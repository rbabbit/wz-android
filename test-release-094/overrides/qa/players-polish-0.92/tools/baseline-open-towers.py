import sys,time,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import device as d,control as c,playersqa as q,probe as p
d.tap('LOAD')
end=time.monotonic()+75;last=None
while time.monotonic()<end:
 try:
  last=c.evaluate("(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow;return {gameTime:w?.__warzoneCommands?.report?.().snapshot?.gameTime||0,ready:!!w?.__warzoneCommands,view:{width:innerWidth,height:innerHeight}}})()")
  if last and last.get('gameTime',0)>0:break
 except Exception as e:last=str(e)
 time.sleep(.3)
else:raise RuntimeError({'baselineWorldNotReady':last})
print({'baselineWorld':last},flush=True)
p.tap('#wt-open-players');q.opened();q.save('02-baseline-towers-players')
