'use strict';
// Execute the actual HUD/help functions. Real scrolling, text sizing and native
// input restoration are separately checked on the installed delivery APK.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-touch-controls.js','utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`source section ${start}`);return source.slice(a,b)};
class Node{
 constructor(tag,doc){this.tagName=tag;this.doc=doc;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.listeners={};this.style={};this.hidden=false;this.inert=false;this.scrollTop=0;this._text='';this._html='';this.className='';this.classList={add:value=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),value])].join(' ')},contains:value=>this.className.split(' ').includes(value)};}
 append(...nodes){for(const n of nodes){if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);this.children.push(n);n.parentNode=this;}}
 appendChild(n){this.append(n);return n}
 after(n){const a=this.parentNode.children;if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);a.splice(a.indexOf(this)+1,0,n);n.parentNode=this.parentNode;}
 setAttribute(k,v){v=String(v);this.attributes[k]=v;if(k==='id')this.id=v;if(k==='class')this.className=v;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
 getAttribute(k){return this.attributes[k]??null}
 hasAttribute(k){return Object.hasOwn(this.attributes,k)}
 addEventListener(k,fn){(this.listeners[k]||=[]).push(fn)}
 focus(){this.doc.activeElement=this}
 all(){return this.children.flatMap(c=>[c,...c.all()])}
 matches(s){if(s==='button:not([disabled])')return this.tagName==='button'&&!this.hasAttribute('disabled');if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.classList.contains(s.slice(1));return this.tagName===s;}
 querySelectorAll(s){const parts=s.split(',').map(v=>v.trim());return this.all().filter(n=>parts.some(p=>n.matches(p)))}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('')}
 set textContent(v){this._text=String(v);this.children=[]}
 get innerHTML(){return this._html}
 set innerHTML(value){this._html=String(value);this.children=[];const stack=[this];for(const token of this._html.matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)){const raw=token[0];if(raw.startsWith('</')){stack.pop();continue;}if(raw.startsWith('<')){const tag=raw.match(/^<([a-z0-9-]+)/i)[1],n=new Node(tag,this.doc);for(const a of raw.slice(tag.length+1).matchAll(/([\w:-]+)(?:="([^"]*)"|'([^']*)')?/g))n.setAttribute(a[1],a[2]??a[3]??'');stack.at(-1).append(n);if(!['img','input','br','hr'].includes(tag)&&!raw.endsWith('/>'))stack.push(n);}else stack.at(-1)._text+=raw;}}
}
function makeDocument(){const doc={activeElement:null,createElement(tag){return new Node(tag,doc)},getElementById(id){return [doc.head,doc.body,...doc.head.all(),...doc.body.all()].find(n=>n.id===id)||null},defaultView:{matchMedia:()=>({matches:true,addEventListener(){}})}};doc.head=new Node('head',doc);doc.body=new Node('body',doc);return doc}
function harness(duel=false){
 const doc=makeDocument(),outer=makeDocument(),calls=[],raf=[],commands={tower:true,close(){calls.push('close-page')},closeNative(){calls.push('close-native')},setSize(v){calls.push(['size',v])},open(v){calls.push(['open',v])}},config=duel?Object.freeze({mode:'duel',humanBranch:'rockets',botBranch:'cannon'}):undefined;
 for(const id of ['warzone-command-strip','warzone-game-frame']){const n=outer.createElement('div');n.id=id;outer.body.append(n)}
 const context={state:{battleActive:true},document:doc,window:{__warzoneDuelConfig:config,__warzoneCommands:commands,parent:{WarzoneHost:{restoreBattlefield(){calls.push('restore')}}},addEventListener(){}},ZOOM_PRESETS:{close:{label:'NEAR'},battle:{label:'BATTLE'},map:{label:'MAP'}},commandDocument:()=>outer,bindTouchCommand:(n,fn)=>n.command=fn,showBattlefieldViewport(){},updateCombatHud(){},toggleQueueMode(){},jumpToBase(){calls.push('base')},toggleCombatLock(){},toggleAutoFight(){},toggleBoxMode(){},stopSelected(){},applyZoomPreset:p=>calls.push(['zoom',p]),releaseAll(){calls.push('release')},focusCanvas(){calls.push('focus')},requestAnimationFrame:fn=>raf.push(fn),setTimeout,console};
 vm.createContext(context);vm.runInContext(extract('  function showCombatHud()', '  function beginSingle('),context);
 return {context,doc,outer,calls,raf,commands};
}
for(const duel of [false,true]){
 const h=harness(duel);assert.equal(h.context.showCombatHud(),true);
 for(const p of ['close','battle','map'])assert.equal(Boolean(h.outer.getElementById(`blocknight-zoom-${p}`)),duel,'only Duel retains camera preset buttons');
 assert.equal(Boolean(h.outer.getElementById('blocknight-zoom-control')),duel);
 const base=h.outer.getElementById('blocknight-base');assert.ok(base);base.command();assert.ok(h.calls.includes('base'));
 for(const id of ['wt-open-build','wt-open-design','wt-open-factory','wt-open-queue','blocknight-tech','blocknight-help'])assert.ok(h.outer.getElementById(id),id);
 h.context.showHelp();const help=h.outer.getElementById('warzone-towers-help'),overlay=h.outer.getElementById('warzone-towers-help-overlay'),content=help.querySelector('.wt-help-content');
 assert.equal(overlay.hidden,false);assert.equal(h.outer.getElementById('warzone-game-frame').inert,true);assert.equal(h.outer.getElementById('warzone-command-strip').inert,true);
 const text=help.textContent,markup=help.innerHTML;
 if(duel){assert.ok(text.includes('FIELD GUIDE')&&text.includes('NEAR / BATTLE / MAP'));assert.ok(markup.includes('Your weapon branch is <b>Rockets</b>'));assert.ok(!text.includes('SKIP WAVE'));assert.equal(h.outer.getElementById('wt-towers-guide-style'),null);assert.equal(help.classList.contains('wt-towers-guide'),false);}
 else{
  assert.ok(text.includes('HOW TO PLAY'));assert.equal(help.classList.contains('wt-towers-guide'),true);assert.ok(!text.includes('NEAR / BATTLE / MAP')&&!text.includes('SAVE DESIGN keeps'));
  for(const phrase of ['3 minutes to prepare','30 rounds','SKIP WAVE','does not clear enemies','BUILD → MODULES','ADD TO LAB … QUEUE','current work only','estimated progress','selected factory','1, 5, 10 or 20','SAVE BLUEPRINT','SAVE CHANGES','SAVE AS NEW','SAVE DESIGN TO PHONE','between games and app restarts','research them again','Return to Main Menu'])assert.ok(text.includes(phrase),phrase);
  assert.ok(markup.includes('completed labs on the battlefield')&&markup.includes('completed factories on the battlefield'));
  assert.equal(content.getAttribute('tabindex'),'0');
  const css=h.outer.getElementById('wt-towers-guide-style').textContent;assert.ok(css.includes('max-height:calc(100dvh - 24px)')&&css.includes('min-height:0; overflow:auto')&&css.includes('touch-action:pan-y'));assert.ok(css.includes('@media(max-width:560px)'));
  assert.ok(!/https?:|wiki|campaign|cheat|free research|automatically saves/i.test(markup),'guide uses in-app actions and avoids imported guides or unsupported save claims');
 }
 for(let cycle=0;cycle<3;cycle++){
  content.scrollTop=99;help.querySelector('.wt-help-back').command();while(h.raf.length)h.raf.shift()();assert.equal(overlay.hidden,true);assert.equal(h.outer.getElementById('warzone-game-frame').inert,false);assert.equal(h.outer.getElementById('warzone-command-strip').inert,false);assert.ok(h.calls.includes('restore')&&h.calls.includes('focus'));
  h.context.showHelp();assert.equal(overlay.hidden,false);if(!duel)assert.equal(content.scrollTop,0,'reopen starts at guide top');
 }
 assert.equal(h.outer.head.all().filter(n=>n.id==='wt-towers-guide-style').length,duel?0:1,'guide theme is installed once');
 let prevented=false,stopped=false;overlay.listeners.keydown[0]({key:'Escape',preventDefault(){prevented=true},stopPropagation(){stopped=true}});assert.ok(prevented&&stopped&&overlay.hidden,'Escape closes Help and consumes input');
}
// Ground the guide in this application's actual local rules and UI labels.
const config=fs.readFileSync('vendor/tower-defense/mod/config.js','utf8'),waves=fs.readFileSync('scenario/warzone-towers-waves.js','utf8'),end=fs.readFileSync('vendor/tower-defense/mod/multiplay/script/rules/endconditions.js','utf8'),pages=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
assert.match(config,/wait\(180\), round\(1\)/);assert.match(config,/round\(30\)/);assert.match(waves,/command\.action === "next" && state\.waiting/);assert.match(end,/Spawner\.queue\.length == 0 && countDroid\(DROID_ANY, scavAI\) == 0/);
for(const phrase of ['SAVE BLUEPRINT','SAVE CHANGES','SAVE AS NEW','SAVE TO PHONE','BLUEPRINT LIBRARY'])assert.ok(pages.includes(phrase));
assert.ok(source.includes('function applyZoomPreset(preset)')&&source.includes('function advanceTilt(dy)')&&source.includes('function advancePan(marker, x, y)'),'camera controls remain available to gesture/programmatic callers');
console.log('PASS: actual Towers HUD omits three preset buttons and keeps BASE; grounded local HOW TO PLAY, bounded body scrolling, repeated close/reopen/focus restoration; Duel navigation and guide remain unchanged');

