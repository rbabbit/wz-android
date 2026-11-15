'use strict';
/* Temporary CDP transport fixture only. Never imports ADB or edits an APK.
 * Install in the parent lobby page, then use the ACTUAL native Refresh/Join UI.
 * All native TCP, room, Ready, map transfer and gameplay responses remain real.
 */
function installRuntime() {
 const key='__nativeLandingsPrivateFixture084';
 if(globalThis[key]?.inspect)return globalThis[key].inspect();
 const original=globalThis.AndroidLobbyHttp;
 if(!original||typeof original.request!=='function')throw Error('AndroidLobbyHttp.request is unavailable');
 if(typeof globalThis.PcLobbyHttp?.receive!=='function')throw Error('Parent lobby HTTP callback is unavailable');
 const requestDescriptor=Object.getOwnPropertyDescriptor(original,'request');
 const globalDescriptor=Object.getOwnPropertyDescriptor(globalThis,'AndroidLobbyHttp');
 const delegate=original.request.bind(original),id='qa-private-084';
 const listingUrl='https://wzlobby.wz2100.net/lobby/api/v1/games';
 const resolveUrl='https://wzlobby.wz2100.net/lobby/api/v1/game/'+id+'/request-join';
 const rawRoom={id,name:'PRIVATE QA · 1 human + 1 Cobra',map:'Sk-Mountain',players:{cur:1,max:4},
  v:'4.7.0',netv:[16384,104],conn:['tcp:ip4'],private:false};
 const listing=JSON.stringify({type:'header',motd:'Private unlisted QA transport fixture; directory metadata is synthetic.'})+'\n'+JSON.stringify(rawRoom)+'\n';
 const resolution=JSON.stringify({connections:[{type:'tcp:ip4',host:'10.0.2.2',port:22180}],joinToken:''});
 const rows=[];let mode='',delegatedRequests=0,active=true;
 const encode=text=>{const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);return btoa(binary);};
 function wrapped(requestId,method,url,headers,body) {
  const verb=String(method).toUpperCase(),endpoint=String(url);
  const match=active&&(verb==='GET'&&endpoint===listingUrl?'listing':verb==='POST'&&endpoint===resolveUrl?'id-resolution':'');
  if(!match){delegatedRequests++;return delegate(requestId,method,url,headers,body);}
  const row={sequence:rows.length+1,requestId,method:verb,url:endpoint,kind:match,responseStatus:200,delivered:false};
  rows.push(row);if(rows.length>40)rows.shift();
  setTimeout(()=>{
   try {globalThis.PcLobbyHttp.receive(requestId,200,JSON.stringify({'Content-Type':match==='listing'?'application/jsonl':'application/json'}),encode(match==='listing'?listing:resolution),'');row.delivered=true;}
   catch(error){row.error=String(error?.message||error);}
  },0);
 }
 try {original.request=wrapped;}catch{}
 if(original.request===wrapped)mode='method-assignment';
 if(!mode) {
  try {Object.defineProperty(original,'request',{value:wrapped,configurable:true,writable:true});}catch{}
  if(original.request===wrapped)mode='method-property';
 }
 if(!mode) {
  try {Object.defineProperty(globalThis,'AndroidLobbyHttp',{value:{request:wrapped},configurable:true,writable:true,enumerable:globalDescriptor?.enumerable??true});}catch{}
  if(globalThis.AndroidLobbyHttp?.request===wrapped)mode='parent-global-property';
 }
 if(!mode)throw Error('HTTP bridge is not writable; bounded fixture was not installed');
 const inspect=()=>({installed:active,mode,fixtureId:id,intercepts:[{method:'GET',url:listingUrl},{method:'POST',url:resolveUrl}],
  host:'10.0.2.2',port:22180,map:'Sk-Mountain',declaredDirectoryCounts:{current:1,maximum:4,liveOccupancyMeasured:false},
  directoryDataSynthetic:true,idResolutionSynthetic:true,gameplayResponsesMocked:false,readyStateMocked:false,
  publicMessagesSent:false,delegatedRequests,requests:rows.map(row=>({...row}))});
 const uninstall=()=>{
  active=false;
  if(mode==='parent-global-property'){
   if(globalDescriptor)Object.defineProperty(globalThis,'AndroidLobbyHttp',globalDescriptor);else globalThis.AndroidLobbyHttp=original;
  }else if(requestDescriptor)Object.defineProperty(original,'request',requestDescriptor);else{delete original.request;if(original.request!==delegate&&typeof original.request!=='function')original.request=delegate;}
  return inspect();
 };
 globalThis[key]=Object.freeze({inspect,uninstall});
 return inspect();
}
async function install(c){if(typeof c?.evaluate!=='function')throw Error('Expected connected CDP helper with evaluate(expression)');return c.evaluate('('+installRuntime.toString()+')()');}
async function inspect(c){return c.evaluate('globalThis.__nativeLandingsPrivateFixture084?.inspect?.() || null');}
async function uninstall(c){return c.evaluate('globalThis.__nativeLandingsPrivateFixture084?.uninstall?.() || null');}
module.exports={install,inspect,uninstall};

// Local behavior check only; never connects a browser or device.
if(require.main===module){
 const assert=require('node:assert/strict'),vm=require('node:vm');
 const calls=[],responses=[],tasks=[];
 const sandbox={TextEncoder,btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout:fn=>tasks.push(fn),AndroidLobbyHttp:{request(...args){calls.push(args);}},PcLobbyHttp:{receive(...args){responses.push(args);}}};
 const installed=vm.runInNewContext('('+installRuntime.toString()+')()',sandbox);
 assert.equal(installed.installed,true);assert.equal(calls.length,0);assert.equal(responses.length,0);
 sandbox.AndroidLobbyHttp.request(1,'GET',installed.intercepts[0].url,'{}','');
 sandbox.AndroidLobbyHttp.request(2,'POST',installed.intercepts[1].url,'{}','do-not-log-attestation');
 sandbox.AndroidLobbyHttp.request(3,'POST','https://wzlobby.wz2100.net/lobby/api/v1/game/other/request-join','{}','unchanged');
 sandbox.AndroidLobbyHttp.request(4,'GET',installed.intercepts[0].url+'?extra=1','{}','');
 tasks.forEach(fn=>fn());assert.equal(responses.length,2);assert.equal(calls.length,2);assert.equal(calls[0][4],'unchanged');
 const listing=Buffer.from(responses[0][3],'base64').toString('utf8').trim().split('\n').map(JSON.parse);
 assert.equal(listing[1].id,'qa-private-084');assert.equal(listing[1].map,'Sk-Mountain');
 const resolution=JSON.parse(Buffer.from(responses[1][3],'base64').toString('utf8'));
 assert.deepEqual(resolution,{connections:[{type:'tcp:ip4',host:'10.0.2.2',port:22180}],joinToken:''});
 const report=sandbox.__nativeLandingsPrivateFixture084.inspect();assert.equal(report.requests.length,2);assert.equal(report.gameplayResponsesMocked,false);assert(!JSON.stringify(report).includes('attestation'));
 sandbox.__nativeLandingsPrivateFixture084.uninstall();sandbox.AndroidLobbyHttp.request(5,'GET',installed.intercepts[0].url,'{}','');assert.equal(calls.length,3);
 console.log(JSON.stringify({passed:true,checks:8,emulatorUsed:false,networkUsed:false,fixtureInstalledOnDevice:false}));
}
