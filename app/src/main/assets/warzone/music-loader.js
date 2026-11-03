/* Mount the verified VPS download in the unchanged engine's native music path. */
(() => {
  'use strict';
  const parameters=new URLSearchParams(location.search);
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
        const selected=new Set(requested===null?catalog.trackIds:requested);
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
