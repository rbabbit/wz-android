"""Freeze the reviewed Players source scope before building the exact test APK."""
from pathlib import Path
from hashlib import file_digest
import json
ROOT=Path(__file__).resolve().parents[1]
BASE=Path('C:/timerApp/candidates/normal-test-0.90-20261116/app/src/main/assets')
ASSETS=ROOT/'app/src/main/assets'
UI={'warzone-command-pages.js','warzone-touch-controls.js','multiplayer/index.html','multiplayer/session.js',
    'multiplayer/mobile-controls.js','multiplayer/multiplayer.css','warzone/ui/towers-game-controls.css'}
NATIVE={'warzone/warzone2100.js','warzone/warzone2100.wasm','warzone/warzone2100-towers-052.js','warzone/warzone2100-towers-052.wasm',
        'warzone/warzone2100-campaign.js','warzone/warzone2100-ffa.js','warzone/warzone2100-duel.js','multiplayer/warzone2100.js','multiplayer/warzone2100.wasm'}
def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()
old={p.relative_to(BASE).as_posix():p for p in BASE.rglob('*') if p.is_file()}
new={p.relative_to(ASSETS).as_posix():p for p in ASSETS.rglob('*') if p.is_file()}
assert old.keys()==new.keys(),'No new/removable assets authorized by reviewed implementation'
rows=[{'path':name,'baselineSHA256':digest(old[name]),'sha256':digest(new[name])} for name in sorted(new)]
changed=[r for r in rows if r['baselineSHA256']!=r['sha256']]
assert {r['path'] for r in changed}==UI|NATIVE,'Unexpected/missing source changes'
ui_path=ROOT/'release-records/players-ui-091-checks.json'; ui=json.loads(ui_path.read_text())
assert ui['passed'] and {r['path'] for r in ui['sources']}==UI
assert all(digest(ASSETS/r['path'])==r['sha256'] for r in ui['sources'])
baseline=Path('C:/timerApp/Warzone-Towers-0.90-Test.apk')
assert digest(baseline)=='ee65c0cd433f5959ff9b2cbc40de6f3e98c79f4c080996e87b3eeaa983403de2'
report={'reviewed':True,'baselineAPK_SHA256':digest(baseline),'changedAssets':[r['path'] for r in changed],
        'addedAssets':[],'assetCount':len(new),'sources':changed,'unchangedAssets':len(new)-len(changed),
        'uiProofSHA256':digest(ui_path),'publicationPerformed':False}
(ROOT/'release-records/scoped-asset-changes.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'reviewed':True,'changedAssets':report['changedAssets'],'unchangedAssets':report['unchangedAssets'],'uiProofSHA256':report['uiProofSHA256']},indent=2))
