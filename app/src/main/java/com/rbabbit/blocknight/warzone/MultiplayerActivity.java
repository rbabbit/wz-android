package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.HttpURLConnection;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;
import org.json.JSONException;

/** Isolated multiplayer experiment. It shares no storage or bridge with Towers. */
public final class MultiplayerActivity extends Activity {
  private static final String TAG = "WarzoneMultiplayer";
  private static final String ORIGIN = "https://appassets.androidplatform.net";
  private static final String START_URL = ORIGIN + "/multiplayer/index.html";
  private static final int MAX_CONNECTIONS = 8;
  private static final int CONNECT_TIMEOUT_MS = 10_000;
  private static final int MAX_SEND_BYTES = 8 * 1024 * 1024;
  private static final long MAX_QUEUED_BYTES = 32L * 1024 * 1024;
  private static final int MAX_HTTP_BYTES = 4 * 1024 * 1024;
  private static final float MIN_ENGINE_CSS_WIDTH = 642f;
  private static final float MIN_ENGINE_CSS_HEIGHT = 482f;
  private static final float DEFAULT_COMMAND_STRIP_CSS_HEIGHT = 72f;
  private static final String PLAYER_PROFILE = "warzone_multiplayer_profile";
  private static final String PLAYER_NAME = "player_name";
  private static final String DEFAULT_PLAYER_NAME = "Player";

  private final Object connectionsLock = new Object();
  private final Map<Integer, Connection> connections = new ConcurrentHashMap<>();
  private final AtomicBoolean destroyed = new AtomicBoolean();
  private final Set<Integer> httpRequestIds = ConcurrentHashMap.newKeySet();
  private final Set<HttpURLConnection> activeHttp = ConcurrentHashMap.newKeySet();
  private final ExecutorService httpExecutor =
      Executors.newFixedThreadPool(4, r -> new Thread(r, "pc-lobby-http"));
  private final ScheduledExecutorService timeouts =
      Executors.newSingleThreadScheduledExecutor(r -> new Thread(r, "pc-socket-timeouts"));
  private WebView webView;
  private FrameLayout root;
  private View.OnLayoutChangeListener viewportListener;
  private SharedPreferences playerPreferences;
  private String savedPlayerName = DEFAULT_PLAYER_NAME;
  private final Object playerProfileLock = new Object();
  private boolean engineViewportActive;
  private float commandStripCssHeight = DEFAULT_COMMAND_STRIP_CSS_HEIGHT;
  private AlertDialog leaveDialog;
  private volatile boolean sessionActive;
  private boolean pendingLobbyNavigation;
  private static final String MUSIC_PROFILE = "warzone_multiplayer_music";
  private final Object musicPreferenceLock = new Object();
  private MusicPackStore musicStore;
  private MapMusicIndex musicIndex;
  private SharedPreferences musicPreferences;
  private String musicSession = "";
  private volatile boolean musicSuspended = true;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    playerPreferences = getSharedPreferences(PLAYER_PROFILE, MODE_PRIVATE);
    String storedPlayerName = playerPreferences.getString(PLAYER_NAME, DEFAULT_PLAYER_NAME);
    if (playerNameError(storedPlayerName).isEmpty()) savedPlayerName = storedPlayerName;
    musicPreferences = getSharedPreferences(MUSIC_PROFILE, MODE_PRIVATE);
    musicStore = new MusicPackStore(this);
    musicIndex = new MapMusicIndex(this, new MusicTrackCatalog(this));
    WebView.setWebContentsDebuggingEnabled(true);
    root = new FrameLayout(this);
    root.setBackgroundColor(0xff000000);
    root.setClipChildren(true);
    webView = new MultiplayerWebView();
    webView.setBackgroundColor(0xff000000);
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    webView.setHorizontalScrollBarEnabled(false);
    webView.setVerticalScrollBarEnabled(false);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(true);
    settings.setSupportZoom(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    webView.addJavascriptInterface(new SocketBridge(), "AndroidSocketBridge");
    webView.addJavascriptInterface(new NativeHttp(), "AndroidLobbyHttp");
    webView.addJavascriptInterface(new Navigation(), "AndroidMultiplayer");
    webView.addJavascriptInterface(new MultiplayerMusic(), "AndroidMultiplayerMusic");

    WebViewAssetLoader.AssetsPathHandler assets =
        new WebViewAssetLoader.AssetsPathHandler(this);
    WebViewAssetLoader loader =
        new WebViewAssetLoader.Builder()
            .addPathHandler(
                "/multiplayer/",
                path -> {
                  boolean artwork = path.startsWith("build-icons/") || path.startsWith("research-icons/");
                  if (artwork && !sharedMultiplayerArt(path)) return blockedResponse(403, "Non-artwork alias blocked");
                  WebResourceResponse response = assets.handle((artwork ? "warzone/" : "multiplayer/") + path);
                  if (response != null) {
                    response.setResponseHeaders(isolationHeaders());
                    if (path.endsWith(".wasm")) response.setMimeType("application/wasm");
                    if (path.endsWith(".data")) response.setMimeType("application/octet-stream");
                  }
                  return response;
                })
            .addPathHandler("/warzone/", path -> {
              if (!sharedUiAsset(path)) return blockedResponse(403, "Non-UI asset blocked");
              WebResourceResponse response = assets.handle("warzone/" + path);
              if (response != null) response.setResponseHeaders(isolationHeaders());
              return response;
            })
            .addPathHandler("/", path -> {
              if (!sharedRenderer(path)) return blockedResponse(403, "Non-UI asset blocked");
              WebResourceResponse response = assets.handle(path);
              if (response != null) response.setResponseHeaders(isolationHeaders());
              return response;
            })
            .build();
    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            if (!isLocal(request.getUrl())) return blockedResponse(403, "External request blocked");
            String musicPath = "/warzone/optional/map-music/";
            if (request.getUrl().getPath().startsWith(musicPath))
              return multiplayerMusicResponse(request, request.getUrl().getPath().substring(musicPath.length()));
            WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
            return response != null ? response : blockedResponse(404, "Asset not found");
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !isLocal(request.getUrl());
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return !isLocal(Uri.parse(url));
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            Log.i(TAG, "Page ready: " + url);
            view.evaluateJavascript(
                "JSON.stringify({isolated:window.crossOriginIsolated,"
                    + "sharedArrayBuffer:typeof SharedArrayBuffer==='function',"
                    + "width:innerWidth,height:innerHeight})",
                capabilities -> Log.i(TAG, "WebView capabilities: " + capabilities));
            if (root != null) root.post(MultiplayerActivity.this::fitViewport);
          }

          @Override
          public void onPageCommitVisible(WebView view, String url) {
            if (pendingLobbyNavigation && START_URL.equals(url)) {
              pendingLobbyNavigation = false;
              view.setVisibility(View.VISIBLE);
              if (root != null) root.post(MultiplayerActivity.this::fitViewport);
            }
          }
        });
    webView.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onConsoleMessage(ConsoleMessage message) {
            Log.i(TAG, "JS " + message.messageLevel() + ": " + message.message());
            return true;
          }
        });
    configureIsolationAllowlist();
    root.addView(webView, new FrameLayout.LayoutParams(-1, -1, Gravity.TOP | Gravity.START));
    webView.setPivotX(0f);
    webView.setPivotY(0f);
    viewportListener = (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> fitViewport();
    root.addOnLayoutChangeListener(viewportListener);
    root.setOnApplyWindowInsetsListener((view, insets) -> {
      int left = 0, top = 0, right = 0, bottom = 0;
      if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
        left = insets.getDisplayCutout().getSafeInsetLeft();
        top = insets.getDisplayCutout().getSafeInsetTop();
        right = insets.getDisplayCutout().getSafeInsetRight();
        bottom = insets.getDisplayCutout().getSafeInsetBottom();
      }
      if (view.getPaddingLeft() != left || view.getPaddingTop() != top
          || view.getPaddingRight() != right || view.getPaddingBottom() != bottom) {
        view.setPadding(left, top, right, bottom);
      }
      view.post(this::fitViewport);
      return insets;
    });
    setContentView(root);
    root.post(this::fitViewport);
    immersive();
    webView.loadUrl(START_URL);
    Log.i(TAG, "Separate PC multiplayer test shell started");
  }

  private static boolean isLocal(Uri uri) {
    return "https".equalsIgnoreCase(uri.getScheme())
        && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
        && (uri.getPort() == -1 || uri.getPort() == 443)
        && uri.getUserInfo() == null;
  }

  private static boolean sharedRenderer(String path) {
    return "warzone-command-pages.js".equals(path) || "warzone-mobile-research.js".equals(path)
        || "warzone-terrain-picker.js".equals(path) || "warzone-intelligence.js".equals(path);
  }

  private static boolean sharedUiAsset(String path) {
    if (path == null || path.contains("..") || path.contains("\\") || path.contains("%")
        || path.indexOf('\0') >= 0 || path.startsWith("/")) return false;
    if ("command-catalog.json".equals(path) || "build-ghost-models.json".equals(path)
        || "music-catalog.js".equals(path)) return true;
    return (path.startsWith("ui/") || path.startsWith("research-icons/") || path.startsWith("build-icons/"))
        && path.matches(".*\\.(?:js|css|json|png|gif|jpg|jpeg|webp|svg|ttf|woff|woff2)$");
  }

  private static boolean sharedMultiplayerArt(String path) {
    return path != null && (path.startsWith("build-icons/") || path.startsWith("research-icons/"))
        && sharedUiAsset(path) && path.matches(".*\\.(?:png|gif|jpg|jpeg|webp|svg)$");
  }

  public final class Navigation {
    @JavascriptInterface public void setSessionActive(boolean active) {
      // This bridge call completes before the joining script proceeds. Back
      // must never wait for a JS callback behind a busy native engine frame.
      sessionActive = active;
      synchronized (musicPreferenceLock) {
        if (active && musicSession.isEmpty()) musicSession = java.util.UUID.randomUUID().toString();
        if (!active) musicSession = "";
      }
      if (!active) runOnUiThread(() -> {
        if (!sessionActive) dismissLeaveDialog();
      });
    }
    @JavascriptInterface public String getPlayerName() {
      synchronized (playerProfileLock) {
        return savedPlayerName;
      }
    }
    @JavascriptInterface public String setPlayerName(String supplied) {
      String name = supplied == null ? "" : supplied.trim();
      String error = supplied != null && supplied.codePoints().anyMatch(Character::isISOControl)
          ? "Use a valid player name without control characters." : playerNameError(name);
      boolean ok = error.isEmpty();
      synchronized (playerProfileLock) {
        // The join must not start with a name that has only been queued for saving.
        if (ok) {
          if (playerPreferences.edit().putString(PLAYER_NAME, name).commit()) savedPlayerName = name;
          else {
            ok = false;
            error = "The player name could not be saved. Please try again.";
          }
        }
        try {
          return new JSONObject().put("ok", ok).put("name", name).put("error", error).toString();
        } catch (JSONException impossible) {
          throw new IllegalStateException(impossible);
        }
      }
    }
    @JavascriptInterface public void setViewportState(boolean engineActive, float headerCssHeight) {
      if (!Float.isFinite(headerCssHeight) || headerCssHeight < 0f || headerCssHeight > 180f) return;
      runOnUiThread(() -> {
        if (destroyed.get()) return;
        engineViewportActive = engineActive;
        commandStripCssHeight = Math.max(DEFAULT_COMMAND_STRIP_CSS_HEIGHT, headerCssHeight);
        fitViewport();
      });
    }
    @JavascriptInterface public void leave() {
      runOnUiThread(() -> onBackPressed());
    }
    @JavascriptInterface public void home() {
      runOnUiThread(() -> finish());
    }
    @JavascriptInterface public void closeConnections() {
      for (Connection connection : connections.values()) connection.finish(null);
    }
  }

  /** Only the soundtrack settings are exposed, never the main game's bridge. */
  public final class MultiplayerMusic {
    @JavascriptInterface public String musicState() { return multiplayerMusicState(); }
    @JavascriptInterface public String setMusicEnabled(boolean on, String session) {
      synchronized (musicPreferenceLock) {
        if (sessionActive && session != null && !session.isEmpty() && session.equals(musicSession))
          musicPreferences.edit().putBoolean("music_enabled", on).commit();
      }
      return multiplayerMusicState();
    }
  }

  private String multiplayerMusicState() {
    try {
      boolean cached = musicStore != null && musicStore.ready();
      synchronized (musicPreferenceLock) {
        return new JSONObject(musicIndex.stateJson("ffa", "multiplayer", "", cached,
            musicPreferences.getBoolean("music_enabled", true), musicSuspended || !sessionActive, ORIGIN))
            .put("session", musicSession).toString();
      }
    } catch (Exception error) {
      Log.w(TAG, "Multiplayer soundtrack unavailable", error);
      return "{\"cached\":false,\"enabled\":false,\"suspended\":true,\"mode\":\"ffa\",\"tracks\":[],\"session\":\"\"}";
    }
  }

  private static boolean validMusicTrackId(String id) {
    return id != null && id.matches("[a-z0-9_]+/[a-zA-Z0-9_-]+\\.opus");
  }

  private WebResourceResponse multiplayerMusicResponse(WebResourceRequest request, String id) {
    MapMusicIndex.Slice track = validMusicTrackId(id) && musicIndex != null ? musicIndex.slice(id) : null;
    if (track != null && musicStore != null && musicStore.ready()) {
      String range = null;
      for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet())
        if ("Range".equalsIgnoreCase(header.getKey())) range = header.getValue();
      try { return MusicTrackResponse.open(musicStore, track, request.getMethod(), range, isolationHeaders()); }
      catch (IOException error) { Log.w(TAG, "Bundled multiplayer track unavailable", error); }
    }
    return blockedResponse(404, "Music track not found");
  }

  private void multiplayerMusicLifecycle(String action) {
    final String session;
    synchronized (musicPreferenceLock) { session = musicSession; }
    if (webView == null || destroyed.get() || session.isEmpty()) return;
    String call = "dispose".equals(action) ? "w.WarzoneMusic?.dispose?.();"
        : "w.WarzoneMusic?.setSuspended?.(" + ("suspend".equals(action) ? "true" : "false") + ");";
    webView.evaluateJavascript("(()=>{const w=document.getElementById('warzone-game-frame')?.contentWindow;"
        + "if(w&&new URLSearchParams(w.location.search).get('battle_session')==="
        + JSONObject.quote(session) + "){" + call + "}})();", null);
  }

  /** The stock editor accepts 15 UTF-8 bytes; never split a Unicode code point. */
  private static String playerNameError(String name) {
    if (name == null || name.isEmpty()) return "Enter a player name.";
    for (int offset = 0; offset < name.length();) {
      char first = name.charAt(offset);
      if (Character.isSurrogate(first)
          && (!Character.isHighSurrogate(first) || offset + 1 >= name.length()
              || !Character.isLowSurrogate(name.charAt(offset + 1)))) {
        return "Use a valid player name.";
      }
      int point = name.codePointAt(offset);
      int type = Character.getType(point);
      if (Character.isISOControl(point) || type == Character.FORMAT
          || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR
          || (point < 128 && !(point >= 'a' && point <= 'z')
              && !(point >= 'A' && point <= 'Z') && !(point >= '0' && point <= '9')
              && point != ' ' && point != '-' && point != '+' && point != '_'
              && point != '[' && point != ']')) {
        return "Use letters, numbers, spaces, - + _ or brackets.";
      }
      offset += Character.charCount(point);
    }
    if (!name.equals(name.trim()) || name.contains("  ")) return "Use single spaces between words.";
    if (name.getBytes(StandardCharsets.UTF_8).length > 15) return "That name is too long for Warzone. Try a shorter name.";
    return "";
  }

  /** Match the established Towers virtual viewport instead of squeezing SDL below its minimum. */
  private void fitViewport() {
    if (root == null || webView == null || destroyed.get()) return;
    int width = root.getWidth() - root.getPaddingLeft() - root.getPaddingRight();
    int height = root.getHeight() - root.getPaddingTop() - root.getPaddingBottom();
    if (width <= 0 || height <= 0) return;
    float density = getResources().getDisplayMetrics().density;
    float reserved = engineViewportActive ? commandStripCssHeight : DEFAULT_COMMAND_STRIP_CSS_HEIGHT;
    float scale = viewportScale(width, height, density, reserved);
    int virtualWidth = (int) Math.ceil(width / scale);
    int virtualHeight = (int) Math.ceil(height / scale);
    FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) webView.getLayoutParams();
    int gravity = Gravity.TOP | Gravity.START;
    // Reapplying identical parameters would create a layout loop during loading/play.
    if (params.width != virtualWidth || params.height != virtualHeight || params.gravity != gravity) {
      params.width = virtualWidth;
      params.height = virtualHeight;
      params.gravity = gravity;
      webView.setLayoutParams(params);
    }
    if (webView.getScaleX() != scale) webView.setScaleX(scale);
    if (webView.getScaleY() != scale) webView.setScaleY(scale);
  }

  private static float viewportScale(int width, int height, float density, float reserved) {
    float scale = Math.min(1f, Math.min(width / (MIN_ENGINE_CSS_WIDTH * density),
        height / ((MIN_ENGINE_CSS_HEIGHT + reserved) * density)));
    if (width / (scale * density) <= 1100f) {
      scale = Math.min(scale, height / ((MIN_ENGINE_CSS_HEIGHT + Math.max(reserved, 116f)) * density));
    }
    return scale;
  }

  @Override
  public void onConfigurationChanged(Configuration configuration) {
    super.onConfigurationChanged(configuration);
    if (root != null) root.post(this::fitViewport);
  }

  private boolean isKeyboardVisible() {
    if (root == null) return false;
    if (Build.VERSION.SDK_INT >= 30 && root.getRootWindowInsets() != null) {
      return root.getRootWindowInsets().isVisible(android.view.WindowInsets.Type.ime());
    }
    Rect visible = new Rect();
    root.getWindowVisibleDisplayFrame(visible);
    return root.getRootView().getHeight() - visible.bottom > 100 * getResources().getDisplayMetrics().density;
  }

  /** HTML panels may scroll; Android focus reveal must not shift the game/header itself. */
  private final class MultiplayerWebView extends WebView {
    private boolean backStartedWithKeyboard;
    MultiplayerWebView() { super(MultiplayerActivity.this); }
    @Override public void scrollTo(int x, int y) { super.scrollTo(0, 0); }
    @Override protected void onScrollChanged(int x, int y, int oldX, int oldY) {
      super.onScrollChanged(x, y, oldX, oldY);
      if (x != 0 || y != 0) super.scrollTo(0, 0);
    }
    @Override public boolean requestChildRectangleOnScreen(View child, Rect rectangle, boolean immediate) {
      return false;
    }
    @Override public boolean onKeyPreIme(int keyCode, KeyEvent event) {
      if (keyCode == KeyEvent.KEYCODE_BACK) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) backStartedWithKeyboard = isKeyboardVisible();
        if (backStartedWithKeyboard) {
          if (event.getAction() == KeyEvent.ACTION_UP) backStartedWithKeyboard = false;
          return false;
        }
        if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) onBackPressed();
        return true;
      }
      return super.onKeyPreIme(keyCode, event);
    }
  }

  private static Map<String, String> isolationHeaders() {
    Map<String, String> headers = new HashMap<>();
    headers.put("Cache-Control", "no-store");
    headers.put("Cross-Origin-Opener-Policy", "same-origin");
    headers.put("Document-Isolation-Policy", "isolate-and-require-corp");
    headers.put("Cross-Origin-Resource-Policy", "same-origin");
    headers.put("Cross-Origin-Embedder-Policy", "require-corp");
    return headers;
  }

  private static WebResourceResponse blockedResponse(int status, String message) {
    return new WebResourceResponse(
        "text/plain",
        "UTF-8",
        status,
        status == 403 ? "Forbidden" : "Not Found",
        isolationHeaders(),
        new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));
  }

  private void configureIsolationAllowlist() {
    try {
      boolean supported =
          WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
              && WebViewFeature.isFeatureSupported(WebViewFeature.CROSS_ORIGIN_ISOLATED_ALLOWLIST);
      if (supported) {
        WebViewCompat.getProfile(webView)
            .setCrossOriginIsolatedAllowlist(Collections.singleton(ORIGIN));
      }
      Log.i(TAG, "Cross-origin isolation allowlist supported: " + supported);
    } catch (RuntimeException error) {
      Log.w(TAG, "Cross-origin isolation allowlist unavailable", error);
    }
  }

  @Override
  public void onWindowFocusChanged(boolean focused) {
    super.onWindowFocusChanged(focused);
    if (focused) {
      immersive();
      if (root != null) root.post(this::fitViewport);
    }
  }

  private void immersive() {
    getWindow()
        .getDecorView()
        .setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onBackPressed() {
    if (webView == null) { super.onBackPressed(); return; }
    if (leaveDialog != null && !leaveDialog.isShowing()) leaveDialog = null;
    if (isFinishing() || isDestroyed() || leaveDialog != null || pendingLobbyNavigation) return;
    if (isKeyboardVisible()) {
      InputMethodManager keyboard = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
      if (keyboard != null) keyboard.hideSoftInputFromWindow(webView.getWindowToken(), 0);
      return;
    }
      if (!sessionActive) { finish(); return; }
      Typeface face = Typeface.createFromAsset(getAssets(), "warzone/ui/Oswald.ttf");
      TextView title = new TextView(this);
      title.setText("Return to multiplayer lobby?");
      title.setTextColor(TowersTheme.TEXT);
      title.setTextSize(18);
      title.setTypeface(face);
      title.setPadding(dp(20), dp(18), dp(20), dp(14));
      AlertDialog dialog = new AlertDialog.Builder(this)
          .setCustomTitle(title)
          .setNegativeButton("Stay", null)
          .setPositiveButton("Return", (ignored, which) -> {
            returnToLobbyNative();
          }).create();
      leaveDialog = dialog;
      dialog.setCanceledOnTouchOutside(false);
      dialog.setOnDismissListener(ignored -> {
        if (leaveDialog == dialog) leaveDialog = null;
        if (webView != null && !destroyed.get() && !isFinishing() && !isDestroyed()) {
          immersive();
          webView.requestFocus();
        }
      });
      webView.evaluateJavascript(
          "document.querySelector('iframe')?.contentWindow?.PcMultiplayerControls?.releaseAll()", null);
      dialog.show();
      GradientDrawable surface = new GradientDrawable();
      surface.setColor(TowersTheme.PANEL);
      surface.setCornerRadius(dp(6));
      if (dialog.getWindow() != null) {
        dialog.getWindow().setBackgroundDrawable(surface);
        dialog.getWindow().setLayout(Math.min(dp(320), getResources().getDisplayMetrics().widthPixels - dp(32)),
            ViewGroup.LayoutParams.WRAP_CONTENT);
        WindowManager.LayoutParams attributes = dialog.getWindow().getAttributes();
        attributes.dimAmount = 0.42f;
        dialog.getWindow().setAttributes(attributes);
      }
      for (int which : new int[]{AlertDialog.BUTTON_NEGATIVE, AlertDialog.BUTTON_POSITIVE}) {
        Button button = dialog.getButton(which);
        boolean primary = which == AlertDialog.BUTTON_POSITIVE;
        button.setTextColor(TowersTheme.buttonText(primary));
        button.setTypeface(face);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setMinHeight(dp(48));
        button.setMinimumHeight(dp(48));
        button.setMinWidth(dp(88));
        button.setMinimumWidth(dp(88));
        button.setPadding(dp(16), 0, dp(16), 0);
        button.setBackgroundTintList(null);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(primary
            ? TowersTheme.PRIMARY_RIPPLE : TowersTheme.RIPPLE),
            TowersTheme.control(this, primary ? TowersTheme.PRIMARY : TowersTheme.CONTROL, 4), null));
      }
  }

  private void dismissLeaveDialog() {
    AlertDialog dialog = leaveDialog;
    leaveDialog = null;
    if (dialog != null) dialog.dismiss();
  }

  private void returnToLobbyNative() {
    if (webView == null || pendingLobbyNavigation || destroyed.get()) return;
    synchronized (musicPreferenceLock) { musicSession = ""; }
    sessionActive = false;
    pendingLobbyNavigation = true;
    // Hide the old surface before closing transport or navigating. Only a
    // committed frame from our own lobby may reveal the WebView again.
    webView.setVisibility(View.INVISIBLE);
    engineViewportActive = false;
    commandStripCssHeight = DEFAULT_COMMAND_STRIP_CSS_HEIGHT;
    dismissLeaveDialog();
    for (Connection connection : connections.values()) connection.finish(null);
    webView.stopLoading();
    webView.loadUrl(START_URL);
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  @Override
  protected void onPause() {
    musicSuspended = true;
    multiplayerMusicLifecycle("suspend");
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    musicSuspended = false;
    multiplayerMusicLifecycle("resume");
  }

  @Override
  protected void onDestroy() {
    multiplayerMusicLifecycle("dispose");
    destroyed.set(true);
    sessionActive = false;
    if (leaveDialog != null) {
      leaveDialog.dismiss();
      leaveDialog = null;
    }
    for (Connection connection : connections.values()) connection.finish(null);
    timeouts.shutdownNow();
    httpExecutor.shutdownNow();
    for (HttpURLConnection connection : activeHttp) connection.disconnect();
    if (root != null && viewportListener != null) root.removeOnLayoutChangeListener(viewportListener);
    if (webView != null) {
      webView.removeJavascriptInterface("AndroidSocketBridge");
      webView.removeJavascriptInterface("AndroidLobbyHttp");
      webView.removeJavascriptInterface("AndroidMultiplayer");
      webView.removeJavascriptInterface("AndroidMultiplayerMusic");
      webView.stopLoading();
      webView.destroy();
      webView = null;
    }
    if (musicStore != null) musicStore.close();
    super.onDestroy();
  }

  private void callback(int id, Connection source, String type, String payload) {
    if (destroyed.get()) return;
    runOnUiThread(
        () -> {
          if (destroyed.get() || webView == null) return;
          // Never let a delayed event for a retired socket reach a reused identifier.
          Connection current = connections.get(id);
          if (source != null && current != null && current != source) return;
          webView.evaluateJavascript(
              "window.PcSocket&&window.PcSocket.receive("
                  + id
                  + ","
                  + JSONObject.quote(type)
                  + ","
                  + JSONObject.quote(payload)
                  + ")",
              null);
        });
  }

  public final class SocketBridge {
    @JavascriptInterface
    public void open(int id, String host, int port) {
      if (destroyed.get()) return;
      if (id < 0 || host == null || host.length() == 0 || host.length() > 253
          || !host.matches("[A-Za-z0-9_.:\\-]+") || port < 1 || port > 65535) {
        callback(id, null, "error", "Invalid socket address");
        callback(id, null, "close", "");
        return;
      }
      Connection connection;
      synchronized (connectionsLock) {
        if (destroyed.get()) return;
        if (connections.containsKey(id)) {
          callback(id, null, "error", "Socket identifier already open");
          return;
        }
        if (connections.size() >= MAX_CONNECTIONS) {
          callback(id, null, "error", "Maximum eight connections reached");
          callback(id, null, "close", "");
          return;
        }
        connection = new Connection(id, host, port);
        connections.put(id, connection);
      }
      connection.start();
    }

    @JavascriptInterface
    public void send(int id, String base64) {
      Connection connection = connections.get(id);
      if (connection == null || destroyed.get()) return;
      if (base64 == null || base64.length() > ((MAX_SEND_BYTES + 2L) / 3L) * 4L) {
        connection.finish("Socket send exceeds size limit");
        return;
      }
      try {
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        if (bytes.length > MAX_SEND_BYTES) connection.finish("Socket send exceeds size limit");
        else connection.send(bytes);
      } catch (IllegalArgumentException error) {
        connection.finish("Invalid base64 socket payload");
      }
    }

    @JavascriptInterface
    public void close(int id) {
      Connection connection = connections.get(id);
      if (connection != null) connection.finish(null);
    }
  }

  /** The stock engine signs lobby requests. Forward their bytes and custom Origin unchanged. */
  public final class NativeHttp {
    @JavascriptInterface
    public void request(int id, String method, String url, String headersJson, String bodyBase64) {
      if (destroyed.get()) return;
      synchronized (httpRequestIds) {
        if (id < 0 || httpRequestIds.contains(id) || httpRequestIds.size() >= 8) {
          httpCallback(id, 0, "{}", "", "Invalid or busy lobby HTTP request");
          return;
        }
        httpRequestIds.add(id);
      }
      try {
        httpExecutor.execute(
            () -> {
              try {
                forwardHttp(id, method, url, headersJson, bodyBase64);
              } finally {
                httpRequestIds.remove(id);
              }
            });
      } catch (RejectedExecutionException error) {
        httpRequestIds.remove(id);
        httpCallback(id, 0, "{}", "", "Lobby HTTP bridge shutting down");
      }
    }
  }

  private static URL allowedLobbyUrl(String value) throws IOException {
    URL url = new URL(value);
    if (!"https".equalsIgnoreCase(url.getProtocol())
        || !"wzlobby.wz2100.net".equalsIgnoreCase(url.getHost())
        || (url.getPort() != -1 && url.getPort() != 443)
        || url.getUserInfo() != null) {
      throw new IOException("Only the official HTTPS lobby is allowed");
    }
    return url;
  }

  private void forwardHttp(
      int id, String suppliedMethod, String suppliedUrl, String headersJson, String bodyBase64) {
    HttpURLConnection connection = null;
    try {
      String method = suppliedMethod == null ? "GET" : suppliedMethod.toUpperCase(Locale.ROOT);
      if (!method.matches("GET|HEAD|POST|PUT|DELETE|OPTIONS|PATCH")) {
        throw new IOException("Unsupported HTTP method");
      }
      URL url = allowedLobbyUrl(suppliedUrl);
      if (bodyBase64 != null && bodyBase64.length() > ((MAX_HTTP_BYTES + 2L) / 3L) * 4L) {
        throw new IOException("Lobby request exceeds size limit");
      }
      byte[] body = bodyBase64 == null || bodyBase64.isEmpty()
          ? new byte[0] : Base64.decode(bodyBase64, Base64.DEFAULT);
      if (body.length > MAX_HTTP_BYTES) throw new IOException("Lobby request exceeds size limit");
      JSONObject requestHeaders = new JSONObject(headersJson == null ? "{}" : headersJson);
      for (int redirects = 0; redirects <= 3; redirects++) {
        if (destroyed.get()) return;
        connection = (HttpURLConnection) url.openConnection();
        activeHttp.add(connection);
        if (destroyed.get()) return;
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(CONNECT_TIMEOUT_MS);
        connection.setUseCaches(false);
        connection.setRequestMethod(method);
        connection.setRequestProperty("User-Agent", "Warzone2100/4.7.0 (+https://github.com/Warzone2100/warzone2100)");
        java.util.Iterator<String> names = requestHeaders.keys();
        while (names.hasNext()) {
          String name = names.next();
          String value = requestHeaders.getString(name);
          if (!name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]+")
              || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            throw new IOException("Invalid HTTP header");
          }
          if (!name.equalsIgnoreCase("Host") && !name.equalsIgnoreCase("Content-Length")
              && !name.equalsIgnoreCase("Connection")) connection.setRequestProperty(name, value);
        }
        if (body.length > 0 || method.equals("POST") || method.equals("PUT") || method.equals("PATCH")) {
          if (method.equals("GET") || method.equals("HEAD")) {
            throw new IOException("HTTP method does not permit a request body");
          }
          connection.setDoOutput(true);
          connection.setFixedLengthStreamingMode(body.length);
          try (OutputStream output = connection.getOutputStream()) { output.write(body); }
        }
        int status = connection.getResponseCode();
        if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
          String location = connection.getHeaderField("Location");
          if (redirects == 3 || location == null) throw new IOException("Lobby redirect limit reached");
          URL next = allowedLobbyUrl(new URL(url, location).toString());
          connection.disconnect();
          activeHttp.remove(connection);
          connection = null;
          url = next;
          continue;
        }
        JSONObject responseHeaders = new JSONObject();
        for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
          if (header.getKey() != null && header.getValue() != null) {
            responseHeaders.put(header.getKey(), String.join(", ", header.getValue()));
          }
        }
        InputStream response = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (response != null) {
          try (InputStream input = response) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
              if (bytes.size() + count > MAX_HTTP_BYTES) throw new IOException("Lobby response exceeds size limit");
              bytes.write(buffer, 0, count);
            }
          }
        }
        Log.i(TAG, "Lobby HTTP " + id + " " + method + " " + url.getPath() + " -> " + status
            + ", bytes=" + bytes.size());
        httpCallback(id, status, responseHeaders.toString(),
            Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP), "");
        return;
      }
    } catch (IOException | JSONException | RuntimeException error) {
      Log.i(TAG, "Lobby HTTP " + id + " failed: " + error.getClass().getSimpleName());
      httpCallback(id, 0, "{}", "", error.getClass().getSimpleName() + ": " + error.getMessage());
    } finally {
      if (connection != null) {
        connection.disconnect();
        activeHttp.remove(connection);
      }
    }
  }

  private void httpCallback(int id, int status, String headers, String bodyBase64, String error) {
    if (destroyed.get()) return;
    runOnUiThread(
        () -> {
          if (destroyed.get() || webView == null) return;
          webView.evaluateJavascript(
              "window.PcLobbyHttp&&window.PcLobbyHttp.receive(" + id + "," + status + ","
                  + JSONObject.quote(headers) + "," + JSONObject.quote(bodyBase64) + ","
                  + JSONObject.quote(error) + ")",
              null);
        });
  }

  private final class Connection {
    final int id;
    final String host;
    final int port;
    final Socket socket = new Socket();
    final ExecutorService writer;
    boolean closed;
    long queuedBytes;
    long sentBytes;
    long receivedBytes;
    ScheduledFuture<?> connectDeadline;

    Connection(int id, String host, int port) {
      this.id = id;
      this.host = host;
      this.port = port;
      writer = Executors.newSingleThreadExecutor(r -> new Thread(r, "pc-socket-write-" + id));
    }

    void start() {
      Log.i(TAG, "Socket " + id + " connecting to " + host + ":" + port);
      try {
        connectDeadline = timeouts.schedule(
            () -> finish("Connection timed out"), CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        writer.execute(
            () -> {
              try {
                socket.setTcpNoDelay(true);
                socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
                synchronized (this) {
                  if (closed) return;
                  connectDeadline.cancel(false);
                  callback(id, this, "open", "");
                }
                Log.i(TAG, "Socket " + id + " opened");
                new Thread(this::read, "pc-socket-read-" + id).start();
              } catch (IOException | RuntimeException error) {
                finish("Connect failed: " + error.getClass().getSimpleName() + ": " + error.getMessage());
              }
            });
      } catch (RejectedExecutionException error) {
        finish("Socket bridge shutting down");
      }
    }

    void send(byte[] bytes) {
      synchronized (this) {
        if (closed || bytes.length == 0) return;
        if (queuedBytes + bytes.length > MAX_QUEUED_BYTES) {
          finish("Socket send queue full");
          return;
        }
        queuedBytes += bytes.length;
        try {
          // Connect and all writes use one executor, preserving JavaScript send order.
          writer.execute(
              () -> {
                try {
                  synchronized (this) { if (closed) return; }
                  OutputStream output = socket.getOutputStream();
                  output.write(bytes);
                  output.flush();
                  synchronized (this) { sentBytes += bytes.length; }
                } catch (IOException | RuntimeException error) {
                  finish("Send failed: " + error.getMessage());
                } finally {
                  synchronized (this) { queuedBytes -= bytes.length; }
                }
              });
        } catch (RejectedExecutionException error) {
          queuedBytes -= bytes.length;
          finish("Socket bridge shutting down");
        }
      }
    }

    void read() {
      byte[] buffer = new byte[64 * 1024];
      try {
        InputStream input = socket.getInputStream();
        int count;
        while ((count = input.read(buffer)) != -1) {
          if (count == 0) continue;
          synchronized (this) {
            if (closed) return;
            receivedBytes += count;
            callback(id, this, "data", Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP));
          }
        }
        finish(null);
      } catch (IOException | RuntimeException error) {
        finish("Receive failed: " + error.getMessage());
      }
    }

    void finish(String error) {
      synchronized (this) {
        if (closed) return;
        closed = true;
        if (connectDeadline != null) connectDeadline.cancel(false);
        if (error != null) callback(id, this, "error", error);
        callback(id, this, "close", "");
      }
      try { socket.close(); } catch (IOException ignored) { }
      writer.shutdownNow();
      synchronized (connectionsLock) { connections.remove(id, this); }
      Log.i(TAG, "Socket " + id + " closed; sent=" + sentBytes + ", received=" + receivedBytes
          + (error == null ? "" : ", " + error));
    }
  }
}
