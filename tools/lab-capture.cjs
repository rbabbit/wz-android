'use strict';
const {connect,screen,out}=require('./native-live.cjs');
const {pause}=require('./lab-journey.cjs');
const fs=require('node:fs'),path=require('node:path');
(async()=>{const c=await connect();try{
 const records=[];
 async function capture(name){await c.paint();screen(name);records.push({name,layout:await c.host(`(()=>{const ids=['blocknight-combat-hud','warzone-towers-wave-hud','wt-command-pages','wt-page-content'];return {width:innerWidth,height:innerHeight,header:document.documentElement.style.getPropertyValue('--wt-command-top'),elements:ids.map(id=>{const e=document.getElementById(id);if(!e)return null;const b=e.getBoundingClientRect();return{id,x:b.x,y:b.y,w:b.width,h:b.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}})}})()`)});}
 if(await c.evaluate('__blockNightResearch.report().open')){await capture('lab-research-01');await c.tap('#blocknight-research-shell .bn-tech-done');await c.wait('!__blockNightResearch.report().open&&!__blockNightResearch.report().pendingClose');}
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');await capture('lab-factory-01');
 await c.tap('#wt-open-design');await c.wait('__warzoneCommands.report().page==="design"');await capture('lab-design-01');
 await pause(c);fs.writeFileSync(path.join(out,'initial-layouts.json'),JSON.stringify(records,null,2));
 }finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
