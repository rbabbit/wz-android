'use strict';
// Bounded host include/lifecycle check. It does not simulate native gameplay.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const files=JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/warzone/maps-bots/files.json'),'utf8'));
const sources=new Map(files.map(file=>[file.path,Buffer.from(file.data,'base64').toString('utf8')]));
for(const[file,source]of sources)if(file.endsWith('.js'))new vm.Script(source,{filename:file});
function context(difficulty){
 const timers=[],native={difficulty,EASY:1,MEDIUM:2,HARD:3,INSANE:4,me:1,maxPlayers:3,mapWidth:128,mapHeight:128,
  startPositions:[{x:10,y:10},{x:110,y:10},{x:10,y:110}],derrickPositions:[],playerData:[{name:'Player'},{name:'Bot'},{name:'Bot2'}],
  Stats:{},Upgrades:{},isMultiplayer:true,ALLIES:-3,ALL_PLAYERS:-1,
  DROID_CYBORG_CONSTRUCT:10,COMP_PROPULSION:3,COMP_BODY:1,COMP_WEAPON:8,
  enumDroid:()=>[],enumStruct:()=>[],propulsionCanReach:()=>true,isSpectator:()=>false,
  setTimer:(name,ms)=>{timers.push({name,ms});return true;},queue:()=>true,newGroup:(()=>{let group=0;return()=>++group;})(),random:()=>0,chat:()=>{},
  includeJSON:()=>{throw Error('Unexpected external JSON dependency');}};
 const c=vm.createContext(native);
 c.include=file=>{const relative=file.replace(/^\//,'');const source=sources.get('/data/mp/'+(relative.startsWith('multiplay/')?relative:'multiplay/skirmish/'+relative));assert(source,'Missing include '+file);vm.runInContext(source,c,{filename:file});};
 return{c,timers};
}
let cases=0;
for(const difficulty of[1,2,3])for(const personality of['personality_cannons.js','personality_mg.js','personality_squeedlers.js']){
 const{c,timers}=context(difficulty);c.include('multiplay/skirmish/ratbot/'+personality);
 assert.equal(timers.length,0);vm.runInContext('CountTrucks=function(){return 0;};UpdateRatios=function(){};eventStartLevel();',c);
 assert.equal(timers.length,13);assert.equal(timers.find(row=>row.name==='MakeTanks').ms,Math.round(300*([0,3,1.8,1][difficulty])));
 const count=timers.length;vm.runInContext('OilTrucks={ID:7};BuildJobs=[{Group:{ID:8}}];eventGameLoaded();',c);
 assert.equal(timers.length,count);assert.equal(vm.runInContext('typeof OilTrucks.GetDroids+":"+typeof BuildJobs[0].NumAssignedTrucks',c),'function:function');cases++;
}
for(const difficulty of[1,2,3]){
 const{c,timers}=context(difficulty);c.include('multiplay/skirmish/maps-dumbot25a.js');
 assert.equal(timers.length,0);vm.runInContext('eventStartLevel();',c);assert.equal(timers.length,6);
 assert.equal(timers[0].ms,Math.round(501*([0,3,1.8,1][difficulty])));
 const count=timers.length;vm.runInContext('mapsDumbWeapon="rockets";eventGameLoaded();',c);
 assert.equal(timers.length,count);assert.equal(vm.runInContext('dumbSchema===argEnum.schema.ROCKET',c),true);cases++;
}
for(const difficulty of[1,2,3]){
 const{c,timers}=context(difficulty);c.include('multiplay/skirmish/wally.js');assert.equal(timers.length,0);
 vm.runInContext('isHoverMap=function(){return false;};isMultiTech4=function(){};recycleOldBuilders=function(){};getAliveAllyPlayersData=function(){return[];};getAliveEnemyPlayersData=function(){return[];};setCurrentEnemy=function(){};build=function(){};lookForOil=function(){};produceDroids=function(){};research=function(){};eventStartLevel();',c);
 assert.equal(vm.runInContext('reactionSpeedDelay',c),[0,15000,5000,0][difficulty]);
 assert.equal(timers.length,20);cases++;
}
console.log('PASS: '+cases+' actual-source include/difficulty/lifecycle cases; '+files.length+' packaged files. Native gameplay not exercised.');
