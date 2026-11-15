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
jdk = Path('C:/Program Files/Android/Android Studio/jbr/bin')
with tempfile.TemporaryDirectory(prefix='mp-room-back-079-') as folder:
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
proof = dict(version='0.79', passed=True, emulatorUsed=False, engineExecuted=False, actualAndroidKeyboardVerified=False,
    scope='Actual current Java Back/cache/navigation methods executed with inert Android API stubs and JavaScript callbacks that never execute; no device, network or native game run.',
    checks=checks, checksPassed=len(checks), sources=[dict(path=p.relative_to(ROOT).as_posix(),
        sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in pins])
out = ROOT / 'qa/multiplayer-room-079/back-host.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(passed=True, checksPassed=len(checks), proof=str(out))))
