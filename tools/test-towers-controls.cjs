'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scenario/warzone-towers-bridge.js'),'utf8');
const start=source.indexOf('function warzoneTowersPollControlCommand()'),end=source.indexOf('function blockNightV32PollQueueCommand()',start);
let command={nonce:'stop-1',action:'stop-selected'};
const calls=[],acks=[];
const context=vm.createContext({includeJSON:()=>command,warzoneTowersLastControlNonce:'',DROID:0,DORDER_STOP:1,selectedPlayer:0,gameTime:100,
 enumSelected:()=>[{id:11,type:0,player:0},{id:12,type:0,player:0},{id:13,type:1,player:0},{id:14,type:0,player:1}],
 orderDroid:(droid,order)=>{calls.push([droid.id,order]);return true},dump:line=>acks.push(JSON.parse(line.slice('BNCONTROL:'.length)))});
vm.runInContext(source.slice(start,end),context);
context.warzoneTowersPollControlCommand();assert.deepEqual(calls,[[11,1],[12,1]],'only selected friendly units are stopped');
assert.deepEqual(acks[0].stopped,[11,12]);assert.equal(acks[0].nonce,'stop-1');
context.warzoneTowersPollControlCommand();assert.equal(calls.length,2,'same command cannot run twice');
command={nonce:'stop-2',action:'cancel'};context.warzoneTowersPollControlCommand();assert.equal(calls.length,2,'cancelled commands must not stop later selections');
command={nonce:'stop-3',action:'stop-selected'};context.enumSelected=()=>[];context.warzoneTowersPollControlCommand();assert.deepEqual(acks.at(-1).stopped,[]);
console.log('PASS: acknowledged STOP affects only selected friendly units, deduplicates, and respects cancellation');
