"""Focused actual Java catalog/save checks and Android view compilation; no device/build."""
from pathlib import Path
import hashlib, json, os, re, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone'
JDK = Path('C:/Program Files/Android/Android Studio/jbr/bin')
ANDROID = Path('C:/Users/punke/AppData/Local/Android/Sdk/platforms/android-36/android.jar')
JSON_JAR = next((Path.home()/'.gradle/caches/modules-2/files-2.1/org.json/json/20240303').glob('*/json-20240303.jar'))

def run(args):
    p = subprocess.run([str(x) for x in args], capture_output=True, text=True, timeout=60)
    if p.returncode: raise AssertionError(p.stdout + p.stderr)
    return p.stdout

def main():
    with tempfile.TemporaryDirectory(prefix='survival-navigation-094-') as directory:
        work = Path(directory); package = work/'com/rbabbit/blocknight/warzone'; package.mkdir(parents=True)
        ui_names = ['SurvivalSetupView','SurvivalMapCatalog','MapLevelCatalog','MapPreviewPager',
                    'TowersTheme','TowersControlDrawable','FfaSetupLayout','TowersSetupLayout',
                    'GraphicsSetupView','BattleLaunchSpec','FfaMapCatalog','HomeModesView','HomeMenuLayout',
                    'PortraitHomeLayout','WarzoneSplashView']
        resources = sorted({m for n in ui_names for m in re.findall(r'(?<!android\.)\bR\.drawable\.(\w+)', (JAVA/(n+'.java')).read_text())})
        (package/'R.java').write_text('package com.rbabbit.blocknight.warzone; final class R {static final class drawable {' +
            ''.join('static final int '+name+'='+str(i+1)+';' for i,name in enumerate(resources))+'}}')
        (package/'BuildConfig.java').write_text('package com.rbabbit.blocknight.warzone; final class BuildConfig {static final boolean PLAY_STORE_BUILD=false;}')
        classes = work/'android-compile'; classes.mkdir()
        run([JDK/'javac.exe','-encoding','UTF-8','-cp',ANDROID,'-d',classes,
            *[JAVA/(name+'.java') for name in ui_names],package/'R.java',package/'BuildConfig.java'])
        # Host-only Context/AssetManager supplies actual catalog bytes and isolated save directories.
        context = work/'android/content/Context.java'; context.parent.mkdir(parents=True)
        context.write_text('package android.content; public abstract class Context {'
            'public abstract java.io.File getFilesDir(); public Context getApplicationContext(){return this;}'
            'public android.content.res.AssetManager getAssets(){return new android.content.res.AssetManager();}}')
        manager = work/'android/content/res/AssetManager.java'; manager.parent.mkdir(parents=True)
        manager.write_text('package android.content.res; public class AssetManager {'
            'public java.io.InputStream open(String path)throws java.io.IOException {'
            'return java.nio.file.Files.newInputStream(java.nio.file.Path.of(System.getProperty("fixture.assets"),path));}}')
        (package/'SurvivalNavigation094.java').write_text(HARNESS)
        host = work/'host'; host.mkdir()
        names=['MapLevelCatalog','SurvivalMapCatalog','BattleLaunchSpec','FfaMapCatalog','SaveGameStore']
        run([JDK/'javac.exe','-encoding','UTF-8','-cp',JSON_JAR,'-d',host,context,manager,
            *[JAVA/(name+'.java') for name in names],package/'SurvivalNavigation094.java'])
        stdout=run([JDK/'java.exe','-Dfixture.assets='+str(ROOT/'app/src/main/assets'),'-cp',str(host)+os.pathsep+str(JSON_JAR),
            'com.rbabbit.blocknight.warzone.SurvivalNavigation094',str(work/'saves')])
        checks=int(re.search(r'PASS (\d+) actual catalog/launch/save checks',stdout)[1])
    sources=[JAVA/(n+'.java') for n in sorted(set(ui_names+['SaveGameStore']))]
    report={'passed':True,'version':'0.94','checks':checks,'androidViewsCompiled':len(ui_names),
        'androidViewsExecuted':False,'emulatorUsed':False,'apkBuilt':False,
        'scope':'Focused actual Java catalog/launch/save methods on host JVM with synthetic native bytes; real Android view sources compile against API36. No engine, device, Gradle or Android persistence execution.',
        'stdout':stdout,'sources':[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sources]}
    target=ROOT/'qa/survival-094/navigation-checks.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'passed':True,'checks':checks,'androidViewsCompiled':len(ui_names),'emulatorUsed':False}))

HARNESS=r'''package com.rbabbit.blocknight.warzone;
import java.io.File;import java.nio.file.*;import java.util.*;import java.nio.charset.StandardCharsets;import org.json.*;
final class SurvivalNavigation094 {
 static int checks;interface Task{void run()throws Exception;}static void check(boolean ok){if(!ok)throw new AssertionError();checks++;}
 static void rejects(Task task)throws Exception{try{task.run();}catch(Exception expected){checks++;return;}throw new AssertionError("must reject");}
 static class Host extends android.content.Context{final File root;Host(Path p)throws Exception{Files.createDirectories(p);root=p.toFile();}public File getFilesDir(){return root;}}
 static String enc(String s){return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));}
 static JSONObject metadata(){return new JSONObject().put("mode","survival").put("profile","survival").put("mapId","tdn2").put("session","s094")
   .put("nativeLevel","Survival-TDN2-T1").put("gameTime",1234).put("wave",1).put("totalWaves",60);}
 static JSONObject files(){JSONObject identity=new JSONObject().put("version",94).put("mode","survival").put("profile","survival").put("map","tdn2")
   .put("level","Survival-TDN2-T1").put("player",0).put("enemyPlayer",1);
   JSONObject globals=new JSONObject().put("survivalIdentity",identity).put("wtreward_match",new JSONObject().put("session","s094"))
     .put("warzoneTowersWaves_state",new JSONObject().put("wave",1));
   return new JSONObject().put("gam.json",enc(new JSONObject().put("gameTime",1234).put("levelName","Survival-TDN2-T1").toString()))
     .put("main.json",enc("{}" )).put("gameinfo.json",enc("{}" )).put("scriptstate.json",enc(new JSONObject().put("rules",globals).toString())).put("game.map",enc("fixture"));}
 public static void main(String[]args)throws Exception{Host ctx=new Host(Path.of(args[0]));
   check(MapLevelCatalog.get(ctx).difficulty("easy").size()==16);check(MapLevelCatalog.get(ctx).difficulty("medium").size()==15);check(MapLevelCatalog.get(ctx).difficulty("hard").size()==15);
   check(!MapLevelCatalog.isKnownId("tdn2"));check(SurvivalMapCatalog.levels().size()==2);check(SurvivalMapCatalog.get("wave").rounds==60);
   check(SurvivalMapCatalog.get("tdn2").preparationSeconds==240);rejects(()->SurvivalMapCatalog.get("emag"));
   check(new BattleLaunchSpec("survival","cannon","wave",false).mapId.equals("wave"));rejects(()->new BattleLaunchSpec("survival","cannon","td2",false));
   check(new BattleLaunchSpec("towers","cannon","easy01",false).mapId.equals("easy01"));
   SaveGameStore survival=new SaveGameStore(ctx,"survival"),waves=new SaveGameStore(ctx);
   String slot=survival.save(metadata(),files());check(survival.load(slot).getJSONObject("metadata").getString("profile").equals("survival"));check(waves.list().length()==0);
   rejects(()->waves.save(metadata(),files()));rejects(()->survival.save(metadata().put("mapId","wave"),files()));
   rejects(()->survival.save(metadata().put("profile","towers"),files()));
   JSONObject bad=files().put("scriptstate.json",enc("{}"));rejects(()->survival.save(metadata(),bad));
   JSONObject wrong=files();JSONObject s=new JSONObject(new String(Base64.getDecoder().decode(wrong.getString("scriptstate.json")),StandardCharsets.UTF_8));
   s.getJSONObject("rules").getJSONObject("survivalIdentity").put("enemyPlayer",7);wrong.put("scriptstate.json",enc(s.toString()));rejects(()->survival.save(metadata(),wrong));
   JSONObject old=metadata();old.remove("mode");old.remove("profile");old.put("mapId","easy01").put("nativeLevel","WT-E01-T1");
   JSONObject oldFiles=files().put("gam.json",enc(new JSONObject().put("gameTime",1234).put("levelName","WT-E01-T1").toString()))
     .put("scriptstate.json",enc("{}"));
   check(waves.save(old,oldFiles).startsWith("wt_"));check(survival.list().length()==1);
   System.out.println("PASS "+checks+" actual catalog/launch/save checks");
 }
}'''
if __name__=='__main__': main()
