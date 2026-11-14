/* Independently implemented public-results reader and Retropaganda default-rating
 * method. Source/method attribution: docs/hub-075-data-sources.md. No site code is
 * loaded or executed by this module. Ratings require a complete synced history. */
(() => {
 'use strict';
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k), finite=v=>typeof v==='number'&&Number.isFinite(v);
 const DEFAULTS=Object.freeze({base:1500,k:40,newMultiplier:2,newGames:50,minimumGames:10,recentNames:30,grace:180000});
 class SSEParser {
  constructor(emit){this.emit=emit;this.buffer='';this.event='';this.id='';this.data=[];this.first=true;}
  push(text){this.buffer+=text;if(this.buffer.length>2*1024*1024)throw Error('A results event is too large.');
   let end;while((end=this.buffer.search(/[\r\n]/))>=0){if(this.buffer[end]==='\r'&&end===this.buffer.length-1)return;
    let line=this.buffer.slice(0,end);const size=this.buffer[end]==='\r'&&this.buffer[end+1]==='\n'?2:1;this.buffer=this.buffer.slice(end+size);
    if(this.first){line=line.replace(/^\uFEFF/,'');this.first=false;}this.line(line);
   }
  }
  line(line){if(!line){if(this.data.length)this.emit({type:this.event||'message',id:this.id,data:this.data.join('\n')});this.event='';this.data=[];return;}
   if(line[0]===':')return;const split=line.indexOf(':'),key=split<0?line:line.slice(0,split);let value=split<0?'':line.slice(split+1);if(value[0]===' ')value=value.slice(1);
   if(key==='data')this.data.push(value);else if(key==='event')this.event=value;else if(key==='id'&&!value.includes('\0'))this.id=value;
  }
  finish(){if(this.buffer.endsWith('\r')){this.line(this.buffer.slice(0,-1));this.buffer='';}if(this.buffer||this.data.length)throw Error('The results stream ended before a complete event.');}
 }
 function normalize(raw,id){
  if(!raw||!raw.game||!Array.isArray(raw.playerData)||raw.playerData.length>64||!finite(raw.game.startDate)||!finite(raw.endDate)||!finite(raw.game.timeGameEnd))throw Error('Invalid public game record.');
  const g=raw.game;
  return {id:String(id||g.startDate+'_'+raw.endDate),game:{startDate:g.startDate,timeGameEnd:g.timeGameEnd,mapName:String(g.mapName||''),version:String(g.version||''),mods:String(g.mods||''),alliancesType:Number(g.alliancesType)||0,timeout:Boolean(g.timeout),cheated:Boolean(g.cheated)},endDate:raw.endDate,
   replayUrl:typeof raw.replayUrl==='string'&&/^https:\/\//.test(raw.replayUrl)?raw.replayUrl:null,
   playerData:raw.playerData.map(p=>({name:String(p.name||''),publicKey:typeof p.publicKey==='string'?p.publicKey:'',usertype:String(p.usertype||''),position:Number(p.position)||0,team:Number(p.team)||0,
    ...(p.ai!==undefined?{ai:p.ai}:{}),researchRatio:p.researchRatio,recentResearchPerformance:p.recentResearchPerformance,recentResearchPotential:p.recentResearchPotential,
    labResearchPerformance:p.labResearchPerformance,labResearchPotential:p.labResearchPotential,labActivity:p.labActivity,recentPowerWon:p.recentPowerWon,playerLeftGameTime:p.playerLeftGameTime}))};
 }
 function identity(p,aliases,spoiled){
  let name=p.name;if(name.length>2&&/_[2-5]$/.test(name))name=name.slice(0,-2);
  let key=p.publicKey,id,bot=false,discounted=false,spoiledKey=false,optedOut=false;
  if(key){try{if(key.length!==44)throw Error();atob(key);}catch{bot=true;}
   if(bot)id=key;else{id=own(aliases,key)?aliases[key]:key;const policy=own(spoiled,id)?spoiled[id]:undefined;spoiledKey=policy!==undefined;
    if(spoiledKey){optedOut=policy===true&&!id.includes(' ');if(optedOut)id=key;discounted=policy===null?true:policy;} }
  }else{
   bot=p.ai!==undefined||name.length!==0||p.usertype.length!==0&&p.usertype!=='spectator';discounted=!bot;
   name=name.replace(/^(?:Red|Orange|Yellow|Green|Cyan|Blue|Purple|Pink|Grey|Black)-/,'');
   if(p.ai){id=String(p.ai.scriptName)+' '+String(p.ai.difficulty);if(!name)name=id;}
   else if(name)id=name;else{name=p.usertype==='spectator'?'Spectator':p.usertype?'Generic':'Empty slot';id=p.usertype?name:'';}
   if(bot)key=id;
  }
  return{id,name,key,bot,discounted,spoiled:spoiledKey,optedOut};
 }
 function research(p){if(p.researchRatio!==undefined)return p.researchRatio;
  if(p.recentResearchPerformance!==undefined)return p.recentResearchPotential?p.recentResearchPerformance/p.recentResearchPotential:1;
  if(p.labResearchPerformance!==undefined)return p.labResearchPotential?p.labResearchPerformance/p.labResearchPotential:1;
  return p.labActivity!==undefined?p.labActivity:1;
 }
 function boardAccept(game,board){return board==='1v1'?game.players.length===2:board==='ffa'?game.players.length>=3&&(game.alliancesType<=1||game.teams.every(t=>t.players.length===1)):true;}
 function calculate(records,aliases={},spoiled={},board='global',complete=false){
  if(!['global','1v1','ffa'].includes(board))throw Error('Unsupported leaderboard.');
  const accounts=new Map(),all=[];
  for(const raw of records){const value=raw.game?raw:normalize(raw.value,raw.id),game={...value.game,id:value.id,endDate:value.endDate,replayUrl:value.replayUrl,duration:value.game.timeGameEnd,players:[],slots:[],teams:[]};const teams=new Map();
   for(const [index,p]of value.playerData.slice().sort((a,b)=>a.position-b.position).entries()){
    const who=identity(p,aliases,spoiled);let account=accounts.get(who.id);
    if(!account){account={...who,name:'',names:new Map(who.spoiled&&!who.optedOut?[[who.id,Infinity]]:[]),publicKeys:new Set(),games:[],elo:DEFAULTS.base,eloCount:0,wins:0,losses:0,draws:0};accounts.set(who.id,account);}
    if(who.key)account.publicKeys.add(who.key);account.names.set(who.name,(account.names.get(who.name)||0)+1);account.games.push(game);
    const key=game.alliancesType?p.team:index;let team=teams.get(key);if(!team){team={id:key,players:[],slots:[],userType:null,power:0};teams.set(key,team);}
    const player={account,name:who.name,userType:p.usertype,researchRatio:research(p),researchKnown:finite(p.researchRatio)||finite(p.recentResearchPerformance)&&finite(p.recentResearchPotential)||finite(p.labResearchPerformance)&&finite(p.labResearchPotential)||finite(p.labActivity),power:p.recentPowerWon,left:p.playerLeftGameTime,team:key};game.slots.push(player);team.slots.push(player);
    if(account.id){game.players.push(player);team.players.push(player);}
   }game.teams=Array.from(teams.values());all.push(game);
  }
  for(const account of accounts.values()){
   if(account.spoiled&&!account.optedOut)account.name=account.id;
   else{const names=new Map();for(const game of account.games.slice(-DEFAULTS.recentNames))for(const p of game.slots)if(p.account===account)names.set(p.name,(names.get(p.name)||0)+1);
    let highest=-Infinity;for(const[name,count]of names)if(count>highest){account.name=name;highest=count;}}
   for(const name of Array.from(account.names.keys()))if(name!==account.name&&(['Player','Player_2','Alpha','Beta'].includes(name)||name.toLowerCase().includes('test'))){account.names.set(account.name,account.names.get(account.name)+account.names.get(name));account.names.delete(name);}
  }
  const games=all.filter(game=>boardAccept(game,board)),seen=new Set(games.map(g=>g.startDate));
  for(const game of games){for(const team of game.teams){const kinds=new Set(team.players.map(p=>p.userType));team.userType=kinds.size===1?kinds.values().next().value:null;}
   if(!game.timeout){const live=game.teams.filter(t=>t.userType==='contender');if(live.length===1){live[0].userType='winner';for(const p of live[0].players)p.userType='winner';}}
  }
  for(const[id,a]of accounts){a.games=a.games.filter(g=>seen.has(g.startDate));if(!a.games.length)accounts.delete(id);else if(!a.discounted)a.discounted=a.games.length<DEFAULTS.minimumGames;}
  if(complete)for(const game of games)rate(game);
  for(const a of accounts.values()){
   let sum=0,count=0,quit=0,known=0;for(const game of a.games)if(game.ratingWeight!==undefined){const p=game.players.find(p=>p.account===a);if(p){sum+=p.researchRatio;quit+=p.quitRatio;count++;if(p.researchKnown)known++;}}
   a.researchKnown=known>0&&(!a.spoiled||!a.discounted);
   a.researchRatio=(!a.spoiled||!a.discounted)&&count?sum/count:1;a.quitRatio=(!a.spoiled||!a.discounted)&&count?1-quit/count:0;
  }
  const ordered=Array.from(accounts.values()).sort((a,b)=>(b.discounted?-1e9+b.games.length:b.elo)-(a.discounted?-1e9+a.games.length:a.elo));
  const rankings=ordered.map((a,i)=>({id:a.id||'',name:a.name||'Unknown',rank:complete?i+1:null,rating:complete&&!a.discounted?a.elo:null,games:a.games.length,wins:complete?a.wins:null,losses:complete?a.losses:null,draws:complete?a.draws:null,
   researchRatio:complete?a.researchRatio:null,researchRecorded:complete&&a.researchKnown,quitRatio:complete?a.quitRatio:null,eligible:complete&&!a.discounted,bot:a.bot,spoiled:a.spoiled,optedOut:a.optedOut,ratedGames:complete?a.eloCount:null,aliases:Array.from(a.names.keys())}));
  const rows=games.map(g=>({id:g.id,mapName:g.mapName,startDate:g.startDate,endDate:g.endDate,duration:g.duration,version:g.version,replayUrl:g.replayUrl,playerCount:g.players.length,
   alliancesType:g.alliancesType,valid:complete?g.ratingWeight!==undefined:null,ratingReason:complete?g.reason||'rated':'History is still syncing',
   players:g.slots.filter(p=>p.account.id).map(p=>({id:p.account.id,name:p.name,outcome:p.userType||null,team:p.team,bot:p.account.bot,researchRatio:p.researchRatio,researchRecorded:p.researchKnown,earlyQuit:p.earlyQuit===true,
    ratingBefore:complete&&!p.account.discounted&&finite(p.before)?p.before:null,ratingDelta:complete&&finite(p.delta)?p.delta:null}))})).reverse();
  return{board,complete,games:rows,rankings};
 }
 function rate(game){
  const d=DEFAULTS;for(const p of game.players)p.before=p.account.elo;
  if(game.cheated){game.reason='Cheated game';return;}if(game.duration<d.grace){game.reason='Shorter than three minutes';return;}
  if(game.teams.every(t=>t.userType==='loser')){game.reason='All teams reported a loss';return;}
  const sizes=game.teams.filter(t=>t.players.length).map(t=>t.players.length);if(Math.min(...sizes)!==Math.max(...sizes)){game.reason='Unequal team sizes';return;}
  for(const t of game.teams){for(const p of t.players){if(!p.account.spoiled||!p.account.discounted){if(t.userType==='winner')p.account.wins++;if(t.userType==='loser')p.account.losses++;if(t.userType==='contender')p.account.draws++;}
    p.earlyQuit=p.left!==undefined&&p.left<d.grace;p.quitRatio=p.left!==undefined&&game.duration?p.left/game.duration:1;t.power+=p.power;}}
  const teams=[];for(const t of game.teams){const members=t.players.filter(p=>!p.account.discounted&&!p.earlyQuit);if(!members.length)continue;
   const team={kind:t.userType,players:members,delta:0,elo:0};let exposure=0;
   for(const p of members){p.exposure=p.quitRatio<.9?p.quitRatio:1;exposure+=p.exposure;p.powerShare=t.power?p.power/t.power:1/members.length;}
   for(const p of members){p.exposure=exposure?p.exposure/exposure:1/members.length;team.elo+=p.before*p.exposure;}teams.push(team);
  }
  const wins=teams.filter(t=>t.kind==='winner'),draws=teams.filter(t=>t.kind==='contender'),losses=teams.filter(t=>t.kind==='loser'),survivors=wins.length?wins:draws;
  const change=(score,a,b)=>d.k*(score-1/(1+Math.pow(10,(b-a)/400)));
  if(survivors.length){const best=teams.slice().sort((a,b)=>b.elo-a.elo);
   for(const loser of losses){const opponent=best.find(t=>t!==loser);if(!opponent)continue;const amount=change(1,opponent.elo,loser.elo);game.ratingWeight=(game.ratingWeight||0)+amount;
    loser.delta=-amount*loser.players.length;for(const team of survivors)team.delta+=amount*loser.players.length/survivors.length;}}
  for(let i=0;i<draws.length;i++)for(let j=i+1;j<draws.length;j++){const a=draws[i],b=draws[j],amount=change(.5,a.elo,b.elo);game.ratingWeight=(game.ratingWeight||0)+Math.abs(amount);const transfer=amount*(a.players.length+b.players.length)/2;a.delta+=transfer;b.delta-=transfer;}
  for(const t of teams)if(t.delta)for(const p of t.players){const time=t.delta>0?t.delta*p.exposure:t.delta/t.players.length;
   const contribution=t.delta>0?t.delta*p.powerShare:t.delta*(t.players.length>1?(1-p.powerShare)/(t.players.length-1):1);
   const maturity=Math.min(p.account.eloCount,d.newGames)/d.newGames;p.delta=(time*maturity+contribution*(1-maturity))*(1+(d.newMultiplier-1)*(1-maturity));p.account.elo+=p.delta;p.account.eloCount++;}
  if(game.ratingWeight===undefined)game.reason='No eligible opposing teams';
 }
 function query(model,request){
  const search=String(request.search||'').trim().toLocaleLowerCase().slice(0,120),offset=Math.max(0,Math.floor(Number(request.offset)||0)),limit=Math.min(50,Math.max(1,Math.floor(Number(request.limit)||30)));
  const match=row=>!search||[row.mapName,...row.players.map(p=>p.name)].some(s=>String(s||'').toLocaleLowerCase().includes(search));
  let items=[],player,matchDetail;
  if(request.view==='rankings')items=model.complete?model.rankings.filter(a=>!search||[a.name,...a.aliases].some(s=>String(s).toLocaleLowerCase().includes(search))):[];
  else if(request.view==='player'){player=model.rankings.find(a=>a.id===request.playerId)||null;items=model.games.filter(g=>g.players.some(p=>p.id===request.playerId)&&match(g));}
  else if(request.view==='match')matchDetail=model.games.find(g=>g.id===request.matchId)||null;
  else items=model.games.filter(match);
  return{view:request.view||'results',board:model.board,total:items.length,offset,limit,items:items.slice(offset,offset+limit),available:request.view!=='rankings'||model.complete,...(player!==undefined?{player}:{}),...(matchDetail!==undefined?{match:matchDetail}:{})};
 }
 globalThis.WarzoneHubData=Object.freeze({DEFAULTS,SSEParser,normalize,calculate,query});
})();
