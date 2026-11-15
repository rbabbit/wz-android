/* Player-private UI queues; this file is evaluated by the native UI context,
   never registered with the synchronized game rules or its timer system. */
var eventChat=function(){},eventResearched=function(){};
var mpMobileTimers=[];
function namespace(){}
function setTimer(){}
function queue(name,delay,arg){mpMobileTimers.push({name:name,due:gameTime+Number(delay||0),arg:arg});}
function hideInterface(){}
function showInterface(){}
function showReticuleWidget(){}
var blockNightV28Queues={},blockNightV28ContinueAttempts={},blockNightV28Responses={};
var blockNightV32LastQueueNonce='',blockNightLabTopics={},warzoneTowersLabResearch={},blockNightLastResearchSnapshot='';
function blockNightResearchCategory(topic){return '';}
function mpMobileTick(){
 if(!wtcmd_started){wtcmd_indexStats();wtcmd_started=true;dump('WTREADY:'+JSON.stringify({version:70,alwaysQueue:true}));}
 wtcmd_poll();blockNightV32PollQueueCommand();
 Object.keys(blockNightV28Queues).forEach(function(id){blockNightV28StartNext(Number(id));});
 wtcmd_tickBuilds();wtcmd_tickProduction();
 var due=mpMobileTimers.filter(function(t){return t.due<=gameTime;});mpMobileTimers=mpMobileTimers.filter(function(t){return t.due>gameTime;});
 due.slice(0,32).forEach(function(t){if(typeof globalThis[t.name]==='function')globalThis[t.name](t.arg);});
 blockNightEmitResearchSnapshotV23();
}
function blockNightEmitResearchSnapshotV23(){
 var topics=blockNightV28AvailableResearch().map(function(t,index){return {id:t.id,name:t.fullname,power:t.power,points:t.points,started:t.started,done:t.done,nativeIndex:index};});
 var labs=enumStruct(selectedPlayer,RESEARCH_LAB).filter(function(l){return l.status===BUILT;}).sort(function(a,b){return a.id-b.id;}).map(function(l,index){
  var n=l.towersResearch||{},a=warzoneTowersLabResearch[String(l.id)]||blockNightLabTopics[String(l.id)];
  var topic=n.topicId?getResearch(n.topicId,selectedPlayer):a?getResearch(a.topicId,selectedPlayer):null;
  if(topic&&topic.done){delete warzoneTowersLabResearch[String(l.id)];delete blockNightLabTopics[String(l.id)];topic=null;}
  return {id:l.id,nativeIndex:index,idle:structureIdle(l)&&!topic,modules:l.modules,health:l.health,topicId:topic?topic.id:'',topicName:topic?topic.fullname:'',
   estimatedProgress:n.progress||0,remainingSeconds:n.remainingSeconds==null?null:n.remainingSeconds,waitingPower:!!n.waitingPower};
 });
 var value={version:70,gameTime:gameTime,power:playerPower(selectedPlayer),topics:topics,labs:labs};
 var stable=JSON.stringify(value);if(stable!==blockNightLastResearchSnapshot){blockNightLastResearchSnapshot=stable;dump('BNTECH:'+stable);}
}
