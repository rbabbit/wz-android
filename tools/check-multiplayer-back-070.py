"""Run actual Activity Back/return methods with a permanently busy fake JS realm.

Android presentation APIs are inert stubs here. Device IME/key dispatch and the
real compositor commit callback remain exact-APK emulator checks.
"""
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java'
JAVA = Path('C:/Program Files/Android/Android Studio/jbr/bin')
source = SOURCE.read_text(encoding='utf-8')


def method(name):
    match = re.search(r'(?m)^\s*(?:@JavascriptInterface )?(?:private|public) (?:static )?[^\n]+\b' + re.escape(name) + r'\([^\n]*\) \{', source)
    if not match:
        raise AssertionError('Production method missing: ' + name)
    start = match.start()
    depth = 0
    for offset in range(source.index('{', start), len(source)):
        depth += (source[offset] == '{') - (source[offset] == '}')
        if depth == 0:
            return source[start:offset + 1].replace('@JavascriptInterface ', '')
    raise AssertionError('Unclosed method: ' + name)


if 'private volatile boolean sessionActive;' not in source:
    raise AssertionError('Bridge session cache must be synchronous/volatile')
body = '\n'.join(method(name) for name in ('onBackPressed', 'dismissLeaveDialog', 'returnToLobbyNative', 'dp', 'onPageCommitVisible'))
setter = method('setSessionActive')
constants = '\n'.join(re.findall(r'  private static final (?:String (?:ORIGIN|START_URL)|float DEFAULT_COMMAND_STRIP_CSS_HEIGHT) = [^;]+;', source))
test = r'''
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
class BaseActivity {
  static final String INPUT_METHOD_SERVICE="ime";
  boolean keyboardVisible; int finishes,keyboardHides,refits;
  void onBackPressed() {finishes++;} void finish(){finishes++;}
  boolean isFinishing(){return false;} boolean isDestroyed(){return false;}
  boolean isKeyboardVisible(){return keyboardVisible;}
  Object getAssets(){return null;}
  Resources getResources(){return new Resources();}
  Object getSystemService(String name){return new InputMethodManager(this);}
  void runOnUiThread(Runnable task){task.run();}
  void immersive(){} void fitViewport(){refits++;}
}
public class MultiplayerActivity extends BaseActivity {
__CONSTANTS__
  private final AtomicBoolean destroyed=new AtomicBoolean();
  private volatile boolean sessionActive;
  private boolean pendingLobbyNavigation,engineViewportActive;
  private float commandStripCssHeight=72;
  private AlertDialog leaveDialog;
  private WebView webView=new WebView();
  private FrameLayout root=new FrameLayout();
  private final Map<Integer,Connection> connections=new LinkedHashMap<>();
__BODY__
  final class Navigation {
__SETTER__
  }
  static int checks;
  static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
  public static void main(String[] args){
    MultiplayerActivity home=new MultiplayerActivity();home.onBackPressed();
    check(home.finishes==1,"Own-lobby Back did not leave activity");
    check(home.webView.scripts.isEmpty(),"Own-lobby Back queried busy JavaScript");
    MultiplayerActivity game=new MultiplayerActivity();Navigation nav=game.new Navigation();nav.setSessionActive(true);
    check(game.sessionActive,"Session cache was not updated before bridge returned");
    for(int i=0;i<4;i++){
      game.onBackPressed();AlertDialog current=game.leaveDialog;
      check(current!=null&&current.isShowing(),"Busy JS blocked Back prompt "+i);
      check(game.webView.scripts.stream().noneMatch(s->s.contains("session.active")||s.contains("Session.active")),"Back queried JS session state");
      current.clickNegative();check(game.leaveDialog==null,"Stay left a stale dialog reference");
    }
    game.onBackPressed();game.connections.put(1,new Connection());game.connections.put(2,new Connection());
    int scripts=game.webView.scripts.size();game.leaveDialog.clickPositive();
    check(!game.sessionActive&&game.pendingLobbyNavigation,"Return did not clear active session immediately");
    check(game.webView.visibility==View.INVISIBLE,"Return exposed old game pixels");
    check(game.connections.values().stream().allMatch(c->c.closed),"Return waited for JS before closing sockets");
    check(game.webView.stopped&&START_URL.equals(game.webView.url),"Return did not natively navigate to own lobby");
    check(game.webView.scripts.size()==scripts,"Return depends on a queued JS callback");
    game.onBackPressed();check(game.finishes==0,"Back escaped while lobby navigation was covered");
    game.onPageCommitVisible(game.webView,"https://appassets.androidplatform.net/multiplayer/engine.html");
    check(game.webView.visibility==View.INVISIBLE,"Wrong document revealed old game");
    game.onPageCommitVisible(game.webView,START_URL);
    check(game.webView.visibility==View.VISIBLE&&!game.pendingLobbyNavigation,"Committed own lobby remained hidden");
    nav.setSessionActive(true);game.onBackPressed();check(game.leaveDialog!=null,"Rejoined session Back failed");
    nav.setSessionActive(false);check(game.leaveDialog==null,"Ended session left a late prompt over lobby");
    nav.setSessionActive(true);game.leaveDialog=new AlertDialog.Builder(game).create();AlertDialog stale=game.leaveDialog;
    game.onBackPressed();check(game.leaveDialog!=null&&game.leaveDialog!=stale&&game.leaveDialog.isShowing(),"Non-showing stale dialog swallowed Back");
    game.leaveDialog.clickNegative();game.keyboardVisible=true;game.onBackPressed();
    check(game.keyboardHides==1&&game.leaveDialog==null,"IME dismissal opened leave prompt");
    game.onBackPressed();check(game.leaveDialog!=null,"Back after IME dismissal failed");
    System.out.println("Multiplayer native Back lifecycle: "+checks+" checks passed with JS callbacks never executed");
  }
}
class Resources { Metrics getDisplayMetrics(){return new Metrics();} }
class Metrics {float density=1;int widthPixels=1280;}
class InputMethodManager {final BaseActivity owner;InputMethodManager(BaseActivity owner){this.owner=owner;}void hideSoftInputFromWindow(Object token,int flags){owner.keyboardHides++;owner.keyboardVisible=false;} }
class View {static final int VISIBLE=0,INVISIBLE=4;int visibility=VISIBLE;void setVisibility(int value){visibility=value;}}
class FrameLayout {void post(Runnable task){task.run();}}
interface ValueCallback {void onReceiveValue(String value);}
class WebView extends View {List<String> scripts=new ArrayList<>();boolean stopped;String url;void evaluateJavascript(String script,ValueCallback callback){scripts.add(script);/* JS deliberately never yields or runs callbacks. */}void requestFocus(){}Object getWindowToken(){return null;}void stopLoading(){stopped=true;}void loadUrl(String value){url=value;}}
class Typeface {static Typeface createFromAsset(Object assets,String name){return new Typeface();}}
class TextView extends View {TextView(Object context){}void setText(String value){}void setTextColor(Object value){}void setTextSize(int value){}void setTypeface(Typeface face){}void setPadding(int a,int b,int c,int d){} }
class Button extends TextView {Button(){super(null);}void setAllCaps(boolean value){}void setMinHeight(int value){}void setMinimumHeight(int value){}void setMinWidth(int value){}void setMinimumWidth(int value){}void setBackgroundTintList(Object value){}void setBackground(Object value){} }
interface DialogClick {void onClick(AlertDialog dialog,int which);}
interface DialogDismiss {void onDismiss(AlertDialog dialog);}
class AlertDialog {
  static final int BUTTON_NEGATIVE=-2,BUTTON_POSITIVE=-1;boolean showing;DialogClick negative,positive;DialogDismiss dismissed;
  void setCanceledOnTouchOutside(boolean value){}void setOnDismissListener(DialogDismiss listener){dismissed=listener;}
  void show(){showing=true;}boolean isShowing(){return showing;}void dismiss(){boolean was=showing;showing=false;if(was&&dismissed!=null)dismissed.onDismiss(this);}
  Window getWindow(){return new Window();}Button getButton(int which){return new Button();}
  void clickNegative(){if(negative!=null)negative.onClick(this,BUTTON_NEGATIVE);dismiss();}
  void clickPositive(){if(positive!=null)positive.onClick(this,BUTTON_POSITIVE);dismiss();}
  static class Builder {AlertDialog dialog=new AlertDialog();Builder(Object context){}Builder setCustomTitle(TextView title){return this;}Builder setNegativeButton(String text,DialogClick listener){dialog.negative=listener;return this;}Builder setPositiveButton(String text,DialogClick listener){dialog.positive=listener;return this;}AlertDialog create(){return dialog;}}
}
class Window {void setBackgroundDrawable(Object drawable){}void setLayout(int width,int height){}WindowManager.LayoutParams getAttributes(){return new WindowManager.LayoutParams();}void setAttributes(WindowManager.LayoutParams value){} }
class WindowManager {static class LayoutParams {float dimAmount;}}
class ViewGroup {static class LayoutParams {static final int WRAP_CONTENT=-2;}}
class GradientDrawable {void setColor(int value){}void setCornerRadius(int value){} }
class ColorStateList {static Object valueOf(int value){return null;}}
class RippleDrawable {RippleDrawable(Object a,Object b,Object c){} }
class TowersTheme {static int TEXT=1,PANEL=2,PRIMARY=3,CONTROL=4,PRIMARY_RIPPLE=5,RIPPLE=6;static Object buttonText(boolean primary){return null;}static Object control(Object context,int colour,int radius){return null;}}
class Connection {boolean closed;void finish(Object reason){closed=true;}}
'''.replace('__CONSTANTS__', constants).replace('__BODY__', body).replace('__SETTER__', setter)
with tempfile.TemporaryDirectory(prefix='warzone-mp070-back-') as temporary:
    folder = Path(temporary)
    test_source = folder / 'MultiplayerActivity.java'
    test_source.write_text(test, encoding='utf-8')
    subprocess.run([str(JAVA / 'javac.exe'), '-encoding', 'UTF-8', str(test_source)], check=True)
    subprocess.run([str(JAVA / 'java.exe'), '-cp', str(folder), 'MultiplayerActivity'], check=True)
