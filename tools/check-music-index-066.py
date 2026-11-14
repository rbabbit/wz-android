"""Execute actual music metadata/index classes with host asset stand-ins, not Android playback."""
from pathlib import Path
import hashlib,json,subprocess,tempfile

ROOT=Path(__file__).resolve().parents[1]
JAVA=ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone'
def digest(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main():
    jar,=list((Path.home()/'.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))
    assert digest(jar)=='3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'
    jdk=Path('C:/Program Files/Android/Android Studio/jbr/bin')
    stubs={
      'android/content/Context.java':'package android.content; public class Context {private final android.content.res.AssetManager assets;public Context(String root){assets=new android.content.res.AssetManager(root);}public Context getApplicationContext(){return this;}public android.content.res.AssetManager getAssets(){return assets;}}',
      'android/content/res/AssetFileDescriptor.java':'package android.content.res;public class AssetFileDescriptor implements AutoCloseable {private final long length;public AssetFileDescriptor(long length){this.length=length;}public long getDeclaredLength(){return length;}public void close(){}}',
      'android/content/res/AssetManager.java':'package android.content.res;import java.io.*;import java.nio.file.*;public class AssetManager {public static final int ACCESS_RANDOM=1;private final Path root;public AssetManager(String root){this.root=Path.of(root);}public InputStream open(String name)throws IOException{return Files.newInputStream(root.resolve(name));}public InputStream open(String name,int mode)throws IOException{return open(name);}public AssetFileDescriptor openFd(String name)throws IOException{return new AssetFileDescriptor(Files.size(root.resolve(name)));}}',
      'com/rbabbit/blocknight/warzone/MusicIndexProbe066.java':r'''
package com.rbabbit.blocknight.warzone;
import android.content.Context;import org.json.*;import java.nio.file.*;import java.util.*;
public class MusicIndexProbe066 {
 static int checks;static void yes(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
 public static void main(String[] args)throws Exception {
  Context context=new Context(args[0]);MusicTrackCatalog catalog=new MusicTrackCatalog(context);MapMusicIndex index=new MapMusicIndex(context,catalog);
  JSONObject maps=new JSONObject(Files.readString(Path.of(args[0],"warzone/map-music.json"))).getJSONObject("maps");String origin="https://appassets.androidplatform.net";
  for(String id:maps.keySet()){JSONObject state=new JSONObject(index.stateJson("towers",id,"",true,true,false,origin));yes(state.getString("mode").equals("map"),"Towers mode");yes(state.getString("trackId").equals(maps.getString(id)),"Every exact assignment");yes(!state.has("tracks"),"Towers retains a single loop policy");yes(state.getString("url").endsWith("/"+maps.getString(id)),"Towers slice URL");}
  JSONObject ffa=new JSONObject(index.stateJson("ffa","new-emag-map-id","",true,true,false,origin));JSONArray all=ffa.getJSONArray("tracks");Set<String> ids=new HashSet<>();
  for(int i=0;i<all.length();i++){JSONObject song=all.getJSONObject(i);String id=song.getString("id");ids.add(id);yes(index.slice(id).length>0,"Bundled slice exists");yes(song.getString("title").equals(catalog.find(id).title),"Actual title");yes(song.getString("url").equals(origin+"/warzone/optional/map-music/"+id),"Local single-track endpoint");}
  yes(ids.equals(catalog.allIds())&&ids.size()==39,"FFA exact39 inventory");yes(ffa.getString("mapId").equals("new-emag-map-id"),"No Towers fallback for FFA map IDs");
  for(String level:new String[]{"CAM_1A","CAM_1B","CAM_2A","CAM_3A","CAM_3_4"}){JSONObject state=new JSONObject(index.stateJson("campaign","",level,true,true,false,origin));JSONArray list=state.getJSONArray("tracks");yes(list.length()==3,"Original Campaign three");for(int i=0;i<3;i++)yes(list.getJSONObject(i).getString("id").equals("original_soundtrack/track"+(i+1)+".opus"),"Same native-order pool for every mission");yes(state.getString("missionId").equals(level),"Mission observation label preserved");}
  for(boolean cached:new boolean[]{false,true})for(boolean enabled:new boolean[]{false,true}){JSONObject state=new JSONObject(index.stateJson("ffa","emag","",cached,enabled,true,origin));yes(state.getBoolean("enabled")== (cached&&enabled),"Cached/preference gate");yes(state.getBoolean("suspended"),"Lifecycle suspension");}
  boolean rejected=false;try{index.stateJson("unknown","td2","",true,true,false,origin);}catch(IllegalArgumentException e){rejected=true;}yes(rejected,"Unknown mode rejected");
  System.out.print(new JSONObject().put("passed",true).put("checksPassed",checks).toString());
 }
}'''}
    files=['MapMusicIndex.java','MusicTrackCatalog.java','MusicPackStore.java','MapLevelCatalog.java']
    with tempfile.TemporaryDirectory(prefix='music-index-066-') as directory:
        work=Path(directory).resolve();assert work.parent==Path(tempfile.gettempdir()).resolve() and work.name.startswith('music-index-066-')
        for name,text in stubs.items():
            p=work/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
        for name in files:(work/'com/rbabbit/blocknight/warzone'/name).write_bytes((JAVA/name).read_bytes())
        built=subprocess.run([str(jdk/'javac.exe'),'-encoding','UTF-8','-cp',str(jar),'-d',str(work),*[str(p) for p in work.rglob('*.java')]],capture_output=True,text=True)
        assert built.returncode==0,built.stderr
        ran=subprocess.run([str(jdk/'java.exe'),'-cp',str(work)+';'+str(jar),'com.rbabbit.blocknight.warzone.MusicIndexProbe066',str(ROOT/'app/src/main/assets')],capture_output=True,text=True)
        assert ran.returncode==0,ran.stderr
        report=json.loads(ran.stdout)
    sources=[JAVA/name for name in files]+[Path(__file__),ROOT/'app/src/main/assets/warzone/music-catalog.js',ROOT/'app/src/main/assets/warzone/music-tracks.json',ROOT/'app/src/main/assets/warzone/map-music.json']
    report.update(version='0.66',emulatorUsed=False,androidPlaybackVerified=False,scope='Actual Java metadata/index code on host JDK with minimal AssetManager/Context stand-ins; no Android/media execution.',sources=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p)) for p in sources])
    (ROOT/'archive/music-0.66-index-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['passed','checksPassed','emulatorUsed','androidPlaybackVerified']}))
if __name__=='__main__':main()
