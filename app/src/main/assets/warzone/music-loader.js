/* Assigned Towers music, plus the retained native playlist path for Duel. */
(() => {
  'use strict';
  const parameters=new URLSearchParams(location.search);
  // The retained Duel page sets its frozen config later in the document. Its
  // filename is available before either engine starts and keeps that path intact.
  if (!/\/index-duel\.html$/.test(location.pathname)) {
    const session=parameters.get('battle_session')||'';
    const state={mode:'map',cached:false,enabled:false,mapId:'',trackId:'',title:'',author:'',
      url:'',battleActive:false,suspended:false,playing:false,loading:false,loadedBytes:0,error:'',disposed:false};
    let player=null,playerUrl='',generation=0,pending=0,menu=null,menuDocument=null,anchor=null;
    let loadController=null,blobUrl='',deadline=null;
    const FETCH_TIMEOUT=20000,PLAY_TIMEOUT=12000,BUFFER_TIMEOUT=12000;
    let outsideListener=null,keyListener=null,resizeListener=null;
    // Install before SDL initializes. Escape closes this small menu before a
    // canvas key listener can interpret it as the stock game's pause menu.
    const earlyKeyListener=event=>{
      if(menu&&!menu.hidden&&event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();closeMenu();
      }
    };
    window.addEventListener('keydown',earlyKeyListener,true);

    const allowed=()=>!state.disposed&&state.battleActive&&!state.suspended&&!document.hidden
      &&state.cached&&state.enabled&&Boolean(state.url);
    const snapshot=raw=>{
      const value=typeof raw==='string'?JSON.parse(raw):raw;
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Music settings are unavailable.');
      let url='';
      if(value.url){
        const local=new URL(String(value.url),location.href);
        if(local.origin!==location.origin||!local.pathname.startsWith('/warzone/optional/map-music/'))
          throw Error('The map soundtrack is unavailable.');
        url=local.href;
      }
      return {cached:value.cached===true,enabled:value.enabled===true,suspended:value.suspended===true,mapId:String(value.mapId||''),
        trackId:String(value.trackId||''),title:String(value.title||''),author:String(value.author||''),url};
    };
    function readSettings(){
      if(state.disposed)return false;
      try{
        if(typeof window.BlockNightAndroid?.musicState!=='function')throw Error('Music settings are unavailable.');
        const value=snapshot(window.BlockNightAndroid.musicState());
        if(value.url!==state.url)state.error='';
        Object.assign(state,value);
        return true;
      }catch(error){state.cached=false;state.enabled=false;state.error=String(error.message||error);return false;}
    }
    function refresh(){
      let header=menuDocument?.getElementById('blocknight-music')||document.getElementById('blocknight-music');
      if(!header){try{header=window.parent.document.getElementById('blocknight-music');}catch(_){}}
      if(header){header.classList.toggle('active',state.enabled&&state.cached);header.setAttribute('aria-expanded',String(Boolean(menu&&!menu.hidden)));}
      if(!menu)return;
      menu.querySelector('[data-music-track]').textContent=state.title||'Map soundtrack';
      menu.querySelector('[data-music-author]').textContent=state.author;
      const status=menu.querySelector('[data-music-status]');
      status.textContent=state.error||(!state.cached?'Download music on the start screen to play it in-game.'
        :!state.enabled?'Music off. Sound effects are unchanged.'
        :state.loading?'Starting music…':state.playing?'Playing this map’s soundtrack.'
        :state.suspended||document.hidden?'Music paused while the game is in the background.'
        :!state.battleActive?'Music will start with the battle.':'Music ready.');
      for(const button of menu.querySelectorAll('[data-music-enabled]')){
        const on=button.dataset.musicEnabled==='true';
        button.disabled=state.disposed||(on&&(!state.cached||!state.url));
        button.setAttribute('aria-pressed',String(on===state.enabled));
      }
    }
    function clearDeadline(){
      if(deadline!==null){clearTimeout(deadline);deadline=null;}
    }
    function pause(){
      generation++;pending=0;clearDeadline();
      const controller=loadController;loadController=null;
      controller?.abort();
      state.loading=false;state.playing=false;state.loadedBytes=0;
      const old=player;
      const oldBlob=blobUrl;player=null;playerUrl='';blobUrl='';
      if(old){
        old.pause();
        try{old.removeAttribute('src');old.load();}catch(_){}
      }
      if(oldBlob)URL.revokeObjectURL(oldBlob);
      refresh();
    }
    function failed(token,message){
      if(token!==generation||state.disposed)return;
      pause();
      if(state.enabled)state.error=message;
      refresh();
    }
    function waitDeadline(token,milliseconds,message){
      // Repeated waiting/stalled events must not extend an already hung start.
      if(deadline!==null)return;
      deadline=setTimeout(()=>{
        deadline=null;
        if(token===generation&&allowed())failed(token,message);
      },milliseconds);
    }
    function trackLength(id){
      const entry=window.WarzoneMusicCatalog?.files?.find(file=>file.filename==='/data/music/albums/'+id);
      const length=entry&&entry.end-entry.start;
      if(!Number.isSafeInteger(entry?.start)||!Number.isSafeInteger(entry?.end)
          ||!Number.isSafeInteger(length)||length<=0||length>8*1024*1024)
        throw Error('The assigned music track is unavailable.');
      return length;
    }
    function retryMessage(error){
      const message=String(error?.message||'');
      return message.endsWith('Tap On to try again.')?message:'Music could not start. Tap On to try again.';
    }
    function playback(retry=false){
      if(!allowed()){pause();return false;}
      // Reopening unrelated game panels must not repeatedly retry a failed
      // media request. The compact menu offers an explicit On retry.
      if(state.error&&!retry){refresh();return false;}
      // On is also a real retry while fetch/play is pending, before the browser
      // emits an error. Leave an already healthy playing track alone.
      if(retry&&(state.error||(!state.playing&&(state.loading||pending))))pause();
      if((player||pending)&&playerUrl!==state.url)pause();
      if(pending||(player&&!player.paused))return true;
      pause();
      const token=++generation,requestedUrl=state.url,controller=new AbortController();
      loadController=controller;playerUrl=requestedUrl;pending=token;
      state.error='';state.loading=true;refresh();
      waitDeadline(token,FETCH_TIMEOUT,'Music took too long to load. Tap On to try again.');
      const current=()=>token===generation&&allowed()&&state.url===requestedUrl;
      try{
        const length=trackLength(state.trackId);
        // Fetch exactly one complete track without Range. Passing an already
        // sliced stream directly to HTML media makes Android WebView apply the
        // media seek twice. Blob URLs let Chromium own all later seek/loop IO.
        fetch(requestedUrl,{method:'GET',cache:'no-store',signal:controller.signal})
          .then(response=>{
            if(!current())return null;
            if(response.status!==200)throw Error('Music could not load. Tap On to try again.');
            const declared=response.headers.get('Content-Length');
            // WebView may combine its generated header with an identical app
            // header. Accept repeated identical lengths, never conflicting ones.
            if(declared!==null&&declared.split(',').some(part=>{
              const value=part.trim();
              return !/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)!==length;
            }))
              throw Error('The music track is incomplete. Tap On to try again.');
            return response.arrayBuffer();
          }).then(buffer=>{
            if(!buffer||!current())return;
            if(buffer.byteLength!==length)throw Error('The music track is incomplete. Tap On to try again.');
            loadController=null;clearDeadline();state.loadedBytes=length;
            blobUrl=URL.createObjectURL(new Blob([buffer],{type:'audio/ogg; codecs=opus'}));
            const audio=new Audio();player=audio;
            audio.preload='auto';audio.loop=true;audio.volume=.55;
            audio.addEventListener('playing',()=>{
              if(player!==audio||token!==generation)return;
              if(!allowed()){pause();return;}
              pending=0;clearDeadline();state.playing=true;state.loading=false;state.error='';refresh();
            });
            const waiting=()=>{
              if(player!==audio||token!==generation||!allowed())return;
              state.playing=false;state.loading=true;
              waitDeadline(token,BUFFER_TIMEOUT,'Music stopped buffering. Tap On to try again.');refresh();
            };
            audio.addEventListener('waiting',waiting);
            audio.addEventListener('stalled',waiting);
            audio.addEventListener('error',()=>failed(token,'Music could not play. Tap On to try again.'));
            audio.addEventListener('pause',()=>{
              if(player===audio&&token===generation&&allowed())
                failed(token,'Music paused. Tap On to try again.');
            });
            audio.src=blobUrl;
            waitDeadline(token,PLAY_TIMEOUT,'Music took too long to start. Tap On to try again.');
            return Promise.resolve(audio.play()).then(()=>{
              if(token!==generation||player!==audio){audio.pause();return;}
              pending=0;
              // Keep the deadline until an actual playing event; a resolved
              // play promise alone is not evidence of audible media progress.
              if(!allowed())pause();
            });
          }).catch(error=>{
            if(token!==generation||state.disposed)return;
            failed(token,error?.name==='AbortError'
              ?'Music could not load. Tap On to try again.':retryMessage(error));
          });
      }catch(error){failed(token,retryMessage(error));}
      return true;
    }
    function setEnabled(on){
      if(state.disposed)return false;
      try{
        if(typeof window.BlockNightAndroid?.setMusicEnabled!=='function')throw Error('Music settings are unavailable.');
        Object.assign(state,snapshot(window.BlockNightAndroid.setMusicEnabled(Boolean(on),session)));
        if(!on)state.error='';
        playback(Boolean(on));refresh();return state.enabled===Boolean(on);
      }catch(error){pause();state.error=String(error.message||error);refresh();return false;}
    }
    function positionMenu(){
      if(!menu||menu.hidden||!anchor)return;
      const win=menuDocument.defaultView,r=anchor.getBoundingClientRect();
      const width=Math.min(310,Math.max(0,win.innerWidth-20));
      menu.style.width=width+'px';
      menu.style.left=Math.max(10,Math.min(r.right-width,win.innerWidth-width-10))+'px';
      menu.style.top=Math.max(10,Math.min(r.bottom+7,win.innerHeight-menu.offsetHeight-10))+'px';
      menu.style.maxHeight=Math.max(0,win.innerHeight-20)+'px';
    }
    function closeMenu(restoreFocus=true){
      if(!menu||menu.hidden)return false;
      menu.hidden=true;anchor?.setAttribute('aria-expanded','false');
      if(restoreFocus&&state.battleActive&&!state.suspended){
        try{document.querySelector('canvas')?.focus({preventScroll:true});}catch(_){}
      }
      return true;
    }
    function detachMenu(){
      if(menuDocument){
        menuDocument.removeEventListener('pointerdown',outsideListener,true);
        menuDocument.removeEventListener('keydown',keyListener,true);
        if(menuDocument!==document){
          window.removeEventListener('pointerdown',outsideListener,true);
          document.removeEventListener('keydown',keyListener,true);
        }
        menuDocument.defaultView.removeEventListener('resize',resizeListener);
      }
      menu?.remove();menu=null;menuDocument=null;anchor=null;
    }
    function showMenu(button,host=document,bind){
      if(state.disposed||!state.battleActive)return false;
      if(menuDocument===host&&menu&&!menu.hidden){closeMenu();return true;}
      if(menuDocument&&menuDocument!==host)detachMenu();
      anchor=button;menuDocument=host;readSettings();playback();
      if(!menu){
        if(!host.getElementById('wt-map-music-style')){
          const style=host.createElement('style');style.id='wt-map-music-style';
          style.textContent=`
            #wt-map-music-menu{position:fixed;z-index:2147483647;box-sizing:border-box;padding:12px 14px;background:#0d2027fa;color:#e2edec;border:0;border-radius:6px;box-shadow:0 8px 24px #0005;font:14px/1.35 system-ui,sans-serif;overflow:auto;overscroll-behavior:contain}
            #wt-map-music-menu[hidden]{display:none!important}
            #wt-map-music-menu header{display:flex;align-items:center;gap:12px;margin:0 0 6px;background:transparent;border:0}
            #wt-map-music-menu strong{font-size:12px;letter-spacing:.8px;color:#8bd3cc}
            #wt-map-music-menu button{appearance:none;cursor:pointer;touch-action:manipulation;border:0;border-radius:4px;background:#193039;color:#d7e6e6;font:600 13px/1.2 system-ui,sans-serif;min-height:44px;padding:8px 12px}
            #wt-map-music-menu button:focus-visible{outline:2px solid #8bd3cc;outline-offset:1px}
            #wt-map-music-menu [data-music-close]{margin-left:auto;width:44px;min-height:36px;padding:4px;background:transparent;font-size:24px;font-weight:400}
            #wt-map-music-menu [data-music-track]{font-size:16px;font-weight:600;overflow-wrap:anywhere}
            #wt-map-music-menu [data-music-author]{font-size:12px;color:#9bb1b5;margin-top:3px;overflow-wrap:anywhere}
            #wt-map-music-menu [data-music-author]:empty{display:none}
            #wt-map-music-menu .wt-music-switch{display:flex;gap:6px;margin:12px 0 8px}
            #wt-map-music-menu .wt-music-switch button{flex:1;min-width:0}
            #wt-map-music-menu [aria-pressed=true]{background:#8bd3cc;color:#092025}
            #wt-map-music-menu button:disabled{opacity:.45;cursor:default}
            #wt-map-music-menu [data-music-status]{font-size:12px;color:#b4c6c8;overflow-wrap:anywhere}
          `;host.head.appendChild(style);
        }
        menu=host.createElement('section');menu.id='wt-map-music-menu';menu.hidden=true;
        menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','false');menu.setAttribute('aria-label','Map music');
        menu.innerHTML='<header><strong>MUSIC</strong><button type="button" data-music-close aria-label="Close music menu">×</button></header><div data-music-track></div><div data-music-author></div><div class="wt-music-switch" role="group" aria-label="Music playback"><button type="button" data-music-enabled="true">ON</button><button type="button" data-music-enabled="false">OFF</button></div><div data-music-status role="status" aria-live="polite"></div>';
        const command=typeof bind==='function'?bind:(button,action)=>button.addEventListener('click',action);
        command(menu.querySelector('[data-music-close]'),()=>closeMenu());
        for(const b of menu.querySelectorAll('[data-music-enabled]'))command(b,()=>setEnabled(b.dataset.musicEnabled==='true'));
        outsideListener=e=>{if(menu&&!menu.hidden&&!menu.contains(e.target)&&!anchor?.contains(e.target))closeMenu(false);};
        keyListener=e=>{if(menu&&!menu.hidden&&e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu();}};
        resizeListener=positionMenu;
        host.addEventListener('pointerdown',outsideListener,true);host.addEventListener('keydown',keyListener,true);
        if(host!==document){
          // Touch input is owned at document capture by the game bridge. Run
          // before that listener without consuming or modifying its event.
          window.addEventListener('pointerdown',outsideListener,true);
          document.addEventListener('keydown',keyListener,true);
        }
        host.defaultView.addEventListener('resize',resizeListener);host.body.appendChild(menu);
      }
      menu.hidden=false;anchor?.setAttribute('aria-expanded','true');refresh();positionMenu();return true;
    }
    function setBattleActive(active){
      if(state.disposed)return;
      const first=Boolean(active)&&!state.battleActive;state.battleActive=Boolean(active);
      if(first)readSettings();
      if(!active)closeMenu(false);
      playback();
    }
    function setSuspended(suspended){
      if(state.disposed)return;
      state.suspended=Boolean(suspended);if(!suspended)readSettings();
      if(suspended)closeMenu(false);
      playback();
    }
    function dispose(){
      if(state.disposed)return;
      state.disposed=true;state.battleActive=false;pause();detachMenu();
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('keydown',earlyKeyListener,true);
    }
    const visibility=()=>playback();
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',dispose,{once:true});
    window.WarzoneMusic={
      // index.html writes this flag into the *native* engine's config. Native
      // music stays off; this one-track player never changes effects or voices.
      enabled:false,prepare(){},applySelection(){return true;},
      setEnabled,setBattleActive,setSuspended,dispose,showMenu,closeMenu,
      report(){return {...state,transport:'track-blob',nativeMusicEnabled:false,selectedTracks:state.trackId?[state.trackId]:[]};}
    };
    return;
  }
  const enabled=parameters.get('music')==='1';
  const probe=parameters.get('music_probe')==='1'||parameters.get('graphics_probe')==='1';
  const catalog=window.WarzoneMusicCatalog;
  const state={enabled,loaded:false,files:0,bytes:0,nativeOpens:0,nativeReadBytes:0,
    nativeAlbums:[],nativeTracks:[],nativeCoverReads:0,selectedTracks:[],selectionApplied:false,nativePreferenceOpens:0,error:null};
  window.WarzoneMusic={
    enabled,
    applySelection(module,configDir){
      if(!enabled)return true;
      try{
        const raw=window.BlockNightAndroid?.musicSelection?.();
        const requested=raw?JSON.parse(raw):null;
        const allowed=new Set(catalog.trackIds);
        if(requested!==null&&(!Array.isArray(requested)||requested.some(id=>!allowed.has(id))))throw Error('Invalid Music selection. Please choose your tracks again.');
        const selected=new Set(requested===null?[]:requested);
        if(!selected.size)throw Error('Select a Music track on the start screen, or turn Music off.');
        const path=configDir+'/music.json';let preferences={};
        try{preferences=JSON.parse(module.FS.readFile(path,{encoding:'utf8'}));}catch(_){}
        if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))preferences={};
        if(!preferences.tracks||typeof preferences.tracks!=='object'||Array.isArray(preferences.tracks))preferences.tracks={};
        // Warzone 4.7 playlist.cpp reads these user preferences before selecting
        // a track. The four modes are campaign, challenge, skirmish, multiplayer.
        // Original album definitions and all audio bytes remain unchanged.
        for(const id of catalog.trackIds){
          const previous=preferences.tracks[id];
          preferences.tracks[id]={...(previous&&typeof previous==='object'?previous:{}),
            settings:{music_modes:Array(4).fill(selected.has(id))}};
        }
        module.FS.writeFile(path+'.tmp',JSON.stringify(preferences),{encoding:'utf8'});
        module.FS.rename(path+'.tmp',path);
        state.selectedTracks=[...selected];state.selectionApplied=true;return true;
      }catch(error){state.error=String(error.message||error);window.BlockNightAndroid?.musicFailed(state.error);return false;}
    },
    prepare(module){
      if(!enabled)return;
      const dependency='warzone-towers-music';module.addRunDependency(dependency);
      fetch('/warzone/optional/music-v1.data',{cache:'no-store'})
        .then(response=>{if(!response.ok)throw Error('The downloaded music is unavailable.');return response.arrayBuffer()})
        .then(buffer=>{
          if(buffer.byteLength!==catalog.bytes)throw Error('The music download is incomplete.');
          // Validate the complete layout before exposing any files to main().
          let end=0;
          for(const entry of catalog.files){
            if(!entry.filename.startsWith('/data/music/')||entry.filename.includes('..')||
                entry.start!==end||entry.end<entry.start||entry.end>buffer.byteLength)throw Error('Invalid music file layout.');
            end=entry.end;
          }
          if(end!==buffer.byteLength)throw Error('Invalid music file layout.');
          for(const entry of catalog.files){
            const split=entry.filename.lastIndexOf('/'),directory=entry.filename.slice(0,split);
            module.FS_createPath('/',directory.slice(1),true,true);
            module.FS_createDataFile(directory,entry.filename.slice(split+1),
                new Uint8Array(buffer,entry.start,entry.end-entry.start),true,true,true);
          }
          {
            const fs=module.FS,open=fs.open,read=fs.read;
            fs.open=function(...args){
              const stream=open.apply(this,args),path=String(stream.path);
              if(path.includes('/music/albums/')&&path.endsWith('.png')){
                state.nativeCoverReads++;
              }
              if(probe&&path.endsWith('/music.json'))state.nativePreferenceOpens++;
              if(probe&&path.includes('/music/')){
                state.nativeOpens++;
                const list=path.endsWith('/album.json')?state.nativeAlbums:path.endsWith('.opus')?state.nativeTracks:null;
                if(list&&!list.includes(path))list.push(path);
              }
              return stream;
            };
            if(probe)fs.read=function(stream,...args){const count=read.call(this,stream,...args);
              if(String(stream.path).includes('/music/'))state.nativeReadBytes+=count;return count};
          }
          state.loaded=true;state.files=catalog.files.length;state.bytes=buffer.byteLength;
          module.removeRunDependency(dependency);
        })
        .catch(error=>{state.error=String(error.message||error);
          window.BlockNightAndroid?.musicFailed(state.error)});
    },
    report(){return {...state,selectedTracks:[...state.selectedTracks],nativeAlbums:[...state.nativeAlbums],nativeTracks:[...state.nativeTracks]}}
  };
})();
