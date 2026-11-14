'use strict';
const q=require('./mp-live-071.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const c=await q.connect();try{
 await c.wait('document.querySelectorAll(".room").length>0','rooms');
 const read=()=>c.evaluate(`({rows:[...document.querySelectorAll('.room')].map(e=>({id:e.dataset.roomId,current:e.dataset.current,text:e.querySelector('.room-players').textContent})),checked:document.querySelector('#hide-empty').checked,viewport:[innerWidth,innerHeight],listHeight:document.querySelector('#rooms').clientHeight,scrollHeight:document.querySelector('#rooms').scrollHeight,home:!!document.querySelector('#home'),help:!!document.querySelector('#blocknight-help')})`);
 const before=await read();if(!before.checked)await c.tap('#hide-empty');const filtered=await read();
 assert.ok(filtered.rows.every(e=>e.current!=='0'));assert.equal(filtered.rows.filter(e=>e.current==='unknown').length,before.rows.filter(e=>e.current==='unknown').length);
 const box=await c.evaluate(`(()=>{const r=document.querySelector('#rooms').getBoundingClientRect();return{x:r.x+r.width/2,from:r.bottom-30,to:r.top+30};})()`);
 await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x,y:box.from,id:1}]});
 for(let i=1;i<=6;i++){await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x,y:box.from+(box.to-box.from)*i/6,id:1}]});await q.delay(25);}
 await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await c.wait('document.querySelector("#rooms").scrollTop>0','room scrolling');const scroll=await c.evaluate('document.querySelector("#rooms").scrollTop');
 await c.save('lobby071-filter-scroll');if(!before.checked)await c.tap('#hide-empty');
 assert.equal(before.home,false);assert.equal(before.help,false);
 fs.writeFileSync(path.join(q.out,'lobby-live-proof.json'),JSON.stringify({before,filtered,scroll,passed:true},null,2));console.log(JSON.stringify({rows:before.rows.length,filtered:filtered.rows.length,scroll,passed:true}));
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
