/* Keep the stock Emscripten RAF pump alive while Android hides its compositor.
 * No native entry points or engine bytes change. Foreground RAF stays native. */
(() => {
 'use strict';
 const request=globalThis.requestAnimationFrame.bind(globalThis),cancel=globalThis.cancelAnimationFrame.bind(globalThis);
 const pending=new Map();let serial=0,background=false,disposed=false,lastFrame=0,pulses=0,delivered=0;
 function deliver(id,time){const job=pending.get(id);if(!job||disposed)return;pending.delete(id);lastFrame=time;delivered++;job.callback(time);}
 globalThis.requestAnimationFrame=callback=>{
  const id=++serial,job={callback,native:0};pending.set(id,job);
  job.native=request(time=>deliver(id,time));return id;
 };
 globalThis.cancelAnimationFrame=id=>{const job=pending.get(id);if(!job)return;pending.delete(id);cancel(job.native);};
 const clock=()=>globalThis.performance.now();
 globalThis.PcBackgroundFrames=Object.freeze({
  setBackground(value){background=Boolean(value);},
  pulse(){
   if(disposed||!background)return false;
   pulses++;const time=clock();
   // The compositor may still run (Recents, split screen). Never double its rate.
   if(time-lastFrame<30)return false;
   const batch=[...pending];
   for(const[id,job]of batch){if(pending.get(id)!==job)continue;cancel(job.native);deliver(id,time);}
   return batch.length>0;
  },
  report:()=>({background,pending:pending.size,pulses,delivered,lastFrame,disposed})
 });
 globalThis.addEventListener('pagehide',()=>{disposed=true;for(const job of pending.values())cancel(job.native);pending.clear();},{once:true});
 try{background=Boolean(parent.PcMultiplayerSession?.background);}catch{}
})();
