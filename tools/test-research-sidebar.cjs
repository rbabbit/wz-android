'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('archive/legacy-html-ui/warzone-mobile-research.js','utf8');
const nodes=new Map();
function node(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',src:'',alt:'',disabled:false,dataset:{},style:{},classList:{toggle(){}},getAttribute(name){return this[name];}});return nodes.get(selector);}
const hover={id:'hover',name:'Hover Propulsion',nativeIndex:7,category:'VEHICLES',points:3600,power:112};
const state={activeLab:0,selectedTopicIndex:7,catalog:[hover],engineLabs:[
 {id:11,nativeIndex:0,idle:false,topicId:'shells',topicName:'HEAT Cannon Shells Mk2',remainingSeconds:49,estimatedProgress:.48},
 {id:12,nativeIndex:1,idle:false,topicId:'synaptic',topicName:'Synaptic Link Data Analysis Mk2',remainingSeconds:40,estimatedProgress:.56},
 {id:13,nativeIndex:2,idle:true,topicId:'',topicName:''},
 {id:14,nativeIndex:3,idle:false,topicId:'alloys',topicName:'Composite Alloys'}],pendingClose:false,assignmentError:''};
const queues={11:[{id:'cannon',name:'Medium Cannon'}],12:[{id:'manufacturing',name:'Automated Manufacturing'}],13:[],14:[hover]};
const context=vm.createContext({state,document:{getElementById:()=>({querySelector:node})},
 queueForLab:id=>queues[id]||[],knownTopic:()=>null,topicImage:t=>'research-icons/'+encodeURIComponent(t.name)+'.gif',
 activeLabForTopic:id=>state.engineLabs.find(l=>!l.idle&&l.topicId===id),queuedLocation:topicId=>Object.keys(queues).map(Number).find(id=>queues[id].some(t=>t.id===topicId))??null,escapeHtml:x=>x});
vm.runInContext(source.slice(source.indexOf('  function renderSummary()'),source.indexOf('  const chooseTopic =')),context);
for(const [index,active,next] of [[0,'HEAT Cannon Shells Mk2','Medium Cannon'],[1,'Synaptic Link Data Analysis Mk2','Automated Manufacturing'],[0,'HEAT Cannon Shells Mk2','Medium Cannon']]){
 state.activeLab=index;context.renderSummary();
 assert.equal(node('.bn-tech-active-name').textContent,active);
 assert.equal(node('.bn-tech-current-image').src,'research-icons/'+encodeURIComponent(active)+'.gif');
 assert.equal(node('.bn-tech-selected-lab').textContent,'LAB '+(index+1));
 assert.equal(node('.bn-tech-lab-total').textContent,'2 ITEMS');
 assert.ok(node('.bn-tech-queue-list').innerHTML.includes(next));
 assert.equal(node('.bn-tech-detail-name').textContent,'Hover Propulsion','catalogue preview remains independent of lab status');
}
state.activeLab=2;context.renderSummary();
assert.equal(node('.bn-tech-active-name').textContent,'No active research');assert.equal(node('.bn-tech-lab-total').textContent,'0 ITEMS');
assert.ok(!node('.bn-tech-queue-list').innerHTML.includes('Medium Cannon'));
state.activeLab=1;state.engineLabs[1].topicName='Automated Manufacturing';state.engineLabs[1].topicId='manufacturing';queues[12]=[];context.renderSummary();
assert.equal(node('.bn-tech-active-name').textContent,'Automated Manufacturing');assert.equal(node('.bn-tech-lab-total').textContent,'1 ITEM');
console.log('PASS: selected lab owns its name, image, total and queue; catalogue Hover cannot leak into lab status; idle and native-advance states reset correctly');
