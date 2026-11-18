package com.rbabbit.warzonetowers.selectiontest;

import android.app.*;
import android.content.*;
import android.os.*;
import android.webkit.*;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import android.graphics.Rect;
import android.util.Xml;
import org.xmlpull.v1.XmlSerializer;
import org.json.*;
import java.io.*;
import java.net.*;
import java.lang.reflect.*;
import java.security.*;
import java.util.concurrent.*;

/** External same-signer QA instrumentation. Never bundled in the delivery app. */
public final class SelectionFixture extends Instrumentation {
  private ActivityMonitor mainMonitor, mpMonitor;
  private volatile Activity resumed;
  private volatile boolean stop;
  private String initialLaunch = "none";

  @Override public void onCreate(Bundle args) {
    super.onCreate(args);
    if (args != null) initialLaunch = args.getString("launch", "none");
    start();
  }
  private Activity activity(String which) {
    Activity found = "main".equals(which) ? mainMonitor.getLastActivity()
        : "mp".equals(which) ? mpMonitor.getLastActivity() : resumed;
    if (found == null || found.isDestroyed()) throw new IllegalStateException("Requested Activity is not alive");
    return found;
  }
  private Object field(Activity a, String name) throws Exception {
    Class<?> type = a.getClass();
    while (type != null) {
      try { Field f = type.getDeclaredField(name); f.setAccessible(true); return f.get(a); }
      catch (NoSuchFieldException missing) { type = type.getSuperclass(); }
    }
    throw new NoSuchFieldException(name);
  }
  private JSONObject state(String which) throws Exception {
    Activity a = activity(which);
    JSONObject value = new JSONObject().put("activity", a.getClass().getName())
        .put("finishing", a.isFinishing()).put("destroyed", a.isDestroyed());
    for (String name : new String[]{"sessionActive", "sessionServiceStarted", "activityResumed"}) {
      try { value.put(name, field(a, name)); } catch (NoSuchFieldException absent) {}
    }
    return value;
  }
  private JSONObject viewGeometry(View v) throws Exception {
    int[] location=new int[2];v.getLocationOnScreen(location);Rect visible=new Rect();boolean intersects=v.getGlobalVisibleRect(visible);
    return new JSONObject().put("class",v.getClass().getName()).put("width",v.getWidth()).put("height",v.getHeight())
        .put("scaleX",v.getScaleX()).put("scaleY",v.getScaleY()).put("pivotX",v.getPivotX()).put("pivotY",v.getPivotY())
        .put("locationX",location[0]).put("locationY",location[1]).put("visibility",v.getVisibility()).put("windowVisibility",v.getWindowVisibility())
        .put("shown",v.isShown()).put("alpha",v.getAlpha()).put("globalVisible",intersects)
        .put("globalVisibleRect",new JSONArray(new int[]{visible.left,visible.top,visible.right,visible.bottom}));
  }
  private JSONObject geometry(String which) throws Exception {
    final JSONObject[] value={null};final Throwable[] error={null};
    runOnMainSync(()->{try{
      Activity a=activity(which);WebView web=(WebView)field(a,"webView");View decor=a.getWindow().getDecorView();
      JSONObject o=new JSONObject().put("activity",a.getClass().getName()).put("captureKind","Read-only actual Java View geometry; no bitmap, settings or layout mutation")
          .put("webView",viewGeometry(web)).put("decor",viewGeometry(decor));
      try{o.put("root",viewGeometry((View)field(a,"root")));}catch(NoSuchFieldException absent){}
      value[0]=o;
    }catch(Throwable failure){error[0]=failure;}});
    if(error[0]!=null)throw new RuntimeException(error[0]);return value[0];
  }
  private static String xmlText(CharSequence value,int max) {
    if(value==null)return "";String raw=value.toString();StringBuilder clean=new StringBuilder();
    for(int i=0;i<raw.length()&&clean.length()<max;){int cp=raw.codePointAt(i);i+=Character.charCount(cp);
      if(cp==9||cp==10||cp==13||cp>=32&&cp<=0xD7FF||cp>=0xE000&&cp<=0xFFFD||cp>=0x10000&&cp<=0x10FFFF)clean.appendCodePoint(cp);
    }return clean.toString();
  }
  private void treeNode(XmlSerializer xml,AccessibilityNodeInfo node,int index,int depth,int[] counts) throws Exception {
    if(node==null)return;if(counts[0]>=5000||depth>60){counts[1]++;return;}counts[0]++;
    Rect bounds=new Rect();node.getBoundsInScreen(bounds);boolean secret=node.isPassword();
    xml.startTag(null,"node").attribute(null,"index",Integer.toString(index))
      .attribute(null,"text",secret?"":xmlText(node.getText(),1024)).attribute(null,"resource-id",xmlText(node.getViewIdResourceName(),512))
      .attribute(null,"class",xmlText(node.getClassName(),256)).attribute(null,"package",xmlText(node.getPackageName(),256))
      .attribute(null,"content-desc",secret?"":xmlText(node.getContentDescription(),1024))
      .attribute(null,"checkable",Boolean.toString(node.isCheckable())).attribute(null,"checked",Boolean.toString(node.isChecked()))
      .attribute(null,"clickable",Boolean.toString(node.isClickable())).attribute(null,"enabled",Boolean.toString(node.isEnabled()))
      .attribute(null,"focusable",Boolean.toString(node.isFocusable())).attribute(null,"focused",Boolean.toString(node.isFocused()))
      .attribute(null,"scrollable",Boolean.toString(node.isScrollable())).attribute(null,"long-clickable",Boolean.toString(node.isLongClickable()))
      .attribute(null,"password",Boolean.toString(secret)).attribute(null,"selected",Boolean.toString(node.isSelected()))
      .attribute(null,"visible-to-user",Boolean.toString(node.isVisibleToUser())).attribute(null,"drawing-order",Integer.toString(node.getDrawingOrder()))
      .attribute(null,"bounds","["+bounds.left+","+bounds.top+"]["+bounds.right+","+bounds.bottom+"]");
    for(int i=0;i<node.getChildCount();i++){
      if(counts[0]>=5000){counts[1]++;break;}AccessibilityNodeInfo child=node.getChild(i);
      if(child!=null)try{treeNode(xml,child,i,depth+1,counts);}finally{child.recycle();}
    }xml.endTag(null,"node");
  }
  private JSONObject uiTree() throws Exception {
    // Direct active-window snapshot only: deliberately NO waitForIdle, shell command or accessibility action.
    AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
    if(root==null)throw new IllegalStateException("Active accessibility window is unavailable");
    StringWriter text=new StringWriter();XmlSerializer xml=Xml.newSerializer();int[] counts={0,0};
    try{
      xml.setOutput(text);xml.startDocument("UTF-8",true);xml.startTag(null,"hierarchy");
      android.hardware.display.DisplayManager displays=(android.hardware.display.DisplayManager)getTargetContext().getSystemService(Context.DISPLAY_SERVICE);
      Display display=displays==null?null:displays.getDisplay(Display.DEFAULT_DISPLAY);
      if(display!=null)xml.attribute(null,"rotation",Integer.toString(display.getRotation()));
      treeNode(xml,root,0,0,counts);xml.endTag(null,"hierarchy");xml.endDocument();
      return new JSONObject().put("xml",text.toString()).put("nodeCount",counts[0]).put("truncated",counts[1]>0)
        .put("maxNodes",5000).put("maxDepth",60).put("rootPackage",xmlText(root.getPackageName(),256)).put("windowId",root.getWindowId())
        .put("captureKind","UiAutomation.getRootInActiveWindow read-only snapshot WITHOUT waitForIdle; not a screenshot");
    }finally{root.recycle();}
  }
  private String eval(String script, String which) throws Exception {
    CountDownLatch done = new CountDownLatch(1);
    String[] value = {null}; Throwable[] error = {null};
    runOnMainSync(() -> {
      try {
        WebView view = (WebView) field(activity(which), "webView");
        view.evaluateJavascript(script, result -> { value[0] = result; done.countDown(); });
      } catch (Throwable failure) { error[0] = failure; done.countDown(); }
    });
    if (!done.await(12, TimeUnit.SECONDS)) throw new TimeoutException("WebView eval callback");
    if (error[0] != null) throw new RuntimeException(error[0]);
    return value[0];
  }
  private void launch(String which) {
    if (!"main".equals(which) && !"mp".equals(which)) throw new IllegalArgumentException("Expected main or mp");
    String name = "com.rbabbit.blocknight.warzone." + ("main".equals(which) ? "MainActivity" : "MultiplayerActivity");
    Intent intent = new Intent(Intent.ACTION_MAIN).setComponent(new ComponentName(getTargetContext().getPackageName(), name));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    startActivitySync(intent);
  }
  private JSONObject fingerprints(JSONArray paths) throws Exception {
    if (paths == null || paths.length() > 256) throw new IllegalArgumentException("Expected up to256 relative file paths");
    File root = getTargetContext().getDataDir().getCanonicalFile();
    JSONArray result = new JSONArray();
    for (int i = 0; i < paths.length(); i++) {
      String relative = paths.getString(i);
      if (relative.isEmpty() || new File(relative).isAbsolute()) throw new IllegalArgumentException("Expected relative file path");
      File file = new File(root, relative).getCanonicalFile();
      if (!file.getPath().startsWith(root.getPath() + File.separator)) throw new IllegalArgumentException("File escapes target data directory");
      JSONObject row = new JSONObject().put("path", relative).put("exists", file.isFile());
      if (file.isFile()) {
        if (file.length() > 134217728L) throw new IllegalArgumentException("Fingerprint file exceeds128MiB bound");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
          byte[] buffer = new byte[65536]; int count;
          while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        row.put("bytes", file.length()).put("sha256", hex.toString());
      }
      result.put(row);
    }
    return new JSONObject().put("files", result).put("dataDirectory", root.getPath())
        .put("activityStarted", mainMonitor.getLastActivity() != null || mpMonitor.getLastActivity() != null)
        .put("applicationInitializedByInstrumentation", true);
  }
  private JSONObject touch(JSONArray frames) throws Exception {
    if (frames == null || frames.length() < 2 || frames.length() > 80) throw new IllegalArgumentException("Touch fixture requires2-80frames");
    long down = SystemClock.uptimeMillis(); MotionEvent last = null; int sent = 0;
    try {
      for (int i = 0; i < frames.length(); i++) {
        JSONObject f = frames.getJSONObject(i); int delay = f.optInt("delayMs",16);
        if (delay < 0 || delay > 250) throw new IllegalArgumentException("Frame delay out of bounds");
        SystemClock.sleep(delay); JSONArray points = f.getJSONArray("points"); int count = points.length();
        if (count < 1 || count > 2) throw new IllegalArgumentException("Only one or two fingers supported");
        int action = f.getInt("action");
        if (action!=0 && action!=1 && action!=2 && action!=3 && action!=261 && action!=262) throw new IllegalArgumentException("Unsupported touch action");
        if ((action==261 || action==262) && count!=2) throw new IllegalArgumentException("Pointer transition requires two fingers");
        MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
        for (int j=0; j<count; j++) {
          JSONArray point=points.getJSONArray(j); double x=point.getDouble(0), y=point.getDouble(1);
          if (!Double.isFinite(x)||!Double.isFinite(y)||x<0||y<0||x>7680||y>7680) throw new IllegalArgumentException("Invalid coordinate");
          props[j]=new MotionEvent.PointerProperties(); props[j].id=j; props[j].toolType=MotionEvent.TOOL_TYPE_FINGER;
          coords[j]=new MotionEvent.PointerCoords(); coords[j].x=(float)x; coords[j].y=(float)y; coords[j].pressure=1f; coords[j].size=.02f;
        }
        MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,count,props,coords,0,0,1f,1f,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
        sendPointerSync(event); if(last!=null)last.recycle(); last=event; sent++;
      }
      return new JSONObject().put("framesInjected",sent).put("inputPath","Android Instrumentation.sendPointerSync / MotionEvent SOURCE_TOUCHSCREEN");
    } catch (Throwable error) {
      if(last!=null)try{MotionEvent cancel=MotionEvent.obtain(last);cancel.setAction(MotionEvent.ACTION_CANCEL);sendPointerSync(cancel);cancel.recycle();}catch(Throwable ignored){}
      throw error;
    } finally {if(last!=null)last.recycle();}
  }
  @Override public void onStart() {
    super.onStart(); Bundle result = new Bundle();
    try {
      mainMonitor=addMonitor("com.rbabbit.blocknight.warzone.MainActivity",null,false);
      mpMonitor=addMonitor("com.rbabbit.blocknight.warzone.MultiplayerActivity",null,false);
      ((Application)getTargetContext().getApplicationContext()).registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks(){
        public void onActivityCreated(Activity a,Bundle b){} public void onActivityStarted(Activity a){}
        public void onActivityResumed(Activity a){resumed=a;} public void onActivityPaused(Activity a){}
        public void onActivityStopped(Activity a){} public void onActivitySaveInstanceState(Activity a,Bundle b){}
        public void onActivityDestroyed(Activity a){if(resumed==a)resumed=null;}
      });
      if (!"none".equals(initialLaunch)) launch(initialLaunch);
      try(ServerSocket server=new ServerSocket()) {
        server.bind(new InetSocketAddress("127.0.0.1",27889)); server.setSoTimeout(5000);
        while(!stop)try(Socket socket=server.accept()) {
          socket.setSoTimeout(15000);
          BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),"UTF-8"));
          PrintWriter writer=new PrintWriter(new OutputStreamWriter(socket.getOutputStream(),"UTF-8"),true);
          JSONObject out=new JSONObject();
          try {
            String line=reader.readLine(); if(line==null||line.length()>2097152)throw new IllegalArgumentException("Invalid bounded request");
            JSONObject in=new JSONObject(line); String command=in.optString("command"), which=in.optString("activity","auto");
            if("eval".equals(command))out.put("value",eval(in.getString("javascript"),which));
            else if("touch".equals(command))out.put("touch",touch(in.getJSONArray("frames")));
            else if("fingerprint".equals(command))out.put("fingerprints",fingerprints(in.getJSONArray("paths")));
            else if("launch".equals(command)){launch(in.optString("activity","main"));out.put("launched",true);}
            else if("state".equals(command))out.put("state",state(which));
            else if("geometry".equals(command))out.put("geometry",geometry(which));
            else if("ui-tree".equals(command))out.put("tree",uiTree());
            else if("stop".equals(command))stop=true;
            else if("ping".equals(command))out.put("target",getTargetContext().getPackageName()).put("helperVersion",92)
                .put("mainSeen",mainMonitor.getLastActivity()!=null).put("mpSeen",mpMonitor.getLastActivity()!=null);
            else throw new IllegalArgumentException("Unknown command");
            out.put("ok",true);
          }catch(Throwable error){out.put("ok",false).put("error",error.toString());}
          writer.println(out.toString());
        }catch(SocketTimeoutException idle){}
      }
      result.putString("result","Private selection fixture stopped normally"); finish(Activity.RESULT_OK,result);
    }catch(Throwable failure){result.putString("error",failure.toString());finish(Activity.RESULT_CANCELED,result);}
  }
}
