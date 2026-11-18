import sys,time,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import control as c,device as d,qa092 as g,playersqa_current as p,journey_steps as j
# Current known state: exact092 Towers prepared save with Players open.
p.closepage();g.tap('#wt-all-combat')
c.wait("(()=>{let l=document.querySelector('#warzone-game-frame').contentWindow.__kalaWarzoneTouch.report().combatLockState;return l.enabled&&l.selectedIds.join(',')==='1900001,1900003'})()",timeout=8)
p.openpage();before=g.native_owned();v=p.read()
point=c.evaluate("(()=>{let p=document.querySelector('#wt-command-pages').getBoundingClientRect(),x=innerWidth-35,y=Math.min(innerHeight-60,p.bottom+70),e=document.elementFromPoint(x,y);return{x,y,id:e?.id,shield:!!e?.closest('#wt-command-pages')}})()")
assert point['shield'],point
geo=g.measure();l,t,r,b=geo['bounds'];d.adb('shell','input','tap',str(round(l+point['x']*(r-l)/geo['css']['width'])),str(round(t+point['y']*(b-t)/geo['css']['height'])))
c.wait("document.querySelector('#warzone-game-frame').contentWindow.__warzoneCommands.playersReport().ready",timeout=5)
after=g.native_owned();assert [(x['id'],x['order'])for x in before['result']['selectedUnits']]==[(x['id'],x['order'])for x in after['result']['selectedUnits']]
g.write('13-towers-world-shield',{'point':point,'before':before,'after':after,'noOrderChanged':True})
p.closepage();p.openpage();d.back();c.wait(p.READ,lambda x:not x['report']['open'],timeout=6)
g.tap('#wt-field-toggle');g.tap('#wt-select-trucks')
c.wait("document.querySelector('#warzone-game-frame').contentWindow.__kalaWarzoneTouch.report().combatLockState.selectedIds.join(',')==='160001,160003,160005,160007'",timeout=8)
start=g.native_owned();w="document.querySelector('#warzone-game-frame').contentWindow"
c.evaluate("(()=>{let w="+w+";w.__qa092Site=null;w.__warzoneCommands.send('preview-build',{itemId:'A0ResearchFacility',x:32,y:65,session:'qa-092-readonly',workerIds:[160001,160003,160005,160007]}).then(x=>w.__qa092Site=x);return true})()")
site=c.wait(w+'.__qa092Site',timeout=8);assert site['ok'],site
tap=j.tap_validated_world_tile(32,65,site);events=[];seen=False;until=time.monotonic()+7
while time.monotonic()<until:
 n=g.native_owned();events.append(n)
 if any(x['order']==2 for x in n['result']['trucks']):seen=True;break
 time.sleep(.2)
assert seen,events[-1]
g.tap('#wt-open-build');c.wait(w+'.__warzoneCommands.report().buildOpen',timeout=6)
p.openpage();modal=p.save('14-towers-players-from-moving-build',nativeCommands=True);assert not modal['commands']['buildOpen']
p.closepage();done=False;until=time.monotonic()+25
while time.monotonic()<until:
 n=g.native_owned();events.append(n);tr=n['result']['trucks']
 if len(tr)==4 and all(x['order']!=2 for x in tr)and any(any(a['id']==x['id']and abs(a['x']-x['x'])+abs(a['y']-x['y'])>=2 for a in start['result']['trucks'])for x in tr):done=True;break
 time.sleep(.3)
assert done,events[-1]
g.write('14-towers-native-movement-build-return',{'preparedSeededCombatIDs':[1900001,1900003],'originalConstructorIDs':[160001,160003,160005,160007],'start':start,'sitePreflight':site,'ordinaryAndroidWorldTap':tap,'nativeMoveOrderSeen':seen,'completed':done,'events':events})
c.wait("(()=>{let l="+w+".__kalaWarzoneTouch.report().combatLockState;return l.enabled&&!l.suspended&&l.selectedIds.join(',')==='1900001,1900003'})()",timeout=8)
g.tap('#wt-all-combat');c.wait("(()=>{let l="+w+".__kalaWarzoneTouch.report().combatLockState;return!l.enabled&&!l.pendingDeselect&&l.selectedIds.length===0})()",timeout=8)
p.openpage();p.save('15-towers-native-returns',nativeCommands=True)
d.adb('shell','wm','size','720x1280');c.wait('innerWidth<1000',timeout=8);g.measure(force=True);o=p.save('16-towers-compact');p.assert_clean_panel(o)
assert o['page']['rect']['right']<=o['viewport']['width']+1
p.closepage();p.openpage();d.back();c.wait(p.READ,lambda x:not x['report']['open'],timeout=6)
d.adb('shell','wm','size','1080x2400');c.wait('innerWidth===1231',timeout=8);g.measure(force=True)
g.tap('#blocknight-tech');c.wait("Boolean(document.querySelector('#blocknight-research-shell')&&!document.querySelector('#blocknight-research-shell').hidden)",timeout=6)
p.openpage();p.save('17-towers-after-research');p.closepage()
d.back();rows=d.nodes(d.xml());assert any(n.get('text')=='Return'for n in rows);d.tap('Return')
g.write('17-towers-journey-outcome',{'passed':True,'exactAPK':'d0d3f16f8f3c0ee7f36fc78dc57c7ae8f2e91d788fcf085ad5e318b56acf67ad','globalToggleAndBack':True,'worldShieldNoOrderChanged':True,'nativeMovementCompleted':True,'BuildToPlayersRestoredCombatIntent':True,'combatOffDeselected':True,'compactToggleAndBack':True,'ResearchToPlayers':True,'normalReturn':True,'seededFixtureDisclosed':True})
print('Towers exact092 focusedjourney passed',flush=True)
