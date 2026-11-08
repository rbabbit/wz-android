'use strict';
// Execute current layout and selection functions, including real BNTECH
// reconciliation. Native gameplay/layout measurements belong to emulator QA.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const source=fs.readFileSync('app/src/main/assets/warzone-mobile-research.js','utf8');
const css=fs.readFileSync('app/src/main/assets/warzone/ui/towers-research.css','utf8');
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
class Node{
 constructor(name){this.name=name;this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this.style={};this.textContent='';this.innerHTML='';this.disabled=false;this.scrolls=[];this.classes=new Set();this.classList={add:x=>this.classes.add(x),contains:x=>this.classes.has(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
 appendChild(n){return this.insertBefore(n,null);}
 insertBefore(n,b){if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);const i=b?this.children.indexOf(b):-1;i<0?this.children.push(n):this.children.splice(i,0,n);n.parentNode=this;return n;}
 replaceChildren(){for(const n of this.children)n.parentNode=null;this.children=[];}
 setAttribute(k,v){this.attrs[k]=String(v);}
 getAttribute(k){return this.attrs[k]??this[k];}
 removeAttribute(k){delete this.attrs[k];}
 scrollIntoView(options){this.scrolls.push(options);}
 querySelectorAll(selector){if(selector==='[data-lab]')return this.children.filter(n=>n.dataset.lab!==undefined);if(selector==='.bn-tech-queue-image')return [];return [];}
}
function harness(duel=false){
 const nodes=new Map(),get=s=>{if(!nodes.has(s))nodes.set(s,new Node(s));return nodes.get(s);};
 const shell=get('#blocknight-research-shell'),main=get('.bn-tech-main'),rail=get('.bn-tech-rail'),browser=get('.bn-tech-browser'),detail=get('.bn-tech-detail'),preview=get('.bn-tech-preview'),categories=get('.bn-tech-categories'),labs=get('.bn-tech-labs');
 shell.querySelector=s=>{const m=s.match(/^\[data-lab="(\d+)"\]$/);return m?labs.children.find(n=>n.dataset.lab===m[1])||null:get(s);};
 shell.querySelectorAll=s=>s==='[data-lab]'?labs.children:[];
 main.appendChild(rail);main.appendChild(browser);main.appendChild(preview);main.appendChild(detail);rail.appendChild(labs);rail.appendChild(categories);
 const body=new Node('body'),head=new Node('head');body.classes.add('wt-towers-polished');
 const state={open:true,opening:false,activeLab:4,activeCategory:'ALL',catalog:[{id:'R-Test-Hover',name:'Hover Propulsion',nativeIndex:0,category:'VEHICLES',power:112,points:3600}],engineLabs:Array.from({length:5},(_,i)=>({id:11+i,nativeIndex:i,idle:i!==4,topicId:i===4?'R-Test-Cobra':'',topicName:i===4?'Medium Body - Cobra':'',remainingSeconds:i===4?24:null,estimatedProgress:.4})),labQueues:{15:[{id:'R-Test-Alloys',name:'Composite Alloys'}]},syncedQueues:{},dirtyLabs:{},runner:null,selectedTopicIndex:0,topicHistory:{},pendingClose:false,assignmentError:'',labSelections:0,bridgeSyncs:0,bridgeErrors:0,queueStateTime:-1};
 const context={state,window:{__warzoneDuelConfig:duel?Object.freeze({mode:'duel'}):undefined,parent:{WarzoneHost:{setResearchOpen(){}}}},document:{body,head,getElementById:id=>id==='blocknight-research-shell'?shell:head.children.find(n=>n.id===id)||null,createElement:tag=>new Node(tag)},canvas:()=>({}),vibrate(){},hideQueueStatus(){},saveCanvasStyle(){},createShell:()=>shell,renderCategories(){},renderCatalog(){},CATEGORIES:['ALL','WEAPONS','VEHICLES'],pruneLabs(){},renderAll(){context.renderLabs();context.renderSummary();},renderLabs(){},renderSummary(){},escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),queueForLab:id=>state.labQueues[id]||[],knownTopic:id=>Object.values(state.labQueues).flat().find(t=>t.id===id)||state.topicHistory[id]||null,topicImage:t=>'research-icons/'+encodeURIComponent(t.name)+'.gif',activeLabForTopic:id=>state.engineLabs.find(l=>!l.idle&&l.topicId===id)||null,queuedLocation:id=>Number(Object.keys(state.labQueues).find(k=>state.labQueues[k].some(t=>t.id===id)))||null,console};
 vm.createContext(context);
 vm.runInContext(extract('  function isTowersResearchShell(', '  function saveCanvasStyle('),context);
 vm.runInContext(extract('  function renderLabs()', '  function renderCategories()'),context);
 vm.runInContext(extract('  function renderSummary()', '  const chooseTopic ='),context);
 vm.runInContext(extract('  function selectLab(', '  function setCategory('),context);
 vm.runInContext(extract('  function activate()', '  function open()'),context);
 get('.bn-tech-progress').querySelector=()=>get('.bn-tech-progress i');
 return {context,state,shell,main,rail,browser,detail,preview,categories,labs,get,nodes};
}
const h=harness();
assert.equal(h.context.configureTowersResearchShell(h.shell),true);
assert.equal(h.context.document.head.children.length,1);assert.equal(h.context.document.head.children[0].href,'/warzone/ui/towers-research.css');h.context.installTowersResearchTheme();assert.equal(h.context.document.head.children.length,1,'theme attached once');
assert.equal(h.preview.parentNode,h.main,'real selected-topic elements form a row under the topic catalogue');
assert.ok(h.main.children.indexOf(h.preview)>h.main.children.indexOf(h.browser)&&h.main.children.indexOf(h.preview)<h.main.children.indexOf(h.detail),'selection precedes current/queue without a permanent right pane');
assert.equal(h.categories.parentNode,h.main,'filters have their own full row');
h.context.renderAll();assert.equal(h.labs.children.length,5);
assert.equal(h.labs.children[4].dataset.labId,'15');assert.equal(h.labs.children[4].attrs['aria-pressed'],'true');
assert.equal(h.get('.bn-tech-selected-lab').textContent,'LAB 5');assert.equal(h.get('.bn-tech-active-name').textContent,'Medium Body - Cobra');
assert.ok(h.get('.bn-tech-queue-list').innerHTML.includes('data-queue-lab="15"'));
assert.ok(h.get('.bn-tech-queue-list').innerHTML.includes('bn-tech-queue-image'));
assert.equal(h.get('.bn-tech-detail-name').textContent,'Hover Propulsion','selected catalogue topic does not overwrite the active lab');
assert.ok(h.labs.children.every(n=>n.innerHTML.includes('build-icons/A0ResearchFacility.png')),'real lab artwork, no fabricated 3D');
assert.equal(h.get('.bn-tech-current-status').textContent,'LAB5 · RESEARCHING');assert.equal(h.get('.bn-tech-progress').attrs['aria-valuenow'],'40');assert.equal(h.get('.bn-tech-progress i').style.width,'40%');
h.state.engineLabs[4].estimatedProgress=NaN;h.context.renderSummary();assert.equal(h.get('.bn-tech-progress').hidden,true);assert.equal(h.get('.bn-tech-progress').attrs['aria-valuenow'],undefined,'missing native estimate never invents progress');
h.state.engineLabs[4].estimatedProgress=.4;h.state.engineLabs[4].waitingPower=true;h.context.renderSummary();assert.equal(h.get('.bn-tech-current-status').textContent,'LAB5 · WAITING FOR POWER');h.state.engineLabs[4].waitingPower=false;
vm.runInContext(extract('  function renderCatalog()', '  function renderSummary()'),h.context);
h.state.bridgeSyncs=1;h.state.playerPower=2430;h.state.catalog.push({id:'R-Test-Alloys',name:'Composite Alloys',nativeIndex:1,category:'VEHICLES',power:56,points:1800},{id:'R-Test-Cobra',name:'Medium Body - Cobra',nativeIndex:2,category:'VEHICLES',power:37,points:1200});h.context.renderCatalog();
for(const id of ['R-Test-Hover','R-Test-Alloys','R-Test-Cobra'])assert.ok(h.get('.bn-tech-list').innerHTML.includes('data-topic-id="'+id+'"'),'every actual available topic survives compact rendering');assert.ok(h.get('.bn-tech-list').innerHTML.includes('LAB 5 QUEUED'));assert.ok(h.get('.bn-tech-list').innerHTML.includes('LAB 5 ACTIVE'));
h.state.activeCategory='WEAPONS';h.context.renderCatalog();assert.ok(h.get('.bn-tech-list').innerHTML.includes('Complete another technology to unlock more.'));h.state.activeCategory='ALL';
h.state.assignmentError='The research queues could not sync.';h.state.pendingClose=true;h.context.renderSummary();assert.equal(h.get('.bn-tech-error').textContent,h.state.assignmentError);assert.equal(h.get('.bn-tech-assign').disabled,true);assert.equal(h.get('.bn-tech-done').textContent,'SYNCING QUEUES…');h.state.pendingClose=false;h.state.assignmentError='';
assert.equal(h.context.selectLab(4),true);assert.equal(h.labs.children[4].scrolls.length,1,'fifth lab is brought into view');
h.state.open=false;h.state.opening=true;h.context.activate();assert.equal(h.state.activeLab,4,'Towers reopen retains chosen fifth laboratory');

// Actual engine-output reconciliation preserves selection by stable object ID,
// including when a smaller-ID lab disappears or native input is reordered.
vm.runInContext(extract('  function categoryFor(', '  function commandReason('),h.context);
vm.runInContext(extract('  function parsePayload(', '  function knownTopic('),h.context);
vm.runInContext(extract('  function handleEngineOutput(', '  window.addEventListener("blocknight-engine-output"'),h.context);
const send=labs=>h.context.handleEngineOutput({detail:{text:'BNTECH:'+JSON.stringify({topics:h.state.catalog,labs,power:2430,gameTime:1000})}});
send(h.state.engineLabs.slice().reverse());assert.equal(h.state.engineLabs[h.state.activeLab].id,15);
send(h.state.engineLabs.filter(l=>l.id!==11));assert.equal(h.state.activeLab,3);assert.equal(h.state.engineLabs[h.state.activeLab].id,15);assert.equal(h.labs.children.length,4);assert.equal(h.state.bridgeErrors,0);

const legacy=harness(true);assert.equal(legacy.context.configureTowersResearchShell(legacy.shell),false);
assert.equal(legacy.context.document.head.children.length,0,'Duel never loads the Towers research theme');
assert.equal(legacy.preview.parentNode,legacy.main,'Duel keeps its separate preview column');assert.equal(legacy.categories.parentNode,legacy.rail,'Duel keeps its legacy combined rail');
legacy.context.renderAll();assert.ok(!legacy.get('.bn-tech-queue-list').innerHTML.includes('bn-tech-queue-image'));
assert.equal(legacy.labs.children[4].dataset.labId,undefined);
legacy.state.open=false;legacy.state.opening=true;legacy.context.activate();assert.equal(legacy.state.activeLab,0,'Duel retains established first-lab reopen behaviour');assert.equal(legacy.labs.children[0].scrolls.length,0);

assert.ok(css.includes('width:var(--wt-compact-window-width,min(740px,66vw))')&&css.includes('max-height:calc(100dvh - 84px)'),'content-fit left game window leaves battlefield visible');
assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'topic catalogue uses two columns');
assert.ok(css.includes('flex:0 0 auto')&&css.includes('overflow-x:auto'),'content-width lab/category controls retain real overflow');
assert.ok(css.includes('position:fixed;inset:0;z-index:-1;background:transparent;pointer-events:auto'),'shell-owned transparent shield preserves prior input coverage');
assert.ok(!css.includes('border:1px')&&!css.includes('border-bottom:1px')&&!css.includes('border-right:1px'),'compact surfaces have no borders or row dividers');
assert.ok(css.includes('touch-action:pan-x')&&css.includes('touch-action:pan-y'));
for(const selector of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/(^|\})\s*([^@{}][^{}]*)\{/gm)){const value=selector[2].trim();if(value&&!value.startsWith('#blocknight-research-shell.wt-towers-research')&&!value.startsWith('@')&&!value.startsWith('src:'))assert.fail('Unscoped Towers research selector: '+value);}
// The shared original HTML/style bytes and observable Duel lab/summary output
// remain identical to the frozen0.13 benchmark, rather than merely similar.
const baseline=execFileSync('git',['show','85ef078:app/src/main/assets/warzone-mobile-research.js'],{encoding:'utf8',maxBuffer:4*1024*1024});
const core=text=>text.slice(text.indexOf('  function createShell()'),text.indexOf('    configureTowersResearchShell(shell);',text.indexOf('  function createShell()')));
assert.equal(core(source),core(baseline),'Duel shared HTML and original style literal are byte-identical');
const snapshot=x=>Array.from(x.nodes,([key,n])=>[key,{html:n.innerHTML,text:n.textContent,attrs:n.attrs,style:n.style}]);
const beforeDuel=JSON.stringify(snapshot(legacy));
for(const [start,end]of [['  function renderLabs()','  function renderCategories()'],['  function renderSummary()','  const chooseTopic =']])vm.runInContext(baseline.slice(baseline.indexOf(start),baseline.indexOf(end,baseline.indexOf(start))),legacy.context);
legacy.context.renderAll();assert.equal(JSON.stringify(snapshot(legacy)),beforeDuel,'actual Duel lab/current/queue render is identical');
function canvasLifecycle(duel){
 const canvasStyle={transform:'',transformOrigin:'',transition:'',willChange:'',filter:''},hud={style:{visibility:'visible'}},wave={style:{visibility:'visible',getPropertyPriority:()=>'',setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}}};
 const c=vm.createContext({window:{__warzoneDuelConfig:duel?{mode:'duel'}:undefined},document:{body:{classList:{contains:()=>true}},getElementById:id=>id==='blocknight-combat-hud'?hud:wave},state:{},canvas:()=>({style:canvasStyle})});
 vm.runInContext(extract('  function saveCanvasStyle()', '  function activate()'),c);c.saveCanvasStyle();
 if(duel){assert.equal(canvasStyle.filter,'brightness(.32) saturate(.55)');assert.equal(hud.style.visibility,'hidden');}
 else{assert.equal(canvasStyle.filter,'');assert.equal(hud.style.visibility,'visible');assert.equal(wave.style.visibility,'visible');}
 c.restoreCanvasStyle();assert.equal(canvasStyle.filter,'');assert.equal(hud.style.visibility,'visible');assert.equal(wave.style.visibility,'visible');assert.equal(c.state.savedCanvasStyle,null);
}
canvasLifecycle(false);canvasLifecycle(true);
// Resolve the actual three-sheet cascade, including importance, specificity,
// shorthand resets and viewport media. Presence-only checks miss inherited
// legacy declarations such as the column layout that caused the R1 failure.
const legacyCss=fs.readFileSync('app/src/main/assets/warzone/ui/lab-research.css','utf8');
const inlineCss=Array.from(source.matchAll(/style\.textContent\s*\+?=\s*`([^`]+)`/g),m=>m[1]).join('\n');
function mediaMatches(query,width,height){return query.split(',').some(part=>Array.from(part.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)).every(([,limit,axis,n])=>limit==='min'?(axis==='width'?width:height)>=Number(n):(axis==='width'?width:height)<=Number(n)));}
function parseCss(text,width,height,rules=[]){
 text=text.replace(/\/\*[\s\S]*?\*\//g,'');let position=0;
 while(position<text.length){const open=text.indexOf('{',position);if(open<0)break;let level=1,end=open+1;for(;end<text.length&&level;end++){if(text[end]==='{')level++;else if(text[end]==='}')level--;}const head=text.slice(position,open).trim(),body=text.slice(open+1,end-1);position=end;
  if(head.startsWith('@media')){if(mediaMatches(head.slice(6),width,height))parseCss(body,width,height,rules);continue;}if(head.startsWith('@'))continue;
  const declarations=[];for(const raw of body.split(';')){const colon=raw.indexOf(':');if(colon<0)continue;const property=raw.slice(0,colon).trim(),important=/!important\s*$/.test(raw),v=raw.slice(colon+1).replace(/!important\s*$/,'').trim();declarations.push({property,value:v,important});}
  for(const selector of head.split(','))rules.push({selector:selector.trim(),declarations,order:rules.length});
 }return rules;
}
function simpleMatches(selector,node){
 if(!node||/:(?:before|after|focus-visible|active)\b/.test(selector))return false;
 if(selector.includes(':disabled')&&!node.disabled)return false;if(selector.includes(':first-child')&&!node.first)return false;if(selector.includes(':last-child')&&!node.last)return false;
 const not=selector.match(/:not\(\.([\w-]+)\)/);if(not&&node.classes.includes(not[1]))return false;
 selector=selector.replace(/:not\([^)]*\)|:[\w-]+/g,'');
 if(selector.includes('[hidden]')&&!node.hidden)return false;selector=selector.replace(/\[[^\]]+\]/g,'');
 const id=selector.match(/#([\w-]+)/);if(id&&id[1]!==node.id)return false;
 for(const match of selector.matchAll(/\.([\w-]+)/g))if(!node.classes.includes(match[1]))return false;
 const tag=selector.match(/^[a-z][\w-]*/i);return !tag||tag[0]===node.tag;
}
function selectorMatches(selector,node){const tokens=selector.replace(/>/g,' > ').trim().split(/\s+/);let index=tokens.length-1,current=node;if(!simpleMatches(tokens[index--],current))return false;while(index>=0){if(tokens[index]==='>'){current=current.parent;index--;if(!simpleMatches(tokens[index--],current))return false;}else{current=current.parent;while(current&&!simpleMatches(tokens[index],current))current=current.parent;if(!current)return false;index--;}}return true;}
function specificity(selector){return[(selector.match(/#/g)||[]).length,(selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)||[]).length,(selector.match(/(?:^|[\s>])[a-z][\w-]*/gi)||[]).length];}
function computed(node,width,height,theme=css){const winners={};const rules=[];for(const sheet of [legacyCss,theme,inlineCss])parseCss(sheet,width,height,rules);
 for(const rule of rules){if(!selectorMatches(rule.selector,node))continue;const score=specificity(rule.selector);for(const declaration of rule.declarations){let items=[[declaration.property,declaration.value]];const p=declaration.property,v=declaration.value;
   if(p==='border'||/^border-(top|right|bottom|left)$/.test(p)){const sides=p==='border'?['top','right','bottom','left']:[p.slice(7)],width=v.match(/^(?:\d+(?:\.\d+)?(?:px)?|none)\b/)?.[0]||'medium';items=sides.map(side=>['border-'+side+'-width',width==='none'?'0':width]);}
   if(p==='outline')items=[['outline-width',v.match(/^(?:\d+(?:\.\d+)?(?:px)?|none)\b/)?.[0]||'medium']];
   if(p==='overflow'){const a=v.split(/\s+/);items=[['overflow-x',a[0]],['overflow-y',a[1]||a[0]]];}
   if(p==='margin'||p==='padding'){const a=v.split(/\s+/);items=['top','right','bottom','left'].map((s,i)=>[p+'-'+s,a[i]||a[i===2?0:1]||a[0]]);}
   if(p==='font'){const size=v.match(/\b\d+(?:\.\d+)?px\b/);if(size)items.push(['font-size',size[0]]);}
   for(const[property,value]of items){const rank=[Number(declaration.important),...score,rule.order],previous=winners[property];if(!previous||rank.findIndex((n,i)=>n!==previous.rank[i])<0||(()=>{for(let i=0;i<rank.length;i++){if(rank[i]!==previous.rank[i])return rank[i]>previous.rank[i];}return true;})())winners[property]={value,rank,selector:rule.selector};}
  }}return Object.fromEntries(Object.entries(winners).map(([k,v])=>[k,v.value]));
}
const cssNode=(classes,parent=null,tag='section')=>({classes:classes.split(' '),parent,tag}),root=cssNode('wt-towers-research');root.id='blocknight-research-shell';
const main=cssNode('bn-tech-main',root),preview=cssNode('bn-tech-preview',main),detail=cssNode('bn-tech-detail',main),active=cssNode('bn-tech-active idle',detail),queue=cssNode('bn-tech-queue-panel',detail),list=cssNode('bn-tech-queue-list',queue,'ol'),item=cssNode('bn-tech-queue-item',list,'li'),remove=cssNode('bn-tech-queue-remove',item,'button'),assign=cssNode('bn-tech-assign',preview,'button'),catalogue=cssNode('bn-tech-browser',main),card=cssNode('bn-tech-card selected',catalogue,'button');
for(const[width,height]of [[1080,544],[854,430],[600,480]]){
 const selected=computed(preview,width,height);assert.equal(selected.display,'flex');assert.equal(selected['flex-direction'],'row','actual cascade keeps Selected/Add inline');assert.equal(selected['justify-content'],'flex-start');assert.equal(selected['text-align'],'left');assert.equal(computed(assign,width,height).width,'auto');assert.equal(computed(assign,width,height)['margin-top'],'0');
 for(const node of [preview,detail,active,queue,item,remove,assign,card])for(const side of ['top','right','bottom','left'])assert.equal(computed(node,width,height)['border-'+side+'-width'],'0','actual cascade clears inherited '+side+' border on '+node.classes[0]);
 assert.equal(computed(remove,width,height).width,'28px','scoped width beats legacy !important');assert.equal(computed(remove,width,height)['font-size'],'20px','scoped font shorthand beats legacy important font-size');
 assert.equal(computed(main,width,height)['overflow-y'],'auto','long text/errors can scroll within the bounded window');assert.equal(computed(list,width,height)['overflow-y'],'auto');assert.equal(computed(list,width,height)['max-height'],'62px');assert.equal(computed(detail,width,height)['overflow-y'],'auto');
}
const withoutRowFix=css.replace(/(\.bn-tech-preview\{[^}]*?)flex-direction:row;/,'$1');assert.notEqual(withoutRowFix,css);assert.equal(computed(preview,1080,544,withoutRowFix)['flex-direction'],'column','cascade regression reproduces the exact omitted-property R1 defect');
console.log('PASS: compact Towers render/native queues, five-lab ID/reopen, finite progress, actual important/media/shorthand cascade and R1 counterfactual, isolated theme and byte-identical Duel HTML/styles/render');
