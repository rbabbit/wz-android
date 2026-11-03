/* Mount the verified VPS download in the unchanged engine's native music path. */
(() => {
  'use strict';
  const parameters=new URLSearchParams(location.search);
  const enabled=parameters.get('music')==='1';
  const probe=parameters.get('music_probe')==='1'||parameters.get('graphics_probe')==='1';
  const catalog=window.WarzoneMusicCatalog;
  const state={enabled,loaded:false,files:0,bytes:0,nativeOpens:0,nativeReadBytes:0,
    nativeAlbums:[],nativeTracks:[],nativeCoverReads:0,error:null};
  window.WarzoneMusic={
    enabled,
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
              // The original Music Manager creates its album-art widget only
              // after the native form is open. This confirms navigation without
              // editing the engine or trusting a short UI timer.
              if(path.includes('/music/albums/')&&path.endsWith('.png')){
                state.nativeCoverReads++;
                window.dispatchEvent?.(new CustomEvent('warzone-music-manager-ready'));
              }
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
    report(){return {...state,nativeAlbums:[...state.nativeAlbums],nativeTracks:[...state.nativeTracks]}}
  };
})();
