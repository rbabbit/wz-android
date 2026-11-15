/* Actual native room snapshots only; request acknowledgement is not Ready. */
(() => {
 'use strict';
 const root=document.getElementById('mp-room');if(!root)return;
 const $=id=>document.getElementById(id),MAX_MESSAGES=120;
 let snapshot=null,pending=null,serial=0,visible=false,feedback='',rosterKey='',chatKey='',optionsKey='',disposed=false,composing=false,chatFocused=false,chatSendPress=false;
 const chatRows=new Map();let chatView=null,rosterView=null,resizeSerial=0,previewKey='',nativeViewport=null,lastViewportRevision=-1;
 const feedbackSounds={sounds:0,presses:0,cancellations:0};let soundAudio=null,lastSound=-Infinity,soundPress=null;const soundRecent=new WeakMap();
 const text=(value,limit=512)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,limit);
 const node=(tag,className,value)=>{const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=text(value);return n;};
 function soundButton(target){const button=target?.closest?.('button');return visible&&button?.isConnected&&!button.disabled&&root.contains(button)&&!button.closest('[hidden],[inert]')?button:null;}
 function soundLevel(){try{const game=document.getElementById('warzone-game-frame')?.contentWindow,module=game?.LaunchedModule||game?.Module,folder=module?.WZVAL_configDirPath||game?.wz_js_get_config_dir_path?.();if(!folder||!module?.FS?.readFile)return 0;const config=module.FS.readFile(folder+'/config',{encoding:'utf8'}),ui=config.match(/^voicevol\s*=\s*(\d+)/m)?.[1],effects=config.match(/^fxvol\s*=\s*(\d+)/m)?.[1];if(effects!==undefined&&Number(effects)===0)return 0;return ui===undefined?1:Math.min(1,Math.max(0,Number(ui)/100));}catch{return 0;}}
 function playSound(button){const now=performance.now(),level=soundLevel();if(!soundButton(button)||!(level>0)||now-lastSound<70)return;try{if(!soundAudio){soundAudio=new Audio('/warzone/ui/game-controls/click.ogg');soundAudio.preload='none';}soundAudio.volume=Math.min(.30,level*.30);soundAudio.currentTime=0;lastSound=now;soundAudio.play()?.then?.(()=>{feedbackSounds.sounds++;}).catch?.(()=>{});}catch{}}
 function cancelSound(){if(soundPress){soundPress.button.classList.remove('mp-room-pressing');soundRecent.set(soundPress.button,performance.now());soundPress=null;feedbackSounds.cancellations++;}}
 function scrollView(list,followTail=true){
  const bounds=list.getBoundingClientRect(),anchors=[];
  for(const row of list.children){const key=row.dataset.messageKey??row.dataset.playerId;if(key===undefined)continue;const box=row.getBoundingClientRect();if(box.bottom>bounds.top+.5){anchors.push({key,offset:box.top-bounds.top});if(anchors.length===4)break;}}
  return{top:list.scrollTop,tail:followTail&&list.scrollHeight-list.scrollTop-list.clientHeight<24,anchors};
 }
 function restoreScroll(list,view,followTail=true){
  if(!view)return;if(followTail&&view.tail){list.scrollTop=list.scrollHeight;return;}
  const bounds=list.getBoundingClientRect();for(const anchor of view.anchors){const row=Array.from(list.children).find(value=>(value.dataset.messageKey??value.dataset.playerId)===anchor.key);if(row){list.scrollTop+=row.getBoundingClientRect().top-bounds.top-anchor.offset;return;}}
  list.scrollTop=view.top;
 }
 function valid(value){return Boolean(value&&value.version===79&&value.ready===true&&typeof value.generation==='string'&&value.generation.length>0&&Number.isInteger(value.revision)&&Number.isInteger(value.localPlayer)&&Array.isArray(value.players)&&value.players.length<=256&&value.players.some(p=>p&&p.id===value.localPlayer&&p.allocated===true)&&value.permissions&&typeof value.permissions==='object');}
 function local(){return snapshot?.players.find(p=>p.id===snapshot.localPlayer)||null;}
 function occupied(player){return player.allocated===true||player.ai===true||typeof player.ai==='number'&&player.ai>=0;}
 function teamLabel(value){return Number.isInteger(value)&&value>=0&&value<26?String.fromCharCode(65+value):Number.isInteger(value)?String(value+1):'—';}
 function localState(){const p=local();return{ready:snapshot?.local?.ready===true,spectator:snapshot?.local?.spectator===true,downloading:snapshot?.local?.downloading===true,team:p?.team};}
 function setFeedback(value){feedback=text(value,512);$('mp-room-feedback').textContent=feedback;}
 function clearPending(message=''){if(pending)clearTimeout(pending.timer);pending=null;setFeedback(message);renderActions();}
 function confirmed(request){const s=localState();return request.action==='ready'?s.ready===request.ready:request.action==='team'?s.team===request.team&&!s.ready:request.action==='spectator'?s.spectator===request.spectator:false;}
 function inspectPending(){if(!pending?.accepted||pending.generation!==snapshot?.generation)return;if(snapshot.revision>pending.revision&&confirmed(pending))clearPending();}
 function denial(action){const p=snapshot?.permissions||{},s=localState();if(!visible||!snapshot)return'The room is not ready.';if(pending)return'Wait for the current room change.';if(action==='ready'&&(p.canReady!==true||s.downloading))return text(p.readyReason||'Finish downloading before becoming ready.');if(action==='team'&&(p.canTeam!==true||s.spectator))return'The host has locked team changes.';if(action==='spectator'&&((s.spectator?p.canPlay:p.canSpectate)!==true||s.downloading))return text(s.spectator?p.playReason||'No player slot is available.':p.spectatorReason||'Spectating is unavailable.');if(action==='chat'&&!['enabled','host-only'].includes(p.chatMode))return'Chat is disabled by the host.';return'';}
 async function request(action,data={}){
  const reason=denial(action);if(reason){setFeedback(reason);return false;}
  const session=globalThis.PcMultiplayerSession;if(typeof session?.roomCommand!=='function'){setFeedback('The room connection is not available.');return false;}
  const mine={...data,action,serial:++serial,generation:snapshot.generation,revision:snapshot.revision,accepted:false,timer:null};pending=mine;setFeedback('');renderActions();
  mine.timer=setTimeout(()=>{if(pending===mine)clearPending('The room change was not confirmed. Please try again.');},10000);
  let reply;try{reply=await session.roomCommand(action,data);}catch{reply={ok:false,reason:'The room connection is unavailable.'};}
  if(pending!==mine||!visible||snapshot?.generation!==mine.generation)return false;
  if(reply?.generation&&reply.generation!==mine.generation){clearPending('The room changed. Please try again.');return false;}
  if(reply?.ok!==true){clearPending(text(reply?.reason||'The host did not accept that change.'));return false;}
  mine.accepted=true;
  if(action==='chat'){
   if($('mp-room-chat-input').value===mine.text)$('mp-room-chat-input').value='';
   clearPending();return true; // No local echo: only native messages enter the log.
  }
  inspectPending();renderActions();return true;
 }
 function renderPlayers(){
  const players=snapshot.players.slice().sort((a,b)=>Number(a.spectator)-Number(b.spectator)||(a.position??a.id)-(b.position??b.id));
  const key=JSON.stringify([snapshot.localPlayer,snapshot.hostPlayer,players]);if(key===rosterKey)return;rosterKey=key;
  const list=$('mp-room-players'),view=scrollView(list,false),fragment=document.createDocumentFragment();
  for(const p of players){
   const used=occupied(p),row=node('div','mp-room-player'+(p.id===snapshot.localPlayer?' local':'')+(!used?' open':''));row.dataset.playerId=String(p.id);
   const team=node('span','mp-room-team',p.spectator?'S':teamLabel(p.team));row.append(team);
   const name=node('span','mp-room-player-name',used?text(p.name||'Player',128):p.closed===true?'Closed slot':'Open slot');
   const tags=[];if(p.local||p.id===snapshot.localPlayer)tags.push('You');if(p.host||p.id===snapshot.hostPlayer)tags.push('Host');if(used&&!p.allocated)tags.push('Bot');if(tags.length)name.append(node('small','',tags.join(' · ')));row.append(name);
   row.append(node('span','mp-room-player-status',!used?'':p.spectator?'Spectator':!p.allocated?'Bot':p.downloading?'Downloading':p.ready?'Ready':'Not ready'));fragment.append(row);
  }
  list.replaceChildren(fragment);restoreScroll(list,view,false);rosterView=scrollView(list,false);
 }
 function renderChat(){
  const messages=Array.isArray(snapshot.messages)?snapshot.messages.slice(-MAX_MESSAGES):[],key=JSON.stringify([snapshot.generation,messages]);if(chatKey===key)return;chatKey=key;
  const log=$('mp-room-chat-log'),view=scrollView(log),keys=new Set(),rows=[];
  messages.forEach((message,index)=>{
   let key=snapshot.generation+':'+String(message.seq??index);if(keys.has(key))key+=':'+index;keys.add(key);
   const system=message.kind==='system',local=message.playerId===snapshot.localPlayer,content=JSON.stringify([system,local,message.name,message.text]);
   let line=chatRows.get(key);if(!line){line=node('p');line.dataset.messageKey=key;chatRows.set(key,line);}
   if(line.dataset.content!==content){line.dataset.content=content;line.className='mp-room-message'+(system?' system':'')+(local?' local':'');line.dataset.sequence=String(message.seq??'');line.replaceChildren();if(!system)line.append(node('b','',text(message.name||'Player',128)));line.append(document.createTextNode(text(message.text,4096)));}
   rows.push(line);
  });
  for(const [key,line]of chatRows)if(!keys.has(key)){line.remove();chatRows.delete(key);}
  log.querySelector('.mp-room-chat-empty')?.remove();let cursor=log.firstChild;
  for(const row of rows){if(row!==cursor)log.insertBefore(row,cursor);cursor=row.nextSibling;}
  if(!rows.length)log.append(node('p','mp-room-chat-empty','Room messages will appear here.'));
  restoreScroll(log,view);chatView=scrollView(log);
 }
 function renderOptions(){
  const values=Array.isArray(snapshot.options)?snapshot.options.slice(0,24):[],key=JSON.stringify(values);if(key===optionsKey)return;optionsKey=key;
  const list=$('mp-room-options-list');list.replaceChildren();
  for(const item of values){if(!item||typeof item.label!=='string')continue;const row=node('div');row.append(node('dt','',item.label),node('dd','',item.value));list.append(row);}
  if(!list.childNodes.length){const row=node('div');row.append(node('dt','','Match options'),node('dd','','Not reported by host'));list.append(row);}
 }
 function renderMap(){
  if($('mp-room-map-preview').hidden||!snapshot)return;
  const canvas=$('mp-room-map-canvas'),status=$('mp-room-map-status');$('mp-room-preview-name').textContent=text(snapshot.mapName||'Map preview',256);
  const preview=globalThis.PcMultiplayerSession?.roomMapPreview?.(),metadata=snapshot.mapPreview;
  const expectedHash=metadata?.mapHash||snapshot.mapHash,same=preview?.generation===snapshot.generation&&(!expectedHash||preview.mapHash===expectedHash);
  if(snapshot.blind===true||metadata?.status==='blind'||same&&preview.status==='blind'){canvas.hidden=true;status.hidden=false;status.textContent='Map preview is hidden in this room.';previewKey='';return;}
  const width=preview?.width,height=preview?.height,pixels=preview?.pixels;
  const valid=same&&preview.status==='ready'&&preview.channels===3&&Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=256&&height<=256&&ArrayBuffer.isView(pixels)&&pixels.BYTES_PER_ELEMENT===1&&pixels.length===width*height*3;
  if(!valid){canvas.hidden=true;status.hidden=false;status.textContent=text(same?preview.reason|| (preview.status==='loading'?'Loading map preview…':'Map preview is not available.') :metadata?.status==='loading'?'Loading map preview…':'Map preview is not available.',512);previewKey='';return;}
  const key=JSON.stringify([preview.generation,preview.mapHash,preview.revision,width,height]);
  if(previewKey!==key){const context=canvas.getContext('2d');if(!context){canvas.hidden=true;status.hidden=false;status.textContent='Map preview is not available.';return;}const image=context.createImageData(width,height);for(let i=0,j=0;i<pixels.length;i+=3,j+=4){image.data[j]=pixels[i];image.data[j+1]=pixels[i+1];image.data[j+2]=pixels[i+2];image.data[j+3]=255;}canvas.width=width;canvas.height=height;context.putImageData(image,0,0);canvas.style.setProperty('--mp-map-ratio',String(width/height));previewKey=key;}
  status.hidden=true;canvas.hidden=false;
 }
 function closeMap(){const panel=$('mp-room-map-preview');panel.hidden=true;$('mp-room-map-toggle').setAttribute('aria-expanded','false');publishBackState();}
 function renderActions(){
  if(!snapshot)return;
  const me=local(),s=localState(),p=snapshot.permissions,busy=Boolean(pending),team=$('mp-room-team'),ready=$('mp-room-ready'),spectate=$('mp-room-spectate');
  $('mp-room-self').textContent=text(me?.name,128);const teams=Array.isArray(p.allowedTeams)?[...new Set(p.allowedTeams.filter(Number.isInteger))].slice(0,32):[];
  const teamKey=JSON.stringify([teams,s.team]);if(team.dataset.options!==teamKey){team.dataset.options=teamKey;team.replaceChildren();for(const value of teams){const option=node('option','',teamLabel(value));option.value=String(value);option.selected=value===s.team;team.append(option);}if(!teams.includes(s.team)){const option=node('option','',teamLabel(s.team));option.value=String(s.team??'');option.selected=true;team.append(option);}}
  team.value=String(s.team??'');team.disabled=busy||p.canTeam!==true||s.spectator;team.title=team.disabled?'Team changes are currently unavailable.':'';
  ready.disabled=busy||p.canReady!==true||s.downloading;ready.textContent=pending?.action==='ready'?'WAITING…':s.ready?'READY ✓':'READY';ready.setAttribute('aria-pressed',String(s.ready));ready.title=text(p.readyReason||'');
  spectate.disabled=busy||(s.spectator?p.canPlay:p.canSpectate)!==true||s.downloading;spectate.textContent=s.spectator?'PLAY':'SPECTATE';spectate.setAttribute('aria-pressed',String(s.spectator));spectate.title=text(s.spectator?p.playReason||'':p.spectatorReason||'');
  const chatBlocked=!['enabled','host-only'].includes(p.chatMode);$('mp-room-chat-input').disabled=chatBlocked;$('mp-room-chat-send').disabled=busy||chatBlocked||!$('mp-room-chat-input').value.trim();$('mp-room-chat-input').placeholder=chatBlocked?'Chat disabled by host':p.chatMode==='host-only'?'Message the host…':'Message the room…';
  const note=pending?pending.action==='chat'?'Sending…':'Waiting for the host…':s.downloading?'Downloading map…':s.spectator?'Spectating':p.canReady!==true?text(p.readyReason||'Not ready'):s.ready?'Ready':'Not ready';$('mp-room-ready-note').textContent=note;
 }
 function render(){if(!snapshot||!visible)return;const used=snapshot.players.filter(p=>occupied(p)&&!p.spectator).length,spectators=snapshot.players.filter(p=>p.allocated===true&&p.spectator).length,max=Number.isInteger(snapshot.maxPlayers)?snapshot.maxPlayers:'—',blind=snapshot.blind===true;$('mp-room-title').textContent=text(snapshot.roomName||'Multiplayer room',160);$('mp-room-map').textContent=text(snapshot.mapName,256);$('mp-room-map').title=text(snapshot.mapName,256);$('mp-room-counts').textContent=blind?'Players hidden':`Players ${used} / ${max}`;$('mp-room-spectators').textContent=blind?Number.isInteger(snapshot.readyPlayers)&&Number.isInteger(snapshot.waitingPlayers)?`${snapshot.readyPlayers} ready · ${snapshot.waitingPlayers} waiting`:'':`Spectators ${spectators}`;$('mp-room-roster-count').textContent=blind?'hidden':`${used} / ${max}`;renderPlayers();renderChat();renderOptions();renderMap();inspectPending();renderActions();}
 function accept(value){if(disposed||!valid(value))return false;if(snapshot&&value.generation===snapshot.generation&&value.revision<snapshot.revision)return false;if(snapshot?.generation!==value.generation){nativeViewport=null;lastViewportRevision=-1;chatFocused=false;chatSendPress=false;if(root.contains(document.activeElement))document.activeElement.blur();clearPending();snapshot=null;rosterKey=chatKey=optionsKey=previewKey='';chatRows.clear();$('mp-room-chat-log').replaceChildren();chatView=rosterView=null;$('mp-room-chat-input').value='';setFeedback('');closeOptions();closeMap();resize();}snapshot=value;render();publishBackState();return true;}
 function publishBackState(){try{globalThis.AndroidMultiplayer?.setRoomBackState?.(snapshot?.generation||'',visible,!$('mp-room-options').hidden||!$('mp-room-map-preview').hidden,visible&&chatFocused);}catch{}}
 function show(value){if(value&&!accept(value))return false;if(!snapshot||disposed)return false;visible=true;root.hidden=false;root.setAttribute('aria-hidden','false');document.documentElement.classList.add('mp-room-open');document.body.classList.add('mp-room-open');render();resize();publishBackState();return true;}
 function closeOptions(){const panel=$('mp-room-options');panel.hidden=true;$('mp-room-options-toggle').setAttribute('aria-expanded','false');publishBackState();}
 function hide(){visible=false;chatFocused=false;chatSendPress=false;nativeViewport=null;lastViewportRevision=-1;cancelSound();try{soundAudio?.pause();}catch{}root.hidden=true;root.setAttribute('aria-hidden','true');if(root.contains(document.activeElement))document.activeElement.blur();clearPending();closeOptions();closeMap();document.documentElement.classList.remove('mp-room-open');document.body.classList.remove('mp-room-open');for(const property of ['height','width','top','left'])root.style.removeProperty(property);publishBackState();}
 function reset(){hide();snapshot=null;rosterKey=chatKey=optionsKey='';$('mp-room-chat-input').value='';setFeedback('');}
 function resize(){
  if(!visible)return;const viewport=nativeViewport||globalThis.visualViewport,height=Math.max(1,Math.min(innerHeight,Number(viewport?.height)||innerHeight)),width=Math.max(1,Math.min(innerWidth,Number(viewport?.width)||innerWidth));
  const chat=$('mp-room-chat-log'),players=$('mp-room-players'),beforeChat=chatView||scrollView(chat),beforeRoster=rosterView||scrollView(players,false),token=++resizeSerial;
  root.dataset.compact=String(height<=260);if(height<innerHeight-.5)root.style.height=height+'px';else root.style.removeProperty('height');if(width<innerWidth-.5)root.style.width=width+'px';else root.style.removeProperty('width');
  const top=Math.max(0,Number(viewport?.offsetTop)||0),left=Math.max(0,Number(viewport?.offsetLeft)||0);if(top)root.style.top=top+'px';else root.style.removeProperty('top');if(left)root.style.left=left+'px';else root.style.removeProperty('left');
  restoreScroll(chat,beforeChat);restoreScroll(players,beforeRoster,false);chatView=scrollView(chat);rosterView=scrollView(players,false);
  requestAnimationFrame(()=>{if(!visible||token!==resizeSerial)return;restoreScroll(chat,beforeChat);restoreScroll(players,beforeRoster,false);chatView=scrollView(chat);rosterView=scrollView(players,false);});
 }
 function setViewport(value){if(value?.generation&&value.generation!==snapshot?.generation)return false;if(Number.isFinite(value?.revision)){if(value.revision<=lastViewportRevision)return false;lastViewportRevision=value.revision;}nativeViewport=value&&value.roomActive!==false&&Number.isFinite(value.width)&&Number.isFinite(value.height)&&value.width>0&&value.height>0?value:null;resize();return true;}
 function handleBack(expectedGeneration){if(!visible||expectedGeneration!==undefined&&expectedGeneration!==snapshot?.generation)return false;if(chatFocused||document.activeElement===$('mp-room-chat-input')){chatFocused=false;$('mp-room-chat-input').blur();publishBackState();return true;}if(!$('mp-room-map-preview').hidden){closeMap();$('mp-room-map-toggle').focus({preventScroll:true});return true;}if(!$('mp-room-options').hidden){closeOptions();$('mp-room-options-toggle').focus({preventScroll:true});return true;}return false;}
 $('mp-room-ready').addEventListener('click',()=>request('ready',{ready:!localState().ready}));$('mp-room-team').addEventListener('change',event=>{const team=Number(event.target.value);if(Number.isInteger(team)&&team!==localState().team)request('team',{team});renderActions();});$('mp-room-spectate').addEventListener('click',()=>request('spectator',{spectator:!localState().spectator}));
 $('mp-room-composer').addEventListener('submit',event=>{event.preventDefault();chatSendPress=false;if(composing)return;const input=$('mp-room-chat-input'),message=input.value.trim();if(!message)return;const max=Number.isInteger(snapshot?.permissions?.chatMaxBytes)?snapshot.permissions.chatMaxBytes:256;if(new TextEncoder().encode(message).length>max){setFeedback(`Messages may contain up to ${max} bytes. Please shorten this message.`);return;}input.focus({preventScroll:true});request('chat',{text:message});});$('mp-room-chat-input').addEventListener('input',renderActions);$('mp-room-chat-input').addEventListener('focus',()=>{chatFocused=true;resize();publishBackState();});$('mp-room-chat-input').addEventListener('blur',event=>{composing=false;if(chatSendPress||event.relatedTarget===$('mp-room-chat-send'))return;chatFocused=false;resize();publishBackState();});$('mp-room-chat-input').addEventListener('compositionstart',()=>{composing=true;});$('mp-room-chat-input').addEventListener('compositionend',()=>{composing=false;});
 // A touch focuses SEND on pointerdown. Keep its hit target in the same place
 // until the actual click submits; collapsing on input blur loses pointerup.
 $('mp-room-chat-send').addEventListener('pointerdown',()=>{chatSendPress=true;},true);
 $('mp-room-chat-send').addEventListener('blur',event=>{if(event.relatedTarget===$('mp-room-chat-input'))return;chatSendPress=false;chatFocused=false;resize();publishBackState();});
 $('mp-room-options-toggle').addEventListener('click',()=>{closeMap();const box=$('mp-room-options');box.hidden=!box.hidden;$('mp-room-options-toggle').setAttribute('aria-expanded',String(!box.hidden));publishBackState();});$('mp-room-options-close').addEventListener('click',closeOptions);
 $('mp-room-map-toggle').addEventListener('click',()=>{closeOptions();const box=$('mp-room-map-preview');box.hidden=!box.hidden;$('mp-room-map-toggle').setAttribute('aria-expanded',String(!box.hidden));renderMap();publishBackState();});$('mp-room-map-close').addEventListener('click',closeMap);
 $('mp-room-chat-log').addEventListener('scroll',()=>{chatView=scrollView($('mp-room-chat-log'));},{passive:true});$('mp-room-players').addEventListener('scroll',()=>{rosterView=scrollView($('mp-room-players'),false);},{passive:true});
 root.addEventListener('pointerdown',event=>{if(!event.isTrusted||event.isPrimary===false||event.button!==0)return;cancelSound();const button=soundButton(event.target);if(button){soundPress={button,id:event.pointerId,x:event.clientX,y:event.clientY};button.classList.add('mp-room-pressing');feedbackSounds.presses++;}},{capture:true,passive:true});
 root.addEventListener('pointermove',event=>{if(!soundPress||soundPress.id!==event.pointerId)return;const box=soundPress.button.getBoundingClientRect();if(!soundButton(soundPress.button)||Math.hypot(event.clientX-soundPress.x,event.clientY-soundPress.y)>8||event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)cancelSound();},{capture:true,passive:true});
 root.addEventListener('pointerup',event=>{if(!soundPress||soundPress.id!==event.pointerId)return;const value=soundPress,box=value.button.getBoundingClientRect();soundPress=null;value.button.classList.remove('mp-room-pressing');soundRecent.set(value.button,performance.now());if(event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom&&Math.hypot(event.clientX-value.x,event.clientY-value.y)<=8)playSound(value.button);},{capture:true,passive:true});
 root.addEventListener('pointercancel',cancelSound,{capture:true,passive:true});root.addEventListener('click',event=>{if(!event.isTrusted)return;const button=soundButton(event.target);if(!button)return;const compatibility=event.detail>0||event.pointerType==='touch';if(compatibility&&performance.now()-(soundRecent.get(button)??-Infinity)<700)return;playSound(button);},{capture:true,passive:true});
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&handleBack()){event.preventDefault();event.stopPropagation();}});globalThis.addEventListener('resize',resize);globalThis.visualViewport?.addEventListener('resize',resize);globalThis.visualViewport?.addEventListener('scroll',resize);globalThis.addEventListener('warzone-multiplayer-viewport',event=>setViewport(event.detail));globalThis.addEventListener('pagehide',()=>{reset();disposed=true;});
 globalThis.PcMultiplayerRoomUI={valid,accept,show,hide,reset,handleBack,setViewport,report:()=>({visible,generation:snapshot?.generation,revision:snapshot?.revision,pending:pending?{action:pending.action,accepted:pending.accepted,generation:pending.generation}:null,mapOpen:!$('mp-room-map-preview').hidden,chatScroll:$('mp-room-chat-log').scrollTop,sound:{...feedbackSounds},feedback,messages:Math.min(MAX_MESSAGES,snapshot?.messages?.length||0)})};
})();
