"""Compile actual save/launch classes and execute legacy/Cobra identity checks; no Android runtime."""
from pathlib import Path
from hashlib import file_digest
import importlib.util, json, os, re, subprocess, uuid

ROOT=Path(__file__).resolve().parents[1]
JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')
OUT=ROOT/'build/cobra-save-064'
SOURCES=['app/src/main/java/com/rbabbit/blocknight/warzone/SaveGameStore.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/BattleLaunchSpec.java',
    'tools/save-store-fixture/android/content/Context.java','tools/check-save-store-027.java',
    'tools/check-campaign-save-051.java','tools/check-cobra-save-064.java','tools/check-cobra-save-064.py']
LEGACY='scenario/ffa/test-fixtures/legacy-nullbot-hard.zip'
APP_SOURCES=['app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/FfaSetupView.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/SavedGamesView.java']

def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()

def main():
    jar,=list((Path.home()/'.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))
    assert digest(jar)=='3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'
    OUT.mkdir(parents=True,exist_ok=True)
    stub=OUT/'MapLevelCatalog.java'
    stub.write_text('package com.rbabbit.blocknight.warzone; final class MapLevelCatalog { static String normalizeId(String value) { return value; } }\n')
    spec=importlib.util.spec_from_file_location('home_route_methods',ROOT/'tools/check-home-routes-056.py')
    helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
    activity=(ROOT/APP_SOURCES[0]).read_text(encoding='utf-8')
    extracted=re.sub(r'^    (?=(?:public|private|protected)\b)','  ',activity,flags=re.M)
    actual='\n'.join(helpers.method(extracted,name)[3] for name in ['ffaSave','ffaRestored','gameUrl','isFfaBattle','loadFfaSave'])
    bridge=OUT/'CobraBridgeProbe064.java'
    bridge.write_text(r'''
package com.rbabbit.blocknight.warzone;
import java.io.IOException;
import org.json.JSONObject;
public final class CobraBridgeProbe064 {
  static final String ORIGIN="https://game",URL="https://game/warzone/index.html?mode=towers";
  static class Log { static void w(String a,String b,Exception c){} }
  static class Gfx {void showError(String value){}}
  static class Saves {String error;void showError(String value){error=value;}}
  static class Root {void removeView(Object value){}}
  static class Web {String url;void loadUrl(String value){url=value;}}
  static class Store {JSONObject payload,archived;int writes;JSONObject load(String id){return payload;}String save(JSONObject meta,JSONObject files){writes++;archived=meta;return "wt_"+"b".repeat(32);}}
  static class Intent {boolean getBooleanExtra(String key,boolean fallback){return fallback;}}
  static final String TAG="host";
  BattleLaunchSpec battleLaunch=new BattleLaunchSpec("ffa","cannon","emag",false,"easy");
  String battleSession="document-A",rewardSession="",battleOutcome="",loadingSaveId="wt_"+"a".repeat(32),ffaDifficulty="easy",matchMode="ffa",duelWeapon="cannon";
  JSONObject loadingSave;Gfx graphicsSetup;Saves savedGamesView;Object loadingOverlay;boolean mainMenuReturnPending,restoringGame;
  Store ffaSaves=new Store();Root root=new Root();Web webView=new Web();
  android.content.pm.ApplicationInfo getApplicationInfo(){return new android.content.pm.ApplicationInfo();}
  Intent getIntent(){return new Intent();}
  void closeFfaSetup(){} void createLoadingPanel(){} void returnToMainMenu(){}
''' + actual + r'''
  static int checks;
  static void check(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
  static JSONObject metadata(String type){JSONObject m=new JSONObject().put("mode","ffa").put("mapId","emag").put("mapName","EMAG FFA").put("session","native-run").put("difficulty","easy").put("nativeLevel","FFA-EMAG-T1").put("gameTime",1000);if(type!=null)m.put("botType",type);return m;}
  static JSONObject proof(String type){JSONObject p=metadata(type).put("ok",true).put("gameTime",1500);return p;}
  public static void main(String[]args){
    CobraBridgeProbe064 fresh=new CobraBridgeProbe064();check(fresh.gameUrl().contains("bnFfaBotType=cobra")&&!fresh.gameUrl().contains("bnFfaRestore"),"Fresh start route is Cobra");
    for(String type:new String[]{"cobra","nullbot"}){
      CobraBridgeProbe064 p=new CobraBridgeProbe064();p.battleLaunch=new BattleLaunchSpec("ffa","cannon","emag",false,"easy",type);
      JSONObject success=new JSONObject(p.ffaSave(p.battleSession,metadata(type).toString(),"{}"));check(success.optBoolean("ok")&&p.ffaSaves.writes==1,"Matching actual bot saves "+type);
      for(String wrong:new String[]{"","unknown","mixed",type.equals("cobra")?"nullbot":"cobra"})check(!new JSONObject(p.ffaSave(p.battleSession,metadata(wrong).toString(),"{}")).optBoolean("ok"),"Wrong explicit save identity denied");
      check(!new JSONObject(p.ffaSave(p.battleSession,metadata(null).toString(),"{}")).optBoolean("ok"),"New archive must explicitly name actual bots");
      for(String wrong:new String[]{"","unknown","mixed",type.equals("cobra")?"nullbot":"cobra"}){
        p.loadingSave=new JSONObject().put("metadata",metadata(type.equals("nullbot")?null:type));check(!p.ffaRestored(p.battleSession,p.loadingSaveId,proof(wrong).toString()),"Wrong restore proof denied");check(p.loadingSave!=null,"Rejected proof retains payload");
      }
      p.loadingSave=new JSONObject().put("metadata",metadata(type.equals("nullbot")?null:type));check(!p.ffaRestored(p.battleSession,p.loadingSaveId,proof(null).toString()),"Missing bot proof denied");
      check(p.ffaRestored(p.battleSession,p.loadingSaveId,proof(type).toString())&&p.loadingSave==null,"Matching restore identity verified "+type);
    }
    for(String type:new String[]{"cobra","nullbot"}){
      CobraBridgeProbe064 p=new CobraBridgeProbe064();p.graphicsSetup=new Gfx();p.savedGamesView=new Saves();p.ffaSaves.payload=new JSONObject().put("metadata",metadata(type.equals("nullbot")?null:type));p.loadFfaSave("wt_"+"a".repeat(32));check(p.battleLaunch.ffaBotType.equals(type),"Load preserves saved bot identity");check(p.webView.url.contains("bnFfaBotType="+type)&&p.webView.url.contains("bnFfaRestore=1"),"Restore URL carries exact expectation");
    }
    System.out.println(new JSONObject().put("passed",true).put("checksPassed",checks).put("actualActivityMethods",true));
  }
}
''',encoding='utf-8')
    android_stub=OUT/'android/content/pm/ApplicationInfo.java';android_stub.parent.mkdir(parents=True,exist_ok=True)
    android_stub.write_text('package android.content.pm; public class ApplicationInfo { public static final int FLAG_DEBUGGABLE=2; public int flags=0; }\n')
    subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8','-cp',str(jar),'-d',str(OUT)]
        +[str(ROOT/name) for name in SOURCES if name.endswith('.java')]+[str(stub),str(bridge),str(android_stub)],check=True,timeout=60)
    results=[]
    for entry in ['CheckCobraSave064','CobraBridgeProbe064','CheckCampaignSave051','SaveStoreCheck027']:
        result=subprocess.run([str(JDK/'java.exe'),'-Xmx768m','-cp',os.pathsep.join((str(OUT),str(jar))),
            'com.rbabbit.blocknight.warzone.'+entry,str(OUT/('data-'+uuid.uuid4().hex)),
            str(ROOT/LEGACY) if entry=='CheckCobraSave064' else str(ROOT/'app/src/main/assets/warzone/levels/catalog.json')],
            check=True,capture_output=True,text=True,timeout=60)
        print(result.stdout.strip());results.append(dict(main=entry,output=result.stdout.strip()))
    record=dict(version='0.64',passed=True,emulatorUsed=False,actualNativeEngineExecuted=False,
        genuineLegacyArchive=LEGACY,legacySHA256=digest(ROOT/LEGACY),syntheticCobraIdentityFixture=True,
        checks=results,sources=[dict(path=name,sha256=digest(ROOT/name)) for name in SOURCES+APP_SOURCES+[LEGACY]])
    (ROOT/'archive/cobra-0.64-java-checks.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
