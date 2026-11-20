package com.rbabbit.blocknight.warzone;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;
import org.json.JSONException;
import org.json.JSONArray;

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
  private static final String PLAYER_NAME_SUFFIX = "(m)";
  private static final String DEFAULT_PLAYER_NAME = "Player" + PLAYER_NAME_SUFFIX;
  private static final String NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested";
  private static final int NOTIFICATION_PERMISSION_REQUEST = 8701;

  private final Object connectionsLock = new Object();
  private final Map<Integer, Connection> connections = new ConcurrentHashMap<>();
  private final AtomicBoolean destroyed = new AtomicBoolean();
  private CronetLobbyHttp lobbyHttp;
  private final ScheduledExecutorService timeouts =
      Executors.newSingleThreadScheduledExecutor(r -> new Thread(r, "pc-socket-timeouts"));
  private MultiplayerWebView webView;
  private BattleControls battleControls;
  private MultiplayerLobbyView nativeLobby;
  private String landingGeneration = "";
  private volatile boolean landingPageReady;
  private FrameLayout root;
  private View.OnLayoutChangeListener viewportListener;
  private SharedPreferences playerPreferences;
  private BlueprintStore blueprints;
  private String savedPlayerName = DEFAULT_PLAYER_NAME;
  private final Object playerProfileLock = new Object();
  private boolean engineViewportActive;
  private float commandStripCssHeight = DEFAULT_COMMAND_STRIP_CSS_HEIGHT;
  private AlertDialog leaveDialog;
  private volatile boolean sessionActive;
  private volatile boolean activityResumed;
  private final Object sessionProtectionLock = new Object();
  private boolean sessionServiceStarted;
  private boolean backgroundPulsePending;
  private final Handler lifecycleHandler = new Handler(Looper.getMainLooper());
  private ConnectivityManager connectivity;
  private ConnectivityManager.NetworkCallback networkCallback;
  private final Runnable backgroundPulse = new Runnable() {
    @Override public void run() {
      if (destroyed.get() || !sessionActive || activityResumed || webView == null) return;
      if (!backgroundPulsePending) {
        backgroundPulsePending = true;
        webView.evaluateJavascript("window.PcMultiplayerSession?.backgroundPulse?.()",
            ignored -> backgroundPulsePending = false);
      }
      lifecycleHandler.postDelayed(this, 33);
    }
  };
  private static final class RoomBackState {
    static final RoomBackState EMPTY = new RoomBackState("", false, false, false);
    final String generation;
    final boolean active, optionsOpen, chatFocused;
    RoomBackState(String generation, boolean active, boolean optionsOpen, boolean chatFocused) {
      this.generation = generation;
      this.active = active;
      this.optionsOpen = optionsOpen;
      this.chatFocused = chatFocused;
    }
  }
  private volatile RoomBackState roomBackState = RoomBackState.EMPTY;
  private String lastRoomViewportKey = "";
  private String lastRoomViewportGeneration = "";
  private long roomViewportRevision;
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
    blueprints = new BlueprintStore(this);
    restorePlayerName();
    musicPreferences = getSharedPreferences(MUSIC_PROFILE, MODE_PRIVATE);
    musicStore = new MusicPackStore(this);
    musicIndex = new MapMusicIndex(this, new MusicTrackCatalog(this));
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
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
    lobbyHttp = new CronetLobbyHttp(getApplicationContext(), (id, status, headers, body, error, claim) ->
        httpCallback(id, status, headers, Base64.encodeToString(body, Base64.NO_WRAP), error, claim),
        this::lobbyNetworkSummary);
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
              if (response != null) {
                response.setResponseHeaders(isolationHeaders());
                if ("ui/game-controls/click.ogg".equals(path)) response.setMimeType("audio/ogg");
              }
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
          public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            if (battleControls != null) battleControls.reset();
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            Log.i(TAG, "Page ready: " + url);
            if (battleControls != null) battleControls.pageReady(url);
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
    battleControls = BattleControls.attach(root, webView, script -> webView.evaluateJavascript(script, null));
    nativeLobby = new MultiplayerLobbyView(this, new MultiplayerLobbyView.Actions() {
      public void filter(boolean hide) { landingCall("setHideEmpty(" + hide + ")"); }
      public boolean saveName(String base) { return saveLandingName(base); }
      public void join(String id) { landingCall("join(" + JSONObject.quote(id) + ")"); }
    }, playerNameBase(savedPlayerName));
    root.addView(nativeLobby, new FrameLayout.LayoutParams(-1, -1));
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
    observeDirectoryNetwork();
    Log.i(TAG, "Separate PC multiplayer test shell started");
  }

  private boolean saveLandingName(String base) {
    try {
      JSONObject result = new JSONObject(new Navigation().setPlayerName(base));
      if (result.optBoolean("ok")) { nativeLobby.acceptedName(result.optString("baseName",base));return true; }
      nativeLobby.profileError(result.optString("error", "Could not save your player name."));
    } catch (JSONException error) {
      nativeLobby.profileError("Could not save your player name. Please try again.");
    }
    return false;
  }

  private void landingCall(String method) {
    if (destroyed.get() || sessionActive || !landingPageReady || webView == null) return;
    webView.evaluateJavascript("window.PcNativeLobby?." + method, null);
  }

  private void showNativeLanding() {
    if (nativeLobby == null || destroyed.get()) return;
    nativeLobby.setVisibility(View.VISIBLE);
    nativeLobby.bringToFront();
  }

  private static List<MultiplayerLobbyModel.Room> landingRooms(JSONArray rows) {
    List<MultiplayerLobbyModel.Room> rooms = new ArrayList<>();
    if (rows == null) return rooms;
    for (int i=0;i<Math.min(1000,rows.length());i++) {
      JSONObject row=rows.optJSONObject(i);if(row==null)continue;
      JSONObject players=row.optJSONObject("players");if(players==null)continue;
      try {
        Integer current=players.isNull("current")?null:players.getInt("current");
        rooms.add(new MultiplayerLobbyModel.Room(row.getString("id"),row.optString("map",""),row.optString("name",""),
            current,players.getInt("max"),row.optBoolean("compatible"),row.optBoolean("ipv4Tcp"),row.optBoolean("private")));
      } catch (JSONException | IllegalArgumentException invalid) { /* Ignore malformed advertised rows. */ }
    }
    return rooms;
  }

  private static boolean isLocal(Uri uri) {
    return "https".equalsIgnoreCase(uri.getScheme())
        && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
        && (uri.getPort() == -1 || uri.getPort() == 443)
        && uri.getUserInfo() == null;
  }

  private static boolean sharedRenderer(String path) {
    return "warzone-command-pages.js".equals(path) || "warzone-mobile-research.js".equals(path)
        || "warzone-terrain-picker.js".equals(path) || "warzone-intelligence.js".equals(path)
        || "warzone-towers-notices.js".equals(path);
  }

  private static boolean sharedUiAsset(String path) {
    if (path == null || path.contains("..") || path.contains("\\") || path.contains("%")
        || path.indexOf('\0') >= 0 || path.startsWith("/")) return false;
    if ("ui/game-controls/click.ogg".equals(path)) return true;
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
    @JavascriptInterface public String loadDesigns() { return blueprints.load(); }
    @JavascriptInterface public boolean importLegacyDesigns(String data) { return blueprints.importLegacy(data); }
    @JavascriptInterface public boolean importNativeTemplates(String data) { return blueprints.importNativeTemplates(data); }
    @JavascriptInterface public String writeDesign(String data) { return blueprints.write(data); }
    @JavascriptInterface public String deleteDesign(String id) { return blueprints.delete(id); }

    @JavascriptInterface public void setSessionActive(boolean active) {
      // This bridge call completes before the joining script proceeds. Back
      // must never wait for a JS callback behind a busy native engine frame.
      boolean wasActive = sessionActive;
      sessionActive = active;
      // The Join bridge completes before JS creates the engine. Request Android
      // protection here, so an immediate Home cannot overtake a posted UI task.
      if (active) startSessionProtectionFromJoin();
      runOnUiThread(() -> { syncSessionProtection();publishActivityState(); });
      if (!active && wasActive) landingPageReady = false;
      cacheRoomBackState(RoomBackState.EMPTY);
      synchronized (musicPreferenceLock) {
        if (active && musicSession.isEmpty()) musicSession = java.util.UUID.randomUUID().toString();
        if (!active) musicSession = "";
      }
      if (!active) runOnUiThread(() -> {
        if (!sessionActive) { dismissLeaveDialog();showNativeLanding();if(wasActive&&nativeLobby!=null)nativeLobby.pending(true,"Returning to lobby…"); }
      });
    }
    @JavascriptInterface public void landingReady(String generation) {
      if (generation == null || generation.isEmpty() || generation.length()>160) return;
      runOnUiThread(() -> {
        if (destroyed.get() || sessionActive) return;
        landingGeneration=generation;landingPageReady=true;showNativeLanding();
      });
    }
    @JavascriptInterface public void landingState(String generation,String json) {
      if (json == null || json.length()>MAX_HTTP_BYTES || generation == null) return;
      final JSONObject state;
      try { state=new JSONObject(json); } catch(JSONException invalid) { return; }
      List<MultiplayerLobbyModel.Room> rooms=landingRooms(state.optJSONArray("games"));
      runOnUiThread(() -> {
        if(destroyed.get()||sessionActive||!landingPageReady||!generation.equals(landingGeneration))return;
        nativeLobby.state(true,state.optBoolean("loading"),state.optBoolean("hideEmpty"),rooms,
            state.optString("error",""),state.optString("notice",""));showNativeLanding();
      });
    }
    @JavascriptInterface public void landingSessionStarted(String generation) {
      runOnUiThread(() -> {
        if(destroyed.get()||!sessionActive||generation==null||!generation.equals(landingGeneration))return;
        nativeLobby.setVisibility(View.GONE);webView.setVisibility(View.VISIBLE);webView.requestFocus();
      });
    }
    @JavascriptInterface public void setRoomBackState(String generation, boolean active,
        boolean optionsOpen, boolean chatFocused) {
      String token = generation == null ? "" : generation;
      if (!active) {
        RoomBackState current = roomBackState;
        if (token.isEmpty() || current.generation.equals(token)) cacheRoomBackState(RoomBackState.EMPTY);
        return;
      }
      if (!sessionActive || token.isEmpty() || token.length() > 128
          || token.codePoints().anyMatch(Character::isISOControl)) return;
      cacheRoomBackState(new RoomBackState(token, true, optionsOpen, chatFocused));
    }
    @JavascriptInterface public String getPlayerName() {
      synchronized (playerProfileLock) {
        return savedPlayerName;
      }
    }
    @JavascriptInterface public String getPlayerBaseName() {
      synchronized (playerProfileLock) {
        return playerNameBase(savedPlayerName);
      }
    }
    @JavascriptInterface public String setPlayerName(String supplied) {
      String baseName = playerNameBase(supplied);
      String name = baseName + PLAYER_NAME_SUFFIX;
      String error = supplied != null && supplied.codePoints().anyMatch(Character::isISOControl)
          ? "Use a valid player name without control characters." : playerNameError(baseName);
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
          return new JSONObject().put("ok", ok).put("name", name).put("baseName", baseName).put("error", error).toString();
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
    /** Native terminal reports only; leaving, joining and spectating never count. */
    @JavascriptInterface public void playGamesEvent(String session, String json) {
      if (destroyed.get() || !sessionActive || session == null || json == null || json.length() > 32768) return;
      synchronized (musicPreferenceLock) {
        if (session.isEmpty() || !session.equals(musicSession)) return;
      }
      try {
        JSONObject event = new JSONObject(json);
        String runId = event.optString("runId", "");
        int player = event.optInt("localPlayer", -1), players = event.optInt("players", 0);
        long elapsed = event.optLong("elapsedMs", -1);
        String map = event.optString("map", "");
        if (!"match_finished".equals(event.optString("kind"))
            || !"multiplayer".equals(event.optString("mode"))
            || !"native-gameover-report".equals(event.optString("source"))
            || !event.optBoolean("verifiedResult") || !event.optBoolean("nativeCompleted")
            || event.optBoolean("spectator", true) || !(event.opt("won") instanceof Boolean)
            || !runId.startsWith("mp-" + session + "-") || runId.length() > 220
            || !(runId + ":finished").equals(event.optString("eventId"))
            || player < 0 || player >= 10 || players < 2 || players > 10 || elapsed <= 0
            || map.isEmpty() || map.length() > 160 || map.codePoints().anyMatch(Character::isISOControl)) return;
        // Local native proof can unlock personal achievements, never a verified
        // global online board. No account sign-in or cloud operation happens here.
        event.put("serverVerified", false).put("difficulty", "online");
        String owner = getSharedPreferences("optional_play_games_v1", MODE_PRIVATE).getString("lastAccount", "");
        new PlayGamesProgressStore(MultiplayerActivity.this).recordEvent(owner, event);
      } catch (Exception unavailable) {
        Log.w(TAG, "Optional multiplayer progress could not be recorded");
      }
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

  private void restorePlayerName() {
    String stored = playerPreferences.getString(PLAYER_NAME, DEFAULT_PLAYER_NAME);
    String name = migratedPlayerName(stored);
    synchronized (playerProfileLock) {
      savedPlayerName = name;
      if (!name.equals(stored)) playerPreferences.edit().putString(PLAYER_NAME, name).commit();
    }
  }

  private static String playerNameBase(String supplied) {
    String base = supplied == null ? "" : supplied.trim();
    while (base.length() >= PLAYER_NAME_SUFFIX.length()
        && base.regionMatches(true, base.length() - PLAYER_NAME_SUFFIX.length(),
            PLAYER_NAME_SUFFIX, 0, PLAYER_NAME_SUFFIX.length())) {
      base = base.substring(0, base.length() - PLAYER_NAME_SUFFIX.length()).trim();
    }
    return base;
  }

  private static String migratedPlayerName(String stored) {
    String base = playerNameBase(stored);
    int count = base.codePointCount(0, base.length());
    if (count > 12) base = base.substring(0, base.offsetByCodePoints(0, 12)).trim();
    if (!playerNameError(base).isEmpty()) return DEFAULT_PLAYER_NAME;
    return base + PLAYER_NAME_SUFFIX;
  }

  /** Twelve code points plus the fixed suffix fit native PLAYER.name's 63-byte payload. */
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
          || (type == Character.SPACE_SEPARATOR && point != ' ')
          || (point < 128 && !(point >= 'a' && point <= 'z')
              && !(point >= 'A' && point <= 'Z') && !(point >= '0' && point <= '9')
              && point != ' ' && point != '-' && point != '+' && point != '_'
              && point != '[' && point != ']')) {
        return "Use letters, numbers, spaces, - + _ or brackets.";
      }
      offset += Character.charCount(point);
    }
    if (!name.equals(name.trim()) || name.contains("  ")) return "Use single spaces between words.";
    if (name.codePointCount(0, name.length()) > 12) return "Use a player name up to 12 characters.";
    return "";
  }

  private void cacheRoomBackState(RoomBackState next) {
    RoomBackState before = roomBackState;
    roomBackState = next;
    if ((before.active != next.active || !before.generation.equals(next.generation))
        && root != null && !destroyed.get()) root.post(this::fitViewport);
  }

  /** Room HTML uses normal density/IME bounds; the game keeps its virtual minimum. */
  private void fitViewport() {
    if (root == null || webView == null || destroyed.get()) return;
    int width = root.getWidth() - root.getPaddingLeft() - root.getPaddingRight();
    int height = root.getHeight() - root.getPaddingTop() - root.getPaddingBottom();
    if (width <= 0 || height <= 0) return;
    RoomBackState room = roomBackState;
    boolean keyboardVisible = isKeyboardVisible();
    float density = getResources().getDisplayMetrics().density;
    float reserved = engineViewportActive ? commandStripCssHeight : DEFAULT_COMMAND_STRIP_CSS_HEIGHT;
    float scale = room.active ? 1f : viewportScale(width, height, density, reserved);
    if (room.active && keyboardVisible) {
      Rect visible = new Rect();
      root.getWindowVisibleDisplayFrame(visible);
      int bottom = visible.bottom;
      if (Build.VERSION.SDK_INT >= 30 && root.getRootWindowInsets() != null) {
        int ime = root.getRootWindowInsets().getInsets(android.view.WindowInsets.Type.ime()).bottom;
        if (ime > 0) bottom = Math.min(bottom,
            getWindowManager().getCurrentWindowMetrics().getBounds().bottom - ime);
      }
      int[] location = new int[2];root.getLocationOnScreen(location);
      height = roomViewportHeight(root.getHeight(), root.getPaddingTop(), root.getPaddingBottom(),
          location[1], bottom, true);
    }
    int virtualWidth = (int) Math.ceil(width / scale);
    int virtualHeight = (int) Math.ceil(height / scale);
    FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) webView.getLayoutParams();
    int gravity = Gravity.TOP | Gravity.START;
    if (params.width != virtualWidth || params.height != virtualHeight || params.gravity != gravity) {
      params.width = virtualWidth;params.height = virtualHeight;params.gravity = gravity;
      webView.setLayoutParams(params);
    }
    if (webView.getScaleX() != scale) webView.setScaleX(scale);
    if (webView.getScaleY() != scale) webView.setScaleY(scale);
    publishRoomViewport(room, virtualWidth / density, virtualHeight / density, keyboardVisible);
  }

  private static int roomViewportHeight(int rootHeight, int top, int bottom, int originY,
      int visibleBottom, boolean keyboardVisible) {
    int full = Math.max(1, rootHeight - top - bottom);
    int visible = visibleBottom - originY - top - bottom;
    return keyboardVisible && visible > 0 ? Math.min(full, visible) : full;
  }

  private void publishRoomViewport(RoomBackState room, float width, float height, boolean keyboardVisible) {
    if (!room.active && lastRoomViewportGeneration.isEmpty()) return;
    String generation = room.active ? room.generation : lastRoomViewportGeneration;
    String key = generation + ":" + room.active + ":" + width + ":" + height + ":" + keyboardVisible;
    if (key.equals(lastRoomViewportKey)) return;
    lastRoomViewportKey = key;
    if (room.active) lastRoomViewportGeneration = generation;else lastRoomViewportGeneration = "";
    try {
      String detail = new JSONObject().put("generation", generation).put("roomActive", room.active)
          .put("width", width).put("height", height).put("offsetLeft", 0).put("offsetTop", 0)
          .put("keyboardVisible", keyboardVisible).put("revision", ++roomViewportRevision).toString();
      webView.post(() -> {
        if (webView == null || destroyed.get()) return;
        RoomBackState current = roomBackState;
        if (room.active ? !current.active || !current.generation.equals(generation) : current.active) return;
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('warzone-multiplayer-viewport',{detail:"
            + detail + "}))", null);
      });
    } catch (JSONException impossible) {
      Log.w(TAG, "Room viewport could not be published", impossible);
    }
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
    @Override protected void onWindowVisibilityChanged(int visibility) {
      // Chromium normally hides the page here and stops the stock engine's RAF
      // network pump. Preserve it only while a real user-started session lives.
      super.onWindowVisibilityChanged(sessionActive && !destroyed.get() ? View.VISIBLE : visibility);
    }
    void syncSessionVisibility() {
      super.onWindowVisibilityChanged(sessionActive && !destroyed.get() ? View.VISIBLE : getWindowVisibility());
    }
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

  private boolean handleRoomBack() {
    RoomBackState room = roomBackState;
    if (!sessionActive || !room.active || (!room.chatFocused && !room.optionsOpen)) return false;
    // Decide synchronously from the room's bridge cache. Never queue a JS query
    // whose delayed answer could open a leave dialog over a later room/game.
    roomBackState = new RoomBackState(room.generation, true,
        room.chatFocused && room.optionsOpen, false);
    webView.evaluateJavascript("window.PcMultiplayerRoomUI?.handleBack("
        + JSONObject.quote(room.generation) + ")", null);
    return true;
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
      if (handleRoomBack()) return;
      if (!sessionActive) { if(nativeLobby!=null&&nativeLobby.getVisibility()==View.VISIBLE)saveLandingName(nativeLobby.draft());finish(); return; }
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
    syncSessionProtection();
    landingPageReady = false;
    showNativeLanding();
    if(nativeLobby!=null)nativeLobby.pending(true,"Returning to lobby…");
    cacheRoomBackState(RoomBackState.EMPTY);
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

  private void publishActivityState() {
    if (webView == null || destroyed.get()) return;
    webView.evaluateJavascript("window.PcMultiplayerSession?.setBackground?.(" + !activityResumed + ")", null);
  }

  private void syncSessionProtection() {
    lifecycleHandler.removeCallbacks(backgroundPulse);
    if (webView != null) webView.syncSessionVisibility();
    synchronized (sessionProtectionLock) {
      if (!sessionActive || destroyed.get()) {
        backgroundPulsePending = false;
        if (sessionServiceStarted) stopService(new Intent(this, MultiplayerSessionService.class));
        sessionServiceStarted = false;
        return;
      }
      Intent protection = new Intent(this, MultiplayerSessionService.class)
          .putExtra(MultiplayerSessionService.BACKGROUND, !activityResumed);
      try {
        if (!sessionServiceStarted) {
          // A restricted start can be retried when the same Activity resumes.
          if (activityResumed) { startForegroundService(protection);sessionServiceStarted = true; }
        } else startService(protection);
      } catch (RuntimeException restricted) {
        Log.w(TAG, "Android did not allow multiplayer background protection", restricted);
      }
    }
    if (sessionActive && !activityResumed) lifecycleHandler.post(backgroundPulse);
  }

  private void startSessionProtectionFromJoin() {
    synchronized (sessionProtectionLock) {
      if (destroyed.get() || !sessionActive || sessionServiceStarted) return;
      try {
        startForegroundService(new Intent(this, MultiplayerSessionService.class)
            .putExtra(MultiplayerSessionService.BACKGROUND, !activityResumed));
        sessionServiceStarted = true;
      } catch (RuntimeException restricted) {
        Log.w(TAG, "Android did not allow multiplayer protection at Join", restricted);
      }
    }
  }

  private void observeDirectoryNetwork() {
    connectivity = getSystemService(ConnectivityManager.class);
    if (connectivity == null) return;
    networkCallback = new ConnectivityManager.NetworkCallback() {
      @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
        if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
          runOnUiThread(() -> { if (activityResumed && !sessionActive) landingCall("resume()"); });
        }
      }
    };
    try { connectivity.registerDefaultNetworkCallback(networkCallback); }
    catch (RuntimeException unavailable) { networkCallback = null;Log.w(TAG, "Network resume observation unavailable", unavailable); }
  }

  @Override
  protected void onPause() {
    activityResumed = false;
    syncSessionProtection();publishActivityState();
    musicSuspended = true;
    multiplayerMusicLifecycle("suspend");
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    activityResumed = true;
    syncSessionProtection();publishActivityState();
    musicSuspended = false;
    multiplayerMusicLifecycle("resume");
    if (!sessionActive) landingCall("resume()");
    if (root != null) root.post(this::fitViewport);
    requestMultiplayerNotificationsIfNeeded();
  }

  private void requestMultiplayerNotificationsIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
        || destroyed.get() || isFinishing()
        || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        || playerPreferences.getBoolean(NOTIFICATION_PERMISSION_REQUESTED, false)) return;
    // Ask on the UI thread when Multiplayer opens, before a live Join can be
    // interrupted. Persist first so denial, dismissal and resume never loop.
    playerPreferences.edit().putBoolean(NOTIFICATION_PERMISSION_REQUESTED, true).apply();
    requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == NOTIFICATION_PERMISSION_REQUEST && grantResults.length > 0
        && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      // Refresh an already-live session's notification; this does not start a
      // session or repeat the user's Join action.
      syncSessionProtection();
    }
  }

  @Override
  protected void onDestroy() {
    multiplayerMusicLifecycle("dispose");
    destroyed.set(true);
    sessionActive = false;
    syncSessionProtection();
    if (connectivity != null && networkCallback != null) {
      try { connectivity.unregisterNetworkCallback(networkCallback); } catch (RuntimeException ignored) { }
      networkCallback = null;
    }
    cacheRoomBackState(RoomBackState.EMPTY);
    if (leaveDialog != null) {
      leaveDialog.dismiss();
      leaveDialog = null;
    }
    for (Connection connection : connections.values()) connection.finish(null);
    timeouts.shutdownNow();
    if (lobbyHttp != null) lobbyHttp.close();
    if (root != null && viewportListener != null) root.removeOnLayoutChangeListener(viewportListener);
    if (battleControls != null) {
      battleControls.detach(root);
      battleControls = null;
    }
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

  /** Keep the engine's official URL, signed bytes and custom Origin unchanged. */
  public final class NativeHttp {
    @JavascriptInterface
    public void request(int id, String method, String url, String headersJson, String bodyBase64) {
      if (!destroyed.get() && lobbyHttp != null) lobbyHttp.request(id, method, url, headersJson, bodyBase64);
    }
    @JavascriptInterface
    public void cancel(int id) { if (lobbyHttp != null) lobbyHttp.cancel(id); }
  }

  private String lobbyNetworkSummary() {
    try {
      ConnectivityManager manager = getSystemService(ConnectivityManager.class);
      NetworkCapabilities caps = manager == null ? null : manager.getNetworkCapabilities(manager.getActiveNetwork());
      if (caps == null) return "none";
      String transport = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ? "vpn"
          : caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "cellular"
          : caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi" : "other";
      return transport + (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ? "-validated" : "-unvalidated");
    } catch (RuntimeException unavailable) { return "unavailable"; }
  }

  private void httpCallback(int id, int status, String headers, String bodyBase64, String error, BooleanSupplier claim) {
    if (destroyed.get()) return;
    runOnUiThread(
        () -> {
          if (destroyed.get() || webView == null || !claim.getAsBoolean()) return;
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
