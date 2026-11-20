/* Native public-list presentation. Existing lobby parser, HTTP and session own joins. */
(() => {
 'use strict';
 if(typeof globalThis.AndroidMultiplayer?.landingReady!=='function')return;
 const token='landing-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 document.body.classList.add('mp-native-landing');
 const publish=state=>{try{AndroidMultiplayer.landingState(token,JSON.stringify({...state,notice:document.getElementById('notice')?.textContent||''}));}catch{}};
 const snapshot=()=>globalThis.PcLobbyUi?.snapshot?.()||{loading:true,hideEmpty:false,games:[],error:''};
 globalThis.PcNativeLobby=Object.freeze({
  publish,
  resume(){if(globalThis.PcMultiplayerSession?.active)return false;return globalThis.PcLobbyUi?.resume?.()||false;},
  setHideEmpty(value){if(typeof value!=='boolean'||globalThis.PcMultiplayerSession?.active)return false;const filter=document.getElementById('hide-empty');if(!filter)return false;filter.checked=value;filter.dispatchEvent(new Event('change'));publish(snapshot());return true;},
  join(id){
   if(globalThis.PcMultiplayerSession?.active||typeof id!=='string')return false;
   const room=snapshot().games.find(row=>row.id===id);if(!room?.joinable){publish({...snapshot(),error:room?.unavailable||'The room is no longer available. Reopen the lobby for the latest list.'});return false;}
   const field=document.getElementById('player-name');if(field)field.value=AndroidMultiplayer.getPlayerBaseName();
   const ok=globalThis.start?.(['--lobbyjoin='+room.id,'--window','--resolution='+innerWidth+'x'+innerHeight,'--noshadows'])===true;
   if(ok)AndroidMultiplayer.landingSessionStarted(token);else publish({...snapshot(),error:document.getElementById('profile-status')?.textContent||'Could not start this room. Please try again.'});
   return ok;
  }
 });
 const ready=()=>{AndroidMultiplayer.landingReady(token);publish(snapshot());};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
