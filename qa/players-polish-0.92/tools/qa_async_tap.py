import json
import control as c,device as d,qa092 as q,final_offline092 as f
receipts=[]
def tap(selector,activity='auto'):
 t=q.point(selector,activity=activity)
 installed=c.evaluate("(()=>{window.__qaOneClick=[];window.__qaOneClickListener=e=>{if(e.target.closest("+json.dumps(selector)+"))__qaOneClick.push({type:e.type,trusted:e.isTrusted,pointerType:e.pointerType,target:e.target.closest('button')?.outerHTML.slice(0,350)});};window.addEventListener('click',__qaOneClickListener,{capture:true,passive:true});return true})()",activity)
 assert installed is True,'Passive QA click observer did not install; no input sent'
 try:
  c.rpc('touch-async',frames=[{'action':0,'points':[t['physical']],'delayMs':0},{'action':1,'points':[t['physical']],'delayMs':60}])
  clicked=c.wait('__qaOneClick',lambda rows:any(x['trusted']for x in rows),timeout=8,activity=activity)
  receipts.append({'target':t,'input':'Real Android SOURCE_TOUCHSCREEN async native injection,60ms requested press','clicks':clicked})
 except Exception as error:
  receipts.append({'target':t,'input':'Real Android SOURCE_TOUCHSCREEN async native injection,60ms requested press','error':str(error),'clicks':c.evaluate('window.__qaOneClick',activity)});raise
 finally:c.evaluate("window.removeEventListener('click',window.__qaOneClickListener,true);true",activity)
 return t
if __name__=='__main__':
 q.tap=tap
 result=f.run_ffa()
 q.write('final-ffa-source-mouse-click-receipts',{'disclosure':'Control taps use Android SOURCE_MOUSE in real emulator; real-finger spectator Details pan separately verified','receipts':receipts})
 print(json.dumps({'status':result['status'],'error':result.get('error'),'failedStage':result.get('failedStage')}))
