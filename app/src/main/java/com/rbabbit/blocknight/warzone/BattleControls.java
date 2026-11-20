package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.Log;
import android.util.LruCache;
import android.util.SparseArray;
import android.util.Xml;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewTreeObserver;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.OverScroller;
import androidx.core.graphics.PathParser;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

/** Android battle buttons positioned using the current game's layout contract. */
final class BattleControls extends FrameLayout {
  private static final String ORIGIN = "https://appassets.androidplatform.net";
  private static final String CHANNEL = "AndroidBattleControls";
  private static final Pattern INVERT = Pattern.compile("invert\\(([\\d.]+)(%)?\\)");
  private static final Pattern CSS_COLOR = Pattern.compile("rgba?\\([^)]*\\)");

  private final WebView web;
  private final Consumer<String> evaluateHost;
  private final SparseArray<CommandButton> buttons = new SparseArray<>();
  private final LruCache<String, IconAsset> icons = new LruCache<>(16 * 1024 * 1024) {
    @Override protected int sizeOf(String key, IconAsset value) {
      return value.bitmap == null ? 8192 : value.bitmap.getAllocationByteCount();
    }
  };
  private final TextPaint ellipsisPaint = new TextPaint();
  private final Map<String, Typeface> fonts = new HashMap<>();
  private final int[] webLocation = new int[2];
  private final int[] layerLocation = new int[2];
  private final Matrix webTouchTransform = new Matrix();
  private final ViewTreeObserver.OnPreDrawListener sync = this::syncGeometry;
  private final Runnable flingFrame = this::advanceFling;
  private final ViewConfiguration touchConfig;
  private final OverScroller fling;
  private final String script;
  private JSONObject snapshot;
  private String accepted = "[]";
  private String viewport = "";
  private float scaleX = 1f, scaleY = 1f;
  private int offsetX, offsetY;
  private int generation;
  private int horizontalScroller, verticalScroller, scrollTarget;
  private float touchX, touchY, previousX, previousY;
  private boolean scrolling, scrollHorizontally;
  private MotionEvent buildDown;
  private boolean buildDragging, buildDispatched;
  private VelocityTracker dragVelocity;
  private int flingTarget, flingPosition;
  private boolean flingHorizontally;

  static BattleControls attach(FrameLayout root, WebView web, Consumer<String> evaluateHost) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return null;
    try (InputStream input = root.getContext().getAssets().open("warzone/ui/native-battle-controls.js")) {
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      byte[] buffer = new byte[4096];
      for (int count; (count = input.read(buffer)) != -1;) output.write(buffer, 0, count);
      BattleControls controls = new BattleControls(root.getContext(), web, evaluateHost,
          new String(output.toByteArray(), StandardCharsets.UTF_8));
      WebViewCompat.addWebMessageListener(web, CHANNEL, Collections.singleton(ORIGIN),
          (view, message, sourceOrigin, isMainFrame, reply) -> {
            if (isMainFrame && ORIGIN.equals(sourceOrigin.toString())) controls.receive(message.getData());
          });
      root.addView(controls, new FrameLayout.LayoutParams(-1, -1));
      root.getViewTreeObserver().addOnPreDrawListener(controls.sync);
      return controls;
    } catch (IOException | RuntimeException error) {
      Log.w("BattleControls", "Could not attach Android battle controls", error);
      return null;
    }
  }

  private BattleControls(Context context, WebView web, Consumer<String> evaluateHost, String script) {
    super(context);
    this.web = web;
    this.evaluateHost = evaluateHost;
    this.script = script;
    touchConfig = ViewConfiguration.get(context);
    fling = new OverScroller(context);
    setClipChildren(true);
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    setVisibility(INVISIBLE);
  }

  void pageReady(String url) {
    Uri page = Uri.parse(url);
    if (!"https".equals(page.getScheme()) || !"appassets.androidplatform.net".equals(page.getHost())) return;
    String path = page.getPath();
    if (path != null && (path.equals("/multiplayer/index.html")
        || path.matches("/warzone/mobile(?:-duel|-ffa|-challenge|-survival|-campaign)?\\.html"))) {
      evaluateHost.accept("window.androidBattleGeneration=" + generation + ";\n" + script);
    }
  }

  void reset() {
    generation++;
    snapshot = null;
    viewport = "";
    accepted = "[]";
    clearButtons();
  }

  private void clearButtons() {
    finishBuildTouch(true);
    stopFling();
    releaseDragVelocity();
    buttons.clear();
    removeAllViews();
    setVisibility(INVISIBLE);
    scrollTarget = 0;
    scrolling = false;
  }

  void detach(FrameLayout root) {
    if (root.getViewTreeObserver().isAlive()) root.getViewTreeObserver().removeOnPreDrawListener(sync);
    WebViewCompat.removeWebMessageListener(web, CHANNEL);
    reset();
    root.removeView(this);
  }

  private void receive(String data) {
    if (!isAttachedToWindow() || data == null || data.length() > 550_000) return;
    try {
      JSONObject state = new JSONObject(data);
      if (state.optInt("generation", -1) != generation) return;
      snapshot = state;
      viewport = "";
      syncGeometry();
    } catch (JSONException | RuntimeException error) {
      // Leave the existing controls available when a layout cannot be represented.
      evaluate("apply([])");
      reset();
      Log.w("BattleControls", "Could not read battle control layout", error);
    }
  }

  private boolean syncGeometry() {
    boolean shown = web.isShown() && (buttons.size() > 0 || buildDragging);
    if (snapshot == null || !web.isShown() || getWidth() <= 0 || getHeight() <= 0) {
      int visibility = shown ? VISIBLE : INVISIBLE;
      if (getVisibility() != visibility) setVisibility(visibility);
      return true;
    }
    int width = snapshot.optInt("width"), height = snapshot.optInt("height");
    if (width <= 0 || height <= 0 || web.getWidth() <= 0 || web.getHeight() <= 0) return true;
    web.getLocationInWindow(webLocation);
    getLocationInWindow(layerLocation);
    scaleX = web.getWidth() * web.getScaleX() / width;
    scaleY = web.getHeight() * web.getScaleY() / height;
    offsetX = webLocation[0] - layerLocation[0];
    offsetY = webLocation[1] - layerLocation[1];
    String geometry = scaleX + ":" + scaleY + ":" + offsetX + ":" + offsetY
        + ":" + getWidth() + ":" + getHeight();
    if (!viewport.equals(geometry)) {
      viewport = geometry;
      updateButtons(snapshot.optJSONArray("buttons"));
    }
    int visibility = buttons.size() > 0 || buildDragging ? VISIBLE : INVISIBLE;
    if (getVisibility() != visibility) setVisibility(visibility);
    return true;
  }

  private void updateButtons(JSONArray items) {
    Set<Integer> present = new HashSet<>();
    JSONArray active = new JSONArray();
    if (items != null) {
      for (int i = 0; i < Math.min(items.length(), 180); i++) {
        JSONObject item = items.optJSONObject(i);
        if (item == null) continue;
        int id = item.optInt("id");
        RectF box = rect(item.optJSONArray("box"));
        RectF clip = rect(item.optJSONArray("clip"));
        if (id <= 0 || box.isEmpty() || clip.isEmpty()) continue;
        RectF extents = new RectF(box);
        JSONArray badges = item.optJSONArray("badges");
        if (badges != null) {
          for (int j = 0; j < badges.length(); j++) {
            JSONObject badge = badges.optJSONObject(j);
            if (badge == null) continue;
            RectF area = rect(badge.optJSONArray("box"));
            area.offset(box.left, box.top);
            extents.union(area);
          }
        }
        if (!extents.intersect(clip)) continue;
        RectF screen = new RectF(extents.left * scaleX + offsetX, extents.top * scaleY + offsetY,
            extents.right * scaleX + offsetX, extents.bottom * scaleY + offsetY);
        if (!screen.intersect(0, 0, getWidth(), getHeight())) continue;
        int left = (int) Math.floor(screen.left), top = (int) Math.floor(screen.top);
        int right = (int) Math.ceil(screen.right), bottom = (int) Math.ceil(screen.bottom);
        CommandButton button = buttons.get(id);
        if (button == null) {
          button = new CommandButton(id);
          buttons.put(id, button);
          addView(button, new FrameLayout.LayoutParams(1, 1));
        }
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) button.getLayoutParams();
        if (params.leftMargin != left || params.topMargin != top
            || params.width != right - left || params.height != bottom - top) {
          params.leftMargin = left;
          params.topMargin = top;
          params.width = right - left;
          params.height = bottom - top;
          button.setLayoutParams(params);
        }
        button.update(item, box, screen, left, top);
        present.add(id);
        active.put(id);
      }
    }
    for (int i = buttons.size() - 1; i >= 0; i--) {
      if (present.contains(buttons.keyAt(i))) continue;
      removeView(buttons.valueAt(i));
      buttons.removeAt(i);
    }
    String ids = active.toString();
    if (!accepted.equals(ids)) {
      accepted = ids;
      evaluate("apply(" + ids + ")");
    }
  }

  private void evaluate(String call) {
    evaluateHost.accept("window.NativeBattleControls?." + call);
  }

  @Override public boolean dispatchTouchEvent(MotionEvent event) {
    int action = event.getActionMasked();
    if (action == MotionEvent.ACTION_DOWN) {
      finishBuildTouch(true);
      stopFling();
      releaseDragVelocity();
    } else if (event.getPointerCount() > 1) {
      releaseDragVelocity();
    } else if (dragVelocity != null) {
      dragVelocity.addMovement(event);
    }
    boolean handled = super.dispatchTouchEvent(event);
    if (buildDragging) {
      // Interception cancels the Android button press. The WebView gets one
      // complete drag gesture with the original down event and timestamps.
      if (!buildDispatched) {
        if (!dispatchBuildEvent(buildDown)) {
          finishBuildTouch(false);
          return true;
        }
        buildDispatched = true;
      }
      dispatchBuildEvent(event);
      handled = true;
    }
    if (!handled || action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
      finishBuildTouch(false);
      releaseDragVelocity();
    }
    return handled;
  }

  @Override public boolean onInterceptTouchEvent(MotionEvent event) {
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        scrollTarget = 0;
        horizontalScroller = verticalScroller = 0;
        scrolling = false;
        touchX = previousX = event.getX();
        touchY = previousY = event.getY();
        for (int i = buttons.size() - 1; i >= 0; i--) {
          CommandButton button = buttons.valueAt(i);
          if (!button.hits(touchX - button.getLeft(), touchY - button.getTop())) continue;
          horizontalScroller = button.horizontalScroller;
          verticalScroller = button.verticalScroller;
          if (button.browserBuildScroll) buildDown = MotionEvent.obtain(event);
          break;
        }
        if (buildDown == null && (horizontalScroller != 0 || verticalScroller != 0)) {
          dragVelocity = VelocityTracker.obtain();
          dragVelocity.addMovement(event);
        }
        break;
      case MotionEvent.ACTION_MOVE:
        float travelX = Math.abs(event.getX() - touchX);
        float travelY = Math.abs(event.getY() - touchY);
        scrollHorizontally = travelX >= travelY;
        scrollTarget = scrollHorizontally ? horizontalScroller : verticalScroller;
        if (scrollTarget != 0 && Math.max(travelX, travelY) > touchConfig.getScaledTouchSlop()) {
          if (buildDown != null) {
            buildDragging = true;
            evaluate("beginBuildScroll(" + scrollTarget + ")");
            return true;
          }
          scrolling = true;
          scrollToFinger(event);
          return true;
        }
        break;
      default:
        break;
    }
    return false;
  }

  @Override public boolean onTouchEvent(MotionEvent event) {
    if (buildDragging) return true;
    if (!scrolling) return false;
    if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
      scrollToFinger(event);
    } else if (event.getActionMasked() == MotionEvent.ACTION_UP
        || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
      if (event.getActionMasked() == MotionEvent.ACTION_UP) startFling(event.getPointerId(0));
      scrolling = false;
      scrollTarget = 0;
    }
    return true;
  }

  private boolean dispatchBuildEvent(MotionEvent original) {
    if (original == null || !web.isShown()) return false;
    MotionEvent event = MotionEvent.obtain(original);
    try {
      // The overlay and WebView share a parent, but the WebView can be scaled
      // down to fit the phone. Match the coordinates it receives normally.
      event.offsetLocation(-offsetX, -offsetY);
      webTouchTransform.setScale(1f / web.getScaleX(), 1f / web.getScaleY());
      event.transform(webTouchTransform);
      return web.dispatchTouchEvent(event);
    } finally {
      event.recycle();
    }
  }

  private void finishBuildTouch(boolean cancel) {
    if (buildDown == null) return;
    if (cancel && buildDispatched) {
      buildDown.setAction(MotionEvent.ACTION_CANCEL);
      dispatchBuildEvent(buildDown);
    }
    buildDown.recycle();
    buildDown = null;
    if (buildDragging) evaluate("endBuildScroll()");
    buildDragging = false;
    buildDispatched = false;
  }

  private void scrollToFinger(MotionEvent event) {
    float x = event.getX(), y = event.getY();
    float distance = scrollHorizontally ? previousX - x : previousY - y;
    sendScroll(scrollTarget, scrollHorizontally, distance);
    previousX = x;
    previousY = y;
  }

  private void sendScroll(int target, boolean horizontal, float distance) {
    float dx = horizontal ? distance / scaleX : 0;
    float dy = horizontal ? 0 : distance / scaleY;
    evaluate("scroll(" + target + "," + dx + "," + dy + ")");
  }

  private JSONArray scrollBounds(int target) {
    JSONArray scrollers = snapshot == null ? null : snapshot.optJSONArray("scrollBounds");
    if (scrollers == null) return null;
    for (int index = 0; index < scrollers.length(); index++) {
      JSONArray bounds = scrollers.optJSONArray(index);
      if (bounds != null && bounds.optInt(0) == target) return bounds;
    }
    return null;
  }

  private void startFling(int pointerId) {
    if (dragVelocity == null) return;
    JSONArray bounds = scrollBounds(scrollTarget);
    if (bounds == null) return;
    dragVelocity.computeCurrentVelocity(1000, touchConfig.getScaledMaximumFlingVelocity());
    int speed = Math.round(scrollHorizontally
        ? -dragVelocity.getXVelocity(pointerId) : -dragVelocity.getYVelocity(pointerId));
    if (Math.abs(speed) < touchConfig.getScaledMinimumFlingVelocity()) return;

    int axis = scrollHorizontally ? 1 : 3;
    float scale = scrollHorizontally ? scaleX : scaleY;
    double offset = bounds.optDouble(axis, 0);
    int min = Math.min(0, (int) Math.round(-offset * scale));
    int max = Math.max(0, (int) Math.round((bounds.optDouble(axis + 1, 0) - offset) * scale));
    if ((speed < 0 && min == 0) || (speed > 0 && max == 0)) return;
    flingTarget = scrollTarget;
    flingHorizontally = scrollHorizontally;
    flingPosition = 0;
    fling.fling(0, 0, flingHorizontally ? speed : 0, flingHorizontally ? 0 : speed,
        flingHorizontally ? min : 0, flingHorizontally ? max : 0,
        flingHorizontally ? 0 : min, flingHorizontally ? 0 : max);
    postOnAnimation(flingFrame);
  }

  private void advanceFling() {
    if (!isShown() || !web.isShown() || scrollBounds(flingTarget) == null || !fling.computeScrollOffset()) {
      stopFling();
      return;
    }
    int position = flingHorizontally ? fling.getCurrX() : fling.getCurrY();
    int distance = position - flingPosition;
    if (distance != 0) sendScroll(flingTarget, flingHorizontally, distance);
    flingPosition = position;
    if (fling.isFinished()) stopFling();
    else postOnAnimation(flingFrame);
  }

  private void stopFling() {
    removeCallbacks(flingFrame);
    if (!fling.isFinished()) fling.abortAnimation();
    flingTarget = 0;
  }

  private void releaseDragVelocity() {
    if (dragVelocity == null) return;
    dragVelocity.recycle();
    dragVelocity = null;
  }

  private final class CommandButton extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF hit = new RectF();
    private final int id;
    private JSONObject spec;
    private RectF cssBox, cssClip;
    private float originX, originY;
    private int horizontalScroller, verticalScroller;
    private boolean browserBuildScroll;
    private String note = "";

    CommandButton(int id) {
      super(BattleControls.this.getContext());
      this.id = id;
      setFocusable(true);
      setSoundEffectsEnabled(false);
      setOnClickListener(view -> evaluate("click(" + id + ")"));
    }

    void update(JSONObject item, RectF box, RectF screen, int left, int top) {
      spec = item;
      cssBox = box;
      cssClip = new RectF(screen.left - left, screen.top - top, screen.right - left, screen.bottom - top);
      originX = scaleX * box.left + offsetX - left;
      originY = scaleY * box.top + offsetY - top;
      hit.set(originX, originY, originX + box.width() * scaleX, originY + box.height() * scaleY);
      if (!hit.intersect(cssClip)) hit.setEmpty();
      horizontalScroller = item.optInt("scrollX");
      verticalScroller = item.optInt("scrollY");
      browserBuildScroll = item.optBoolean("browserBuildScroll");
      note = item.optString("note");
      setEnabled(item.optBoolean("enabled"));
      setSelected(item.optBoolean("selected"));
      setAlpha((float) Math.max(0, Math.min(1, item.optDouble("opacity", 1))));
      String label = item.optString("label");
      if (!label.contentEquals(getContentDescription() == null ? "" : getContentDescription())) {
        setContentDescription(label);
      }
      invalidate();
    }

    boolean hits(float x, float y) { return hit.contains(x, y); }

    @Override public boolean onTouchEvent(MotionEvent event) {
      if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
        if (!hits(event.getX(), event.getY())) return false;
        evaluate("press(" + id + ")");
      }
      return super.onTouchEvent(event);
    }

    @Override protected void drawableStateChanged() {
      super.drawableStateChanged();
      invalidate();
    }

    @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
      super.onInitializeAccessibilityNodeInfo(info);
      info.setClassName("android.widget.Button");
      if (Build.VERSION.SDK_INT >= 30 && !note.isEmpty()) info.setStateDescription(note);
    }

    @Override protected void onDraw(Canvas canvas) {
      if (spec == null) return;
      canvas.save();
      canvas.clipRect(cssClip);
      canvas.translate(originX, originY);
      canvas.scale(scaleX, scaleY);
      float width = cssBox.width(), height = cssBox.height();
      float radius = (float) spec.optDouble("radius"), border = (float) spec.optDouble("border");
      RectF face = new RectF(0, 0, width, height);
      paint.setStyle(Paint.Style.FILL);
      Shader background = gradient(spec.optString("gradient"), height);
      paint.setColor(background == null ? color(spec.optString("background"), Color.TRANSPARENT) : Color.WHITE);
      paint.setShader(background);
      canvas.drawRoundRect(face, radius, radius, paint);
      paint.setShader(null);
      if (border > 0) {
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(border);
        paint.setColor(color(spec.optString("edge"), Color.TRANSPARENT));
        face.inset(border / 2, border / 2);
        canvas.drawRoundRect(face, Math.max(0, radius - border / 2), Math.max(0, radius - border / 2), paint);
        paint.setStyle(Paint.Style.FILL);
      }
      forEach(spec.optJSONArray("badges"), badge -> {
        paint.setColor(color(badge.optString("color"), Color.TRANSPARENT));
        float corner = (float) badge.optDouble("radius");
        canvas.drawRoundRect(rect(badge.optJSONArray("box")), corner, corner, paint);
      });
      forEach(spec.optJSONArray("icons"), icon -> drawIcon(canvas, icon, paint));
      forEach(spec.optJSONArray("texts"), text -> drawText(canvas, text, paint));
      if (isPressed() || isFocused()) {
        paint.setColor(isPressed() ? 0x30000000 : 0x99FFFFFF);
        paint.setStyle(isPressed() ? Paint.Style.FILL : Paint.Style.STROKE);
        paint.setStrokeWidth(1);
        canvas.drawRoundRect(face, radius, radius, paint);
        paint.setStyle(Paint.Style.FILL);
      }
      canvas.restore();
    }
  }

  private void drawText(Canvas canvas, JSONObject text, Paint paint) {
    String content = text.optString("text");
    RectF area = rect(text.optJSONArray("box"));
    float size = (float) text.optDouble("size");
    if (content.isEmpty() || area.isEmpty() || size <= 0) return;
    paint.setTypeface(font(text.optString("family"), text.optInt("weight", 400)));
    paint.setTextSize(size);
    paint.setTextScaleX(1f);
    float measured = paint.measureText(content);
    boolean centered = text.optBoolean("center");
    if (measured > 0 && !centered) paint.setTextScaleX(area.width() / measured);
    paint.setColor(color(text.optString("color"), Color.WHITE));
    Paint.FontMetrics metrics = paint.getFontMetrics();
    float baseline = area.centerY() - (metrics.ascent + metrics.descent) / 2f;
    RectF clip = rect(text.optJSONArray("clip"));
    canvas.save();
    if (!clip.isEmpty()) {
      canvas.clipRect(clip);
      if (text.optBoolean("ellipsis") && area.right > clip.right) {
        ellipsisPaint.set(paint);
        content = TextUtils.ellipsize(content, ellipsisPaint,
            Math.max(0, clip.right - area.left), TextUtils.TruncateAt.END).toString();
      }
    }
    float left = centered ? area.centerX() - paint.measureText(content) / 2 : area.left;
    canvas.rotate((float) text.optDouble("rotation", 0), area.centerX(), area.centerY());
    canvas.drawText(content, left, baseline, paint);
    canvas.restore();
    paint.setTextScaleX(1f);
  }

  private Typeface font(String family, int weight) {
    boolean towers = family.contains("Towers") || family.contains("Oswald");
    String key = (towers ? "towers" : "system") + weight;
    Typeface found = fonts.get(key);
    if (found != null) return found;
    Typeface base = towers ? Typeface.createFromAsset(getContext().getAssets(), "warzone/ui/Oswald.ttf")
        : Typeface.create("sans-serif", Typeface.NORMAL);
    Typeface face = Build.VERSION.SDK_INT >= 28
        ? Typeface.create(base, Math.max(1, Math.min(1000, weight)), false)
        : Typeface.create(base, weight >= 600 ? Typeface.BOLD : Typeface.NORMAL);
    fonts.put(key, face);
    return face;
  }

  private void drawIcon(Canvas canvas, JSONObject item, Paint paint) {
    RectF area = rect(item.optJSONArray("box"));
    if (area.isEmpty()) return;
    String asset = item.optString("asset");
    IconAsset icon = icon(item, asset);
    if (icon == null) return;
    RectF clip = rect(item.optJSONArray("clip"));
    canvas.save();
    if (!clip.isEmpty()) canvas.clipRect(clip);
    if (icon.bitmap != null) {
      paint.setColor(Color.WHITE);
      paint.setAlpha(Math.round(255f * (float) item.optDouble("opacity", 1)));
      canvas.drawBitmap(icon.bitmap, null, area, paint);
      canvas.restore();
      return;
    }
    if (icon.width <= 0 || icon.height <= 0) {
      canvas.restore();
      return;
    }
    canvas.translate(area.left, area.top);
    canvas.scale(area.width() / icon.width, area.height() / icon.height);
    canvas.translate(-icon.x, -icon.y);
    String filter = item.optString("filter");
    Matcher invert = INVERT.matcher(filter);
    float amount = invert.find() ? Float.parseFloat(invert.group(1)) / (invert.group(2) == null ? 1f : 100f) : 0f;
    boolean green = filter.contains("hue-rotate");
    float opacity = (float) item.optDouble("opacity", 1);
    for (IconPath part : icon.paths) {
      if (Color.alpha(part.fill) > 0) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(iconInk(part.fill, amount, green, opacity));
        canvas.drawPath(part.path, paint);
      }
      Stroke stroke = part.stroke;
      if (stroke != null) {
        paint.setStyle(Paint.Style.STROKE);
        paint.setColor(iconInk(stroke.color, amount, green, opacity));
        paint.setStrokeWidth(stroke.width);
        paint.setStrokeCap(stroke.cap);
        paint.setStrokeJoin(stroke.join);
        paint.setStrokeMiter(stroke.miter);
        canvas.drawPath(part.path, paint);
      }
    }
    paint.setStyle(Paint.Style.FILL);
    canvas.restore();
  }

  private IconAsset icon(JSONObject item, String asset) {
    String key = asset.isEmpty() ? "inline:" + item.optJSONArray("viewBox") + item.optJSONArray("paths") : asset;
    IconAsset cached = icons.get(key);
    if (cached != null) return cached;
    IconAsset icon = asset.isEmpty() ? inlineIcon(item) : loadIcon(asset);
    if (icon != null) icons.put(key, icon);
    return icon;
  }

  private static int inverted(int channel, float amount) {
    return Math.max(0, Math.min(255, Math.round(channel + (255 - 2 * channel) * amount)));
  }

  private static int iconInk(int color, float amount, boolean green, float opacity) {
    int ink = color;
    if (amount > 0) {
      ink = green ? 0xff63e682 : Color.rgb(inverted(Color.red(color), amount),
          inverted(Color.green(color), amount), inverted(Color.blue(color), amount));
    }
    return (ink & 0x00ffffff) | (Math.round(Color.alpha(color) * opacity) << 24);
  }

  private IconAsset loadIcon(String asset) {
    asset = Uri.decode(asset);
    if (!asset.matches("warzone/(?:ui|build-icons|research-icons)/[^\\\\]+\\.(?:svg|png|webp|gif|jpe?g)")
        || asset.contains("/../") || asset.contains("/./")) return null;
    IconAsset icon = new IconAsset();
    try (InputStream input = getContext().getAssets().open(asset)) {
      if (!asset.endsWith(".svg")) {
        icon.bitmap = BitmapFactory.decodeStream(input);
        return icon;
      }
      XmlPullParser parser = Xml.newPullParser();
      parser.setInput(input, "UTF-8");
      for (int event = parser.next(); event != XmlPullParser.END_DOCUMENT; event = parser.next()) {
        if (event != XmlPullParser.START_TAG) continue;
        if ("svg".equals(parser.getName())) {
          String[] bounds = parser.getAttributeValue(null, "viewBox").trim().split("[ ,]+");
          icon.x = Float.parseFloat(bounds[0]);
          icon.y = Float.parseFloat(bounds[1]);
          icon.width = Float.parseFloat(bounds[2]);
          icon.height = Float.parseFloat(bounds[3]);
        } else if ("path".equals(parser.getName())) {
          Path path = PathParser.createPathFromPathData(parser.getAttributeValue(null, "d"));
          if (path == null) continue;
          if ("evenodd".equals(parser.getAttributeValue(null, "fill-rule"))) path.setFillType(Path.FillType.EVEN_ODD);
          icon.paths.add(new IconPath(path, color(parser.getAttributeValue(null, "fill"), Color.BLACK), null));
        }
      }
      return icon;
    } catch (Exception error) {
      Log.w("BattleControls", "Could not read battle icon", error);
      return icon;
    }
  }

  private static IconAsset inlineIcon(JSONObject value) {
    JSONArray box = value.optJSONArray("viewBox");
    if (box == null || box.length() != 4) return null;
    IconAsset icon = new IconAsset();
    icon.x = (float) box.optDouble(0);
    icon.y = (float) box.optDouble(1);
    icon.width = (float) box.optDouble(2);
    icon.height = (float) box.optDouble(3);
    forEach(value.optJSONArray("paths"), part -> {
      try {
        Path path = vectorPath(part);
        if (path == null) return;
        if ("evenodd".equals(part.optString("fillRule"))) path.setFillType(Path.FillType.EVEN_ODD);
        int fill = iconInk(color(part.optString("fill"), Color.BLACK), 0, false,
            (float) part.optDouble("fillOpacity", 1));
        icon.paths.add(new IconPath(path, fill, vectorStroke(part)));
      } catch (RuntimeException error) {
        Log.w("BattleControls", "Could not draw inline battle icon", error);
      }
    });
    return icon;
  }

  private static Path vectorPath(JSONObject value) {
    String kind = value.optString("kind");
    if ("path".equals(kind)) return PathParser.createPathFromPathData(value.optString("data"));
    JSONArray geometry = value.optJSONArray("geometry");
    if (geometry == null) return null;
    Path path = new Path();
    if ("circle".equals(kind) && geometry.length() == 3) {
      path.addCircle((float) geometry.optDouble(0), (float) geometry.optDouble(1),
          (float) geometry.optDouble(2), Path.Direction.CW);
    } else if ("rect".equals(kind) && geometry.length() == 6) {
      path.addRoundRect((float) geometry.optDouble(0), (float) geometry.optDouble(1),
          (float) geometry.optDouble(2), (float) geometry.optDouble(3),
          (float) geometry.optDouble(4), (float) geometry.optDouble(5), Path.Direction.CW);
    } else {
      return null;
    }
    return path;
  }

  private static Stroke vectorStroke(JSONObject value) {
    float width = (float) value.optDouble("strokeWidth", 0);
    int color = iconInk(color(value.optString("stroke"), Color.TRANSPARENT), 0, false,
        (float) value.optDouble("strokeOpacity", 1));
    if (width <= 0 || Color.alpha(color) == 0) return null;
    Paint.Cap cap = switch (value.optString("cap")) {
      case "round" -> Paint.Cap.ROUND;
      case "square" -> Paint.Cap.SQUARE;
      default -> Paint.Cap.BUTT;
    };
    Paint.Join join = switch (value.optString("join")) {
      case "round" -> Paint.Join.ROUND;
      case "bevel" -> Paint.Join.BEVEL;
      default -> Paint.Join.MITER;
    };
    return new Stroke(color, width, cap, join, (float) value.optDouble("miter", 4));
  }

  private static final class IconAsset {
    final List<IconPath> paths = new ArrayList<>();
    Bitmap bitmap;
    float x, y, width, height;
  }

  private record IconPath(Path path, int fill, Stroke stroke) {}
  private record Stroke(int color, float width, Paint.Cap cap, Paint.Join join, float miter) {}

  private interface PartConsumer { void accept(JSONObject part); }

  private static void forEach(JSONArray parts, PartConsumer consumer) {
    if (parts == null) return;
    for (int i = 0; i < parts.length(); i++) {
      JSONObject part = parts.optJSONObject(i);
      if (part != null) consumer.accept(part);
    }
  }

  private static RectF rect(JSONArray values) {
    if (values == null || values.length() != 4) return new RectF();
    return new RectF((float) values.optDouble(0, 0), (float) values.optDouble(1, 0),
        (float) values.optDouble(2, 0), (float) values.optDouble(3, 0));
  }

  private static Shader gradient(String css, float height) {
    if (!css.startsWith("linear-gradient(rgb") || height <= 0) return null;
    Matcher matcher = CSS_COLOR.matcher(css);
    List<Integer> stops = new ArrayList<>();
    while (matcher.find()) stops.add(color(matcher.group(), Color.TRANSPARENT));
    if (stops.size() < 2) return null;
    int[] colors = new int[stops.size()];
    for (int i = 0; i < colors.length; i++) colors[i] = stops.get(i);
    return new LinearGradient(0, 0, 0, height, colors, null, Shader.TileMode.CLAMP);
  }

  private static int color(String input, int fallback) {
    if (input == null || input.isEmpty()) return fallback;
    if ("transparent".equals(input) || "none".equals(input)) return Color.TRANSPARENT;
    try {
      if (input.startsWith("rgb")) {
        String[] values = input.substring(input.indexOf('(') + 1, input.indexOf(')')).trim().split("[, /]+");
        return Color.argb(values.length == 4 ? Math.round(255f * Float.parseFloat(values[3])) : 255,
            Math.round(Float.parseFloat(values[0])), Math.round(Float.parseFloat(values[1])),
            Math.round(Float.parseFloat(values[2])));
      }
      return Color.parseColor(input);
    } catch (IllegalArgumentException | IndexOutOfBoundsException error) {
      return fallback;
    }
  }
}
