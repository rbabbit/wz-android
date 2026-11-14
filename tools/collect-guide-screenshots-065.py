"""Retain untouched real Guide screenshots and measured normalized callouts."""
from pathlib import Path
from hashlib import sha256
from struct import unpack
from datetime import datetime, timezone
import json, shutil
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/guide-065'
OUT=ROOT/'app/src/main/assets/guide/screenshots'
PROOF=ROOT/'archive/guide-0.65-screenshots.json'
rows={}; provenance=[]
def digest(p):return sha256(p.read_bytes()).hexdigest()
def add(id,source,caption,mode,callouts,version,method='Observed UI controls',focus=False):
 source=Path(source); source=source if source.is_absolute() else ROOT/source
 data=source.read_bytes(); assert data[:8]==b'\x89PNG\r\n\x1a\n'; w,h=unpack('>II',data[16:24]); OUT.mkdir(parents=True,exist_ok=True)
 dest=OUT/(id+'.png'); shutil.copyfile(source,dest); assert digest(dest)==digest(source)
 calls=[]
 for n,c in enumerate(callouts,1):
  r=c['targetRect']; assert len(r)==4 and all(isinstance(v,(float,int)) for v in r) and r[2]>0 and r[3]>0 and r[0]>=0 and r[1]>=0 and r[0]+r[2]<=1.000001 and r[1]+r[3]<=1.000001
  calls.append(dict(number=n,label=c['label'].replace('native ','').replace('Native ',''),targetRect=[round(v,7)for v in r]))
 row=dict(src='screenshots/'+dest.name,width=w,height=h,caption=caption,mode=mode,callouts=calls)
 if focus and calls:
  x=max(0,min(c['targetRect'][0]for c in calls)-.025); y=max(0,min(c['targetRect'][1]for c in calls)-.025)
  right=min(1,max(c['targetRect'][0]+c['targetRect'][2]for c in calls)+.025); bottom=min(1,max(c['targetRect'][1]+c['targetRect'][3]for c in calls)+.025)
  row['focusRect']=[round(x,7),round(y,7),round(right-x,7),round(bottom-y,7)]
 rows[id]=row;provenance.append(dict(id=id,path=dest.relative_to(ROOT).as_posix(),sha256=digest(dest),bytes=len(data),sourcePath=str(source),sourceSHA256=digest(source),sourceVersion=version,unmodified=True,measurement=method,callouts=calls))
def px(x,y,w,h,W=2400,H=1080):return[x/W,y/H,w/W,h/H]
for id in ['controls-drawer','research-queue','intelligence-report','factory-units','factory-queue','design-blueprint','build-sites','build-modules']:
 r=json.loads((QA/('capture-'+id+'.json')).read_text());calls=r['callouts']
 if id=='research-queue':calls[-1]['label']='Select topics to enable the queue action'
 add(id,r['image']['path'],r['caption']+' Captured in v0.64; these menu controls remain current.',r['mode'],calls,'0.64','Actual visible DOM rectangles, with iframe offset normalized to physical screenshot',True)
add('controls-world','C:/Users/punke/Downloads/Screenshot_20261111-204653.png','Actual phone Campaign screen, 11 Nov 2026. Original app version was not recorded; the labeled controls match the current game.','campaign',[
 dict(label='Return the camera to your base',targetRect=px(509,21,120,69)),dict(label='Keep combat units selected',targetRect=px(641,21,186,69)),dict(label='Open the Build catalogue',targetRect=px(457,975,119,82)),dict(label='Minimap and camera position',targetRect=px(1995,653,354,375)),dict(label='Selected units on the battlefield',targetRect=px(1457,474,188,108))],None,'Unmodified user-supplied physical-phone PNG; visible labels verified against current game controls')
# Terrain-free native setup and save-row figures are retained from exact v0.64 verification.
m=json.loads((ROOT/'archive/cobra-0.64/4d22e9a6-cobra-medium-native.json').read_text())['setup'];w=m['physical']['width'];h=m['physical']['height'];calls=[]
for label,caption in [('Easy','Easy for all three bots'),('Medium','Medium for all three bots'),('Hard','Hard for all three bots'),('START FFA','Start a new Cobra match'),('FFA SAVES','Continue a saved FFA match')]:
 n=next(n for n in m['native']if n['text']==label);a=[int(v)for v in __import__('re').findall(r'-?\d+',n['bounds'])];calls.append(dict(label=caption,targetRect=px(a[0],a[1],a[2]-a[0],a[3]-a[1],w,h)))
add('ffa-setup',m['screenshot']['path'],'FFA setup: choose difficulty for three independent Cobra opponents, with VTOL off. Actual v0.64 capture; controls are unchanged.','ffa',calls,'0.64','Actual native accessibility target bounds')
l=json.loads((ROOT/'archive/cobra-0.64/4d22e9a6-cobra-layout-regression.json').read_text())['followup']['compactSaves'];calls=[]
for test,label in [(lambda n:'Load EMAG FFA, EASY · NullBot' in n['label'],'Load the legacy NullBot checkpoint'),(lambda n:'Load EMAG FFA, EASY · Cobra' in n['label'],'Load the Cobra checkpoint'),(lambda n:n['label']=='Close saved games','Close the saved-game list')]:
 n=next(n for n in l['native']if test(n));a=[int(v)for v in __import__('re').findall(r'-?\d+',n['bounds'])];calls.append(dict(label=label,targetRect=px(a[0],a[1],a[2]-a[0],a[3]-a[1],1280,720)))
add('phone-saves',l['screenshot']['path'],'Actual phone save list from v0.64: each FFA checkpoint keeps its actual Cobra or NullBot identity.','ffa',calls,'0.64','Actual native accessibility bounds at640x360dp/font1.3')
for id in ['towers-map','towers-wave']:
 r=json.loads((QA/('capture-'+id+'.json')).read_text());add(id,r['image']['path'],r['caption']+' Actual v0.64 capture; controls are unchanged.','towers',r['callouts'],'0.64','Actual native accessibility/DOM bounds',True)
r=json.loads((QA/'capture-campaign-briefing-native.json').read_text());add('campaign-briefing',r['image']['path'],'Original Campaign briefing screen, captured in v0.64. The mission is paused while this native panel is open. Choose an available briefing, then BACK TO GAME.','campaign',[dict(label='Available briefing icons',targetRect=px(875,854,236,99)),dict(label='Return to the battlefield',targetRect=px(2130,23,226,71)),dict(label='Mission is paused',targetRect=px(8,130,105,31))],'0.64','Visible original native panel targets measured on the unmodified frame')
rows['phone-blueprints']={**rows['design-blueprint'],'caption':'Blueprints tab and Save controls in the actual Design menu. Capture v0.64; controls remain current.','callouts':[dict(number=1,label='Open saved phone blueprints',targetRect=px(416,189,173,57)),rows['design-blueprint']['callouts'][-1]]};rows['phone-blueprints']['callouts'][1]={**rows['phone-blueprints']['callouts'][1],'number':2}
rows['phone-blueprints']['focusRect']=[.005,.11,.59,.60]
rows['towers-rewards']={**rows['towers-map'],'caption':'Open REWARDS from the Towers map browser to inspect crystals and available rewards. This figure shows the entry point.','callouts':[dict(number=1,label='Open the Towers crystal wallet',targetRect=rows['towers-map']['callouts'][3]['targetRect'])]}
(ROOT/'app/src/main/assets/guide/screenshots-data.js').write_text('/* Unmodified real captures; SVG callouts and focus crops are applied at runtime. */\nwindow.WarzoneGuideScreenshots = '+json.dumps(rows,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
PROOF.write_text(json.dumps(dict(version='0.65',passed=True,screenshotsOnly=True,actualGuideRuntimeVerified=False,images=provenance,aliases={'phone-blueprints':'design-blueprint','towers-rewards':'towers-map'},unmodifiedPixels=True,rendererDisclosure='Hardware and SwiftShader normal terrain remained black; one Classic configuration diagnostic was not accepted as a Guide image. Normal1/hardware restored. Current menu controls are shown as closeups; the actual physical-phone Campaign image supplies proper terrain without synthesizing or altering it.',recordedUTC=datetime.now(timezone.utc).isoformat()),indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(passed=True,uniqueImages=len(provenance),imageIDs=len(rows),bytes=sum(r['bytes']for r in provenance),manifest='app/src/main/assets/guide/screenshots-data.js',proof=str(PROOF)),indent=2))

