"""Run MP music bridge/routes and actual bounded readers on the host JDK.

Android Context/WebView/preferences are stand-ins. The production metadata,
activity methods, pack store and byte reader execute unchanged. No emulator.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone'
SOURCE = JAVA / 'MultiplayerActivity.java'
source = SOURCE.read_text(encoding='utf-8')


def block(start):
    begin = source.index('{', start)
    depth = 0
    quoted = None
    escape = False
    comment = None
    i = begin
    while i < len(source):
        char = source[i]
        after = source[i + 1:i + 2]
        if comment == 'line':
            if char == '\n': comment = None
        elif comment == 'block':
            if char == '*' and after == '/': comment = None; i += 1
        elif quoted:
            if escape: escape = False
            elif char == '\\': escape = True
            elif char == quoted: quoted = None
        elif char == '/' and after in ('/', '*'):
            comment = 'line' if after == '/' else 'block'; i += 1
        elif char in ('"', "'"): quoted = char
        elif char == '{': depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0: return source[start:i + 1]
        i += 1
    raise AssertionError('Unclosed production block')


def method(name):
    match = re.search(r'(?m)^\s*(?:@JavascriptInterface )?(?:private|public) (?:static )?[^\n]+\b' + name + r'\([^\n]*\) \{', source)
    assert match, name
    return block(match.start())


def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    bridge = block(source.index('  public final class MultiplayerMusic {'))
    assert re.findall(r'@JavascriptInterface public \w+ (\w+)\(', bridge) == ['musicState', 'setMusicEnabled']
    assert 'getSharedPreferences(MUSIC_PROFILE, MODE_PRIVATE)' in source
    assert '"warzone_multiplayer_music"' in source
    assert 'request.getUrl().getPath().startsWith(musicPath)' in source
    assert 'return multiplayerMusicResponse(request,' in source
    assert 'new MultiplayerMusic(), "AndroidMultiplayerMusic"' in source
    assert 'removeJavascriptInterface("AndroidMultiplayerMusic")' in source
    assert 'BlockNightAndroid' not in source
    assert 'evaluateJavascript' not in method('returnToLobbyNative'), 'Back return must never depend on queued JS'
    for name, action in [('onPause', 'suspend'), ('onResume', 'resume'), ('onDestroy', 'dispose')]:
        value = re.search(r'(?m)^  protected void ' + name + r'\(\) \{', source)
        assert value and 'multiplayerMusicLifecycle("' + action + '")' in block(value.start())
    jar, = list((Path.home() / '.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))
    assert digest(jar) == '3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'
    jdk = Path('C:/Program Files/Android/Android Studio/jbr/bin')
    methods = '\n'.join(method(name) for name in ['sharedUiAsset', 'validMusicTrackId', 'setSessionActive', 'multiplayerMusicState', 'multiplayerMusicResponse', 'multiplayerMusicLifecycle'])
    harness = r'''
package com.rbabbit.blocknight.warzone;
import android.content.Context;import android.webkit.*;import android.util.Log;
import org.json.*;import java.io.*;import java.util.*;import java.util.concurrent.atomic.AtomicBoolean;
import java.nio.file.*;import java.security.MessageDigest;import java.util.HexFormat;
public class MultiplayerMusicProbe072 {
 static final String ORIGIN="https://appassets.androidplatform.net",TAG="MPMusic";
 final Object musicPreferenceLock=new Object();final AtomicBoolean destroyed=new AtomicBoolean();
 MusicPackStore musicStore;MapMusicIndex musicIndex;MemoryPreferences musicPreferences=new MemoryPreferences();
 String musicSession="";boolean sessionActive,musicSuspended;WebView webView=new WebView();
 void runOnUiThread(Runnable task){task.run();}void dismissLeaveDialog(){}
 static Map<String,String> isolationHeaders(){return Map.of("Cross-Origin-Resource-Policy","same-origin");}
 static WebResourceResponse blockedResponse(int code,String text){return new WebResourceResponse("text/plain",null,code,"Not Found",Map.of(),new ByteArrayInputStream(new byte[0]));}
__METHODS__
__BRIDGE__
 static int checks;
 static void yes(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
 static WebResourceRequest request(String method,String range){return new WebResourceRequest(){public String getMethod(){return method;}public Map<String,String>getRequestHeaders(){return range==null?Map.of():Map.of("rAnGe",range);}};}
 public static void main(String[] args)throws Exception {
  MultiplayerMusicProbe072 app=new MultiplayerMusicProbe072();Context context=new Context(args[0]);
  app.musicStore=new MusicPackStore(context);app.musicIndex=new MapMusicIndex(context,new MusicTrackCatalog(context));
  MultiplayerMusic bridge=app.new MultiplayerMusic();JSONObject initial=new JSONObject(bridge.musicState());
  yes(initial.getBoolean("cached"),"Bundled music ready");yes(initial.getString("session").isEmpty(),"Inactive session token empty");yes(initial.getBoolean("suspended"),"Lobby cannot play music");
  JSONArray all=initial.getJSONArray("tracks");yes(all.length()==39,"Exact39 song playlist");yes(initial.getString("mode").equals("ffa"),"Reuse original shuffle policy");
  bridge.setMusicEnabled(false,"");yes(app.musicPreferences.enabled,"Inactive preference change rejected");
  app.setSessionActive(true);String token=new JSONObject(bridge.musicState()).getString("session");yes(!token.isEmpty(),"Unique active session token");
  app.setSessionActive(true);yes(token.equals(app.musicSession),"Repeated active observation keeps current token");
  bridge.setMusicEnabled(false,"stale");yes(app.musicPreferences.enabled,"Stale iframe rejected");
  bridge.setMusicEnabled(false,token);yes(!new JSONObject(bridge.musicState()).getBoolean("enabled"),"OFF persisted to MP private preference");
  bridge.setMusicEnabled(true,token);yes(new JSONObject(bridge.musicState()).getBoolean("enabled"),"ON persisted");
  app.musicSuspended=true;yes(new JSONObject(bridge.musicState()).getBoolean("suspended"),"Activity background pause state");
  app.multiplayerMusicLifecycle("suspend");yes(app.webView.scripts.getLast().contains("setSuspended?.(true)"),"Actual background lifecycle API");
  app.multiplayerMusicLifecycle("resume");yes(app.webView.scripts.getLast().contains("setSuspended?.(false)"),"Actual foreground lifecycle API");
  yes(app.webView.scripts.getLast().contains(JSONObject.quote(token)),"Lifecycle is fenced to current iframe token");
  app.multiplayerMusicLifecycle("dispose");yes(app.webView.scripts.getLast().contains("dispose?.()"),"Retirement disposes Audio");
  app.setSessionActive(false);yes(app.musicSession.isEmpty(),"Exit clears token");bridge.setMusicEnabled(false,token);yes(app.musicPreferences.enabled,"Outgoing old callback rejected");
  int scripts=app.webView.scripts.size();app.multiplayerMusicLifecycle("resume");yes(app.webView.scripts.size()==scripts,"Inactive lifecycle cannot reach another frame");
  app.setSessionActive(true);yes(!token.equals(app.musicSession),"Rejoin receives a new token");bridge.setMusicEnabled(false,token);yes(app.musicPreferences.enabled,"Old token cannot alter new battle");
  for(String path:new String[]{"optional/music-v1.data","music/music.data","music-loader.js","music-tracks.json","optional/map-music/x","../music-catalog.js","%6dusic-catalog.js"})yes(!sharedUiAsset(path),"Non-catalog asset blocked: "+path);
  yes(sharedUiAsset("music-catalog.js"),"Exact catalogue readable");
  for(String id:new String[]{"../config","original_soundtrack/../track1.opus","original_soundtrack/%2e%2e/track1.opus","original_soundtrack\\track1.opus","/original_soundtrack/track1.opus","original_soundtrack/track1.opus/extra","original_soundtrack/track1.opus?x","original_soundtrack/track1.json"})yes(!validMusicTrackId(id),"Unsafe music ID blocked: "+id);
  yes(app.multiplayerMusicResponse(request("GET",null),"original_soundtrack/unknown.opus").getStatusCode()==404,"Unknown well-shaped track rejected");
  JSONObject catalog=new JSONObject(Files.readString(Path.of(args[0],"warzone/music-catalog.js")).replaceFirst("(?s)^.*?=\\s*", "").replaceFirst(";\\s*$", ""));
  Map<String,JSONObject>entries=new HashMap<>();JSONArray files=catalog.getJSONArray("files");for(int i=0;i<files.length();i++){JSONObject entry=files.getJSONObject(i);entries.put(entry.getString("filename"),entry);}
  for(int i=0;i<all.length();i++){
   JSONObject song=all.getJSONObject(i);String id=song.getString("id");yes(validMusicTrackId(id),"All actual39 track IDs accepted");yes(song.getString("url").equals(ORIGIN+"/warzone/optional/map-music/"+id),"Exact local URL");
   JSONObject entry=entries.get("/data/music/albums/"+id);long expected=entry.getLong("end")-entry.getLong("start");
   WebResourceResponse response=app.multiplayerMusicResponse(request("GET",null),id);yes(response.getStatusCode()==200,"Whole-track response");yes(response.getResponseHeaders().get("Accept-Ranges").equals("none"),"Browser Blob owns seeking");
   yes(!response.getResponseHeaders().containsKey("Content-Length"),"No duplicate GET length header");
   MessageDigest hash=MessageDigest.getInstance("SHA-256");long total=0;try(InputStream in=response.getData()){yes(in.available()==expected,"Track bounded available");byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){hash.update(buffer,0,n);total+=n;}yes(in.read()==-1,"No following-track bytes");}
   yes(total==expected,"Exact track byte count");yes(HexFormat.of().formatHex(hash.digest()).equals(entry.getString("sha256")),"Original audio hash");
   WebResourceResponse head=app.multiplayerMusicResponse(request("HEAD",null),id);yes(head.getStatusCode()==200&&head.getData().read()==-1,"HEAD no audio body");yes(head.getResponseHeaders().get("Content-Length").equals(Long.toString(expected)),"HEAD length metadata");
   yes(app.multiplayerMusicResponse(request("GET","bytes=0-"),id).getStatusCode()==416,"Direct ranges rejected");yes(app.multiplayerMusicResponse(request("POST",null),id).getStatusCode()==405,"Non-read methods rejected");
  }
  System.out.println(new JSONObject().put("passed",true).put("checks",checks).put("originalTracksVerified",39));
 }
 static class MemoryPreferences {boolean enabled=true;boolean getBoolean(String key,boolean fallback){return enabled;}Editor edit(){return new Editor();}class Editor{boolean value;Editor putBoolean(String key,boolean value){this.value=value;return this;}boolean commit(){enabled=value;return true;}}}
}
'''.replace('__METHODS__', methods).replace('__BRIDGE__', bridge)
    stubs = {
        'android/content/Context.java': 'package android.content;public class Context {private final android.content.res.AssetManager assets;public Context(String root){assets=new android.content.res.AssetManager(root);}public Context getApplicationContext(){return this;}public android.content.res.AssetManager getAssets(){return assets;}}',
        'android/content/res/AssetFileDescriptor.java': 'package android.content.res;public class AssetFileDescriptor implements AutoCloseable {private final long length;public AssetFileDescriptor(long length){this.length=length;}public long getDeclaredLength(){return length;}public void close(){}}',
        'android/content/res/AssetManager.java': 'package android.content.res;import java.io.*;import java.nio.file.*;public class AssetManager {public static final int ACCESS_RANDOM=1;private final Path root;public AssetManager(String root){this.root=Path.of(root);}public InputStream open(String name)throws IOException{return new FileInputStream(root.resolve(name).toFile());}public InputStream open(String name,int mode)throws IOException{return open(name);}public AssetFileDescriptor openFd(String name)throws IOException{return new AssetFileDescriptor(Files.size(root.resolve(name)));}}',
        'android/util/Log.java': 'package android.util;public class Log {public static void w(String tag,String text,Exception e){}}',
        'android/webkit/JavascriptInterface.java': 'package android.webkit;public @interface JavascriptInterface {}',
        'android/webkit/WebView.java': 'package android.webkit;import java.util.*;public class WebView {public List<String>scripts=new ArrayList<>();public void evaluateJavascript(String script,Object callback){scripts.add(script);}}',
        'android/webkit/WebResourceRequest.java': 'package android.webkit;import java.util.Map;public interface WebResourceRequest {String getMethod();Map<String,String>getRequestHeaders();}',
        'android/webkit/WebResourceResponse.java': 'package android.webkit;import java.io.*;import java.util.*;public class WebResourceResponse {private final int code;private final Map<String,String>headers;private final InputStream input;public WebResourceResponse(String mime,String encoding,int code,String reason,Map<String,String>headers,InputStream input){this.code=code;this.headers=headers;this.input=input;}public int getStatusCode(){return code;}public Map<String,String>getResponseHeaders(){return headers;}public InputStream getData(){return input;}}',
    }
    with tempfile.TemporaryDirectory(prefix='mp-music-072-') as folder:
        work = Path(folder).resolve()
        assert work.parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('mp-music-072-')
        for name, text in stubs.items():
            p = work / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding='utf-8')
        package = work / 'com/rbabbit/blocknight/warzone'; package.mkdir(parents=True)
        for name in ('MapMusicIndex.java', 'MusicTrackCatalog.java', 'MapLevelCatalog.java', 'MusicPackStore.java', 'MusicTrackResponse.java'):
            (package / name).write_bytes((JAVA / name).read_bytes())
        (package / 'MultiplayerMusicProbe072.java').write_text(harness, encoding='utf-8')
        built = subprocess.run([str(jdk / 'javac.exe'), '-encoding', 'UTF-8', '-cp', str(jar), '-d', str(work), *map(str, work.rglob('*.java'))], capture_output=True, text=True)
        assert built.returncode == 0, built.stderr
        ran = subprocess.run([str(jdk / 'java.exe'), '-cp', str(work) + ';' + str(jar), 'com.rbabbit.blocknight.warzone.MultiplayerMusicProbe072', str(ROOT / 'app/src/main/assets')], capture_output=True, text=True)
        assert ran.returncode == 0, ran.stderr
        report = json.loads(ran.stdout)
    report.update(emulatorUsed=False,androidPlaybackVerified=False,scope='Actual Activity music bridge/routes + bundled metadata/store/readers with host Android stand-ins; no Android or decoder execution.',activitySHA256=digest(SOURCE))
    output = ROOT / 'qa/multiplayer-072/music-java.json'; output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__': main()
