"""Check the actual header-free Campaign geometry/state; no Android or emulator run."""
from pathlib import Path
from zipfile import ZipFile
import ast, hashlib, json, re, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone'
JDK = Path('C:/Program Files/Android/Android Studio/jbr/bin')
source = (BASE/'CampaignSetupView.java').read_text(encoding='utf-8-sig')
helper = (BASE/'CampaignLandingLayout.java').read_text(encoding='utf-8-sig')
prior = ROOT/'tools/test-landing-home-campaign-084.py'

def method(text, needle):
    start = text.index(needle)
    depth = 0
    for i in range(text.index('{', start), len(text)):
        depth += (text[i] == '{') - (text[i] == '}')
        if depth == 0:
            return text[start:i+1]
    raise AssertionError('Unclosed method: '+needle)

assert 'Alpha campaign' not in source and 'heading' not in source
assert 'heading' not in helper and 'Box detail = new Box(0, 0, width, detailHeight)' in helper
assert 'title = copy("CAMPAIGN", 24, true)' in source
for action in ('actions.start()', 'actions.saves()', 'actions.download()', 'actions.cancel()', 'actions.back()'):
    assert source.count(action) == 1, action
with ZipFile(ROOT.parent/'warzone-towers-0.84-source.zip') as saved:
    old = saved.read('app/src/main/java/com/rbabbit/blocknight/warzone/CampaignSetupView.java').decode('utf-8-sig')
assert method(source, '    void update(') == method(old, '    void update('), 'Readiness/download/state method changed'
assert 'home_portrait_campaign_083' in source and 'PorterDuff.Mode.DST_IN' in source

# Reuse the retained font-aware Campaign harness, without running historical Home checks.
assignments = {node.targets[0].id: node.value for node in ast.parse(prior.read_text(encoding='utf-8-sig')).body
               if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)}
geometry = ast.literal_eval(assignments['geometry'])
replacements = {
    'CampaignGeometry084': 'CampaignGeometry085',
    'heading=face.deriveFont(28*d*scale),': '',
    'int hh=height(heading,"Alpha campaign",col),dh=': 'int dh=',
    'd,hh,dh,sh,working': 'd,dh,sh,working',
    'r.heading.height==hh&&r.detail.height==dh&&r.status.height==sh': 'r.detail.top==0&&r.detail.height==dh&&r.status.height==sh',
    '!hits(r.heading,r.detail)&&!hits(r.detail,r.status)': '!hits(r.detail,r.status)',
}
for before, after in replacements.items():
    assert before in geometry, 'Historical harness contract changed: '+before
    geometry = geometry.replace(before, after)
state_literal = assignments['state_harness'].func.value
state = ast.literal_eval(state_literal).replace('CampaignState084', 'CampaignState085')
state = state.replace('__UPDATE__', method(source, '    void update('))

with tempfile.TemporaryDirectory(prefix='campaign-heading-085-') as temp:
    work = Path(temp)
    package = work/'com/rbabbit/blocknight/warzone'
    package.mkdir(parents=True)
    (package/'CampaignLandingLayout.java').write_bytes((BASE/'CampaignLandingLayout.java').read_bytes())
    (package/'CampaignGeometry085.java').write_text(geometry, encoding='utf-8')
    (work/'CampaignState085.java').write_text(state, encoding='utf-8')
    built = subprocess.run([str(JDK/'javac.exe'), '-encoding', 'UTF-8', '-d', str(work),
                            *map(str, package.glob('*.java')), str(work/'CampaignState085.java')],
                           capture_output=True, text=True)
    assert built.returncode == 0, built.stderr
    outputs = {}
    for name in ('com.rbabbit.blocknight.warzone.CampaignGeometry085', 'CampaignState085'):
        ran = subprocess.run([str(JDK/'java.exe'), '-Djava.awt.headless=true', '-cp', str(work), name,
                              str(ROOT/'app/src/main/assets/warzone/ui/Oswald.ttf')], capture_output=True, text=True)
        assert ran.returncode == 0, ran.stderr
        outputs[name] = ran.stdout

counts = {name: int(re.search(r'CHECKS=(\d+)', output)[1]) for name, output in outputs.items()}
scenarios = [line[5:] for output in outputs.values() for line in output.splitlines() if line.startswith('PASS ')]
paths = [BASE/'CampaignSetupView.java', BASE/'CampaignLandingLayout.java', prior, Path(__file__),
         ROOT/'app/src/main/assets/warzone/ui/Oswald.ttf']
checks = [
    'Large Alpha campaign TextView and reserved heading/gap removed; detail starts at body y=0',
    'Top CAMPAIGN/Back, existing artwork and all five action bindings retained',
    'Actual Campaign readiness/download/cancel/error/update method is textually unchanged from084',
    'Actual pure-Java body geometry remains bounded for normal/compact/enlarged-font and ready/download/error states',
    'Actual extracted Java update method retains readiness, progress, cancellation and Continue gating',
]
proof = dict(version='0.85', passed=True, emulatorUsed=False, actualAndroidViewsExecuted=False,
             actualNativeEngineExecuted=False, actualJavaGeometryExecuted=True, checks=checks, checksPassed=len(checks),
             assertions=sum(counts.values()), assertionCounts=counts, scenarios=scenarios,
             scope='Production pure-Java Campaign layout and extracted unchanged state method with retained font metrics. No Android rendering, touch, download network or gameplay execution.',
             sources=[dict(path=p.relative_to(ROOT).as_posix(), sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in paths])
out = ROOT/'qa/menu-polish-085/campaign.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(proof, indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(passed=True, assertions=proof['assertions'], scenarios=len(scenarios), proof=str(out))))
