/* Public-data worker only. It does not access a game, account login or Android
 * bridge. Incomplete history never produces a published leaderboard. */
'use strict';
importScripts('hub-data.js');
const Hub=WarzoneHubData,BASE='https://warzone2100.retropaganda.info/';
let generation=0,controller=null,committed=null,pending=null,status='idle',message='',cacheWarning='',lastNotice=0,storageQueue=Promise.resolve();
const models=new Map();
const validCursor=value=>typeof value==='string'&&(value===''||/^[0-9_]{1,100}$/.test(value));
function db(){return new Promise((resolve,reject)=>{const request=indexedDB.open('warzone-public-hub-075',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots');};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});}
async function readCache(){let database;try{database=await db();return await new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readonly'),store=tx.objectStore('snapshots');const a=store.get('complete'),b=store.get('checkpoint');tx.oncomplete=()=>resolve({complete:a.result,checkpoint:b.result});tx.onerror=()=>reject(tx.error);});}catch{cacheWarning='Offline storage is unavailable on this device.';return{};}finally{database?.close();}}
function saveCache(value,complete){const copy={...value,records:value.records.slice()};storageQueue=storageQueue.catch(()=>{}).then(async()=>{let database;try{database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');store.put(copy,complete?'complete':'checkpoint');if(complete)store.delete('checkpoint');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}catch{cacheWarning='The data loaded, but could not be cached for offline use.';}finally{database?.close();}});return storageQueue;}
function checkedCache(value){
 if(!value||value.version!==1||!validCursor(value.cursor)||!Array.isArray(value.records)||value.records.length>50000||!value.keys||!value.spoiled)return null;
 try{return{...value,records:value.records.map(r=>Hub.normalize(r,r.id)),complete:value.complete===true};}catch{return null;}
}
function visible(){return committed?.complete?committed:pending||{records:[],keys:{},spoiled:{},complete:false,lastUpdated:null};}
function notify(force=false){const now=Date.now();if(!force&&now-lastNotice<350)return;lastNotice=now;models.clear();const data=visible();
 postMessage({type:'state',status,message,cacheWarning,progress:{records:pending?.records.length||data.records.length,complete:data.complete===true},
  summary:{complete:data.complete===true,gameCount:data.records.length,playerCount:null,lastUpdated:data.lastUpdated||null,source:BASE+'hub',method:'Retropaganda defaults',cached:committed?.complete===true},boards:['global','1v1','ffa']});
}
async function feed(path,signal){const response=await fetch(BASE+path,{headers:{Accept:'application/json'},signal,redirect:'error'});if(!response.ok)throw Error('Public identity data could not load ('+response.status+').');const text=await response.text();if(text.length>1024*1024)throw Error('Public identity data is too large.');const value=JSON.parse(text);if(!value||Array.isArray(value)||typeof value!=='object'||Object.entries(value).some(([key,v])=>key.length>4096||(path==='player-public-keys.json'?typeof v!=='string'||v.length>1024:v!==null&&typeof v!=='boolean')))throw Error('Invalid public identity data.');return value;}
async function refresh(){const token=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;status='loading';message='Syncing public game history…';notify(true);
 const activeController=controller;const timer=setTimeout(()=>activeController.abort(),120000);try{
  const[keys,spoiled]=await Promise.all([feed('player-public-keys.json',signal),feed('player-spoiled-public-keys.json',signal)]);if(token!==generation)return;
  const base=pending||committed;pending={version:1,records:base?.records.slice()||[],cursor:base?.cursor||'',complete:false,keys,spoiled,lastUpdated:base?.lastUpdated||null};
  const seen=new Set(pending.records.map(r=>r.id));let synced=false,bytes=0,lastSave=Date.now();
  const parser=new Hub.SSEParser(event=>{
   if(event.type==='reset'){pending.records=[];pending.cursor='';seen.clear();return;}
   if(event.type==='synced'){synced=true;return;}
   if(event.type!=='message')return;if(!validCursor(event.id)||!event.id)throw Error('Invalid public results cursor.');
   const row=Hub.normalize(JSON.parse(event.data),event.id);if(!seen.has(row.id)){pending.records.push(row);seen.add(row.id);}
   pending.cursor=event.id;if(pending.records.length>50000)throw Error('The public history is larger than the current device limit.');notify();
  });
  const response=await fetch(BASE+'results.json?id='+encodeURIComponent(pending.cursor),{headers:{Accept:'text/event-stream'},signal,redirect:'error'});
  if(!response.ok||!String(response.headers.get('Content-Type')).startsWith('text/event-stream'))throw Error('The public results stream is unavailable.');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  try{while(!synced){const chunk=await reader.read();if(chunk.done)break;if(token!==generation)return;bytes+=chunk.value.byteLength;if(bytes>64*1024*1024)throw Error('The results download exceeded the device limit.');parser.push(decoder.decode(chunk.value,{stream:true}));
    if(Date.now()-lastSave>3000){lastSave=Date.now();saveCache(pending,false);}
   }
  }finally{await reader.cancel().catch(()=>{});}
  if(token!==generation)return;if(!synced)throw Error('The public history ended before synchronization finished.');
  pending.complete=true;pending.lastUpdated=Date.now();committed=pending;pending=null;await saveCache(committed,true);
  if(token!==generation)return;status='ready';message='Public history synced.';notify(true);
 }catch(error){if(token!==generation)return;status=committed?.complete?'offline':'error';message=signal.aborted?'The sync was interrupted. Tap Refresh to retry.':String(error.message||error);if(pending?.records.length)saveCache(pending,false);notify(true);
 }finally{clearTimeout(timer);if(token===generation)controller=null;}
}
async function load(){const token=++generation;controller?.abort();controller=null;status='loading';message='Opening saved public results…';notify(true);const cache=await readCache();if(token!==generation)return;
 committed=checkedCache(cache.complete);pending=checkedCache(cache.checkpoint);if(committed&&!committed.complete)committed=null;
 if(pending&&committed&&pending.lastUpdated<committed.lastUpdated)pending=null;
 status=committed?'ready':'loading';message=committed?'Showing cached public results; checking for updates…':'Syncing public game history…';notify(true);refresh();
}
function query(request){const data=visible(),board=['global','1v1','ffa'].includes(request.board)?request.board:'global';let model=models.get(board);
 if(!model){model=Hub.calculate(data.records,data.keys,data.spoiled,board,data.complete);models.set(board,model);}
 postMessage({type:'result',requestId:request.requestId,...Hub.query(model,request)});
}
onmessage=event=>{const request=event.data||{};try{
 if(request.type==='load')load().catch(error=>{status='error';message=String(error.message||error);notify(true);});
 else if(request.type==='refresh')refresh();
 else if(request.type==='query')query(request);
 else if(request.type==='cancel'){generation++;controller?.abort();controller=null;if(pending?.records.length)saveCache(pending,false);status='cancelled';message='Sync paused.';notify(true);}
 else postMessage({type:'error',requestId:request.requestId,message:'Unknown Hub request.'});
 }catch(error){postMessage({type:'error',requestId:request.requestId,message:String(error.message||error)});}};
