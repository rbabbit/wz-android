'use strict';
// Compile the actual Java key-routing methods with small input/window stubs.
// Android/WebView and IME integration still require the exact APK emulator check.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const source=fs.readFileSync('app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java','utf8');
function method(signature){const begin=source.indexOf(signature);assert.ok(begin>=0,signature);const brace=source.indexOf('{',begin);let depth=0;for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(begin,i+1);}throw Error('Unclosed method '+signature);}
const methods=['private static boolean isGameBackKey(int keyCode)','private boolean gameBackWindow()','private boolean routeGameBackKey(KeyEvent event)','public boolean dispatchKeyEvent(KeyEvent event)'].map(method).join('\n');
const preIme=method('public boolean onKeyPreIme(int keyCode, KeyEvent event)');
assert.match(source,/WindowInsets\.Type\.ime\(\)/);assert.match(source,/getDefaultDisplay\(\)\.getRealSize\(screen\)/);assert.match(source,/if \(gameBackWindow\(\) && isKeyboardVisible\(\)\)/);
assert.match(source,/OnBackInvokedDispatcher\.PRIORITY_OVERLAY, this::onBackPressed/,'app navigation owns the modern Back callback ahead of WebView defaults');
const java=`
class KeyEvent {
 static final int KEYCODE_UNKNOWN=0,KEYCODE_BACK=4,KEYCODE_ESCAPE=111,KEYCODE_A=29,ACTION_DOWN=0,ACTION_UP=1;
 final int action,code,repeat;final boolean cancelled;
 KeyEvent(int a,int c,int r,boolean x){action=a;code=c;repeat=r;cancelled=x;}
 int getAction(){return action;}int getKeyCode(){return code;}int getRepeatCount(){return repeat;}boolean isCanceled(){return cancelled;}
}
class Log {static void i(String tag,String text){}}
class BaseActivity {int superCalls;public boolean dispatchKeyEvent(KeyEvent e){superCalls++;return false;}}
class BaseView {int delegateCalls;public boolean onKeyPreIme(int key,KeyEvent e){delegateCalls++;return false;}}
public class MainActivity extends BaseActivity {
 static final String TAG="test";Object webView=new Object(),graphicsSetup,loadingOverlay,replayPanel,musicSetup;
 int pendingBackKey=KeyEvent.KEYCODE_UNKNOWN,backRoutes,keyboardHides;boolean keyboard;
 boolean isKeyboardVisible(){return keyboard;}void hideKeyboard(){keyboardHides++;keyboard=false;}void onBackPressed(){backRoutes++;}
 ${methods}
 class ProbeView extends BaseView {${preIme}}
 static KeyEvent e(int action,int code){return new KeyEvent(action,code,0,false);}
 static void check(boolean x,String why){if(!x)throw new AssertionError(why);}
 public static void main(String[] args){
  for(int key:new int[]{KeyEvent.KEYCODE_BACK,KeyEvent.KEYCODE_ESCAPE}){
   MainActivity a=new MainActivity();
   check(a.dispatchKeyEvent(e(0,key)),"consume down before WebView");check(a.backRoutes==0&&a.superCalls==0,"down does not navigate");
   check(a.dispatchKeyEvent(new KeyEvent(0,key,2,false)),"consume repeat");
   check(a.dispatchKeyEvent(e(1,key))&&a.backRoutes==1&&a.superCalls==0,"one route on up");
   a.dispatchKeyEvent(e(1,key));check(a.backRoutes==1,"orphan up cannot navigate again");
   a.dispatchKeyEvent(e(0,key));a.dispatchKeyEvent(new KeyEvent(1,key,0,true));check(a.backRoutes==1,"cancelled up cannot navigate");
   MainActivity b=new MainActivity();ProbeView v=b.new ProbeView();
   check(v.onKeyPreIme(key,e(0,key)),"pre-IME consumes hidden-keyboard down");check(v.onKeyPreIme(key,e(1,key))&&b.backRoutes==1&&v.delegateCalls==0,"pre-IME routes before Chromium");
   b.keyboard=true;check(!v.onKeyPreIme(key,e(0,key))&&v.delegateCalls==0,"visible IME gets Back without Chromium pre-processing");
   b.dispatchKeyEvent(e(0,key));b.dispatchKeyEvent(e(1,key));check(b.keyboardHides==1&&b.backRoutes==1,"post-IME fallback hides keyboard only");
   MainActivity c=new MainActivity();c.dispatchKeyEvent(e(0,key));c.keyboard=true;c.dispatchKeyEvent(e(1,key));check(c.keyboardHides==1&&c.backRoutes==0,"keyboard opening between down/up cannot close page");
   c.dispatchKeyEvent(e(1,key));check(c.backRoutes==0,"IME-dismiss up cannot close page");
   MainActivity d=new MainActivity();ProbeView dv=d.new ProbeView();dv.onKeyPreIme(key,e(0,key));d.keyboard=true;check(!dv.onKeyPreIme(key,e(1,key)),"IME keeps its dismissal event");d.keyboard=false;d.dispatchKeyEvent(e(1,key));check(d.backRoutes==0,"pre-IME dismissal clears any earlier key-down");
  }
  MainActivity a=new MainActivity();a.dispatchKeyEvent(e(0,29));check(a.superCalls==1&&a.backRoutes==0,"other keys unchanged");
  for(String screen:new String[]{"graphics","loading","replay","music","no-webview"}){
   MainActivity b=new MainActivity();switch(screen){case "graphics":b.graphicsSetup=new Object();break;case "loading":b.loadingOverlay=new Object();break;case "replay":b.replayPanel=new Object();break;case "music":b.musicSetup=new Object();break;default:b.webView=null;}
   b.dispatchKeyEvent(e(0,4));b.dispatchKeyEvent(e(1,4));check(b.backRoutes==0&&b.superCalls==2,"native screen preserves existing Back: "+screen);
   ProbeView v=b.new ProbeView();v.onKeyPreIme(4,e(0,4));check(v.delegateCalls==1,"non-game WebView path unchanged");
  }
  System.out.println("PASS: actual Java legacy/pre-IME Back and Escape routing, repeat/cancel/orphan guards, IME priority and non-game fallback");
 }
}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'warzone-back-routing-'));fs.writeFileSync(path.join(temp,'MainActivity.java'),java);
const jdk=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
execFileSync(path.join(jdk,'bin/javac.exe'),['MainActivity.java'],{cwd:temp,stdio:'pipe'});
process.stdout.write(execFileSync(path.join(jdk,'bin/java.exe'),['-cp',temp,'MainActivity'],{encoding:'utf8'}));
