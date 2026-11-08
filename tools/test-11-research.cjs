'use strict';
// Execute current layout and selection functions, including real BNTECH
// reconciliation. Native gameplay/layout measurements belong to emulator QA.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
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
 return {context,state,shell,main,rail,browser,detail,preview,categories,labs,get};
}
const h=harness();
assert.equal(h.context.configureTowersResearchShell(h.shell),true);
assert.equal(h.context.document.head.children.length,1);assert.equal(h.context.document.head.children[0].href,'/warzone/ui/towers-research.css');h.context.installTowersResearchTheme();assert.equal(h.context.document.head.children.length,1,'theme attached once');
assert.equal(h.preview.parentNode,h.detail,'real selected-topic elements move into the laboratory panel');
assert.equal(h.categories.parentNode,h.main,'filters have their own full row');
h.context.renderAll();assert.equal(h.labs.children.length,5);
assert.equal(h.labs.children[4].dataset.labId,'15');assert.equal(h.labs.children[4].attrs['aria-pressed'],'true');
assert.equal(h.get('.bn-tech-selected-lab').textContent,'LAB 5');assert.equal(h.get('.bn-tech-active-name').textContent,'Medium Body - Cobra');
assert.ok(h.get('.bn-tech-queue-list').innerHTML.includes('data-queue-lab="15"'));
assert.ok(h.get('.bn-tech-queue-list').innerHTML.includes('bn-tech-queue-image'));
assert.equal(h.get('.bn-tech-detail-name').textContent,'Hover Propulsion','selected catalogue topic does not overwrite the active lab');
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

assert.ok(css.includes('grid-template-areas:"labs labs" "filters filters" "topics queue"'));
assert.ok(css.includes('flex:1 0 138px')&&css.includes('overflow-x:auto'),'five labs fit or own a real horizontal overflow strip');
assert.ok(css.includes('touch-action:pan-x')&&css.includes('touch-action:pan-y'));
for(const selector of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/(^|\})\s*([^@{}][^{}]*)\{/gm)){const value=selector[2].trim();if(value&&!value.startsWith('#blocknight-research-shell.wt-towers-research')&&!value.startsWith('@')&&!value.startsWith('src:'))assert.fail('Unscoped Towers research selector: '+value);}
console.log('PASS: real two-column Towers DOM, fifth-lab selection/queues, native-ID reconciliation, reopen context and scoped style; Duel retains legacy layout and selection behaviour');
