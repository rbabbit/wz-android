'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./check-campaign-js-051.cjs');
const ROOT=path.resolve(__dirname,'..'),FILE='app/src/main/assets/warzone-campaign-hud.js',source=fs.readFileSync(path.join(ROOT,FILE),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const checks=[];
function check(name,fn){fn();checks.push({name,passed:true});console.log('PASS: '+name);}
function fixture(){
 const h=harness(),nodes=new Map(),labels={strong:{textContent:''},small:{textContent:''}};
 let buttonsRight=840;
 const node=()=>({style:{},classList:{toggle(){}},setAttribute(){},inert:false,hidden:false});
 const hud=node();hud.getBoundingClientRect=()=>({left:7,top:7,right:buttonsRight,bottom:51,width:buttonsRight-7,height:44});
 const status=node();status.getBoundingClientRect=()=>({left:892,top:8,right:1052,bottom:48,width:160,height:40});status.querySelector=selector=>labels[selector];
 nodes.set('blocknight-combat-hud',hud);nodes.set('warzone-campaign-status',status);nodes.set('wt-campaign-all-combat',node());nodes.set('wt-campaign-native-back',node());
 h.document.getElementById=id=>nodes.get(id)||null;h.run('warzone-campaign-hud.js');h.window.__warzoneCampaign.poll();
 return{h,api:h.window.__warzoneCampaign,nodes,status,labels,buttonsRight:value=>buttonsRight=value};
}
check('Campaign status is absolute, content-fit and fully within the observed 58px header',()=>{
 const css=source.match(/#warzone-campaign-status\{([^}]+)\}/)[1];
 for(const declaration of['position:absolute','top:8px','right:12px','width:max-content','max-width:160px','height:40px','margin:0','pointer-events:none'])assert.ok(css.includes(declaration),declaration);
 assert.ok(8+40<=58);assert.ok(1064-12-160>=0);assert.ok(!css.includes('margin-left:auto'));
});
check('Mission status uses friendly chapter labels and preserves mission timer text',()=>{
 const f=fixture();
 for(const[mission,label]of[['cam1a','Alpha campaign'],['cam2-1','Beta campaign'],['cam3a','Gamma campaign'],['other','Campaign']]){
  f.api.accept({mode:'campaign',session:mission+'_1',mission,missionTime:125,gameTime:2000});assert.equal(f.labels.strong.textContent,label);assert.equal(f.labels.small.textContent,'2:05');
 }
});
check('At1064CSS width the status stays visible when clear and hides itself rather than overlapping enlarged buttons',()=>{
 const f=fixture();f.api.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:2000});assert.equal(f.status.style.visibility,'');
 f.buttonsRight(900);f.api.poll();assert.equal(f.status.style.visibility,'hidden');
 f.buttonsRight(840);f.api.poll();assert.equal(f.status.style.visibility,'');
});
check('All foreign native UI hides campaign status and allows the native Back control to own the header',()=>{
 const f=fixture();f.api.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:2000});
 for(const patch of[{paused:true,worldSafe:false},{paused:false,transportOpen:true,nativeMenuOpen:true,worldSafe:false},{transportOpen:false,intelligenceOpen:true,worldSafe:false}]){
  f.h.frame(patch);f.api.poll();assert.equal(f.status.style.visibility,'hidden');assert.equal(f.nodes.get('wt-campaign-native-back').hidden,false);
 }
 f.h.frame({paused:false,video:false,transportOpen:false,intelligenceOpen:false,nativeMenuOpen:false,worldSafe:true});f.api.poll();assert.equal(f.status.style.visibility,'');
});
const result={version:'0.51',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
 scope:'Actual campaign HUD controller with observed1064CSS/58px-header geometry fixtures and CSS source constraints; actual screen verified by the final emulator pass.',
 sources:[{path:FILE,sha256:sha(source)},{path:'tools/check-campaign-status-051.cjs',sha256:sha(fs.readFileSync(__filename))}],recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(ROOT,'archive/campaign-status-js-0.51-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
