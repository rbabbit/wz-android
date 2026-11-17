'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./campaign-ui-fixture-089.cjs');
const ROOT=path.resolve(__dirname,'..'),HUD='app/src/main/assets/warzone-campaign-hud.js',DOCK='app/src/main/assets/warzone/ui/lab-ui.js';
const source=file=>fs.readFileSync(path.join(ROOT,file),'utf8'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
function dom(){
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.parentElement=null;this.style={};this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.inert=false;this.textContent='';this.classes=new Set();this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),contains:n=>this.classes.has(n),toggle:(n,on)=>{if(on===undefined)on=!this.classes.has(n);on?this.classes.add(n):this.classes.delete(n);return on;}};}
  set className(value){this.classes=new Set(value.split(/\s+/));}get className(){return [...this.classes].join(' ');}
  appendChild(node){if(node.parentElement)node.remove();node.parentElement=this;this.children.push(node);return node;}
  append(...nodes){nodes.forEach(node=>this.appendChild(node));}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=String(value);if(name==='hidden')this.hidden=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
  getAttribute(name){return this.attributes[name];}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}click(){for(const fn of this.listeners.click||[])fn({target:this});}
  matches(selector){return selector[0]==='#'?this.id===selector.slice(1):selector[0]==='.'?this.classes.has(selector.slice(1)):selector[0]==='['?this.attributes[selector.slice(1,-1)]!==undefined||this.dataset[selector.slice(6,-1).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]!==undefined:this.tagName===selector;}
  querySelectorAll(selector){const result=[],parts=selector.trim().split(/\s+/),walk=(node,index)=>{for(const child of node.children){if(child.matches(parts[index])){if(index===parts.length-1)result.push(child);else walk(child,index+1);}walk(child,index);}};walk(this,0);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let node=this;node;node=node.parentElement)if(selector.split(',').some(s=>node.matches(s)))return node;return null;}
  set innerHTML(html){this.children=[];const stack=[this],tokens=html.match(/<[^>]+>|[^<]+/g)||[];for(const token of tokens){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const match=token.match(/^<([a-z]+)\b([^>]*)>/i);if(!match)continue;const node=new Node(match[1]);for(const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(attribute[1],attribute[2]??'');stack.at(-1).appendChild(node);if(!['img','input','br'].includes(node.tagName))stack.push(node);}else stack.at(-1).textContent+=token;}}
  getBoundingClientRect(){return this.rect||{left:0,right:0,top:0,bottom:0,width:0,height:0};}
 }
 const body=new Node('body'),head=new Node('head');
 const document={body,head,createElement:tag=>new Node(tag),getElementById:id=>body.querySelector('#'+id)||head.querySelector('#'+id),addEventListener(){}};
 const add=(tag,id,parent=body)=>{const node=new Node(tag);node.id=id;parent.appendChild(node);return node;};
 return{document,add};
}
function fixture(campaign=true){
 const h=harness(),d=dom();Object.assign(h.document,d.document);h.document.getElementById=d.document.getElementById;
 h.window.__warzoneCampaignMode=campaign;h.context.location.search=campaign?'?mode=campaign':'';
 h.context.addEventListener=h.window.addEventListener;h.context.localStorage={getItem:()=>null,setItem(){}};
 const frame=d.add('iframe','warzone-game-frame');frame.contentWindow=h.window;
 const strip=d.add('header','warzone-command-strip'),hud=d.add('div','blocknight-combat-hud',strip);
 const group1=d.add('div','commands',hud);group1.className='bn-command-group';group1.rect={left:7,right:390,width:383};
 for(const id of['blocknight-tech','wt-open-factory','wt-open-queue'])d.add('button',id,group1);
 const group2=d.add('div','base-group',hud);group2.className='bn-command-group';group2.rect={left:400,right:620,width:220};d.add('button','blocknight-base',group2);
 const group3=d.add('div','utilities',hud);group3.className='bn-command-group';group3.rect={left:630,right:810,width:180};d.add('button','blocknight-save',group3);d.add('button','blocknight-help',group3);
 for(const id of['wt-field-centre','wt-field-toggle','wt-status-panel','blocknight-select-all','wt-intelligence'])d.add('div',id);
 const nativeRect={left:900,right:1040,top:8,bottom:48,width:140,height:40};
 const create=h.document.createElement;h.document.createElement=tag=>{const node=create(tag);if(tag==='aside')node.rect=nativeRect;return node;};
 h.commandState.snapshot={factories:[]};h.touchState.hudVisible=true;
 const research={open:false,opening:false,labs:[],queues:[]};h.window.__blockNightResearch.report=()=>research;
 // Current accepted Campaign HUD opens the Intelligence adapter, rather than
 // injecting the obsolete direct F5 shortcut used by the original v0.53 test.
 h.window.__warzoneIntelligence={isOpen:()=>false,open:async()=>{h.calls.push(['intel','open']);return true;},close:async()=>true};
 const runHUD=()=>{h.run('warzone-campaign-hud.js');h.window.__warzoneCampaign?.poll();h.window.__warzoneCampaign?.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:2000,missionTime:-1});};
 const runDock=()=>vm.runInContext(source(DOCK),h.context,{filename:DOCK});
 return{h,d,hud,group1,group2,group3,nativeRect,research,runHUD,runDock,node:id=>h.document.getElementById(id)};
}
async function main(){
 await check('Campaign header preserves primary Research and groups ALL COMBAT with Base; native Intelligence remains in the unit drawer',()=>{
  const f=fixture();f.runHUD();assert.equal(f.hud.children[0],f.group1);assert.equal(f.group1.children[0].id,'blocknight-tech');
  const all=f.node('wt-campaign-all-combat');assert.equal(all.parentElement,f.group2);assert.equal(f.group2.children[0].id,'blocknight-base');
  assert.ok(all.querySelector('img'));assert.equal(f.node('wt-campaign-intel'),null);assert.ok(f.node('wt-intelligence'));
  assert.ok(f.d.document.body.classList.contains('wt-campaign'));
 });
 await check('Header ALL COMBAT retains persistent native selection intent, selected state and physical-input fences',async()=>{
  const f=fixture();f.runHUD();const all=f.node('wt-campaign-all-combat');all.click();await f.h.settle();
  const api=f.h.window.__warzoneCampaign;assert.equal(api.report().allCombat,true);assert.equal(api.report().selectedCount,4);assert.equal(all.getAttribute('aria-pressed'),'true');assert.equal(all.classList.contains('active'),false);f.h.touchState.allCombatSelected=true;api.poll();assert.equal(all.classList.contains('active'),true);assert.equal(all.dataset.combatSelected,'true');
  f.h.window.dispatchEvent({type:'pointerdown',pointerId:1,pointerType:'touch'});assert.equal(api.report().suspended,true);
  f.h.window.dispatchEvent({type:'pointerup',pointerId:1,pointerType:'touch'});f.h.advance(600);api.poll();await f.h.settle();assert.equal(api.report().allCombat,true);assert.equal(api.report().suspended,false);
  all.click();assert.equal(api.report().allCombat,false);assert.equal(all.getAttribute('aria-pressed'),'false');
 });
 await check('Current native chapter uses bundled Towers font; absent countdown adds no filler and fractional timers are whole seconds',()=>{
  const f=fixture();f.runHUD();const api=f.h.window.__warzoneCampaign,status=f.node('warzone-campaign-status'),timer=status.querySelector('small');
  assert.equal(status.querySelector('strong').textContent,'Alpha campaign');assert.equal(timer.hidden,true);assert.equal(timer.textContent,'');
  for(const[level,label]of[['CAM_2A','Beta campaign'],['CAM3A','Gamma campaign']]){f.h.frame({nativeLevel:level});api.poll();api.accept({mode:'campaign',session:'chapter_'+level,mission:'cam1a',missionTime:125.9,gameTime:2000});assert.equal(status.querySelector('strong').textContent,label);assert.equal(timer.hidden,false);assert.equal(timer.textContent,'2:05');}
  assert.ok(source(HUD).includes('font:500 13px/1.2 Towers,sans-serif'));assert.ok(!source(HUD).includes('Oswald'));
 });
 await check('Full-width header measures actual groups: chapter remains visible in free space and yields when controls grow',()=>{
  const f=fixture();f.runHUD();const status=f.node('warzone-campaign-status');f.hud.rect={left:7,right:1056,width:1049};
  f.h.window.__warzoneCampaign.poll();assert.equal(status.style.visibility,'');
  f.group3.rect={left:630,right:905,width:275};f.h.window.__warzoneCampaign.poll();assert.equal(status.style.visibility,'hidden');
  f.group3.rect={left:630,right:810,width:180};f.h.window.__warzoneCampaign.poll();assert.equal(status.style.visibility,'');
  assert.ok(source(HUD).includes('#warzone-command-strip #blocknight-combat-hud{right:8px;max-width:none}'));
 });
 await check('Campaign zero-facility footer uses compact truthful captions while Towers retains accepted captions',()=>{
  for(const campaign of[true,false]){const f=fixture(campaign);if(campaign)f.runHUD();f.runDock();
   assert.equal(f.node('lab-ops-research').querySelector('small').textContent,campaign?'No labs':'Build to get started');
   assert.equal(f.node('lab-ops-production').querySelector('small').textContent,campaign?'No factories':'Build to get started');
   for(const id of['lab-ops-research','lab-ops-production','wt-open-build'])assert.ok(f.node(id));
   assert.equal(f.h.window.TowersLab.report().visible,true);assert.equal(f.node('lab-ops').dataset.collapsed,'false');
  }
 });
 await check('Campaign footer uses content width capped to viewport; every added selector is Campaign-scoped and no accepted stylesheet changes',()=>{
  const css=source(HUD).match(/style\.textContent=`([\s\S]*?)`;/)[1];
  for(const rule of css.split('}').map(v=>v.trim()).filter(Boolean))assert.ok(rule.startsWith('body.wt-campaign ' )||rule.startsWith('body.wt-campaign.wt-towers-polished '),rule);
  assert.ok(css.includes('#lab-ops[data-collapsed=false]{width:max-content;max-width:calc(100vw - 70px)}'));
  assert.ok(!css.includes('--wt-command-top'));assert.ok(!css.includes('#warzone-game-frame'));
 });
 await check('Native Intel/transport/video retain ownership of complete footer and return controls with no generic header Intel duplicate',async()=>{
  const f=fixture();f.runHUD();f.runDock();const api=f.h.window.__warzoneCampaign;
  assert.equal(await api.openIntel(),true);assert.ok(f.h.calls.some(row=>row[0]==='intel'&&row[1]==='open'));
  for(const patch of[{worldSafe:false,intelligenceOpen:true},{intelligenceOpen:false,transportOpen:true},{transportOpen:false,video:true}]){f.h.frame(patch);api.poll();for(const id of['lab-ops','wt-field-centre','wt-field-toggle','wt-status-panel']){assert.equal(f.node(id).style.visibility,'hidden');assert.equal(f.node(id).inert,true);}assert.equal(f.node('wt-campaign-native-back').hidden,!!patch.video);}
  f.h.frame({worldSafe:true,video:false,transportOpen:false,intelligenceOpen:false});api.poll();assert.equal(f.node('lab-ops').style.visibility,'');assert.equal(f.node('lab-ops').inert,false);
 });
 await check('Towers does not install Campaign class, status, ALL control or header overrides',()=>{
  const f=fixture(false);f.runHUD();assert.equal(f.h.window.__warzoneCampaign,undefined);assert.equal(f.node('wt-campaign-all-combat'),null);assert.equal(f.d.document.body.classList.contains('wt-campaign'),false);
 });
 const result={version:'0.89',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
  scope:'Actual Campaign HUD and activity-dock controllers in controlled DOM/VM fixtures; CSS constraints are source checks, not a browser layout claim. Exact-APK header/footer fit and native input require emulator evidence.',
  sources:[HUD,DOCK,'tools/check-campaign-header-089.cjs','tools/campaign-ui-fixture-089.cjs'].map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(ROOT,file)))})),recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(ROOT,'release-records/campaign-layout-js-089-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
