'use strict';
const {connect,delay,out}=require('./native-live.cjs'),fs=require('node:fs'),path=require('node:path');
(async()=>{const c=await connect();const r={screens:[],engine:'Warzone WebAssembly/WebGL; custom gameplay overlays currently HTML/CSS/JS'};
try{
 await c.wait('__kalaWarzoneTouch.report().hudVisible&&__warzoneCommands.report().snapshot?.trucks.length>0');
 const record=name=>{c.screen('baseline-'+name);r.screens.push(name);};
 r.initial=await c.evaluate('({waves:__warzoneTowersWaves.report(),research:__blockNightResearch.report(),commands:__warzoneCommands.report(),viewport:[parent.innerWidth,parent.innerHeight]})');
 await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open');record('research');await c.tap('.bn-tech-done');await c.wait('!__blockNightResearch.report().open');
 for(const page of ['factory','design','saved','queue']){if(page==='saved')await c.tap('#wt-command-tabs [data-page="saved"]');else await c.tap('#wt-open-'+page);await c.wait(`__warzoneCommands.report().page==='${page}'`);record(page);if(page!=='design')await c.tap('#wt-command-pages [data-action="back"]');}
 await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');record('help');await c.tap('.wt-help-back');
 await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen');record('build');await c.tap('#wt-build-sidebar .wt-sidebar-exit');await c.wait('!__warzoneCommands.report().buildOpen');
 r.dom=await c.host('({header:document.getElementById("blocknight-combat-hud")?.outerHTML,research:document.getElementById("blocknight-research-shell")?.outerHTML,commands:document.getElementById("wt-command-pages")?.outerHTML.slice(0,500),wave:document.getElementById("warzone-towers-wave-hud")?.outerHTML})');
 r.errors=c.errors;
}finally{await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await delay(1200);r.time=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await delay(1200);r.observedPaused=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime')===r.time;c.screen('baseline-paused');fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(r,null,2));c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
