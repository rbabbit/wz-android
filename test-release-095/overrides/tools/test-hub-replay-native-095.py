"""Execute verbatim Hub URL policies and Back/lifecycle methods with inert host platform edges. No Android/runtime/network claim."""
from pathlib import Path
import hashlib,json,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
HUB=ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone/HubView.java'
JDK=Path('C:/Program Files/Android/Android Studio/jbr/bin')
s=HUB.read_text()
def method(signature):
 start=s.index(signature);end=s.index('{',start)+1;depth=1
 while depth:
  if s[end]=='{':depth+=1
  elif s[end]=='}':depth-=1
  end+=1
 return s[start:end]
policy='\n'.join(method(x)for x in ['private static boolean trusted(', 'private static boolean allowedAssetPath(', 'private static boolean replayAssetPath(', 'private static boolean localAsset(', 'private static boolean localDocument(', 'private static boolean publicData(', 'private static boolean replayRemote(', 'private static boolean dataDestination(', 'private static boolean sourceLink('])
life='\n'.join(method(x)for x in ['void back()', 'private void clearBack()', 'void pause()', 'void resume()', 'void dispose()'])
template=(ROOT/'tools/test-hub-native-075.java').read_text().replace('HubNativeCheck075','HubNativeCheck095')
template=template.replace('/*PRODUCTION_POLICY*/',policy).replace('/*PRODUCTION_LIFECYCLE*/',life)
template=template.replace('private static final String APP_HOST=', 'private static final String REPLAY_HOST="desktop-0467j9q.tail41fd3a.ts.net", SITE_HOST="maway2000.github.io";\n        private static final String APP_HOST=')
template=template.replace('void removeView(Browser ignored){removed++;}', 'void removeView(Browser ignored){removed++;}\n        int cancelled; void cancelReplayRequests(){cancelled++;}')
extra=r"""
    private static void replayPolicies(){
        String local="https://appassets.androidplatform.net/assets/";
        for(String path:new String[]{"hub/replay/index.html","hub/replay/replay.css","hub/replay/vendor/minuke%20(2).pie","hub/replay/mapmaker/pies/wheel.pie"})
            yes(Policy.localAsset(new Uri(local+path)),"bundled replay asset "+path);
        yes(Policy.localDocument(new Uri(local+"hub/replay/index.html?replay=https%3A%2F%2Fwarzone2100.retropaganda.info%2Freplays%2F1794989715726.wzrp")),"local replay document navigable");
        for(String path:new String[]{"hub/replay/../../warzone/index.html","hub/replay/%2e%2e/private.json","hub/replay/%252e%252e/private.json","hub/replay/a%5Cb.js","hub/replay/x%3Fq.js","hub/replay/x%23h.js"})
            yes(!Policy.localAsset(new Uri(local+path)),"replay asset traversal rejected "+path);
        String host="https://desktop-0467j9q.tail41fd3a.ts.net", site="https://maway2000.github.io";
        String sha="2965375dc91b0a1e939bc4fb8952e6599370819e019cb8d2e1f439060ab842da";
        for(String value:new String[]{host+"/wzstats/api/v1/matches/8068",host+"/wzstats/api/v1/replays/"+sha,host+"/wzstats/data/wavehoster-live.json",site+"/boha/stats/published/matches.json",site+"/boha/stats/published/wavehoster.json"})
            yes(Policy.replayRemote(new Uri(value)),"specific public replay source "+value);
        for(String value:new String[]{host+"/wzstats/api/v1/matches/0",host+"/wzstats/api/v1/matches/-1",host+"/wzstats/api/v1/matches/8068?q=1",host+"/wzstats/api/v1/matches/8068#f",host+"/wzstats/api/v1/replays/"+sha+"/extra",host+"/wzstats/api/v1/replays/"+sha.toUpperCase(),host+"/wzstats/api/v1/admin/8068",host+"/wzstats/data/private.json",site+"/boha/replay-analyzer.js",site+"/boha/stats/published/../private.json","https://warzone2100.retropaganda.info/replays/1794989715726.wzrp"})
            yes(!Policy.replayRemote(new Uri(value)),"non-data/unvalidated replay source rejected "+value);
        for(String prefix:new String[]{"http://desktop-0467j9q.tail41fd3a.ts.net","https://desktop-0467j9q.tail41fd3a.ts.net.evil.test","https://evil@desktop-0467j9q.tail41fd3a.ts.net","https://desktop-0467j9q.tail41fd3a.ts.net:444","https://evil.test"})
            yes(!Policy.replayRemote(new Uri(prefix+"/wzstats/api/v1/matches/8068")),"untrusted replay origin rejected "+prefix);
        Life back=new Life();back.back();yes(back.cancelled==1,"Back cancels native replay streams");back.pause();yes(back.cancelled==2,"pause cancels native replay streams");back.dispose();yes(back.cancelled==3,"dispose cancels native replay streams");
    }
"""
template=template.replace('public static void main(String[] args){policies();lifecycle();',extra+'\n    public static void main(String[] args){policies();lifecycle();replayPolicies();')
with tempfile.TemporaryDirectory(prefix='hub-replay-095-')as folder:
 work=Path(folder);f=work/'HubNativeCheck095.java';f.write_text(template)
 build=subprocess.run([str(JDK/'javac.exe'),'-encoding','UTF-8','-d',str(work),str(f)],capture_output=True,text=True);assert build.returncode==0,build.stderr
 result=subprocess.run([str(JDK/'java.exe'),'-cp',str(work),'com.rbabbit.blocknight.warzone.HubNativeCheck095'],capture_output=True,text=True);assert result.returncode==0,result.stdout+result.stderr
 checks=json.loads(result.stdout)
proof={'passed':True,'scope':'Verbatim production Java URL policies and Back/lifecycle with inert URI/browser edges. No Android views, HTTP transfer or device playback executed.','checks':checks,'hubSHA256':hashlib.sha256(HUB.read_bytes()).hexdigest()}
out=ROOT/'qa/hub-replay-095/native-host.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
