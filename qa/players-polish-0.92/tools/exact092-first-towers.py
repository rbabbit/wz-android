import sys,time,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import control as c,device as d,qa092 as g,playersqa_current as p
d.capture('10-exact092-home')
d.tap('TOWERS');d.tap('SAVED GAMES');d.capture('11-exact092-towers-saves');d.tap('LOAD')
end=time.monotonic()+75;last=None
while time.monotonic()<end:
 try:
  last=c.evaluate("(document.querySelector('#warzone-game-frame')?.contentWindow?.__warzoneCommands?.report?.().snapshot?.gameTime||0)")
  if last and last>0:break
 except Exception as e:last=str(e)
 time.sleep(.3)
else:raise RuntimeError({'exact092WorldNotReady':last})
geometry=g.measure(force=True);g.write('12-towers-actual-geometry',geometry)
p.openpage();v=p.save('12-exact092-towers-players');p.assert_clean_panel(v)
assert v['native']['mode']=='offline-scenario'
assert [m['label']for m in v['rows'][0]['metrics']]==['UNITS','STRUCTURES','POWER']
assert v['page']['rect']['width']<v['viewport']['width']*.9
print(json.dumps({'page':v['page'],'rows':v['rows'],'geometry':geometry},indent=2)[:5500],flush=True)
