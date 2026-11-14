"""Guard the matching 0.41 cache and compile only two Towers presentation files.

No native state, console lifetimes, power calculations or non-Towers rendering
is changed. Original source and all earlier overlays remain reproducible.
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import tarfile
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'archive/native-theme-0.42'
PREVIOUS = ROOT / 'archive/native-production-0.41/native-build.json'
ORIGINAL = {
    'console.cpp': '358562db314857c7150b340adb7aec57af7c4bc4de085bbd578dfdace86d7ce8',
    'intdisplay.cpp': '6e01e3e4f202a5d326b15775bca6f636c2bd0b8e64f28446d8b76a19ee73e7e0',
}
EXPECTED_OBJECTS = ['src/CMakeFiles/warzone2100.dir/console.cpp.o',
                    'src/CMakeFiles/warzone2100.dir/intdisplay.cpp.o']
HELPER = '''
// Towers opts in with the existing transient UI marker; never saved to disk.
static bool towersSageTheme()
{
#ifdef __EMSCRIPTEN__
\tFILE *marker = fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!marker) return false;
\tconst bool enabled = fgetc(marker) == '1';
\tfclose(marker);
\treturn enabled;
#else
\treturn false;
#endif
}

static PIELIGHT towersSageColour(uint8_t r, uint8_t g, uint8_t b)
{
\tPIELIGHT colour;
\tcolour.fromRGBA(r, g, b, 255);
\treturn colour;
}
'''


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def replace_once(text, old, new):
    assert text.count(old) == 1, 'Unexpected source anchor: ' + old[:80]
    return text.replace(old, new, 1)


def reconstruct(name, original):
    assert sha256(original).hexdigest() == ORIGINAL[name]
    text = original.decode()
    if name == 'console.cpp':
        # Preserve message geometry and processing, replacing only backdrop colour.
        text = text.replace('iV_TransBoxFill(', 'towersConsoleBoxFill(')
        box = '''
static void towersConsoleBoxFill(int x1, int y1, int x2, int y2)
{
\tif (towersSageTheme()) pie_UniTransBoxFill(x1, y1, x2, y2, towersSageColour(220,232,207));
\telse iV_TransBoxFill(x1, y1, x2, y2);
}
'''
        text = replace_once(text, '#include <set>\n', '#include <set>\n#include <cstdio>\n' + HELPER + box)
        text = replace_once(text, 'PIELIGHT getConsoleTextColor(int player)\n{',
                            'PIELIGHT getConsoleTextColor(int player)\n{\n\tif (towersSageTheme()) return towersSageColour(16,23,12);')
        text = replace_once(text, 'PIELIGHT colour = mode ? WZCOL_CONS_TEXT_USER_ALLY : getConsoleTextColor((*WhichMessages)[i].player);',
                            'PIELIGHT colour = towersSageTheme() ? towersSageColour(16,23,12) : mode ? WZCOL_CONS_TEXT_USER_ALLY : getConsoleTextColor((*WhichMessages)[i].player);')
        text = replace_once(text, 'drawBlueBox(0, 0,tmp, 18);',
                            'if (towersSageTheme()) pie_UniTransBoxFill(0, 0, tmp, 18, towersSageColour(220,232,207));\n\t\telse drawBlueBox(0, 0,tmp, 18);')
    else:
        text = replace_once(text, '#include "qtscript.h"\n', '#include "qtscript.h"\n#include <cstdio>\n' + HELPER)
        start = text.index('void PowerBar::display(int xOffset, int yOffset)')
        stop = text.index('\nIntFancyButton::IntFancyButton()', start)
        block = text[start:stop]
        anchor = '\tBatchedImageDrawRequests imageDrawBatch(true); // defer drawing\n'
        replacement = anchor + '''\tconst bool sage = towersSageTheme();
\t// Keep the exact original segment positions and work values; only pixels differ.
\tauto drawPowerImage = [&](unsigned image, int px, int py, int width)
\t{
\t\tPIELIGHT colour = image == IMAGE_PBAR_AVAIL ? towersSageColour(16,23,12)
\t\t    : image == IMAGE_PBAR_USED ? towersSageColour(52,65,46)
\t\t    : image == IMAGE_PBAR_REQUIRED ? towersSageColour(182,201,158)
\t\t    : towersSageColour(203,220,186);
\t\tpie_UniTransBoxFill(px, py, px + width, py + iV_GetImageHeight(IntImages, image), colour);
\t};
'''
        block = replace_once(block, anchor, replacement)
        repeated = re.compile(r'iV_DrawImageRepeatX\(IntImages, (IMAGE_PBAR_\w+), ([^,]+), ([^,]+), ([^,]+), defaultProjectionMatrix\(\), true, &imageDrawBatch\);')
        block, count = repeated.subn(lambda m: 'if (sage) drawPowerImage('+', '.join(m.group(i) for i in range(1,5))+');\n\t\telse '+m.group(0), block)
        assert count == 5, 'Unexpected repeated power sprite count'
        single = re.compile(r'iV_DrawImage\(IntImages, (IMAGE_PBAR_\w+), ([^,]+), ([^,]+), defaultProjectionMatrix\(\), &imageDrawBatch\);')
        block, count = single.subn(lambda m: 'if (sage) drawPowerImage('+', '.join(m.group(i) for i in range(1,4))+', iV_GetImageWidth(IntImages, '+m.group(1)+'));\n\telse '+m.group(0), block)
        assert count == 2, 'Unexpected power end-cap count'
        block = replace_once(block, 'pie_UniTransBoxFill(textX - 3, y0 + 1, textX + needTextWidth + 3, y0 + this->height() - 1, WZCOL_TRANSPARENT_BOX);',
                            'pie_UniTransBoxFill(textX - 3, y0 + 1, textX + needTextWidth + 3, y0 + this->height() - 1, sage ? towersSageColour(220,232,207) : WZCOL_TRANSPARENT_BOX);')
        block = replace_once(block, '(realTime / 1250) % 5 ? WZCOL_WHITE: WZCOL_RED',
                            'sage ? towersSageColour(16,23,12) : (realTime / 1250) % 5 ? WZCOL_WHITE: WZCOL_RED')
        block = replace_once(block, 'Avail < 0 ? WZCOL_RED : WZCOL_TEXT_BRIGHT',
                            'sage ? towersSageColour(16,23,12) : Avail < 0 ? WZCOL_RED : WZCOL_TEXT_BRIGHT')
        text = text[:start] + block + text[stop:]
    return text.encode()


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    rows, patch = [], ''
    bundle = ROOT / 'archive/native-blueprint-4.7.0-source.tar.gz'
    with tarfile.open(bundle, 'r:gz') as archive:
        for name in ORIGINAL:
            before = archive.extractfile('source/src/' + name).read()
            after = reconstruct(name, before)
            (OUT / ('original-' + name)).write_bytes(before)
            (OUT / name).write_bytes(after)
            patch += ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
                                                fromfile='a/src/' + name, tofile='b/src/' + name))
            rows.append({'file':name,'originalPath':'archive/native-theme-0.42/original-'+name,
                         'originalSHA256':sha256(before).hexdigest(), 'path':'archive/native-theme-0.42/'+name,
                         'sha256':sha256(after).hexdigest()})
    (OUT / 'native-theme.patch').write_bytes(patch.encode())
    previous = json.loads(PREVIOUS.read_text())
    record = {'version':'0.42','guardPassed':True,'scope':'Towers-only presentation colours; original message lifetime, power values/geometry, all gameplay and non-Towers rendering retained',
              'baselineSourceBundle':'archive/native-blueprint-4.7.0-source.tar.gz','sources':rows,
              'patch':'archive/native-theme-0.42/native-theme.patch','patchSHA256':digest(OUT / 'native-theme.patch'),
              'previousNativeBuild':'archive/native-production-0.41/native-build.json','previousNativeBuildSHA256':digest(PREVIOUS),
              'preservedSourceOverlays':previous['sourceOverlays'],
              'originalBuildRecipeSHA256':previous['originalBuildRecipeSHA256']}
    write_json(OUT / 'source-overlay.json', record)
    return record, previous


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--incremental-cache', type=Path)
    parser.add_argument('--raw-out', type=Path, default=ROOT.parent / '_release-records/native-theme042/raw')
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    overlay, previous = prepare()
    if args.prepare_only:
        print(json.dumps(overlay)); return
    assert os.name != 'nt' and args.incremental_cache, 'Build only in the prepared Linux/WSL cache'
    cache = args.incremental_cache.resolve()
    for name, expected in previous['sourceOverlays'].items():
        assert digest(cache / 'source/src' / name) == expected, 'Earlier overlay changed: '+name
    for row in previous['raw']:
        assert digest(cache / 'build/src' / row['file']) == row['sha256'], 'Raw 0.41 build output changed'
    assert digest(ROOT / 'tools/build-native-blueprint.sh') == previous['originalBuildRecipeSHA256']
    for row in overlay['sources']:
        target = cache / 'source/src' / row['file']
        assert digest(target) == row['originalSHA256'], 'Expected original presentation source: '+row['file']
    assert ROOT not in args.raw_out.resolve().parents
    args.raw_out.mkdir(parents=True, exist_ok=True)
    for row in overlay['sources']:
        shutil.copyfile(ROOT / row['path'], cache / 'source/src' / row['file'])
    log = OUT / 'native-build.log'
    command = ['bash','-c','source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
               'native-theme-042',str(cache)]
    started = time.monotonic()
    with log.open('w') as stream:
        subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=480)
    elapsed = time.monotonic() - started
    text = log.read_text()
    compiled = re.findall(r'Building CXX object (\S+)', text)
    assert sorted(compiled) == EXPECTED_OBJECTS, 'Unexpected compile scope: '+str(compiled)
    assert len(re.findall(r'Linking CXX executable[^\n]*warzone2100',text)) == 1
    for name, expected in previous['sourceOverlays'].items():
        assert digest(cache / 'source/src' / name) == expected
    record = {'version':'0.42','passed':True,'emulatorUsed':False,'androidRuntimeExecuted':False,
              'nativeBuildPerformed':True,'nativeFullFreshBuildPerformed':False,'relinkedNativeEngine':True,
              'compiledObjects':compiled,'elapsedSeconds':round(elapsed,3),'command':command,'cachePath':str(cache),
              'previousNativeBuild':overlay['previousNativeBuild'],'previousNativeBuildSHA256':digest(PREVIOUS),
              'sourceOverlay':'archive/native-theme-0.42/source-overlay.json','sourceOverlaySHA256':digest(OUT / 'source-overlay.json'),
              'preservedSourceOverlays':previous['sourceOverlays'],
              'sourceOverlays':dict(previous['sourceOverlays'], **{r['file']:r['sha256'] for r in overlay['sources']}),
              'log':'archive/native-theme-0.42/native-build.log','logSHA256':digest(log),
              'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
    for name in ['warzone2100.js','warzone2100.wasm']:
        target=args.raw_out/name; shutil.copy2(cache/'build/src'/name,target)
        record['raw'].append({'file':name,'sha256':digest(target),'bytes':target.stat().st_size})
    write_json(OUT/'native-build.json',record)
    print(json.dumps(record))


if __name__ == '__main__':
    main()
