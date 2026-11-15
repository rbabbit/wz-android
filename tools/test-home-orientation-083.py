"""Host-run actual083 orientation policy/scheduler; no Android or emulator.
Android lifecycle/render/input checks belong to the exact-APK journey.
"""
from pathlib import Path
import hashlib, json, re, subprocess, tempfile, xml.etree.ElementTree as ET, zipfile

ROOT=Path(__file__).resolve().parents[1]; QA=ROOT/'qa/portrait-home-083'
JAVA=ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone'
MAIN=(JAVA/'MainActivity.java').read_text(); GRAPHICS=(JAVA/'GraphicsSetupView.java').read_text()
QA.mkdir(parents=True,exist_ok=True)
def method(source,name):
    match=re.search(r'(?m)^  (?:private|public|protected) [^\n]*\b'+re.escape(name)+r'\([^\n]*\) \{',source)
    if not match:raise AssertionError('Method missing '+name)
    start=match.start();brace=source.index('{',match.start());depth=1;i=brace+1;quote=None;escape=False;comment=None
    while depth:
        ch=source[i];nxt=source[i:i+2]
        if comment=='line':
            if ch=='\n':comment=None
        elif comment=='block':
            if nxt=='*/':comment=None;i+=1
        elif quote:
            if escape:escape=False
            elif ch=='\\':escape=True
            elif ch==quote:quote=None
        elif nxt=='//':comment='line';i+=1
        elif nxt=='/*':comment='block';i+=1
        elif ch in ['"',"'"]:quote=ch
        elif ch=='{':depth+=1
        elif ch=='}':depth-=1
        i+=1
    return source[start:i]

methods='\n'.join(method(MAIN,n) for n in ['uiOrientation','syncUiOrientation','applyUiOrientation'])
harness='''package com.rbabbit.blocknight.warzone;
import java.util.*;
public class HomeOrientationHost083 {
 static class ActivityInfo {static final int SCREEN_ORIENTATION_PORTRAIT=1,SCREEN_ORIENTATION_SENSOR_LANDSCAPE=6;}
 static class Home {boolean modes=true;boolean isHomeModesVisible(){return modes;}}
 static class Root {List<Runnable> queue=new ArrayList<>();void removeCallbacks(Runnable r){queue.removeIf(x->x==r);}void post(Runnable r){queue.add(r);}void flush(){List<Runnable> copy=new ArrayList<>(queue);queue.clear();for(Runnable r:copy)r.run();}}
 Root root=new Root();Home graphicsSetup=new Home();boolean graphicsSetupConstructing,orientationDestroyed,finishing,destroyed;
 Object guideView,hubView,campaignSetup,ffaSetup,savedGamesView,rewardsView,rewardReceipt,battleBriefing,loadingOverlay,replayPanel,adCover;
 final Runnable applyHomeOrientation=this::applyUiOrientation;
 int requested=1;List<Integer> requests=new ArrayList<>();
 boolean isFinishing(){return finishing;}boolean isDestroyed(){return destroyed;}
 int getRequestedOrientation(){return requested;}void setRequestedOrientation(int n){requested=n;requests.add(n);}
 METHODS
 static List<String> checks=new ArrayList<>();
 static void check(boolean v,String name){if(!v)throw new AssertionError(name);checks.add(name);}
 public static void main(String[] args)throws Exception{
  HomeOrientationHost083 h=new HomeOrientationHost083();
  h.graphicsSetupConstructing=true;h.syncUiOrientation();check(h.root.queue.isEmpty()&&h.requests.isEmpty(),"Constructor Home callback cannot run half-initialized Activity policy");
  h.graphicsSetupConstructing=false;h.syncUiOrientation();h.root.flush();check(h.requested==1&&h.requests.isEmpty(),"Cold mode-selection Home stays portrait idempotently");
  h.graphicsSetup.modes=false;h.syncUiOrientation();check(h.requested==6&&h.root.queue.isEmpty(),"Towers map requests landscape immediately");
  h.graphicsSetup.modes=true;h.syncUiOrientation();h.syncUiOrientation();check(h.requested==6&&h.root.queue.size()==1,"Repeated Home returns coalesce into one pending portrait update");
  h.graphicsSetup.modes=false;h.syncUiOrientation();h.root.flush();check(h.requested==6&&!h.requests.contains(1),"Battle return directly to Towers map avoids transient portrait bounce");
  h.graphicsSetup.modes=true;h.syncUiOrientation();h.ffaSetup=new Object();h.syncUiOrientation();h.root.flush();check(h.requested==6&&!h.requests.contains(1),"Battle return directly to FFA setup cancels intermediate Home portrait");
  h.ffaSetup=null;h.syncUiOrientation();h.root.flush();check(h.requested==1,"Back from FFA setup restores mode-selection portrait");
  String[] pages={"campaignSetup","guideView","hubView","savedGamesView","rewardsView","rewardReceipt","battleBriefing","adCover","loadingOverlay","replayPanel"};
  for(String page:pages){java.lang.reflect.Field f=HomeOrientationHost083.class.getDeclaredField(page);f.set(h,new Object());h.syncUiOrientation();check(h.requested==6,page+" preserves existing landscape surface");f.set(h,null);h.syncUiOrientation();h.root.flush();check(h.requested==1,"Closing "+page+" returns only unobscured mode Home to portrait");}
  Home retained=h.graphicsSetup;Object loading=new Object();h.graphicsSetup=null;h.loadingOverlay=loading;h.syncUiOrientation();check(h.requested==6,"Native game loading requests landscape before URL start");
  h.loadingOverlay=null;h.syncUiOrientation();h.root.flush();check(h.requested==6&&h.graphicsSetup==null,"Running game remains landscape without recreating Home");
  h.graphicsSetup=retained;h.syncUiOrientation();h.root.flush();check(h.requested==1,"Main resume after separate Multiplayer Activity restores portrait Home");
  h.finishing=true;h.graphicsSetup.modes=false;h.syncUiOrientation();check(h.requested==1,"Finishing Activity cannot trigger navigation orientation changes");h.finishing=false;
  h.requested=6;h.graphicsSetup.modes=true;h.syncUiOrientation();h.orientationDestroyed=true;h.root.flush();check(h.requested==6,"Pending Home callback cannot mutate destroyed orientation lifecycle");
  System.out.print("[");for(int i=0;i<checks.size();i++){if(i>0)System.out.print(",");System.out.print("\\\""+checks.get(i)+"\\\"");}System.out.print("]");
 }
}'''.replace('METHODS',methods)
jdk=Path('C:/Program Files/Android/Android Studio/jbr/bin')
with tempfile.TemporaryDirectory(prefix='wz-home-orientation-083-') as temporary:
    folder=Path(temporary); (folder/'HomeOrientationHost083.java').write_text(harness,newline='\n')
    command=[str(jdk/'javac.exe'),'-d',str(folder),str(JAVA/'HomeOrientationPolicy.java'),str(folder/'HomeOrientationHost083.java')]
    built=subprocess.run(command,text=True,capture_output=True)
    if built.returncode:raise SystemExit(built.stderr)
    result=subprocess.run([str(jdk/'java.exe'),'-cp',str(folder),'com.rbabbit.blocknight.warzone.HomeOrientationHost083'],text=True,capture_output=True)
    if result.returncode:raise SystemExit(result.stderr)
    checks=json.loads(result.stdout)

ns='{http://schemas.android.com/apk/res/android}'
activities={a.attrib[ns+'name']:a.attrib for a in ET.parse(ROOT/'app/src/main/AndroidManifest.xml').findall('application/activity')}
assert activities['.MainActivity'][ns+'screenOrientation']=='portrait'
assert activities['.MultiplayerActivity'][ns+'screenOrientation']=='sensorLandscape'
for a in activities.values():assert {'orientation','screenSize','screenLayout','smallestScreenSize'}<=set(a[ns+'configChanges'].split('|'))
checks.append('Manifest starts Main portrait, retains Multiplayer landscape and handles size/orientation changes without Activity recreation')
assert 'actions.homePage(false);' in GRAPHICS and 'actions.homePage(true);' in GRAPHICS
assert 'boolean isHomeModesVisible() { return !towersMapVisible; }' in GRAPHICS
assert MAIN.index('graphicsSetupConstructing = true;')<MAIN.index('new GraphicsSetupView(')<MAIN.index('graphicsSetupConstructing = false;')
checks.append('Actual internal Towers/Home transitions notify Activity only after their visible state changes')
for name in ['showGraphicsSetup','showGuide','showHub','closeGuide','closeHub','showCampaignSetup','closeCampaignSetup','showFfaSetup','closeFfaSetup','showCampaignSaves','showFfaSaves','showSavedGames','closeSavedGames','showRewards','closeRewards','dismissRewardReceipt','dismissBriefing','createLoadingPanel','hideLoadingPanel','finishAdScreen']:
    assert 'syncUiOrientation();' in method(MAIN,name),name
checks.append('Every actual setup/reader/save/reward/loading/briefing/ad open and close path updates the central policy')
configuration=method(MAIN,'onConfigurationChanged')
assert 'super.onConfigurationChanged(configuration)' in configuration and 'root.requestLayout()' in configuration and 'root.post(this::fitViewport)' in configuration
assert not any(token in configuration for token in ['loadUrl(','reload(','showGraphicsSetup(','launchGame(','returnToMainMenu('])
assert 'syncUiOrientation();' in method(MAIN,'onResume')
destroy=method(MAIN,'onDestroy');assert destroy.index('orientationDestroyed = true;')<destroy.index('closeHub();') and 'root.removeCallbacks(applyHomeOrientation)' in destroy
checks.append('Configuration and resume resize retained views without reloading native game, with pending callback cleanup on destroy')

fallback=json.loads((QA/'fallback.json').read_text())
def locate_zip(value):
    if isinstance(value,dict):
        if str(value.get('path','')).endswith('.zip'):return value['path']
        for v in value.values():
            p=locate_zip(v)
            if p:return p
    elif isinstance(value,list):
        for v in value:
            p=locate_zip(v)
            if p:return p
    return None
archive=locate_zip(fallback);assert archive
with zipfile.ZipFile(archive) as source:
    target='app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'
    names=[n for n in source.namelist() if n==target]
    assert len(names)==1; baseline=source.read(names[0]).decode('utf-8-sig').replace('\r\n','\n')
    for name in ['launchGame','loadSavedGame','loadCampaignSave','loadFfaSave','returnToMainMenu','onBackPressed','fitViewport']:
        assert method(MAIN,name)==method(baseline,name), 'Unrelated existing behavior changed: '+name
checks.append('Actual game launch/load/return, keyboard Back, and viewport algorithms remain identical to delivered082 source')
paths=['app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java','app/src/main/java/com/rbabbit/blocknight/warzone/GraphicsSetupView.java','app/src/main/java/com/rbabbit/blocknight/warzone/HomeOrientationPolicy.java','app/src/main/AndroidManifest.xml','tools/test-home-orientation-083.py']
proof={'version':'0.83','passed':True,'emulatorUsed':False,'actualAndroidViewsExecuted':False,'actualNativeEngineExecuted':False,
       'actualJavaPolicyExecuted':True,'checks':checks,'checksPassed':len(checks),
       'sources':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in paths]}
(QA/'orientation.json').write_text(json.dumps(proof,indent=2))
print(json.dumps({'passed':True,'checksPassed':len(checks),'scope':'Actual Java orientation decision/scheduler in host stubs; no Android rendering or game execution.'}))
