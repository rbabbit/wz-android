"""Execute current MP profile Java methods and the forced-suffix JS writer offline."""
from pathlib import Path
import hashlib, json, re, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[1]
SOURCE='app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java'
JAVA=Path('C:/Program Files/Android/Android Studio/jbr/bin')
s=(ROOT/SOURCE).read_text(encoding='utf-8')
def method(name):
 m=re.search(r'^  (?:  @JavascriptInterface public|private(?: static)?) [^\n]+\b'+name+r'\([^\n]*\) \{',s,re.M)
 if not m: raise AssertionError('Missing actual method '+name)
 start=m.start(); depth=0
 for n in range(s.index('{',start),len(s)):
  depth+=(s[n]=='{')-(s[n]=='}')
  if depth==0:return s[start:n+1].replace('@JavascriptInterface ','')
 raise AssertionError('Unclosed '+name)
methods='\n'.join(method(n) for n in ['playerNameBase','migratedPlayerName','playerNameError','restorePlayerName','getPlayerName','getPlayerBaseName','setPlayerName'])
constants='\n'.join(re.findall(r'^  private static final String (?:PLAYER_NAME|PLAYER_NAME_SUFFIX|DEFAULT_PLAYER_NAME) = [^;]+;',s,re.M))
harness=r'''
import java.util.*;
final class JSONException extends Exception {}
final class JSONObject {
 static JSONObject last; final Map<String,Object> values=new LinkedHashMap<>();
 JSONObject(){last=this;} JSONObject put(String key,Object value)throws JSONException{values.put(key,value);return this;}
 public String toString(){StringJoiner j=new StringJoiner(",","{","}");for(var e:values.entrySet())j.add(quote(e.getKey())+":"+(e.getValue() instanceof String?quote((String)e.getValue()):e.getValue()));return j.toString();}
 static String quote(String s){return "\""+s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t")+"\"";}
}
final class Profile081 {
__CONSTANTS__
 final Object playerProfileLock=new Object(); String savedPlayerName=DEFAULT_PLAYER_NAME; final Prefs playerPreferences=new Prefs();
 static final class Prefs {String value;boolean fail;int commits;String getString(String k,String fallback){return value==null?fallback:value;}Editor edit(){return new Editor();}final class Editor{String pending;Editor putString(String k,String v){pending=v;return this;}boolean commit(){commits++;if(fail)return false;value=pending;return true;}}}
__METHODS__
 static int count;static final List<String> checks=new ArrayList<>();static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks.add(name);count++;}
 static void migrate(String old,String expected){Profile081 p=new Profile081();p.playerPreferences.value=old;p.restorePlayerName();check(p.getPlayerName().equals(expected),"Migration "+String.valueOf(old));check(p.getPlayerName().equals(p.playerPreferences.getString(PLAYER_NAME,DEFAULT_PLAYER_NAME)),"Migration persisted "+String.valueOf(old));}
 public static void main(String[]args)throws Exception{
  migrate("noobcrusher","noobcrusher(m)");migrate("123456789012345","123456789012(m)");migrate("Player(m)(m)","Player(m)");migrate(" Player(M) ","Player(m)");migrate("😀".repeat(13),"😀".repeat(12)+"(m)");migrate("name\nplayerName=bad","Player(m)");migrate("(m)","Player(m)");migrate(null,"Player(m)");
  Profile081 p=new Profile081();p.restorePlayerName();check(p.getPlayerBaseName().equals("Player"),"Default field excludes suffix");
  String json=p.setPlayerName("123456789012");check(Boolean.TRUE.equals(JSONObject.last.values.get("ok")),"12 ASCII accepted");check(p.getPlayerName().equals("123456789012(m)"),"Fixed suffix stored");check(JSONObject.last.values.get("baseName").equals("123456789012"),"Bridge returns base separately");check(json.contains("\"name\":\"123456789012(m)\""),"Safe JSON includes full name");
  p.setPlayerName("😀".repeat(12));check(Boolean.TRUE.equals(JSONObject.last.values.get("ok")),"12 Unicode code points accepted");check(p.getPlayerName().getBytes(java.nio.charset.StandardCharsets.UTF_8).length==51,"Native63byte capacity fits worst-case full name");
  p.setPlayerName("é".repeat(12));check(Boolean.TRUE.equals(JSONObject.last.values.get("ok")),"12 accented characters accepted");
  for(String bad:new String[]{"","(m)","1234567890123","bad\nname","bad\r", "bad=name","bad/name","Two  Words","bad\u200Bname","\uD800"}){String before=p.getPlayerName();p.setPlayerName(bad);check(Boolean.FALSE.equals(JSONObject.last.values.get("ok")),"Invalid input rejected "+Arrays.toString(bad.toCharArray()));check(p.getPlayerName().equals(before),"Invalid input preserves private profile");}
  p.setPlayerName("newname(m)(m)");check(p.getPlayerName().equals("newname(m)"),"Repeated suffix cannot accumulate");
  p.playerPreferences.fail=true;String before=p.getPlayerName();p.setPlayerName("other");check(Boolean.FALSE.equals(JSONObject.last.values.get("ok"))&&before.equals(p.getPlayerName()),"Failed synchronous commit cannot change join identity");
  p.playerPreferences.fail=false;p.setPlayerName("[Bob]+_Ace-1");check(p.getPlayerBaseName().equals("[Bob]+_Ace-1"),"Established safe alphabet preserved");
  p.setPlayerName("newname(m)");int commits=p.playerPreferences.commits;p.restorePlayerName();check(p.playerPreferences.commits==commits,"Canonical migration idempotent");
  System.out.println("CHECKS="+count);for(String c:checks)System.out.println("PASS "+c);
 }
}
'''.replace('__METHODS__',methods).replace('__CONSTANTS__',constants)
with tempfile.TemporaryDirectory(prefix='mp-profile-081-') as tmp:
 f=Path(tmp)/'Profile081.java';f.write_text(harness,encoding='utf-8')
 subprocess.run([str(JAVA/'javac.exe'),'-encoding','UTF-8',str(f)],check=True,capture_output=True,text=True)
 result=subprocess.run([str(JAVA/'java.exe'),'-cp',tmp,'Profile081'],capture_output=True,text=True,encoding='utf-8')
 if result.returncode: raise AssertionError(result.stderr)
checks=[x[5:] for x in result.stdout.splitlines() if x.startswith('PASS ')]
proof={'version':'0.81','passed':True,'emulatorUsed':False,'engineExecuted':False,'actualAndroidViewsExecuted':False,'scope':'Actual extracted Java profile/migration/bridge methods with inert SharedPreferences and JSONObject stubs; native name capacity verified separately from matched source. No device execution.','checks':checks,'checksPassed':len(checks),'sources':[{'path':name,'sha256':hashlib.sha256((ROOT/name).read_bytes()).hexdigest()} for name in [SOURCE,Path(__file__).relative_to(ROOT).as_posix()]]}
out=ROOT/'qa/multiplayer-profile-081/profile-java.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'checksPassed':len(checks),'proof':str(out)}))
