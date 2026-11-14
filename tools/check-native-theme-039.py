"""Archive native v0.39 presentation/source checks against the frozen v0.38 ZIP.

This does not launch Android, an emulator, the engine, or any UI renderer.
Source colour/contrast calculations do not establish real rendered acceptance.
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
MANIFEST = 'archive/repository-files.json'
FALLBACK = 'archive/fallback-0.39.json'
REPORT = 'archive/native-theme-0.39-checks.json'
BASELINE_SHA = '28407a5782f8126438c13c7aeeba89f4ecdb3dbd2ab5cf56ec01ba4e89b85b7e'
PRESENTATION = {
    'BattleBriefingView.java', 'GraphicsSetupView.java', 'MainActivity.java',
    'MapPreviewPager.java', 'RewardReceiptView.java', 'RewardsView.java',
    'SavedGamesView.java', 'WarzoneSplashView.java',
}
RESOURCE_SCOPE = {'app/src/main/res/values/colors.xml', 'app/src/main/res/values/styles.xml'}
METHODS = {
    'MainActivity.java': [
        'showGraphicsSetup', 'launchGame', 'showRewards', 'refreshAdState',
        'refreshRewardBalance', 'releaseAdScreen', 'finishAdScreen', 'closeRewards',
        'showSavedGames', 'closeSavedGames', 'loadSavedGame', 'completeRewardQuote',
        'dismissRewardReceipt', 'finishTowersRewards', 'dismissBriefing',
        'fadeBriefing', 'prepareStartupBriefing', 'briefingFailed',
        'selectedMusicTracks', 'gameUrl', 'isDuelBattle', 'installAutoLauncher',
        'installTouchControls', 'cancelMainMenuReturn', 'returnToMainMenu',
        'showBattleExitPanel', 'showReplayPanel', 'replayText',
        'finishStartupAutomation', 'revealBattlefield', 'faceOpponent',
        'showCombatHud', 'mapMusicState', 'mapMusicLifecycle', 'immersive',
        'onWindowFocusChanged', 'onPause', 'onResume', 'onDestroy',
        'isGameBackKey', 'gameBackWindow', 'isKeyboardVisible', 'hideKeyboard',
        'routeGameBackKey', 'dispatchKeyEvent', 'onBackPressed',
    ],
    'GraphicsSetupView.java': [
        'desiredButtonWidth', 'chooseMatch', 'chooseWeapon', 'chooseDifficulty',
        'chooseMap', 'rememberMap', 'refresh', 'selectedMap', 'selectedMatchMode',
        'selectedDuelWeapon', 'setRewardBalance',
    ],
    'RewardsView.java': [
        'refresh', 'completeMutation', 'showError', 'setAdState', 'updateAdControls',
        'setCategory', 'commitOne', 'selectOwned', 'clearFeedback', 'showFeedback',
        'maxQuantity', 'maxOwned', 'visibleItems', 'render', 'itemStatus',
        'dismissOwnedPopup', 'image', 'normalized', 'count',
    ],
    'SavedGamesView.java': ['refresh'],
    'BattleBriefingView.java': [
        'showFor', 'onMeasure', 'onLayout', 'dispatchDraw', 'cancel', 'onDetachedFromWindow',
    ],
    'MapPreviewPager.java': [
        'showLevels', 'setInteractionEnabled', 'settleSelection', 'decorate',
        'snapToPage', 'fling', 'onScrollChanged', 'onInterceptTouchEvent',
        'onTouchEvent', 'performAccessibilityAction', 'onDetachedFromWindow',
    ],
}


def require(value, message):
    if not value:
        raise AssertionError(message)


def digest(path):
    value = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def normalize(source):
    return source.replace('\r\n', '\n')


def mask_java(source):
    # Preserve source offsets while ignoring braces/parens inside strings/comments.
    token = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/'
    return re.sub(token, lambda m: re.sub(r'[^\n]', ' ', m.group()), source)


def balanced_end(masked, start, opening='{', closing='}'):
    require(masked[start] == opening, 'Expected opening delimiter')
    depth = 1
    for cursor in range(start + 1, len(masked)):
        depth += (masked[cursor] == opening) - (masked[cursor] == closing)
        if depth == 0:
            return cursor + 1
    raise AssertionError('Unterminated source block')


def method(source, name, indent):
    declaration = (rf'(?m)^ {{{indent}}}(?! )'
                   rf'(?:(?:private|public|protected|static|final|synchronized|@Override) )*'
                   rf'[A-Za-z_][\w<>\[\].?, ]*? {re.escape(name)}\(')
    match = re.search(declaration, source)
    require(match is not None, 'Missing method: ' + name)
    masked = mask_java(source)
    opening = masked.index('{', match.end())
    return source[match.start():balanced_end(masked, opening)]


def listeners(source):
    masked = mask_java(source)
    found = []
    for match in re.finditer(r'\.(?:setOn\w+Listener|addOnLayoutChangeListener)\s*\(', masked):
        opening = masked.index('(', match.start())
        found.append(source[match.start():balanced_end(masked, opening, '(', ')')])
    return found


def layout_methods(source):
    masked = mask_java(source)
    found = []
    pattern = r'(?m)^ +@Override (?:protected|public) void (?:onMeasure|onLayout)\('
    for match in re.finditer(pattern, source):
        opening = masked.index('{', match.end())
        found.append(source[match.start():balanced_end(masked, opening)])
    return found


def contrast(foreground, background):
    def luminance(value):
        channels = [(value >> shift & 255) / 255 for shift in (16, 8, 0)]
        channels = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels]
        return sum(c * w for c, w in zip(channels, (.2126, .7152, .0722)))
    values = sorted((luminance(foreground), luminance(background)))
    return (values[1] + .05) / (values[0] + .05)


def main():
    checks = []
    fallback_path = ROOT / FALLBACK
    fallback = json.loads(fallback_path.read_text(encoding='utf-8'))
    source_entry = next(e for e in fallback['files'] if e['path'].endswith('-source.zip'))
    source_zip = Path(source_entry['path'])
    require(source_entry['sha256'] == BASELINE_SHA, 'Wrong v0.38 fallback source identity')
    require(source_zip.stat().st_size == source_entry['bytes'] and digest(source_zip) == BASELINE_SHA,
            'Immutable v0.38 complete source ZIP changed')
    checks.append('Complete v0.38 source ZIP retains its pinned size and SHA-256')

    with ZipFile(source_zip) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate baseline source ZIP members')
        manifest_bytes = archive.read(MANIFEST)
        inventory = json.loads(manifest_bytes)
        indexed = {e['path']: e for e in inventory['files']}
        require(len(indexed) == len(inventory['files']) and set(indexed) == set(names) - {MANIFEST},
                'Baseline source inventory is incomplete')
        checks.append('Pinned ZIP manifest covers every ZIP member except the manifest itself')

        def old_bytes(name):
            value = archive.read(name)
            entry = indexed[name]
            require(len(value) == entry['bytes'] and sha256(value).hexdigest() == entry['sha256'],
                    'Baseline manifest mismatch: ' + name)
            return value

        previous = {file: normalize(old_bytes(JAVA + file).decode('utf-8')) for file in PRESENTATION}
        current = {file: normalize((ROOT / JAVA / file).read_text(encoding='utf-8')) for file in PRESENTATION}
        old_java = {name for name in indexed if name.startswith(JAVA)}
        current_java = {p.relative_to(ROOT).as_posix() for p in (ROOT / JAVA).rglob('*.java')}
        require(current_java == old_java | {JAVA + 'TowersTheme.java'}, 'Unexpected Java addition/removal')
        changed_java = {JAVA + file for file in PRESENTATION}
        require(all((ROOT / name).read_bytes() != old_bytes(name) for name in changed_java),
                'Expected changed native presentation source is absent')
        protected_java = sorted(old_java - changed_java)
        for name in protected_java:
            require((ROOT / name).read_bytes() == old_bytes(name), 'Service/catalogue/legacy Java changed: ' + name)
        checks.append('All 13 non-presentation Java services, catalogues, codecs and legacy MusicSetupView retain v0.38 bytes')

        preserved_art = sorted(name for name in indexed if (
            name.startswith('app/src/main/res/') and name not in RESOURCE_SCOPE
            or name.startswith(('app/src/main/assets/warzone/research-icons/',
                               'app/src/main/assets/warzone/levels/previews/'))
            or name in {'app/src/main/assets/warzone/ui/briefing-start.png',
                        'app/src/main/assets/warzone/ui/briefing-defeat.png'}))
        for name in preserved_art:
            require((ROOT / name).read_bytes() == old_bytes(name), 'Original art/icon/resource changed: ' + name)
        checks.append('Original art, icons, 46 map previews, briefing PNGs and unscoped Android resources retain baseline bytes')

        unchanged_methods = []
        for file, method_names in METHODS.items():
            for name in method_names:
                indent = 2 if file == 'MainActivity.java' else 4
                require(method(previous[file], name, indent) == method(current[file], name, indent),
                        'Control method changed: ' + file + '::' + name)
                unchanged_methods.append(file + '::' + name)
        checks.append('94 named reward, save, navigation, music, briefing and control methods retain exact normalized source')
        listener_count = 0
        layout_count = 0
        for file in PRESENTATION:
            old_listeners = listeners(previous[file])
            require(old_listeners == listeners(current[file]), 'Native listener callback changed: ' + file)
            listener_count += len(old_listeners)
            old_layouts = layout_methods(previous[file])
            require(old_layouts == layout_methods(current[file]), 'Native layout/measure method changed: ' + file)
            layout_count += len(old_layouts)
        checks.append('Every native setOn listener callback and onMeasure/onLayout implementation retains exact normalized source')

        main = current['MainActivity.java']
        old_main = previous['MainActivity.java']
        begin, end = '.setNegativeButton("Cancel"', '.create();'
        require(old_main[old_main.index(begin):old_main.index(end, old_main.index(begin))]
                == main[main.index(begin):main.index(end, main.index(begin))],
                'Main-menu confirmation action changed')
        checks.append('Main-menu Cancel/Return action callbacks remain unchanged')
        splash = current['WarzoneSplashView.java']
        old_splash = previous['WarzoneSplashView.java']
        begin, end = 'if (artwork == null)', 'subtitle = new TextView'
        require(old_splash[old_splash.index(begin):old_splash.index(end)]
                == splash[splash.index(begin):splash.index(end)], 'Splash art render/filter changed')
        checks.append('Original splash bitmap loading, logo, artwork renderer and existing colour filter retain exact source')

        for file in ['RewardsView.java', 'RewardReceiptView.java', 'SavedGamesView.java',
                     'MapPreviewPager.java', 'BattleBriefingView.java']:
            for literal in re.findall(r'0x[\da-fA-F]{8}', current[file]):
                rgb = literal[-6:].lower()
                require(rgb[:2] == rgb[2:4] == rgb[4:], 'Chromatic active-view literal: ' + file + ' ' + literal)
        checks.append('Active standalone native view colour literals are monochrome')
        theme = (ROOT / JAVA / 'TowersTheme.java').read_text(encoding='utf-8')
        palette = {name: int(value, 16) for name, value in re.findall(r'static final int (\w+) = (0x[\dA-Fa-f]+);', theme)}
        require(palette == {'BACKGROUND': 0xFF080808, 'PANEL': 0xFF111111, 'CONTROL': 0xFF202020,
                            'TEXT': 0xFFF4F4F4, 'SECONDARY': 0xFFA5A5A5, 'ON_PRIMARY': 0xFF080808,
                            'RIPPLE': 0x33FFFFFF, 'PRIMARY_RIPPLE': 0x33000000}, 'Native shared palette differs')
        checks.append('Native shared palette matches the selected background/panel/control/text colours')
        require('button.setTextColor(selected ? TowersTheme.ON_PRIMARY : INK);' in current['RewardsView.java']
                and 'option.setTextColor(position == count(loadout, entry.id) ? TowersTheme.ON_PRIMARY : INK);' in current['RewardsView.java']
                and 'b.setTextColor(compact && selected ? TowersTheme.ON_PRIMARY : INK);' in current['GraphicsSetupView.java'],
                'Selected-button/option foreground contrast path missing')
        require('fill == INK ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE' in current['RewardsView.java'],
                'White button pressed-state ink missing')
        checks.append('White selected buttons/options use black text and dark pressed-state ripple in source')
        state_calls = r'(?m)^.*\.(?:setEnabled|setAlpha)\(.*$'
        for file in PRESENTATION:
            require(re.findall(state_calls, previous[file]) == re.findall(state_calls, current[file]),
                    'Disabled/enabled or alpha behavior changed: ' + file)
        checks.append('Native enabled/disabled guards and existing alpha treatments retain exact source lines')

        colors = ET.fromstring((ROOT / 'app/src/main/res/values/colors.xml').read_bytes())
        old_colors = ET.fromstring(old_bytes('app/src/main/res/values/colors.xml'))
        color_values = {e.attrib['name']: e.text for e in colors}
        expected_colors = {e.attrib['name']: e.text for e in old_colors}
        expected_colors['warzone_brand_background'] = '#080808'
        require(color_values == expected_colors, 'Brand/window resource changed beyond background')
        style_name = 'app/src/main/res/values/styles.xml'
        require((ROOT / style_name).read_bytes() == old_bytes(style_name).replace(b'#8BD3CC', b'#F4F4F4'),
                'Android theme resource changed beyond accent')
        checks.append('Android window/navigation/splash background and accent use monochrome; launcher icon background is unchanged')
        require('new MusicSetupView(' not in main and 'if (isDuelBattle()) { showReplayPanel(won); return; }' in main
                and 'if (!isDuelBattle()) { returnToMainMenu(); return; }' in main,
                'Legacy route reachability changed')
        checks.append('Legacy MusicSetupView remains unreferenced by MainActivity; coloured terminal panels remain Duel-only')

        contrast_values = {label: round(contrast(palette[fg], palette[bg]), 2) for label, fg, bg in [
            ('selectedTextOnWhite', 'ON_PRIMARY', 'TEXT'),
            ('primaryTextOnPanel', 'TEXT', 'PANEL'),
            ('secondaryTextOnPanel', 'SECONDARY', 'PANEL'),
            ('secondaryTextOnControl', 'SECONDARY', 'CONTROL'),
        ]}
        require(min(contrast_values.values()) >= 4.5, 'Source palette text contrast below 4.5:1')
        checks.append('Opaque source palette text combinations exceed 4.5:1 calculated contrast')

    sources = sorted(changed_java | {JAVA + 'TowersTheme.java'} | RESOURCE_SCOPE)
    report = {
        'version': '0.39', 'passed': True, 'emulatorUsed': False,
        'androidRuntimeExecuted': False, 'gameplayVerified': False, 'renderedUIVerified': False,
        'scope': 'Native presentation colours, unchanged source contracts, preserved art/services and calculated opaque palette contrast only.',
        'limitations': 'No Android runtime, emulator, device, GPU, real touch, keyboard, scrolling, disabled-state rendering or visual acceptance verification.',
        'checksPassed': len(checks), 'checks': checks,
        'baselineSourceZIP': str(source_zip), 'sourceZIPBaselineSHA256': BASELINE_SHA,
        'baselineManifest': {'path': MANIFEST, 'sha256': sha256(manifest_bytes).hexdigest(), 'entries': len(indexed)},
        'fallbackRecord': {'path': FALLBACK, 'sha256': digest(fallback_path)},
        'unchangedMethods': unchanged_methods, 'unchangedMethodCount': len(unchanged_methods),
        'unchangedListenerCallbackCount': listener_count, 'unchangedLayoutMethodCount': layout_count,
        'protectedJavaPaths': protected_java, 'preservedArtworkResourceCount': len(preserved_art),
        'paletteContrastRatios': contrast_values,
        'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in sources],
        'checker': {'path': Path(__file__).relative_to(ROOT).as_posix(), 'sha256': digest(Path(__file__))},
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    }
    (ROOT / REPORT).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'checksPassed': len(checks), 'unchangedMethods': len(unchanged_methods),
                      'unchangedListenerCallbacks': listener_count, 'preservedArtResources': len(preserved_art),
                      'emulatorUsed': False, 'report': REPORT}))


if __name__ == '__main__':
    main()
