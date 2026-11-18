import json,time
import control as c
import qa092 as q
q.PREFER_NATIVE=True
install=r'''(()=>{let rows=[];const f=(e,p)=>{const b=e.target?.closest?.('button'),o={type:e.type,phase:p,trusted:e.isTrusted,pointerType:e.pointerType,x:e.clientX,y:e.clientY,action:b?.dataset.action,prevented:e.defaultPrevented,time:performance.now()};rows.push(o);queueMicrotask(()=>o.after=e.defaultPrevented)};const a=e=>f(e,'window-capture'),b=e=>f(e,'window-bubble');for(const t of ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','mousedown','mouseup','click']){window.addEventListener(t,a,{capture:true,passive:true});window.addEventListener(t,b,{passive:true})}window.__qaCancelDetailed={read:()=>rows,dispose:()=>{for(const t of ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','mousedown','mouseup','click']){window.removeEventListener(t,a,true);window.removeEventListener(t,b)}}};return true})()'''
c.evaluate(install);q.measure(force=True)
target=q.point('[data-action="cancel-design-rename"]');x,y=target['physical']
receipt=c.rpc('touch',frames=[{'action':0,'points':[[x,y]],'delayMs':120},{'action':1,'points':[[x,y]],'delayMs':100}])
time.sleep(.8)
value={'target':target,'receipt':receipt,'events':c.evaluate('__qaCancelDetailed.read()'),'state':c.evaluate('({visible:!!document.querySelector("#wt-design-rename-input")?.getBoundingClientRect().width,active:document.activeElement?.id,view:'+q.VIEW+'})')}
c.evaluate('__qaCancelDetailed.dispose()');q.write('final-campaign-cancel-full-events-once',value)
print(json.dumps(value,indent=2))
