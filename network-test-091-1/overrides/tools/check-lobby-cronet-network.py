#!/usr/bin/env python3
"""Actual Java policy/lifecycle checks and compile against the pinned official Cronet API.

This performs no app build, device operations, lobby join, or server mutation.
"""
from pathlib import Path
import hashlib
import io
import json
import os
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone'
JDK = Path(os.environ.get('JAVA_HOME', r'C:/Program Files/Android/Android Studio/jbr')) / 'bin'
SDK = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
MAIN = r'''package com.rbabbit.blocknight.warzone;
public final class PolicyCheck {
  static int checks;
  static void yes(boolean value) { if (!value) throw new AssertionError("check " + checks); checks++; }
  static void rejects(Throwing f) throws Exception { try { f.run(); } catch (java.io.IOException good) { checks++; return; } throw new AssertionError("accepted invalid input"); }
  interface Throwing { void run() throws Exception; }
  public static void main(String[] args) throws Exception {
    String url="https://wzlobby.wz2100.net/lobby/api/v1/game/abc/request-join?x=%2B";
    yes(LobbyHttpPolicy.allowedUrl(url).toString().equals(url));
    yes(LobbyHttpPolicy.allowedUrl("https://WZLOBBY.WZ2100.NET:443/lobby/api/v1/games").getPort()==443);
    for(String bad:new String[]{"http://wzlobby.wz2100.net/lobby", "https://wzlobby.wz2100.net:444/lobby", "https://other.invalid/lobby", "https://user@wzlobby.wz2100.net/lobby", "https://wzlobby.wz2100.net.evil.invalid/lobby", "/lobby", "https://wzlobby.wz2100.net/lobby#fragment"}) rejects(()->LobbyHttpPolicy.allowedUrl(bad));
    yes(LobbyHttpPolicy.method("post").equals("POST"));
    for(String bad:new String[]{"CONNECT", "POST\r\nX:y", "TRACE"}) rejects(()->LobbyHttpPolicy.method(bad));
    for(String h:new String[]{"Origin", "Referer", "User-Agent", "Content-Type", "Authorization"}) yes(LobbyHttpPolicy.forwardedHeader(h,"preserved"));
    for(String h:new String[]{"Host", "Content-Length", "Connection"}) yes(!LobbyHttpPolicy.forwardedHeader(h,"ignored"));
    rejects(()->LobbyHttpPolicy.forwardedHeader("Bad Header","x"));
    rejects(()->LobbyHttpPolicy.forwardedHeader("Origin","x\r\nInjected:y"));
    LobbyHttpPolicy.bodyAllowed("POST",LobbyHttpPolicy.MAX_BYTES); checks++;
    rejects(()->LobbyHttpPolicy.bodyAllowed("POST",LobbyHttpPolicy.MAX_BYTES+1));
    rejects(()->LobbyHttpPolicy.bodyAllowed("GET",1));
    LobbyHttpPolicy.Registry r=new LobbyHttpPolicy.Registry();
    LobbyHttpPolicy.Registry.Ticket a=r.begin(1); yes(a!=null); yes(r.begin(1)==null);
    yes(r.active(a)); yes(r.terminal(a)); yes(!r.active(a)); yes(!r.terminal(a)); yes(r.claim(a)); yes(!r.claim(a));
    a=r.begin(1); yes(r.cancel(1)==a); yes(!r.terminal(a));
    LobbyHttpPolicy.Registry.Ticket b=r.begin(1); yes(b!=a); yes(!r.claim(a)); yes(r.terminal(b)); yes(r.claim(b));
    a=r.begin(1); yes(r.terminal(a)); b=r.begin(1); yes(b!=null); yes(!r.claim(a)); yes(r.terminal(b)); yes(r.claim(b));
    for(int i=0;i<8;i++) yes(r.begin(i)!=null); yes(r.begin(8)==null); yes(r.cancel(2)!=null); yes(r.begin(8)!=null);
    yes(r.clear().size()==8); yes(!r.isCurrent(b)); yes(r.begin(-1)==null);
    System.out.println("actual-policy-checks="+checks);
  }
}'''

def run():
    source_paths = [JAVA / name for name in ('LobbyHttpPolicy.java', 'CronetLobbyHttp.java', 'MultiplayerActivity.java')]
    digests = {str(p.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}
    transport = source_paths[1].read_text(encoding='utf-8')
    activity = source_paths[2].read_text(encoding='utf-8')
    gradle = (ROOT / 'app/build.gradle.kts').read_text(encoding='utf-8')
    assert 'org.chromium.net:cronet-bundled:500.1.0' in gradle
    assert 'versionCode = 91' in gradle and 'versionName = "0.91-network.1"' in gradle
    assert 'PROVIDER_NAME_APP_PACKAGED' in transport and '.enableQuic(true).enableHttp2(true).enableBrotli(true)' in transport
    assert '.addQuicHint(LobbyHttpPolicy.HOST, 443, 443)' in transport and 'HTTP_CACHE_DISABLED' in transport and '.disableCache()' in transport
    assert 'UploadDataProviders.create(body)' in transport and 'builder.addHeader(name, value)' in transport
    assert 'request.cancel()' in transport and 'BooleanSupplier claim' in activity and '!claim.getAsBoolean()' in activity
    assert 'HttpURLConnection' not in activity and 'forwardHttp(' not in activity
    assert 'public void cancel(int id)' in activity and 'lobbyHttp.cancel(id)' in activity
    assert 'if (lobbyHttp != null) lobbyHttp.close()' in activity
    assert 'setExperimentalOptions' not in transport and 'setProxy' not in transport
    with tempfile.TemporaryDirectory(prefix='wz-cronet-host-') as tmp:
        temp = Path(tmp)
        main = temp / 'PolicyCheck.java'; main.write_text(MAIN, encoding='utf-8')
        subprocess.run([str(JDK/'javac.exe'), '-d', str(temp), str(source_paths[0]), str(main)], check=True, capture_output=True, text=True)
        result = subprocess.run([str(JDK/'java.exe'), '-cp', str(temp), 'com.rbabbit.blocknight.warzone.PolicyCheck'], check=True, capture_output=True, text=True)
        jars=[]; dependencies=[]
        for artifact in ('cronet', 'cronet-bundled'):
            url=f'https://dl.google.com/dl/android/maven2/org/chromium/net/{artifact}/500.1.0/{artifact}-500.1.0.aar'
            with urllib.request.urlopen(url, timeout=20) as response: data=response.read(32*1024*1024)
            aar=zipfile.ZipFile(io.BytesIO(data)); jar=temp/f'{artifact}.jar'; jar.write_bytes(aar.read('classes.jar')); jars.append(str(jar))
            dependencies.append({'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        classpath=os.pathsep.join([str(SDK/'platforms/android-36/android.jar')]+jars)
        compile_result=subprocess.run([str(JDK/'javac.exe'), '-cp', classpath, '-d', str(temp), str(source_paths[0]), str(source_paths[1])], check=True, capture_output=True, text=True)
        report={'passed':True,'scope':'actual pure Java policy/identity execution, pinned SDK API compile and scoped source contracts',
                'policyResult':result.stdout.strip(),'cronetCompilePassed':True,'compileNotes':compile_result.stderr.strip(),
                'sourceSHA256':digests,'dependencies':dependencies,'androidRuntimeTested':False,'cellularSuccessClaimed':False,
                'deviceOrVPSOperations':False}
    output=ROOT/'release-records/lobby-cronet-java-checks.json'; output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__ == '__main__': run()
