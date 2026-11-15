"""Record already-observed exact-APK checks; performs no build or device input."""
from pathlib import Path
from hashlib import sha256
import json, runpy, shutil, struct

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/native-landings-084'
load=lambda name:json.loads((QA/name).read_text(encoding='utf-8-sig'))
def digest(p):
    h=sha256()
    with p.open('rb') as stream:
        for data in iter(lambda:stream.read(1024*1024),b''):h.update(data)
    return h.hexdigest()
def pin(p):return dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=digest(p))
def pixels(p):return list(struct.unpack('>II',p.read_bytes()[16:24]))

installed=load('installed-apk.json')
assert installed['candidateAPK_SHA256']==installed['installedAPK_SHA256']==digest(ROOT/'app/build/outputs/apk/debug/app-debug.apk')
for mode in ('normal','compact','large'):
    report=load('routes-'+mode+'.json');assert report['passed'] and report['actualAndroidViewsExecuted']
assert len(load('routes-normal.json')['checks'])==6
assert load('routes-compact.json')['viewport']==load('routes-large.json')['viewport']==[1280,640]
assert load('routes-large.json')['fontScale']==1.3
assert load('gameplay.json')['passed'] and load('private-match-progress.json')['passed']
assert load('mp-official-list.json')['actualOfficialDirectory'] and load('mp-official-list.json')['filterAfter']
assert 'mIsFullscreen=false' in (QA/'final-mp-ime-state.txt').read_text()
for name in ('final-profile-restored','final-private-native-return','final-home-after-mp-match','delivery-game-home-return','delivery-home-restored','final-large-campaign-saves'):
    assert (QA/(name+'.png')).is_file() and (QA/(name+'.json')).is_file(),name

generated=Path('C:/Users/punke/.codex/generated_images/01a1adef-d5f1-7a72-8d73-6a3c8a03cf57')
targets={
 'home':'exec-8e10617f-2ca4-4f8f-84ab-b102d67ca5e2.png',
 'campaign':'exec-f87b5107-6e25-4e2a-b8c3-03ed74ac2a95.png',
 'towers':'exec-73428adb-79b3-41a5-83d5-b1e7de569705.png',
 'ffa':'exec-71aebc72-8ca8-4470-9882-b89d2bce61fe.png',
 'multiplayer':'exec-675161d8-c345-4389-8b43-c6323751f2bf.png'}
comparisons=[]
for screen,filename in targets.items():
    source=generated/filename;reference=QA/('reference-'+screen+'.png')
    shutil.copy2(source,reference)
    rendered=QA/('final-normal-'+screen+'.png')
    comparisons.append(dict(screen=screen,source=pin(reference),sourcePixels=pixels(reference),implementation=pin(rendered),implementationPixels=pixels(rendered),nativeViewportDP=[844,390],densityDPI=320))
(QA/'visual-comparisons.json').write_text(json.dumps(dict(version='0.84',pairedImagesReviewed=True,independentReview=True,comparisons=comparisons,actionableP0P1P2=[]),indent=2)+'\n')

report='''# v0.84 Native landscape landing menus — design QA

**Findings**

No actionable P0/P1/P2 visual differences remain in the five final native
landing screens. This is a scoped menu/design pass; gameplay terrain rendering
quality remains outside it. Every landing uses the retained monochrome native
controls, real artwork/data and the approved compact hierarchy.

**Visual truth and rendered evidence**

The five selected generated images were opened together with their actual APK
screenshots in paired comparison inputs. A second agent independently compared
the same pairs and compact captures. Source filenames, exact pixel dimensions,
copies and screenshot hashes are in `qa/native-landings-084/visual-comparisons.json`.

| Screen | Selected visual | Exact installed APK |
| --- | --- | --- |
| Home | `qa/native-landings-084/reference-home.png` | `qa/native-landings-084/final-normal-home.png` |
| Campaign | `qa/native-landings-084/reference-campaign.png` | `qa/native-landings-084/final-normal-campaign.png` |
| Towers | `qa/native-landings-084/reference-towers.png` | `qa/native-landings-084/final-normal-towers.png` |
| FFA | `qa/native-landings-084/reference-ffa.png` | `qa/native-landings-084/final-normal-ffa.png` |
| Multiplayer | `qa/native-landings-084/reference-multiplayer.png` | `qa/native-landings-084/final-normal-multiplayer.png` |

Actual native screenshots are 1688x780 pixels at 320dpi, or 844x390dp.
References have approximately the same landscape aspect ratio and are compared
at that logical size. Native display-cutout clearance is retained; the bezel-free
references have none. There is no CSS viewport, browser frame or simulated phone
chrome in these Android View captures. Compact evidence is 1280x640 pixels,
640x320dp, with both 100% and 130% text (`final-compact-*`, `final-large-*`).

State differences are explicit: live wallet/counts/room names change, real map
names retain the directory's capitalization, and catalog descriptions retain
their actual content. Unknown occupancy remains “Up to N”; it is never invented
as a measured count. The current version label is rbabbit v0.84.

**Required fidelity surfaces**

- Fonts/typography: retained Oswald supplies the compact game labels, with native
  body text for descriptions. All six Home destinations, map settings, player
  name/suffix, counts and Join actions are readable. The generated mock's heavier
  letter strokes differ from native Oswald antialiasing; this is P3, not a new
  font or a web-style heading. Native compact text sizing is intentional.
- Spacing/layout rhythm: Home restores the original logo/grey-tank composition
  and a single compact six-button row. Campaign keeps a Back/header and left
  actions with art fading into black. Towers/FFA use preview-left/settings-right
  with separate fixed Play/Start and bounded paging. Multiplayer uses flat rows
  and wraps the native header on a narrower phone. No persistent control is
  outside the viewport. Campaign's compact body intentionally scrolls, and the
  captured scroll reaches Continue and its real saved-games list.
- Colors/tokens: black surfaces, charcoal controls, light primary actions and
  white/grey text follow the existing Towers theme. The native checkbox has
  visible checked/unchecked states; blocked/full room actions are disabled.
  There are no blue engine panels or web-page headers in these landing screens.
- Images/assets: the official logo, original grey tank, existing Campaign
  illustration and actual uncropped map previews remain sharp and correctly
  placed. No rasterized controls, replacement icons or drawn approximations
  were used. The Home logo is slightly smaller than the generated example in
  order to retain the original Home geometry; this is acceptable P3 drift.
- Copy/content: no direct-IP form, duplicate version labels or Players heading
  remains in the visible public list. The fixed mobile suffix and compact counts
  are present. Actual map/Cobra/difficulty/save/download semantics are preserved;
  generated illustrative descriptions and live data are not hardcoded.

Full-size inputs made the important header/control/name/count/image regions
clearly readable. Those regions were specifically inspected in both paired
images; additional cropped/resized images were unnecessary.

**Iteration history**

1. First APK: all five visual compositions were inspected against the selected
   references. No P0/P1/P2 composition issue was found. Actual keyboard state
   exposed the new name field's Android fullscreen/extract editor. Independent
   source review also found that invalid-name Done discarded error focus.
2. The field now requests NO_EXTRACT_UI/NO_FULLSCREEN and consumes a failed Done
   without dismissing focus. The actual Java listener branches were executed in
   focused host checks; the rebuilt APK's real keyboard stayed inline with the
   suffix visible (`final-mp-inline-keyboard.png`, `final-mp-ime-state.txt`).
3. The exact rebuilt APK completed all six routes, compact and enlarged-text
   captures, Campaign scrolling/saves, native filter/Refresh and name persistence.
   Final paired review found no actionable P0/P1/P2 visual issue. Native Join
   reached the real private host, Ready started its match, and Return restored
   the public list. A normal Towers game retained Research, touch pan and its
   engine through background/resume.

**Fixture diagnosis and verification limits**

An early Home predicate incorrectly treated the retained blank background
WebView as a visible page. It was corrected after inspecting the real screen and
fresh hierarchy. Transient null-root/not-idle automation responses during
navigation/rendering were handled by observed-state waits or direct engine
state/screenshots. They are not reported as app defects. An early shell-quoted
test expression was replaced with the checked-in test helper. No product code
was changed for these fixture errors.

The private directory entry and game-ID resolution were temporary transport
fixtures, with synthetic advertised occupancy. Its TCP/room/Ready/match were
real. No public chat or gameplay seed was used. Existing black emulator terrain,
physical phones, full public matches, every mission and every map's gameplay are
not covered by this menu QA. Exact scope/pins: `qa/native-landings-084/verification.json`.

**Implementation checklist**

- All five approved landscape native landings implemented.
- Real data/navigation/profile/filter/Join paths retained and observed.
- Small screen, enlarged text, keyboard, scrolling and return paths checked.
- Initial v0.83 APK/source fallback preserved; exact APK/source packaging gated
  on these observations and asset/signature/source checks.

final result: passed

---

'''
old=(ROOT/'design-qa.md').read_text(encoding='utf-8-sig')
marker='# v0.83 Portrait Home design QA'
assert marker in old
(ROOT/'design-qa.md').write_text(report+old[old.index(marker):],encoding='utf-8')

pack=runpy.run_path(str(ROOT/'tools/package-native-landings-084.py'),run_name='record084_package_contract')
evidence=[]
for p in sorted(QA.glob('*')):
    if p.is_file() and p.suffix in {'.json','.png','.txt','.log'} and not p.name.startswith(('failure','candidate1')) and p.name not in {'verification.json','commit-inventory.json','package.log'}:
        evidence.append(pin(p))
sources=pack['PRODUCT']|{pack['GRADLE'],pack['TOOL'],'tools/record-native-landings-084.py',
 'tools/native-landings-live-084.cjs','tools/native-landings-routes-084.cjs',
 'tools/native-landings-game-084.cjs','tools/native-landings-mp-live-084.cjs','tools/native-landings-private-fixture-084.cjs'}
proof=dict(version='0.84',passed=True,emulatorUsed=True,actualAndroidViewsExecuted=True,
 candidateAPK_SHA256=installed['candidateAPK_SHA256'],installedAPK_SHA256=installed['installedAPK_SHA256'],device=installed['device'],
 checks={name:True for name in pack['REQUIRED_CHECKS']},buildLog=pin(QA/'build.log'),
 verificationScope='Exact installed APK: all six landscape Home routes; native Campaign/Towers/FFA/MP composition and actual utility navigation; 844x390dp and640x320dp with130%text; inline real Android keyboard/name limit/fixed suffix/persistence; real official filter/Refresh; native Join through bounded directory/ID-resolution fixture to real official headless Cobra host, actual Ready/match/frame-time advancement/return; normal Towers Research/pan/background-resume/return. ADB/CDP only; no desktop input.',
 limitations=[
  'Inherited black terrain persists in the emulator; source and visual renderer cause remain unverified and outside the landing update.',
  'No physical-phone, full public-match, speaker audition, all campaign missions or every map gameplay verification claimed.',
  'Private test directory and game-ID resolution only were synthetic; advertised private occupancy was not measured. TCP handshake, native Ready, game progression and return were real. No fake gameplay or public messages.',
  'Compact Campaign details/actions scroll; actual Continue and saved-games access were verified after scrolling. Native MP header wraps on narrow/enlarged text screens.',
  'Transient automation hierarchy errors and an incorrect initial blank-WebView Home predicate were diagnosed as fixture issues; final routes reran after correcting observation.'],
 fixture=dict(publicMessagesSent=False,publicRoomJoined=False,headlessHost=True,desktopInputUsed=False,directoryDataSynthetic=True,idResolutionSynthetic=True,readyStateMocked=False,seededGameplay=False,ownedHostStopped=True,originalProfileRestored=True),
 sources=[pin(ROOT/name) for name in sorted(sources)],evidence=evidence)
(QA/'verification.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(recorded=True,version='0.84',checks=len(proof['checks']),sources=len(proof['sources']),evidence=len(evidence),apk=installed['candidateAPK_SHA256'])))
