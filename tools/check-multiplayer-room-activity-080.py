"""Execute actual Activity Back/cache methods with permanently busy JS stubs.

Host Java only; device IME and compositor are checked separately on the APK.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
retained = ROOT / 'tools/check-multiplayer-back-070.py'
script = retained.read_text(encoding='utf-8').split("with tempfile.TemporaryDirectory(prefix='warzone-mp070-back-')")[0]
namespace = {'__file__': str(retained)}
exec(compile(script, str(retained), 'exec'), namespace)
source = namespace['source']


def block(pattern):
    match = re.search(pattern, source)
    assert match, pattern
    start = match.start()
    depth = 0
    for offset in range(source.index('{', match.end() - 1), len(source)):
        depth += (source[offset] == '{') - (source[offset] == '}')
        if depth == 0:
            return source[start:offset + 1].replace('@JavascriptInterface ', '')
    raise AssertionError('Unclosed block')


harness = namespace['test']
seam = '  private volatile boolean sessionActive;'
assert harness.count(seam) == 1
harness = harness.replace(seam, seam + '\n  private final Object musicPreferenceLock=new Object();\n  private String musicSession="";\n'
    + block(r'  private static final class RoomBackState\s*\{')
    + '\n  private volatile RoomBackState roomBackState=RoomBackState.EMPTY;\n'
    + block(r'  private boolean handleRoomBack\(\)\s*\{'))
setter = block(r'    @JavascriptInterface public void setRoomBackState\([^)]*\)\s*\{')
harness = harness.replace('  final class Navigation {', '  final class Navigation {\n' + setter)
harness = harness.replace('checks++;if(!value)throw new AssertionError(label);',
    'checks++;if(!value)throw new AssertionError(label);System.out.println("PASS "+label);')
extra = r'''
    MultiplayerActivity room=new MultiplayerActivity();Navigation rn=room.new Navigation();rn.setSessionActive(true);
    rn.setRoomBackState("room-79",true,true,true);
    room.onBackPressed();
    check(room.leaveDialog==null,"Room editor Back does not open Leave while JS is busy");
    check(room.webView.scripts.get(0).contains("handleBack(\"room-79\")"),"Room Back carries expected generation");
    check(!room.roomBackState.chatFocused&&room.roomBackState.optionsOpen,"Room Back consumes chat focus before options");
    room.onBackPressed();
    check(room.leaveDialog==null&&!room.roomBackState.optionsOpen,"Second room Back consumes options synchronously");
    room.onBackPressed();check(room.leaveDialog!=null,"Room root Back still opens native Leave prompt");room.leaveDialog.clickNegative();
    rn.setRoomBackState("room-new",true,true,false);rn.setRoomBackState("room-old",false,false,false);
    check(room.roomBackState.generation.equals("room-new")&&room.roomBackState.optionsOpen,"Stale room hide cannot clear newer Back state");
    rn.setRoomBackState("bad\nroom",true,false,false);
    check(room.roomBackState.generation.equals("room-new"),"Invalid room generation cannot replace cache");
    rn.setRoomBackState("room-new",false,false,false);
    check(!room.roomBackState.active,"Matching room hide clears native Back cache");
    rn.setRoomBackState("room-ime",true,false,true);room.keyboardVisible=true;int beforeIme=room.webView.scripts.size();
    room.onBackPressed();
    check(room.keyboardHides==1&&room.leaveDialog==null,"Room IME remains first Back priority");
    check(room.webView.scripts.size()==beforeIme&&room.roomBackState.chatFocused,"IME Back does not depend on any JS callback");
    room.onBackPressed();check(!room.roomBackState.chatFocused&&room.leaveDialog==null,"After IME closes editor layer is safely dismissed");
    rn.setSessionActive(false);check(!room.roomBackState.active,"Session teardown clears room Back state before returning");
    rn.setRoomBackState("stale",true,true,true);check(!room.roomBackState.active,"Inactive session cannot publish room Back state");
    rn.setSessionActive(true);rn.setRoomBackState("room-return",true,false,false);room.onBackPressed();room.leaveDialog.clickPositive();
    check(!room.roomBackState.active&&room.pendingLobbyNavigation,"Native Return clears room Back state under opaque cover");
'''
marker = '    System.out.println("Multiplayer native Back lifecycle: '
assert marker in harness
harness = harness.replace(marker, extra + marker)
harness += r'''
class JSONObject {
  static String quote(String value) {
    return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
  }
}
'''
# Execute the current fit code against small Android view/inset stubs too.
helpers = '\n'.join(block(pattern) for pattern in (
    r'  private void cacheRoomBackState\([^)]*\)\s*\{',
    r'  private void fitViewport\([^)]*\)\s*\{',
    r'  private static int roomViewportHeight\([^)]*\)\s*\{',
    r'  private void publishRoomViewport\([^)]*\)\s*\{',
    r'  private static float viewportScale\([^)]*\)\s*\{',
    r'  private static boolean sharedUiAsset\([^)]*\)\s*\{'))
harness = harness.replace('  private volatile RoomBackState roomBackState=RoomBackState.EMPTY;',
    '  private volatile RoomBackState roomBackState=RoomBackState.EMPTY;\n'
    + '  private String lastRoomViewportKey="",lastRoomViewportGeneration="";private long roomViewportRevision;\n'
    + '  private static final float MIN_ENGINE_CSS_WIDTH=642f,MIN_ENGINE_CSS_HEIGHT=482f;\n'
    + '  private static final String TAG="MP";\n' + helpers)
harness = harness.replace('void immersive(){} void fitViewport(){refits++;}', 'void immersive(){}')
harness = harness.replace('  Resources getResources(){return new Resources();}',
    '  final Resources resources=new Resources();final WindowManager manager=new WindowManager();\n'
    + '  Resources getResources(){return resources;}WindowManager getWindowManager(){return manager;}')
harness = harness.replace('class Resources { Metrics getDisplayMetrics(){return new Metrics();} }',
    'class Resources { final Metrics metrics=new Metrics();Metrics getDisplayMetrics(){return metrics;} }')
harness = harness.replace('class FrameLayout {void post(Runnable task){task.run();}}', r'''
class Rect {int bottom;}
class Insets {int bottom;}
class WindowInsets {static class Type {static int ime(){return 1;}}final Insets ime=new Insets();Insets getInsets(int type){return ime;}}
class Build {static class VERSION {static int SDK_INT=30;}}
class Gravity {static final int TOP=1,START=2;}
class FrameLayout {
 int width=1280,height=720,left=0,top=0,right=0,bottom=0,originY=0,visibleBottom=720;final WindowInsets insets=new WindowInsets();
 void post(Runnable task){task.run();}int getWidth(){return width;}int getHeight(){return height;}
 int getPaddingLeft(){return left;}int getPaddingTop(){return top;}int getPaddingRight(){return right;}int getPaddingBottom(){return bottom;}
 void getWindowVisibleDisplayFrame(Rect value){value.bottom=visibleBottom;}void getLocationOnScreen(int[] value){value[1]=originY;}
 WindowInsets getRootWindowInsets(){return insets;}
 static class LayoutParams {int width=-1,height=-1,gravity=0;}
}
''')
harness = harness.replace('List<String> scripts=new ArrayList<>();boolean stopped;',
    'List<String> scripts=new ArrayList<>();List<Runnable> posted=new ArrayList<>();'
    + 'FrameLayout.LayoutParams params=new FrameLayout.LayoutParams();float scaleX=1,scaleY=1;'
    + 'void post(Runnable task){posted.add(task);}void runPosted(){for(Runnable task:new ArrayList<>(posted)){posted.remove(task);task.run();}}'
    + 'Object getLayoutParams(){return params;}void setLayoutParams(FrameLayout.LayoutParams value){params=value;}'
    + 'float getScaleX(){return scaleX;}float getScaleY(){return scaleY;}void setScaleX(float value){scaleX=value;}void setScaleY(float value){scaleY=value;}'
    + 'boolean stopped;')
harness = harness.replace('class WindowManager {static class LayoutParams {float dimAmount;}}',
    'class WindowManager {int boundsBottom=720;WindowMetrics getCurrentWindowMetrics(){return new WindowMetrics(boundsBottom);}static class LayoutParams {float dimAmount;}}'
    + 'class WindowMetrics {final Rect bounds=new Rect();WindowMetrics(int bottom){bounds.bottom=bottom;}Rect getBounds(){return bounds;}}')
harness = harness.replace('class JSONObject {', 'class JSONException extends Exception {}\nclass Log {static void w(String tag,String text,Throwable error){}}\nclass JSONObject {\n'
    + ' final Map<String,Object> values=new LinkedHashMap<>();JSONObject put(String key,Object value)throws JSONException{values.put(key,value);return this;}\n'
    + ' public String toString(){StringBuilder text=new StringBuilder("{");for(Map.Entry<String,Object> e:values.entrySet()){if(text.length()>1)text.append(",");text.append(quote(e.getKey())).append(":").append(e.getValue() instanceof String?quote((String)e.getValue()):e.getValue());}return text.append("}").toString();}\n')
harness = harness.replace('android.view.WindowInsets', 'WindowInsets')
extra_viewport = r'''
    MultiplayerActivity viewport=new MultiplayerActivity();Navigation vn=viewport.new Navigation();vn.setSessionActive(true);
    viewport.root.width=1200;viewport.root.height=600;viewport.root.visibleBottom=600;viewport.resources.metrics.density=2;viewport.manager.boundsBottom=600;
    viewport.fitViewport();float engineScale=viewport.webView.scaleX;
    check(engineScale<1,"Non-room game viewport retains virtual minimum scaling");
    vn.setRoomBackState("room-fit",true,false,false);
    check(viewport.webView.scaleX==1&&viewport.webView.scaleY==1,"Room uses ordinary density without engine scaling");
    check(viewport.webView.params.width==1200&&viewport.webView.params.height==600,"Normal room occupies actual available pixels");
    viewport.webView.runPosted();
    check(viewport.webView.scripts.get(viewport.webView.scripts.size()-1).contains("\"height\":300.0"),"Room viewport event reports CSS pixels");
    viewport.keyboardVisible=true;viewport.root.visibleBottom=360;viewport.root.insets.ime.bottom=240;viewport.fitViewport();
    check(viewport.webView.params.height==360&&viewport.webView.scaleX==1,"Overlay IME reduces room height without shrinking controls");
    viewport.webView.runPosted();check(viewport.webView.scripts.get(viewport.webView.scripts.size()-1).contains("\"keyboardVisible\":true"),"Native viewport event reports actual IME visibility");
    viewport.root.height=360;viewport.fitViewport();check(viewport.webView.params.height==360,"Already-resized root does not subtract keyboard twice");
    viewport.keyboardVisible=false;viewport.root.height=600;viewport.fitViewport();
    check(viewport.webView.params.height==600,"Keyboard dismissal restores full room despite stale visible rectangle");
    viewport.webView.runPosted();check(viewport.webView.scripts.get(viewport.webView.scripts.size()-1).contains("\"keyboardVisible\":false"),"Keyboard restoration event is explicit");
    int scriptsBefore=viewport.webView.scripts.size();viewport.publishRoomViewport(new RoomBackState("room-fit",true,false,false),600,280,false);
    vn.setRoomBackState("room-new",true,false,false);viewport.webView.runPosted();
    check(viewport.webView.scripts.subList(scriptsBefore,viewport.webView.scripts.size()).stream().noneMatch(v->v.contains("room-fit")),"Retired room cannot receive delayed viewport event");
    vn.setRoomBackState("room-new",false,false,false);
    check(viewport.webView.scaleX==engineScale,"Leaving room restores exact former engine scaling");
    check(roomViewportHeight(1080,40,20,100,500,true)==340,"IME height respects safe padding and root screen origin");
    check(roomViewportHeight(1080,40,20,100,500,false)==1020,"No-IME geometry ignores stale keyboard rectangle");
    check(roomViewportHeight(0,0,0,0,0,true)==1,"Transient zero geometry is bounded");
    check(sharedUiAsset("ui/game-controls/click.ogg"),"Only existing Warzone click audio is allowed");
    for(String value:new String[]{"ui/other.ogg","ui/game-controls/click.mp3","ui/../game-controls/click.ogg","ui/game-controls/%63lick.ogg","music/track.ogg"})
      check(!sharedUiAsset(value),"Unapproved audio or traversal remains blocked "+value);
'''
harness = harness.replace(marker, extra_viewport + marker)
jdk = Path('C:/Program Files/Android/Android Studio/jbr/bin')
with tempfile.TemporaryDirectory(prefix='mp-room-activity-080-') as folder:
    work = Path(folder)
    target = work / 'MultiplayerActivity.java'
    target.write_text(harness, encoding='utf-8')
    built = subprocess.run([str(jdk / 'javac.exe'), '-encoding', 'UTF-8', str(target)], capture_output=True, text=True)
    assert built.returncode == 0, built.stderr
    ran = subprocess.run([str(jdk / 'java.exe'), '-cp', str(work), 'MultiplayerActivity'], capture_output=True, text=True)
    assert ran.returncode == 0, ran.stderr
    checks = [line[5:] for line in ran.stdout.splitlines() if line.startswith('PASS ')]
assert checks
pins = [ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java', Path(__file__).resolve()]
proof = dict(version='0.80', passed=True, emulatorUsed=False, engineExecuted=False, actualAndroidKeyboardVerified=False,
    scope='Actual current Java room fit, IME geometry, viewport publishing, Back/cache and audio allowlist methods executed with inert Android API stubs and deferred JavaScript callbacks; no device, network or native game run.',
    checks=checks, checksPassed=len(checks), sources=[dict(path=p.relative_to(ROOT).as_posix(),
        sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in pins])
out = ROOT / 'qa/multiplayer-room-080/activity-host.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(passed=True, checksPassed=len(checks), proof=str(out))))
