"""Compile actual home-route methods against async store stubs; no emulator."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json,re,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
MAIN='app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'
JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')

def method(text,name):
    match=re.search(r'^  (?:private|protected|public) [^\n{]*\b'+re.escape(name)+r'\([^\n]*\)\s*\{',text,re.M)
    assert match,name
    brace=text.index('{',match.start());depth=0;quote=None;escaped=False;comment=None;i=brace
    while i<len(text):
        c=text[i];pair=text[i:i+2]
        if comment=='line':
            if c=='\n':comment=None
        elif comment=='block':
            if pair=='*/':comment=None;i+=1
        elif quote:
            if escaped:escaped=False
            elif c=='\\':escaped=True
            elif c==quote:quote=None
        elif pair=='//':comment='line';i+=1
        elif pair=='/*':comment='block';i+=1
        elif c in ('"',"'"):quote=c
        elif c=='{':depth+=1
        elif c=='}':
            depth-=1
            if depth==0:return match.start(),brace,i+1,text[match.start():i+1]
        i+=1
    raise AssertionError('Unclosed method '+name)

def main():
    text=(ROOT/MAIN).read_text(encoding='utf-8')
    fallback=json.loads((ROOT/'archive/fallback-0.56.json').read_text())
    saved=next(Path(row['path']) for row in fallback['files'] if row['path'].endswith('.zip'))
    with ZipFile(saved) as z:before=z.read(MAIN).decode('utf-8').replace('\r\n','\n')
    changed=['showGraphicsSetup','showCampaignSetup','closeCampaignSetup','showCampaignSaves','loadCampaignSave','launchGame',
        'showRewards','showSavedGames','loadSavedGame','returnToMainMenu','onPause','onDestroy','onBackPressed']
    after=text
    for name in ['cancelCampaignHomeCheck','openCampaignFromHome']:
        a,b,c,_=method(after,name);after=after[:a]+after[c:]
    after=after.replace('  private int campaignHomeGeneration;\n','').replace('  private boolean campaignHomeBusy;\n','')
    def masked(value):
        for name in changed:
            a,b,c,_=method(value,name);value=value[:b]+'{ /* HOME ROUTE */ }'+value[c:]
        return '\n'.join(line for line in value.splitlines() if line.strip())
    assert masked(after)==masked(before),'MainActivity changed outside the declared home-routing methods'
    for name in ['installTouchControls','gameUrl','createLoadingPanel']:
        assert method(text,name)[3]==method(before,name)[3],name+' gameplay bridge changed'
    campaign_saves=method(text,'showCampaignSaves')[3]
    assert 'campaignSaves.list()' in campaign_saves and 'saveGames.list()' not in campaign_saves
    assert 'campaignSetup == null' not in campaign_saves and '!campaignVideos.ready()' in campaign_saves
    assert 'saveGames.list()' in method(text,'showSavedGames')[3]
    for name in ['showGraphicsSetup','showCampaignSetup','closeCampaignSetup','loadCampaignSave','launchGame','showRewards','showSavedGames','loadSavedGame','returnToMainMenu','onPause','onDestroy']:
        assert 'cancelCampaignHomeCheck();' in method(text,name)[3],name+' does not invalidate inspection'
    back=method(text,'onBackPressed')[3]
    assert back.index('campaignHomeBusy')<back.index('super.onBackPressed()')
    assert back.index('handleHomeBack()')<back.index('super.onBackPressed()')
    returned=method(text,'returnToMainMenu')[3]
    assert returned.index('graphicsSetup == null && isTowersBattle()')<returned.index('battleSession = ""')
    assert returned.index('showTowersMap()')>returned.index('showGraphicsSetup()')
    actual='\n'.join(method(text,name)[3] for name in ['cancelCampaignHomeCheck','openCampaignFromHome'])
    stub=r'''
import java.util.*;
import java.util.function.Consumer;
public class HomeRouteProbe {
 static class GraphicsSetupView {boolean busy;int busyUpdates;void setCampaignBusy(boolean v){busy=v;busyUpdates++;}}
 static class CampaignVideoStore {final List<Consumer<Boolean>> pending=new ArrayList<>();void inspect(Consumer<Boolean> c){pending.add(c);}}
 GraphicsSetupView graphicsSetup=new GraphicsSetupView();Object campaignSetup,loadingOverlay,savedGamesView,rewardsView,rewardReceipt;
 CampaignVideoStore campaignVideos=new CampaignVideoStore();int campaignHomeGeneration;boolean campaignHomeBusy,mainMenuReturnPending,activityResumed=true,finishing,destroyed;
 int launches,saves,setups;String matchMode="towers";
 boolean isFinishing(){return finishing;}boolean isDestroyed(){return destroyed;}
 void showCampaignSetup(){setups++;}void showCampaignSaves(){saves++;}void launchGame(){launches++;}
'''
    cases=r'''
 static void check(boolean value){if(!value)throw new AssertionError();}
 static HomeRouteProbe start(boolean continuing){HomeRouteProbe p=new HomeRouteProbe();p.openCampaignFromHome(continuing);check(p.campaignHomeBusy&&p.graphicsSetup.busy&&p.campaignVideos.pending.size()==1);return p;}
 public static void main(String[]args){
  HomeRouteProbe p=start(false);p.openCampaignFromHome(false);check(p.campaignVideos.pending.size()==1);p.campaignVideos.pending.get(0).accept(true);
  check(p.launches==1&&p.saves==0&&p.setups==0&&p.matchMode.equals("campaign")&&!p.campaignHomeBusy&&!p.graphicsSetup.busy);
  p.campaignVideos.pending.get(0).accept(true);check(p.launches==1);
  p=start(true);p.campaignVideos.pending.get(0).accept(true);check(p.saves==1&&p.launches==0&&p.setups==0);
  for(boolean continuing:new boolean[]{false,true}){p=start(continuing);p.campaignVideos.pending.get(0).accept(false);check(p.setups==1&&p.launches==0&&p.saves==0&&!p.graphicsSetup.busy);p.campaignVideos.pending.get(0).accept(true);check(p.launches==0&&p.saves==0);}
  p=start(false);p.cancelCampaignHomeCheck();p.campaignVideos.pending.get(0).accept(true);check(p.launches==0&&!p.graphicsSetup.busy);
  p=start(false);p.graphicsSetup=new GraphicsSetupView();p.campaignVideos.pending.get(0).accept(true);check(p.launches==0);
  p=start(false);p.activityResumed=false;p.campaignVideos.pending.get(0).accept(true);check(p.launches==0&&!p.campaignHomeBusy&&!p.graphicsSetup.busy);
  p=start(false);p.finishing=true;p.campaignVideos.pending.get(0).accept(true);check(p.launches==0&&!p.campaignHomeBusy);
  p=start(true);p.destroyed=true;p.campaignVideos.pending.get(0).accept(true);check(p.saves==0&&!p.campaignHomeBusy);
  p=start(false);Consumer<Boolean> old=p.campaignVideos.pending.get(0);p.cancelCampaignHomeCheck();p.openCampaignFromHome(true);old.accept(true);check(p.launches==0&&p.saves==0);p.campaignVideos.pending.get(1).accept(true);check(p.saves==1);
  p=new HomeRouteProbe();p.savedGamesView=new Object();p.openCampaignFromHome(false);check(p.campaignVideos.pending.isEmpty());
  p=new HomeRouteProbe();p.rewardsView=new Object();p.openCampaignFromHome(true);check(p.campaignVideos.pending.isEmpty());
  p=new HomeRouteProbe();p.campaignSetup=new Object();p.openCampaignFromHome(false);check(p.campaignVideos.pending.isEmpty());
  p=new HomeRouteProbe();p.loadingOverlay=new Object();p.openCampaignFromHome(false);check(p.campaignVideos.pending.isEmpty());
  p=new HomeRouteProbe();p.destroyed=true;p.openCampaignFromHome(false);check(p.campaignVideos.pending.isEmpty());
  System.out.println("Ready New/Continue, missing media, duplicate/stale callbacks, navigation/Back/lifecycle/modal guards passed");
 }
}
'''
    with tempfile.TemporaryDirectory(prefix='home-routes056-') as folder:
        cpp=Path(folder)/'HomeRouteProbe.java';cpp.write_text(stub+actual+cases,encoding='utf-8')
        subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8','-d',folder,str(cpp)],check=True,capture_output=True,text=True)
        output=subprocess.check_output([str(JDK/'java.exe'),'-cp',folder,'HomeRouteProbe'],text=True).strip()
    proof={'version':'0.56','passed':True,'actualMainRouteMethodsCompiled':True,'asyncRouteCases':15,'duplicateAndStaleCallbacksGuarded':True,
        'campaignAndTowersSaveStoresSeparate':True,'missingVideosOpensSetupWithoutAutoLaunch':True,'towersReturnPreservesMapBrowser':True,
        'existingGameplayBridgeMethodsUnchanged':True,'otherMainSourceUnchanged':True,'emulatorUsed':False,'result':output,
        'sources':[{'path':MAIN,'sha256':sha256((ROOT/MAIN).read_bytes()).hexdigest()},
            {'path':'tools/check-home-routes-056.py','sha256':sha256(Path(__file__).read_bytes()).hexdigest()}]}
    (ROOT/'archive/home-0.56-route-checks.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(proof))

if __name__=='__main__':main()
