"""Focused actual-resolver VM/source checks; never starts Android or a browser."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import unquote
from zipfile import ZipFile
import json
import re
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'app/src/main/assets/warzone/ui/research-art.js'
MOBILE = 'app/src/main/assets/warzone-mobile-research.js'
LOADER = 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'
CATALOG = 'archive/research-art-catalog-0.47.json'
GENERATOR = 'tools/generate-research-art-047.py'


def digest(value):
    return sha256(value).hexdigest()


def functions(source):
    matches = list(re.finditer(r'^  (?:async )?function (\w+)\(', source, re.M))
    return {m[1]: source[m.start():matches[i+1].start() if i+1 < len(matches) else len(source)]
            for i, m in enumerate(matches)}


def main():
    checks = []
    gen = runpy.run_path(str(ROOT / GENERATOR))
    expected, catalog = gen['build_catalog']()
    helper = (ROOT / SOURCE).read_text(encoding='utf-8')
    assert helper == gen['TEMPLATE'].replace('__CATALOG__', json.dumps(expected, ensure_ascii=False, separators=(',', ':')))
    assert len(expected) == 390 and json.loads((ROOT / CATALOG).read_text(encoding='utf-8')) == catalog
    checks.append('Resolver is reproducible from all 390 actual native research identities and explicit reviewed aliases')
    for row in catalog['topics']:
        assert row['url'].startswith('/warzone/')
        path = ROOT / 'app/src/main/assets' / unquote(row['url']).lstrip('/')
        assert path.is_file(), row
    checks.append('Every actual catalog identity resolves to an existing packaged stock image or an honest generic research symbol')
    fallback = json.loads((ROOT / 'archive/fallback-0.47.json').read_text(encoding='utf-8'))
    source_zip = next(Path(r['path']) for r in fallback['files'] if r['path'].endswith('-source.zip'))
    with ZipFile(source_zip) as z:
        prior = z.read(MOBILE).decode('utf-8')
        for name in z.namelist():
            if name.startswith(('app/src/main/assets/warzone/research-icons/', 'app/src/main/assets/warzone/build-icons/',
                                'app/src/main/assets/warzone/ui/icons/')):
                assert digest((ROOT / name).read_bytes()) == digest(z.read(name)), name
    checks.append('All existing item thumbnails, building pictures and original UI icons retain their fallback bytes')
    current = (ROOT / MOBILE).read_text(encoding='utf-8')
    before, after = functions(prior), functions(current)
    changed = [name for name in before if before[name] != after[name]]
    assert set(changed) == {'topicImage', 'renderCatalog', 'renderSummary'}
    assert set(after) - set(before) == {'applyTopicImage'}
    checks.append('Only research image lookup/render functions changed; assignments, queues, snapshots and action handlers retain fallback source')
    loader = (ROOT / LOADER).read_text(encoding='utf-8')
    assert loader.index('"warzone/ui/research-art.js"') < loader.index('"warzone-towers-notices.js"')
    assert loader.index('"warzone/ui/research-art.js"') < loader.index('"warzone-mobile-research.js"') < loader.index('"warzone-intelligence.js"')
    assert 'window.WarzoneResearchArt.apply(image,topic)' in (ROOT / 'app/src/main/assets/warzone-intelligence.js').read_text(encoding='utf-8')
    checks.append('The real synchronous engine-document script loader installs the shared resolver before notices, Research and Intelligence')
    node = r'''
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync('app/src/main/assets/warzone/ui/research-art.js','utf8'),context);
const a=context.window.WarzoneResearchArt;
assert.equal(a.url({id:'R-Defense-Tower01',name:'A completely different translated label'}),'/warzone/research-icons/Machinegun%20Guard%20Tower.gif');
assert.equal(a.url({id:'R-Defense-Pillbox01'}),'/warzone/research-icons/Machinegun%20Bunker.gif');
assert.equal(a.url({id:'R-Sys-Sensor-UpLink'}),'/warzone/research-icons/Satellite%20Uplink%20Centre.gif');
assert.equal(a.url({id:'R-Cyborg-Hvywpn-Mcannon'}),a.genericUrl,'never substitute an unverified auto-cannon for the native medium cannon');
assert.equal(a.url({name:'Heavy Machinegun Guard Tower'}),a.genericUrl,'a display name never fabricates an identity');
for(const t of [null,undefined,{},'',{id:'not-a-native-topic'}])assert.equal(a.url(t),a.genericUrl);
assert.equal(a.isReportDefinition({id:'R-Defense-Tower01'}),true);
assert.equal(a.isReportDefinition({id:'R-Vehicle-Engine03'}),false);
assert.equal(a.isReportDefinition({id:'R-Wpn-Cannon-Damage02'}),false);
assert.equal(a.isReportDefinition({id:'unknown'}),false);
function image(){const props=new Map();return{dataset:{},style:{setProperty:(n,v,p)=>props.set(n,[v,p]),removeProperty:n=>props.delete(n)},props,getAttribute(n){return n==='src'?this.src:null;},src:'',onerror:null};}
const i=image();a.apply(i,{id:'R-Defense-Tower01'});assert.equal(i.src,a.url({id:'R-Defense-Tower01'}));
assert.equal(i.props.size,0,'real artwork is neither filtered nor padded');
i.onerror();assert.equal(i.src,a.genericUrl);assert.equal(i.onerror,null);assert.deepEqual(i.props.get('filter'),['none','important']);assert.deepEqual(i.props.get('background'),['#dddddd','important']);
a.apply(i,{id:'R-Defense-Tower01'});assert.equal(i.src,a.genericUrl,'failed images do not retry forever during status refresh');
a.apply(i,{id:'R-Sys-Sensor-UpLink'});assert.notEqual(i.src,a.genericUrl);assert.equal(i.props.size,0,'switching to known artwork removes generic-only backing');
a.apply(i,null);assert.equal(i.src,a.genericUrl);a.applyLab(i);assert.equal(i.src,'/warzone/build-icons/A0ResearchFacility.png');assert.equal(i.props.size,0,'idle laboratory restores real facility art without stale generic styling');
new vm.Script(fs.readFileSync('app/src/main/assets/warzone-mobile-research.js','utf8'));
console.log('actual shared resolver VM passed');
'''
    output = subprocess.check_output(['node', '-e', node], cwd=ROOT, text=True)
    assert 'VM passed' in output
    checks += ['Actual resolver VM proves stable IDs override misleading labels and missing identities never become laboratory art',
               'Actual resolver VM covers eligible/minor report definitions, guarded error fallback, repeat refresh and real idle-lab restoration',
               'Generic black artwork has an explicit neutral backing on both dark/white rows; original art remains unfiltered']
    files = [SOURCE, MOBILE, LOADER, CATALOG, GENERATOR]
    report = {'version': '0.47', 'passed': True, 'emulatorUsed': False, 'browserUsed': False,
        'androidRuntimeExecuted': False, 'actualNativeEngineExecuted': False, 'screensVerified': False,
        'gameplayVerified': False, 'scope': 'Actual JavaScript resolver VM, catalog coverage and source preservation only.',
        'checks': checks, 'checksPassed': len(checks), 'nativeTopics': len(expected),
        'exactImages': sum(r['resolution'] != 'generic' for r in catalog['topics']),
        'honestGenericImages': sum(r['resolution'] == 'generic' for r in catalog['topics']),
        'preservedResearchFunctions': len(before) - len(changed),
        'sources': [{'path': name, 'sha256': digest((ROOT / name).read_bytes())} for name in files],
        'recordedUTC': datetime.now(timezone.utc).isoformat()}
    (ROOT / 'archive/research-art-0.47-checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'checksPassed': len(checks), 'nativeTopics': len(expected),
        'exactImages': report['exactImages'], 'honestGenericImages': report['honestGenericImages'],
        'emulatorUsed': False, 'report': 'archive/research-art-0.47-checks.json'}))


if __name__ == '__main__':
    main()
