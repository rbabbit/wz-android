"""Append mobile campaign hooks; preserve the compiled engine and original data prefix."""
from pathlib import Path
import hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
js_path, data_path = ASSETS / 'warzone2100.js', ASSETS / 'warzone2100.data'
js, data = js_path.read_bytes().decode(), data_path.read_bytes()
pattern = r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}'
index = {name: (int(a), int(b)) for name, a, b in re.findall(pattern, js)}
def read(name):
    a, b = index[name]
    return data[a:b]

base = '/data/base/script/campaign/mobile/'
bridge = (ROOT / 'scenario/warzone-towers-bridge.js').read_text(encoding='utf8')
bridge = re.sub(r'var blockNightV28OriginalEvent\w+ = \w+;\n', '', bridge)
bridge = re.sub(r'function warzoneTowersDiagnosticSnapshot\(\).*?(?=function blockNightV31PollZoomCommand)', '', bridge, flags=re.S)
bridge = bridge[:bridge.index('eventChat = function')]
for name in ['blocknight-zoom-command.json', 'warzone-towers-control-command.json', 'blocknight-queue-command.json']:
    bridge = bridge.replace('includeJSON("' + name + '")', 'includeJSON("mobile/' + name + '")')
commands = (ROOT / 'scenario/warzone-towers-commands.js').read_text(encoding='utf8')
for name in ['warzone-towers-catalog.json', 'warzone-towers-command.json']:
    commands = commands.replace('includeJSON("' + name + '")', 'includeJSON("mobile/' + name + '")')
files = {
    base + 'campaign-bridge.js': ((ROOT/'campaign/mobile-events.js').read_text(encoding='utf8') + '\n' + bridge + '\n' + commands).encode(),
    base + 'warzone-towers-catalog.json': (ROOT/'scenario/warzone-towers-catalog.json').read_bytes(),
}
for name in ['warzone-towers-command.json', 'warzone-towers-control-command.json', 'blocknight-queue-command.json', 'blocknight-zoom-command.json']:
    files[base + name] = b'{}'
missions = sorted(n for n in index if re.fullmatch(r'/data/base/script/campaign/cam[^/]+\.js', n))
for mission in missions:
    original = read(mission).split(b'\n// Mobile campaign bridge (append-only).')[0]
    tail = ('\n// Mobile campaign bridge (append-only).\n'
            'include("script/campaign/mobile/campaign-bridge.js");\n'
            'campmobile_level = ' + json.dumps(Path(mission).stem) + ';\n').encode()
    files[mission] = original + tail

updated = 0
with data_path.open('ab') as output:
    for name, content in files.items():
        if name in index and read(name) == content:
            continue
        a = output.tell(); output.write(content); b = output.tell()
        entry = '{filename:' + json.dumps(name) + ',start:' + str(a) + ',end:' + str(b) + '}'
        match = re.escape('{filename:"' + name + '",start:') + r'\d+,end:\d+\}'
        if name in index:
            js = re.sub(match, lambda _: entry, js, count=1)
        else:
            i = js.rindex('}],remote_package_size:')
            js = js[:i+1] + ',' + entry + js[i+1:]
        updated += 1
size = data_path.stat().st_size
js = re.sub(r'remote_package_size:\d+', 'remote_package_size:' + str(size), js, count=1)
js = re.sub(r'package_uuid:"[^"]+"', 'package_uuid:"campaign-mobile-' + str(size) + '"', js, count=1)
js_path.write_bytes(js.encode())
print(f'Campaign: {len(missions)} original mission scripts, {updated} appended assets; package {size} bytes')
