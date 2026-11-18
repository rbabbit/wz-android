/* QA runtime fixture only. Listing/resolution are synthetic; native matches are real. */
(function installPrivateDirectory() {
 'use strict';
 const ROLE='player',PORT=22206,id='qa-players-092-player-run3',key='__playersPolishPrivateDirectory092';
 const old=globalThis[key];
 if(old){const state=old.inspect();if(state.installed&&state.fixtureId===id)return state;if(state.installed)throw Error('Uninstall the other owned directory fixture first');}
 const original=globalThis.AndroidLobbyHttp,callback=globalThis.PcLobbyHttp;
 if(typeof original?.request!=='function'||typeof callback?.receive!=='function'||!callback.report?.().main)throw Error('Install only in the actual multiplayer parent HTTP bridge');
 const requestDescriptor=Object.getOwnPropertyDescriptor(original,'request'),cancelDescriptor=Object.getOwnPropertyDescriptor(original,'cancel');
 const globalDescriptor=Object.getOwnPropertyDescriptor(globalThis,'AndroidLobbyHttp');
 const delegate=original.request.bind(original),delegateCancel=typeof original.cancel==='function'?original.cancel.bind(original):()=>{};
 const listingUrl='https://wzlobby.wz2100.net/lobby/api/v1/games',resolveUrl='https://wzlobby.wz2100.net/lobby/api/v1/game/'+id+'/request-join';
 const rawRoom={id,name:'PRIVATE PLAYERS092 · '+ROLE,map:'Sk-Mountain',players:{cur:ROLE==='player'?1:2,max:4},v:'4.7.0',netv:[16384,104],conn:['tcp:ip4'],private:false};
 const listing=JSON.stringify({type:'header',motd:'Synthetic local QA directory only; native readiness, roles, statistics and gameplay are real.'})+'\n'+JSON.stringify(rawRoom)+'\n';
 const resolution=JSON.stringify({connections:[{type:'tcp:ip4',host:'10.0.2.2',port:PORT}],joinToken:''});
 const pending=new Map(),rows=[];let active=true,mode='',delegatedRequests=0,blockedOfficialRequests=0;
 const encode=text=>{const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);return btoa(binary);};
 const official=url=>{try{return new URL(url).origin==='https://wzlobby.wz2100.net';}catch{return false;}};
 function wrapped(requestId,method,url,headers,body){
  const verb=String(method).toUpperCase(),endpoint=String(url);
  const match=active&&(verb==='GET'&&endpoint===listingUrl?'listing':verb==='POST'&&endpoint===resolveUrl?'id-resolution':'');
  if(!match&&!official(endpoint)){delegatedRequests++;return delegate(requestId,method,url,headers,body);}
  if(!active)return delegate(requestId,method,url,headers,body);
  if(!match)blockedOfficialRequests++;
  const row={requestId,method:verb,kind:match||'blocked-official-endpoint',delivered:false,canceled:false};rows.push(row);if(rows.length>40)rows.shift();
  const timer=setTimeout(()=>{
   pending.delete(requestId);if(!active||row.canceled)return;
   try{callback.receive(requestId,match?200:0,JSON.stringify({'Content-Type':match==='listing'?'application/jsonl':'application/json'}),encode(match==='listing'?listing:match==='id-resolution'?resolution:''),match?'':'Private QA fixture blocked unrelated official-lobby request');row.delivered=true;}
   catch(error){row.error=String(error?.message||error);}
  },0);
  pending.set(requestId,{timer,row});
 }
 function cancel(requestId){const item=pending.get(requestId);if(item){clearTimeout(item.timer);pending.delete(requestId);item.row.canceled=true;return;}return delegateCancel(requestId);}
 try{original.request=wrapped;original.cancel=cancel;}catch{}
 if(original.request===wrapped&&original.cancel===cancel)mode='method-assignment';
 if(!mode){try{Object.defineProperty(original,'request',{value:wrapped,configurable:true,writable:true});Object.defineProperty(original,'cancel',{value:cancel,configurable:true,writable:true});}catch{}if(original.request===wrapped&&original.cancel===cancel)mode='method-property';}
 if(!mode){try{Object.defineProperty(globalThis,'AndroidLobbyHttp',{value:{request:wrapped,cancel},configurable:true,writable:true,enumerable:globalDescriptor?.enumerable??true});}catch{}if(globalThis.AndroidLobbyHttp?.request===wrapped&&globalThis.AndroidLobbyHttp?.cancel===cancel)mode='parent-global-property';}
 if(!mode){restoreProperty(original,'request',requestDescriptor,delegate);restoreProperty(original,'cancel',cancelDescriptor,delegateCancel);throw Error('QA HTTP bridge is not writable; no host connection was attempted');}
 const inspect=()=>({installed:active,mode,fixtureId:id,role:ROLE,host:'10.0.2.2',port:PORT,directoryDataSynthetic:true,idResolutionSynthetic:true,declaredDirectoryCounts:{current:rawRoom.players.cur,maximum:4,liveOccupancyMeasured:false},nativeGameplayMocked:false,readyStateMocked:false,publicRequestsSentByFixture:false,pendingSynthetic:pending.size,delegatedRequests,blockedOfficialRequests,requests:rows.map(row=>({...row}))});
 function restoreProperty(object,name,descriptor,value){try{if(descriptor)Object.defineProperty(object,name,descriptor);else{delete object[name];if(typeof object[name]!=='function')object[name]=value;}return true;}catch{return object[name]===value||object[name]!==wrapped&&object[name]!==cancel;}}
 const uninstall=()=>{
  for(const [requestId,item]of pending){clearTimeout(item.timer);item.row.canceled=true;try{callback.receive(requestId,0,'{}','','Private QA directory removed');}catch{}}
  pending.clear();active=false;
  if(mode==='parent-global-property'){if(globalDescriptor)Object.defineProperty(globalThis,'AndroidLobbyHttp',globalDescriptor);else globalThis.AndroidLobbyHttp=original;}
  // Restore any partial method edits as well as the selected installation mode.
  const requestRestored=restoreProperty(original,'request',requestDescriptor,delegate),cancelRestored=restoreProperty(original,'cancel',cancelDescriptor,delegateCancel);
  return {...inspect(),requestRestored,cancelRestored};
 };
 globalThis[key]=Object.freeze({inspect,uninstall});return inspect();
})()
