/* Focused lifecycle regression checks. No Android, WASM or network required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/multiplayer/session.js'), 'utf8');

function fixture() {
 let clock = 0, sequence = 0, mode = 0, frames = [], closed = 0, refreshed = 0;
 const timers = new Map(), intervals = new Map(), nodes = new Map();
 const controls = {setPhase(){}, releaseAll(){}, report(){return {};}};
 const node = id => {
  if(!nodes.has(id)) nodes.set(id, {id,hidden:true,style:{},value:'',children:[],append(item){this.children.push(item);},replaceChildren(){this.children=[];}});
  return nodes.get(id);
 };
 const sandbox = {
  Date:{now:()=>clock},
  setTimeout(fn, delay){const id=++sequence;timers.set(id,{fn,at:clock+delay});return id;},
  clearTimeout(id){timers.delete(id);},
  setInterval(fn){const id=++sequence;intervals.set(id,fn);return id;},
  clearInterval(id){intervals.delete(id);},
  document:{getElementById:node,body:{classList:{toggle(){}}},querySelectorAll:()=>[],createElement(){const frame={contentWindow:{LaunchedModule:{getMultiplayerGameMode:()=>mode},PcMultiplayerState:{},PcMultiplayerControls:controls},remove(){this.removed=true;}};frames.push(frame);return frame;}},
  AndroidMultiplayer:{closeConnections(){closed++;},leave(){},home(){}},
  PcSocket:{receive(){}},refreshPcLobby(){refreshed++;},innerWidth:1920,innerHeight:1080
 };
 vm.runInNewContext(source, sandbox, {filename:'session.js'});
 const step = milliseconds => {
  clock += milliseconds;
  let ready;
  while((ready=[...timers].find(([,t])=>t.at<=clock))){timers.delete(ready[0]);ready[1].fn();}
 };
 return {
  session:sandbox.PcMultiplayerSession,node,
  start(){sandbox.start(['--join=test.invalid:2100']);sandbox.PcMultiplayerSession.engineReady();},
  socket:(id,type,payload='')=>sandbox.PcSocket.receive(id,type,payload),
  step,poll(){for(const fn of intervals.values())fn();},setMode(value){mode=value;},
  get closed(){return closed;},get refreshed(){return refreshed;},get frames(){return frames;}
 };
}

let count=0;
function test(name,run){run();count++;console.log('PASS '+name);}

test('NET and INFO diagnostics are not errors; warnings remain visible',()=>{
 const f=fixture();f.start();
 f.session.message('net     | 11:00:00: [recv] A normal packet');
 f.session.message('info    | 11:00:00: Native initialization');
 assert.equal(f.session.errors.length,0);
 f.session.message('warning | 11:00:00: A useful warning');
 assert.equal(f.session.errors.length,1);
});

test('initial terminal rejection returns without received bytes and keeps multiline reason',()=>{
 const f=fixture();f.start();f.socket(1,'open');
 f.session.message('info | 11:00:00: Failed to join with error: Wrong password');
 f.session.message('Contact the host for access.');
 f.step(250);
 assert.equal(f.session.active,false);
 assert.equal(f.node('notice').textContent,'Wrong password\nContact the host for access.');
 assert.equal(f.node('notice').style.whiteSpace,'pre-line');
 assert.equal(f.refreshed,1);
});

test('pre-acceptance bytes and endpoint close do not abort native fallback',()=>{
 const f=fixture();f.start();f.socket(1,'open');f.socket(1,'data','QUJDRA==');f.socket(1,'close');
 f.step(1000);assert.equal(f.session.active,true);
 assert.equal(f.session.report().roomEstablished,false);
 assert.equal(f.session.phase,'connecting');
 f.socket(2,'open');assert.equal(f.node('transition').hidden,true);
});

test('accepted-room reconnect cancels return and removes blocking transition',()=>{
 const f=fixture();f.start();f.socket(1,'open');
 f.session.message('net | 11:00:00: & local Options Received (MP game)');
 assert.equal(f.session.phase,'room');
 f.socket(1,'close');assert.equal(f.node('transition').hidden,false);
 f.step(200);f.socket(2,'open');
 assert.equal(f.node('transition').hidden,true);
 f.step(1000);assert.equal(f.session.active,true);
});

test('autohost waiting-room cancel and NET restart continue to new match port',()=>{
 const f=fixture();f.start();f.socket(1,'open');
 f.session.message('net |17:06:39: [recvOptions:1] & local Options Received (MP game)');
 f.session.message('net |17:06:44: [stopJoining:1] Canceling game...');
 f.socket(1,'close');
 f.session.message('net |17:06:44: [NETclose:1449] Terminating sockets.');
 f.session.message('net |17:06:44: [NETshutdown:1409] NETshutdown');
 f.session.message('net |17:06:44: [NETinit:1370] NETinit');
 f.step(30);
 f.session.message('net |17:06:44: [updateJoiningStatus:1485] Establishing connection with host');
 assert.equal(f.session.report().roomEstablished,false);
 assert.equal(f.node('transition').hidden,true);
 f.session.message('net |17:06:44: [socketOpen:454] Connecting to [65.21.236.11]:21002');
 f.step(91);f.socket(2,'open');f.step(1000);
 assert.equal(f.session.active,true);assert.equal(f.node('transition').hidden,true);
 f.session.message('net |17:06:45: Accepted into the game');
 assert.equal(f.session.phase,'room');
});

test('new open cancels stale cancel timer even without optional native progress log',()=>{
 const f=fixture();f.start();f.socket(1,'open');
 f.session.message('net | 11:00:00: & local Options Received (MP game)');
 f.session.message('net | 11:00:00: Canceling game...');f.socket(1,'close');
 f.step(100);f.socket(2,'open');f.step(1000);
 assert.equal(f.session.active,true);assert.equal(f.node('transition').hidden,true);
});

test('native kick after NETclose preserves reason and continuation',()=>{
 const f=fixture();f.start();f.socket(1,'open');
 f.session.message('net | 11:00:00: Accepted into the game');
 f.socket(1,'close');
 f.session.message('info | 11:00:00: You have been kicked, because Data check failed');
 f.session.message('Different ruleset\nAsk the host to restart.');
 f.socket(1,'error','Connection closed');
 f.step(250);
 assert.equal(f.session.active,false);
 assert.equal(f.node('notice').textContent,'Data check failed\nDifferent ruleset\nAsk the host to restart.');
});

test('loading signal prevents game controls during native mode transition',()=>{
 const f=fixture();f.start();f.socket(1,'open');
 f.session.loading(true);f.setMode(1);f.poll();
 assert.equal(f.session.phase,'loading');assert.equal(f.node('game-controls').hidden,true);
 f.session.loading(false);
 assert.equal(f.session.phase,'game');assert.equal(f.node('game-controls').hidden,false);
 f.setMode(2);f.poll();assert.equal(f.session.phase,'loading');
});

test('native cancel before data returns; a new start resets overlay and phase',()=>{
 const f=fixture();f.start();f.session.message('net | 11:00:00: We have stopped joining.');
 f.step(250);assert.equal(f.session.active,false);assert.equal(f.closed,1);
 f.node('transition').hidden=false;f.start();
 assert.equal(f.session.active,true);assert.equal(f.node('transition').hidden,true);
 assert.equal(f.session.phase,'connecting');assert.equal(f.session.report().roomEstablished,false);
});

test('candidate refusal does not return until native overall timeout',()=>{
 const f=fixture();f.start();f.socket(1,'open');f.socket(1,'error','Connection refused');f.socket(1,'close');
 f.step(1000);assert.equal(f.session.active,true);
 f.session.message('info | 11:00:00: Failed to join with timeout, state: WaitingForConnection');
 f.step(250);assert.equal(f.session.active,false);
 assert.match(f.node('notice').textContent,/Host did not respond/);
});

console.log(`${count} multiplayer lifecycle checks passed.`);
