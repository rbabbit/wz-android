"""Focused v0.46 native presentation/source checks; no Android runtime or emulator."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import re
import runpy
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
REPORT = 'archive/native-controls-0.46-checks.json'
PRIOR = runpy.run_path(str(ROOT / 'tools/check-native-theme-039.py'), run_name='native_046_check_helpers')
require, method, listeners, layout_methods, contrast, normalize = (PRIOR[k] for k in (
    'require', 'method', 'listeners', 'layout_methods', 'contrast', 'normalize'))
SCOPE = {'GraphicsSetupView.java', 'MainActivity.java', 'MapPreviewPager.java', 'RewardsView.java',
         'SavedGamesView.java', 'RewardReceiptView.java', 'TowersTheme.java', 'TowersControlDrawable.java'}
PALETTE = {'BACKGROUND':0xFF0C0C0C, 'PANEL':0xFF111111, 'CONTROL':0xFF252525,
           'PRIMARY':0xFFF4F4F4, 'TEXT':0xFFF4F4F4, 'ON_PRIMARY':0xFF101010,
           'SECONDARY':0xFFBCBCBC, 'DISABLED':0xFF888888}

def digest(path): return sha256(path.read_bytes()).hexdigest()

def main():
    checks=[]
    fallback=json.loads((ROOT / 'archive/fallback-0.46.json').read_text(encoding='utf-8'))
    source=Path(next(r['path'] for r in fallback['files'] if r['path'].endswith('-source.zip')))
    require(fallback['baseline']=='0.45' and fallback['workingAppSourcesVerifiedAgainstCompleteFallback']==585,
            'v0.45 fallback not verified before edits')
    with ZipFile(source) as archive:
        names=set(archive.namelist())
        previous={p.name:normalize(archive.read(p.relative_to(ROOT).as_posix()).decode('utf-8'))
                  for p in (ROOT / JAVA).glob('*.java')}
        current={p.name:normalize(p.read_text(encoding='utf-8')) for p in (ROOT / JAVA).glob('*.java')}
        require(set(previous)==set(current), 'Java files added or removed')
        unchanged=[]
        for name in current:
            if name not in SCOPE:
                require(current[name]==previous[name], 'Non-presentation native source changed: '+name)
                unchanged.append(name)
        checks.append('Every non-presentation Java service/catalogue/codec and original Home/briefing artwork source is unchanged')
        for name in SCOPE - {'TowersControlDrawable.java', 'TowersTheme.java'}:
            require(listeners(previous[name])==listeners(current[name]), 'Native input/action listeners changed: '+name)
            require(layout_methods(previous[name])==layout_methods(current[name]), 'Native onMeasure/onLayout changed: '+name)
        checks.append('All existing native action callbacks and measurement/layout methods retain v0.45 source')
        preserved_methods=0
        for name, methods in PRIOR['METHODS'].items():
            for label in methods:
                require(method(previous[name],label,2 if name=='MainActivity.java' else 4)
                        ==method(current[name],label,2 if name=='MainActivity.java' else 4),
                        'Protected native behavior changed: '+name+'::'+label)
                preserved_methods+=1
        checks.append('Protected navigation, lifecycle, map selection, purchase/save/ad policy methods remain unchanged')
        original_art=[n for n in names if n.startswith('app/src/main/res/') and not n.endswith(('values/colors.xml','values/styles.xml'))]
        original_art += [n for n in names if n.startswith('app/src/main/assets/warzone/ui/game-controls/')]
        for name in original_art:
            require((ROOT / name).read_bytes()==archive.read(name), 'Original icon/resource/control fallback artwork changed: '+name)
        checks.append('Original resource artwork, launcher icon geometry and unused old control PNG/Ogg bytes are retained')
    theme=current['TowersTheme.java']
    for name,value in PALETTE.items():
        match=re.search(r'static final int '+name+r' = (0x[0-9A-F]+);',theme)
        require(match and int(match.group(1),16)==value, 'Shared palette mismatch: '+name)
    pairs=[('normal',PALETTE['TEXT'],PALETTE['CONTROL']),('selected',PALETTE['ON_PRIMARY'],PALETTE['PRIMARY']),
           ('pressed',PALETTE['TEXT'],0xFF151515),('secondary',PALETTE['SECONDARY'],PALETTE['PANEL'])]
    ratios={name:round(contrast(fg,bg),3) for name,fg,bg in pairs}
    require(min(ratios.values())>=4.5, 'Enabled native label contrast below 4.5:1')
    require('android.R.attr.state_pressed' in theme and 'android.R.attr.state_selected' in theme,
            'Primary label state pairing missing')
    checks.append('Shared neutral palette and enabled normal/selected/pressed/secondary text contrast satisfy numeric source checks')
    drawable=current['TowersControlDrawable.java']
    require('radius = 6 * density' in drawable and 'canvas.drawRoundRect' in drawable,
            'Selected gently rounded rectangle is missing')
    require(not any(token in drawable for token in ('Bitmap','button-plate','button-selected','drawBitmap','canvas.translate','Path(')),
            'Rejected clipped bitmap/button bounds movement still active')
    require('else if (pressed) face.setColors(new int[] {0xFF151515, 0xFF181818})' in drawable,
            'Pressed face must be dark, including primary/selected controls')
    checks.append('Rounded real UI controls use six-dp corners, stateful fill/edge feedback and fixed touch bounds; old plate drawing is inactive')
    reward=current['RewardsView.java']
    require('final TextView name, status, amount;' in reward and 'name.setTextColor(TowersTheme.buttonText(light))' in reward
            and 'amount.setTextColor(TowersTheme.buttonText(light))' in reward
            and 'status.setTextColor(TowersTheme.controlText(light' in reward
            and reward.count('setDuplicateParentStateEnabled(true)')==5,
            'Reward selected/pressed labels do not inherit the row fill state')
    require('selected ? TowersTheme.CARD_SELECTED : TowersTheme.PANEL' in current['MapPreviewPager.java'],
            'Read-only map card must not turn white behind white descriptive text')
    checks.append('Reward row labels share the touched/selected parent state; map information cards retain a dark readable surface')
    colours=ET.parse(ROOT / 'app/src/main/res/values/colors.xml').getroot()
    values={n.attrib['name']:n.text for n in colours}
    require(values['warzone_brand_background']=='#0C0C0C' and values['warzone_text']=='#F4F4F4', 'Android resource palette differs')
    styles=(ROOT / 'app/src/main/res/values/styles.xml').read_text(encoding='utf-8')
    require('Theme.Material.NoActionBar' in styles and 'Theme.Material.Light' not in styles,
            'Android system widget theme remains light')
    require('windowLightStatusBar">false' in styles and 'windowLightNavigationBar">false' in styles,
            'System bar contrast differs from dark background')
    sage=re.compile(r'DCE8CF|CBDCBA|B6C99E|10170C|34412E|58634F',re.I)
    require(not any(sage.search(text) for text in current.values()), 'Native sage literal remains')
    checks.append('Native resources, scrims, shared panels and system widget theme use the matching dark palette with no sage literals')
    sources=[JAVA+n for n in sorted(SCOPE)]+['app/src/main/res/values/colors.xml','app/src/main/res/values/styles.xml']
    report={'version':'0.46','createdUTC':datetime.now(timezone.utc).isoformat(),'passed':True,
        'emulatorUsed':False,'browserUsed':False,'androidRuntimeExecuted':False,'actualNativeEngineExecuted':False,
        'screensVerified':False,'gameplayVerified':False,'checks':checks,'checksPassed':len(checks),
        'protectedBehaviorMethods':preserved_methods,'unchangedNativeSources':unchanged,'contrastRatios':ratios,
        'sources':[{'path':n,'sha256':digest(ROOT/n)} for n in sources]}
    (ROOT / REPORT).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':True,'checks':len(checks),'protectedMethods':preserved_methods,'contrast':ratios,'report':REPORT}))

if __name__=='__main__': main()
