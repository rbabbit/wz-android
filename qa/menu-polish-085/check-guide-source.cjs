/* Executes the real Guide reader without a browser or emulator. No layout claims. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root='app/src/main/assets/guide', html=fs.readFileSync(root+'/index.html','utf8');
assert(!/id="mode"|mode-label|aria-label="Game mode"/.test(html));
let document;
class Element {
  constructor(tag='div'){
    Object.assign(this,{tagName:tag,children:[],attrs:{},dataset:{},events:{},scrollTop:0,open:false,value:'',_text:''});
    this.style={setProperty(k,v){this[k]=v;}};
    const names=new Set();this.classList={add:n=>names.add(n),remove:n=>names.delete(n),contains:n=>names.has(n),toggle:n=>{if(names.has(n)){names.delete(n);return false;}names.add(n);return true;}};
  }
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this._text='';this.children=[...nodes];}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(e=>typeof e==='string'?e:e.textContent).join(' ');}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  dispatch(k,event={}){for(const fn of this.events[k]||[])fn({target:this,preventDefault(){},...event});}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){}
}
const checks=[];
for(const requested of ['', 'towers','ffa','campaign','invalid']){
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const roots=['research','play'].map(kind=>{const e=new Element('button');e.dataset.root=kind;return e;});
  document={activeElement:null,documentElement:new Element('html'),
    getElementById:id=>{assert(elements.has(id),'Unexpected/missing DOM id: '+id);return elements.get(id);},
    createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createDocumentFragment:()=>new Element('fragment'),
    querySelectorAll:selector=>{assert.equal(selector,'[data-root]');return roots;},addEventListener(){}};
  const context={document,window:{},location:{search:requested?'?mode='+requested:''},URLSearchParams,setTimeout:fn=>{fn();return 1;},clearTimeout(){}};
  vm.createContext(context);
  for(const file of ['research-data.js','practical-data.js','screenshots-data.js','guide.js'])vm.runInContext(fs.readFileSync(root+'/'+file,'utf8'),context,{filename:file});
  const api=context.window.WarzoneGuide, actual=api.state().mode, expected=['towers','ffa','campaign'].includes(requested)?requested:'towers';
  assert.equal(actual,expected);
  const raw=context.window.WarzoneGuideResearchData.catalogues[expected],topics=Array.isArray(raw)?raw:raw.topics;
  const count=Array.isArray(topics)?topics.length:Object.keys(topics).length;
  assert.equal(api.counts().topics,count);
  const chapters=context.window.WarzoneGuidePracticalData.chapters;
  let pageCount=0;
  for(const chapter of chapters){
    api.go({kind:'chapter',id:chapter.id});
    for(const p of chapter.pages)assert(elements.get('main').textContent.includes(p.title),expected+' chapter missing '+p.id);
    for(const p of chapter.pages){api.go({kind:'page',id:p.id});assert(elements.get('main').textContent.includes(p.title));pageCount++;}
  }
  const first=Array.isArray(topics)?topics[0]:Object.entries(topics).map(([id,t])=>({id,...t}))[0];
  api.go({kind:'topic',id:first.id});assert(elements.get('main').textContent.includes(first.name));
  const input=elements.get('query');input.value='transporter';input.dispatch('input');
  const campaignPage=chapters.flatMap(ch=>ch.pages).find(p=>p.id==='campaign-transporter');
  assert(elements.get('main').textContent.includes(campaignPage.title),'Campaign page must remain searchable from '+expected);
  api.go({kind:'sources'});assert(api.back());assert.equal(api.state().query,'transporter');
  assert.equal(api.state().mode,expected,'Practical navigation must not change research catalogue');
  const size=elements.get('type-size');size.dispatch('click');assert.equal(size.getAttribute('aria-pressed'),'true');assert.equal(document.documentElement.style['--scale'],'1.2');
  checks.push({requested:requested||'Home/default',catalogue:actual,topics:count,chapters:chapters.length,pages:pageCount,search:true,back:true,textSize:true});
}
const sources=['index.html','guide.css','guide.js'].map(file=>({path:root+'/'+file,sha256:crypto.createHash('sha256').update(fs.readFileSync(root+'/'+file)).digest('hex')}));
const report={version:'0.85',passed:true,method:'Actual guide.js executed against current HTML IDs and bundled data in a minimal source DOM fixture; no browser/emulator or rendering.',checks,
  assets:sources,sources,
  visualTested:false,emulatorUsed:false,recordedUTC:new Date().toISOString()};
fs.writeFileSync('qa/menu-polish-085/guide-source-checks.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
