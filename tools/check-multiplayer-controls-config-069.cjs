'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=path.join(__dirname,'../app/src/main/assets/multiplayer/lobby-config.js');
const sandbox={};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(source,'utf8'),sandbox,{filename:source});
const config=sandbox.PcLobbyConfig;
function parse(text){
 const sections={};let section='';
 for(const line of text.split(/\r?\n/)){
  const heading=line.match(/^\s*\[([^\]]+)\]\s*$/);
  if(heading){section=heading[1].trim().toLowerCase();sections[section]??={};continue;}
  const pair=line.match(/^\s*([^=;#]+?)\s*=\s*(.*)$/);
  if(pair)(sections[section]??={})[pair[1].trim().toLowerCase()]=pair[2];
 }
 return sections;
}
// Matches stock configuration.cpp's load order and display.cpp setter conflicts.
// It proves these values survive both current and legacy rotate-key migration.
function stockBindings(general){
 let rotate=3,pan=0;const right=Number(general.rightclickorders||0)!==0;
 if(right&&rotate===3)rotate=2;
 pan=Number(general.mousekeypan||0);if(pan===rotate)rotate=0;
 const next=Number(general.configversion||1)<3?(Number(general.middleclickrotate||0)?2:3):Number(general.mousekeyrotate||rotate);
 if(!(right&&next===3)){if(next===pan)pan=0;rotate=next;}
 return {pan,rotate,right};
}
const fixtures=[
 '',
 '[Other]\nlobbyserver=keep-other\nmouseKeyPan=99\n',
 '[General]\nconfigVersion=3\nRightClickOrders=1\nmouseKeyPan=0\nmouseKeyRotate=2\nvolume=41\n[Other]\nmouseKeyRotate=77\n',
 '[General]\r\nconfigVersion=1\r\nMiddleClickRotate=1\r\nRightClickOrders=1\r\nmouseKeyPan=0\r\n[Audio]\r\nvolume=20\r\n',
 '[General]\n; keep comment\nmouseKeyPan=0\nMOUSEKEYPAN=3\nrightclickorders=1\nRightClickOrders=1\nlobbyserver=wrong\n[Other]\nvalue=42\n',
];
for(const before of fixtures){
 const after=config.update(before),sections=parse(after),g=sections.general;
 assert.equal(g.lobbyserver,'https://wzlobby.wz2100.net/lobby');
 assert.deepEqual(stockBindings(g),{pan:2,rotate:3,right:false});
 assert.equal(config.update(after),after,'updates must be idempotent');
 const original=parse(before);
 for(const [section,values] of Object.entries(original))if(section!=='general')assert.deepEqual(sections[section],values,'unrelated sections are preserved');
 for(const key of ['mouseKeyPan','mouseKeyRotate','RightClickOrders','MiddleClickRotate']){
  const matches=after.match(new RegExp('^'+key+'=', 'gmi'))||[];
  // Other sections may intentionally use these names; only General is forced.
  assert.ok(matches.length>=1);
 }
 if(before.includes('volume=41'))assert.equal(g.volume,'41');
 if(before.includes('; keep comment'))assert.ok(after.includes('; keep comment'));
}
const duplicates=config.update(fixtures[4]).split('[Other]')[0];
assert.equal((duplicates.match(/^mouseKeyPan=/gmi)||[]).length,1);
assert.equal((duplicates.match(/^RightClickOrders=/gmi)||[]).length,1);
const noticePrefs={version:1,notifications:{campaignVideoNotification:{seen:2,skip:false},important:{seen:1,skip:false}}};
const updated=JSON.parse(config.updateNotifications(JSON.stringify(noticePrefs)));
assert.equal(updated.notifications.campaignVideoNotification.skip,true);
assert.equal(updated.notifications.campaignVideoNotification.seen,2);
assert.deepEqual(updated.notifications.important,noticePrefs.notifications.important);
assert.equal(updated.version,1);
assert.equal(config.updateNotifications(config.updateNotifications('')),config.updateNotifications(''));
assert.throws(()=>config.updateNotifications('[]'),/Invalid multiplayer notification/);
assert.throws(()=>config.updateNotifications('{broken'),{name:'SyntaxError'});
let written=new Map();
config.apply({readFile:p=>p.endsWith('/config')?fixtures[3]:JSON.stringify(noticePrefs),writeFile:(p,t)=>written.set(p,t)},'/warzone2100-online');
assert.deepEqual(stockBindings(parse(written.get('/warzone2100-online/config')).general),{pan:2,rotate:3,right:false});
assert.equal(JSON.parse(written.get('/warzone2100-online/notifications.json')).notifications.campaignVideoNotification.skip,true);
assert.deepEqual(JSON.parse(written.get('/warzone2100-online/notifications.json')).notifications.important,noticePrefs.notifications.important);
written=new Map();
config.apply({readFile:()=>{throw Error('missing');},analyzePath:()=>({exists:false}),writeFile:(p,t)=>written.set(p,t)},'/new');
assert.deepEqual(stockBindings(parse(written.get('/new/config')).general),{pan:2,rotate:3,right:false});
assert.deepEqual(JSON.parse(written.get('/new/notifications.json')),{notifications:{campaignVideoNotification:{skip:true}}});
assert.throws(()=>config.apply({readFile:()=>{throw Error('read failure');},analyzePath:()=>({exists:true})},'/existing'),/read failure/);
console.log('PASS MP stock controls config: fresh/current/legacy/duplicate INI, native key-conflict migration, scoped missing-video suppression, preference preservation and persistent FS.');
