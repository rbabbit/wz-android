'use strict';
// Execute the delivered navigation functions against a small host DOM fixture.
// Device hit testing, clipping and actual native queue sync remain emulator QA.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const old=fs.readFileSync('tools/test-13-help.cjs','utf8');
let setup=old.slice(0,old.indexOf('for(const duel of [false,true])'));
setup=setup.replace("contains:value=>this.className.split(' ').includes(value)","contains:value=>this.className.split(' ').includes(value),toggle:(value,on)=>{const a=new Set(this.className.split(' ').filter(Boolean));on?a.add(value):a.delete(value);this.className=[...a].join(' ')}");
setup=setup.replace('function makeDocument(){',"Node.prototype.remove=function(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;};\nfunction makeDocument(){");
const loader={require,console,setTimeout};vm.runInNewContext(setup+';this.makeHarness=harness;',loader);
const checks=[];function check(name,fn){fn();checks.push(name);}
function harness(duel=false){
 const h=loader.makeHarness(duel),c=h.context;
 c.URLSearchParams=URLSearchParams;c.window.location={search:'?map=td2'};
 h.outer.documentElement={style:{getPropertyValue:()=>1}};
 const research={open:false,opening:false,blocked:false};
 c.window.__blockNightResearch={report:()=>research,open(){research.open=true;h.calls.push('research-open')},close(){h.calls.push('research-close');if(!research.blocked)research.open=research.opening=false;return true;}};
 c.window.WarzoneRewards={closeDrawer(){h.calls.push('rewards-close')},open(){h.calls.push('rewards-open')}};
 c.window.WarzoneMusic={closeMenu(){h.calls.push('music-close')},showMenu(){h.calls.push('music-open')},setBattleActive(){}};
 h.commands.afterBuildExit=fn=>fn();h.commands.toggle=page=>h.calls.push(['toggle',page]);
 c.window.__kalaWarzoneTouch={setHeaderMenuState:c.setHeaderMenuState,closeHelp:c.closeHelp};
 c.showCombatHud();return{...h,research};
}
const h=harness(),button=id=>h.outer.getElementById(id);
check('Towers header renames TECH to RESEARCH and links its real pane',()=>{
 assert.equal(button('blocknight-tech').querySelector('span').textContent,'RESEARCH');
 assert.equal(button('blocknight-tech').getAttribute('aria-controls'),'blocknight-research-shell');
});
check('Research header opens once and second tap calls the queue-preserving close API',()=>{
 button('blocknight-tech').command();assert(h.research.open);
 button('blocknight-tech').command();assert(!h.research.open);
 assert(h.calls.includes('research-close'));
});
check('Build Production and Queue header use toggle without changing programmatic open APIs',()=>{
 for(const page of ['build','factory','queue']){button('wt-open-'+page).command();assert(h.calls.some(v=>Array.isArray(v)&&v[0]==='toggle'&&v[1]===page));}
});
check('Opening Help leaves header usable and blocks only the battlefield frame',()=>{
 button('blocknight-help').command();
 assert.equal(h.outer.getElementById('warzone-towers-help-overlay').hidden,false);
 assert.equal(h.outer.getElementById('warzone-game-frame').inert,true);
 assert.equal(h.outer.getElementById('warzone-command-strip').inert,false);
 assert.equal(button('blocknight-help').getAttribute('aria-expanded'),'true');
});
check('Towers Help has no duplicate Close or Back to Battle controls',()=>{
 const help=h.outer.getElementById('warzone-towers-help');
 assert.equal(help.querySelector('.wt-help-close'),null);assert.equal(help.querySelector('.wt-help-back'),null);
 assert.equal(help.getAttribute('aria-modal'),'false');
 assert(help.innerHTML.includes('Top <b>RESEARCH</b>'));
});
check('Help header toggles closed repeatedly and restores native input/focus',()=>{
 for(let i=0;i<3;i++){
  if(h.outer.getElementById('warzone-towers-help-overlay').hidden)button('blocknight-help').command();
  button('blocknight-help').command();while(h.raf.length)h.raf.shift()();
  assert.equal(h.outer.getElementById('warzone-towers-help-overlay').hidden,true);
  assert.equal(h.outer.getElementById('warzone-game-frame').inert,false);
  assert.equal(button('blocknight-help').getAttribute('aria-expanded'),'false');
 }
 assert(h.calls.includes('focus'));
});
check('Switching Help to Research closes Help before opening Research',()=>{
 button('blocknight-help').command();button('blocknight-tech').command();
 assert.equal(h.outer.getElementById('warzone-towers-help-overlay').hidden,true);assert(h.research.open);
});
check('Research queue-sync failure keeps Research visible instead of opening another menu',()=>{
 h.research.blocked=true;button('blocknight-help').command();
 assert(h.research.open);assert.equal(h.outer.getElementById('warzone-towers-help-overlay').hidden,true);
 h.research.blocked=false;
});
check('Music and Rewards header switches close other JS and native Rewards panels through APIs',()=>{
 button('blocknight-music').command();assert(!h.research.open);assert(h.calls.includes('music-open'));
 button('blocknight-rewards').command();assert(h.calls.includes('rewards-open'));
 assert(h.calls.includes('rewards-close'));
});
check('Header state aliases preserve the real DOM button IDs',()=>{
 h.context.setHeaderMenuState('rewards',true);assert.equal(button('blocknight-rewards').getAttribute('aria-expanded'),'true');
 h.context.setHeaderMenuState('factory',true);assert.equal(button('wt-open-factory').getAttribute('aria-expanded'),'true');
});
const duel=harness(true);
check('Dormant Duel retains TECH label and separate guide close controls',()=>{
 assert.equal(duel.outer.getElementById('blocknight-tech').querySelector('span').textContent,'TECH');
 duel.context.showHelp();assert(duel.outer.getElementById('warzone-towers-help').querySelector('.wt-help-back'));
});
const researchSource=fs.readFileSync('app/src/main/assets/warzone-mobile-research.js','utf8');
function extract(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
check('Closing Research while queues are dirty continues existing native synchronization in background',()=>{
 const events=[],state={open:true,opening:false,dirtyLabs:{14:true},runner:null,syncBlocked:true,closes:0};
 const c={state,document:{getElementById:()=>({remove(){}})},restoreCanvasStyle(){},vibrate(){},canvas:()=>({focus(){}}),
  window:{__kalaWarzoneTouch:{setHeaderMenuState:(id,open)=>events.push([id,open])},parent:{WarzoneHost:{setResearchOpen(){}}}},
  startQueueSync(){state.runner={labIds:[14]};return true;},showQueueStatus:m=>events.push(m)};
 vm.createContext(c);vm.runInContext(extract(researchSource,'  function finishClose(', '  function selectLab('),c);
 c.close();assert.equal(state.open,false);assert.equal(state.runner.background,true);assert.equal(state.closes,1);
 assert(events.some(v=>typeof v==='string'&&v.includes('SYNCING 1 LAB QUEUE')));
});
const sources=['app/src/main/assets/warzone-touch-controls.js','app/src/main/assets/warzone-mobile-research.js','app/src/main/assets/warzone/ui/towers-shell.css','tools/check-navigation-031.cjs','tools/test-13-help.cjs'];
const report={version:'0.31',emulatorUsed:false,actualNavigationFunctionsExecuted:true,checksPassed:checks.length,checks,sources:sources.map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}))};
fs.writeFileSync('archive/navigation-0.31-checks.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:checks.length,emulatorUsed:false}));
