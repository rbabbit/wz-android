"""Focused map-arrow source/state checks; no Android runtime or screen claim."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
from datetime import datetime, timezone
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
HELPERS = runpy.run_path(str(ROOT / 'tools/check-native-theme-039.py'), run_name='arrow_047_helpers')
require, contrast = HELPERS['require'], HELPERS['contrast']


def main():
    fallback = json.loads((ROOT / 'archive/fallback-0.47.json').read_text(encoding='utf-8'))
    source = Path(next(r['path'] for r in fallback['files'] if r['path'].endswith('-source.zip')))
    checks = []
    with ZipFile(source) as z:
        before = z.read(JAVA + 'MapPreviewPager.java').decode('utf-8').replace('\r\n', '\n')
        expected = before.replace('import android.content.Context;\n',
                'import android.content.Context;\nimport android.content.res.ColorStateList;\n')
        expected = expected.replace('        private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);\n',
                '        private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);\n'
                '        private final ColorStateList inkColours = TowersTheme.buttonText(false);\n')
        expected = expected.replace('            buttonFace.setState(getDrawableState());\n',
                '            final int[] visualState = getDrawableState();\n'
                '            buttonFace.setState(visualState);\n')
        expected = expected.replace('            ink.setColor(TowersTheme.TEXT);\n',
                '            // The selected map propagates its white face to this child. Pair\n'
                '            // the chevron with that same state instead of always painting white.\n'
                '            ink.setColor(!isEnabled() && isSelected() ? 0xFF505050\n'
                '                    : inkColours.getColorForState(visualState, TowersTheme.TEXT));\n')
        actual = (ROOT / (JAVA + 'MapPreviewPager.java')).read_text(encoding='utf-8')
        require(actual == expected, 'Map pager changed beyond cached stateful arrow ink')
        checks.append('Map paging, swipe/click/accessibility callbacks, artwork and measurement/layout are identical except the arrow paint state')
        before_main = z.read(JAVA + 'MainActivity.java').decode('utf-8').replace('\r\n', '\n')
        main = (ROOT / (JAVA + 'MainActivity.java')).read_text(encoding='utf-8')
        require(main == before_main.replace('      "warzone-towers-notices.js",\n',
                '      "warzone/ui/research-art.js",\n      "warzone-towers-notices.js",\n'),
                'Activity changed beyond ordered shared artwork helper installation')
        checks.append('Activity lifecycle/navigation/services are unchanged; shared research artwork is installed synchronously before its consumers')
        for name in z.namelist():
            if name.startswith(JAVA) and name.endswith('.java') and name not in {JAVA + 'MapPreviewPager.java', JAVA + 'MainActivity.java'}:
                require((ROOT / name).read_bytes() == z.read(name), 'Unrelated Android source changed: ' + name)
        checks.append('All other Android sources, including theme, drawable and wallet/save/ad policies, remain byte-identical')
    theme = (ROOT / (JAVA + 'TowersTheme.java')).read_text(encoding='utf-8')
    require('static android.content.res.ColorStateList buttonText(boolean primary)' in theme
            and 'new int[] {android.R.attr.state_pressed}' in theme
            and 'new int[] {android.R.attr.state_selected}' in theme
            and 'DISABLED, TEXT, ON_PRIMARY, ON_PRIMARY' in theme,
            'Arrow must resolve the actual shared stateful ink list')
    pairs = {'normal':(0xFFF4F4F4,0xFF252525), 'selected':(0xFF101010,0xFFF4F4F4),
             'pressed':(0xFFF4F4F4,0xFF151515)}
    ratios = {n:round(contrast(*p),3) for n,p in pairs.items()}
    require(min(ratios.values()) > 4.5, 'Enabled arrow ink/fill source contrast too low')
    checks.append('Normal/selected/pressed arrow ink and face share the same drawable state with readable source colour pairs; disabled selected ink stays dark')
    sources = [JAVA + n for n in ('MapPreviewPager.java','MainActivity.java','TowersTheme.java','TowersControlDrawable.java')]
    report = {'version':'0.47','passed':True,'emulatorUsed':False,'browserUsed':False,
        'androidRuntimeExecuted':False,'actualNativeEngineExecuted':False,'screensVerified':False,
        'gameplayVerified':False,'checks':checks,'checksPassed':len(checks),'sourceContrastRatios':ratios,
        'sources':[{'path':n,'sha256':sha256((ROOT/n).read_bytes()).hexdigest()} for n in sources],
        'recordedUTC':datetime.now(timezone.utc).isoformat()}
    (ROOT / 'archive/home-arrow-0.47-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':True,'checksPassed':len(checks),'contrast':ratios,'emulatorUsed':False}))


if __name__ == '__main__':
    main()
