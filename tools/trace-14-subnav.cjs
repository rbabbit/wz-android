'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),cases:[]};
(async()=>{const c=await j.connectReady();try{
 await c.host(`window.__qa14TapTrace=[];window.__qa14TapListener=e=>{const b=e.target.closest?.('button');__qa14TapTrace.push({type:e.type,trusted:e.isTrusted,target:e.target.id,button:b?.id,data:b?{...b.dataset}:null,text:b?.innerText,xy:[e.clientX,e.clientY],view:[innerWidth,innerHeight],at:performance.now()});};for(const k of ['pointerdown','pointerup','click'])document.addEventListener(k,__qa14TapListener,true);true`);
 for(const p of [{name:'normal',wm:'600x1080',font:'1',scale:1},{name:'compact',wm:'480x854',font:'1.3',scale:1.4}]){
  await j.closeOverlays(c);const before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');l.adb('shell','wm','size',p.wm);l.adb('shell','settings','put','system','font_scale',p.font);await c.evaluate('__warzoneCommands.setSize('+p.scale+');true');await j.waitAdvancingClock(c,before);await c.paint();
  await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');
  for(const page of ['design','saved','factory','saved']){const old=await c.host('__qa14TapTrace.length');await c.tap('#wt-command-tabs [data-page="'+page+'"]');await l.delay(500);const actual=await c.evaluate('__warzoneCommands.report().page'),events=await c.host('__qa14TapTrace.slice('+old+')');r.cases.push({profile:p.name,page,actual,events});console.log(p.name,page,actual,events.map(e=>[e.type,e.data?.page,e.xy]));fs.writeFileSync(path.join(l.out,'subnav-trace.json'),JSON.stringify(r,null,2));assert.equal(actual,page,'real measured tap acknowledged');}
  r.cases.at(-1).screen=l.screen('14-'+p.name+'-blueprints-trace');
 }
 r.passed=true;
}catch(e){r.failure=String(e.stack||e);r.screen=l.screen('14-subnav-trace-failure');throw e;}finally{await c.host(`for(const k of ['pointerdown','pointerup','click'])document.removeEventListener(k,__qa14TapListener,true);delete window.__qa14TapTrace;delete window.__qa14TapListener;true`);await j.closeOverlays(c);c.close();fs.writeFileSync(path.join(l.out,'subnav-trace.json'),JSON.stringify(r,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
