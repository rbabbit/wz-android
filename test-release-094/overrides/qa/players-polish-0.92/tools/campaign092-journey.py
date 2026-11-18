import sys,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import control as c,device as d,qa092 as g,playersqa_current as p,journey_steps as j
w="document.querySelector('#warzone-game-frame').contentWindow"
assert c.evaluate("getComputedStyle(document.querySelector('#warzone-campaign-status')).visibility==='hidden'")
p.closepage();assert c.evaluate("getComputedStyle(document.querySelector('#warzone-campaign-status')).visibility==='visible'")
g.tap('#wt-campaign-all-combat');c.wait("(()=>{let x="+w+".__kalaWarzoneTouch.report().combatLockState;return x.enabled&&x.selectedIds.length===5})()",timeout=8)
j.players_cycle('21-campaign','campaign')
g.tap('#wt-open-factory');c.wait("Boolean(document.querySelector('.wt-factory-view-tabs [data-page=design]'))",timeout=6)
g.tap('.wt-factory-view-tabs [data-page="design"]');c.wait("Boolean(document.querySelector('#wt-design-name-button'))",timeout=6)
j.campaign_ime_cycle('22-campaign-ime-first');j.campaign_ime_cycle('23-campaign-ime-second')
g.tap('[aria-label="Back to manufacturing"]');g.tap('#wt-open-factory')
c.wait("!"+w+".__warzoneCommands.report().factoryMenuOpen",timeout=6)
p.openpage();p.save('24-campaign-after-ime',nativeCommands=True);p.closepage()
# Input restoration through actual Android world tap; current native position and readonly site preflight recorded.
start=g.native_owned();c.evaluate("(()=>{let w="+w+";w.__qa092Site=null;w.__warzoneCommands.send('preview-build',{itemId:'A0ResearchFacility',x:18,y:53,session:'qa092-campaign-readonly',workerIds:[160001,160003,160005]}).then(r=>w.__qa092Site=r);return true})()")
site=c.wait(w+'.__qa092Site',timeout=8);g.write('24-campaign-site-preflight',site)
print('SITE',json.dumps(site),flush=True)
assert site.get('ok'),site
# Complete site validation is inspected by root before issuing movement.
g.write('24-campaign-input-ready',{'nativeStart':start,'site':site,'lock':p.read()['touch']['combatLockState']})
print('Campaign menus/IME passed; native input preflight ready',flush=True)
