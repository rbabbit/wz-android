package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

/** Android shell for the official Warzone 2100 4.7 WebAssembly engine. */
public final class MainActivity extends Activity {
    private static final String TAG = "BlockNightWZ";
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String URL = ORIGIN + "/warzone/mobile.html?blocknight=1";
    private static final float MIN_ENGINE_CSS_WIDTH = 642f;
    private static final float MIN_ENGINE_CSS_HEIGHT = 482f;

    private FrameLayout root;
    private WebView webView;
    private TowersNativeUi nativeUi;
    private FrameLayout loadingOverlay;
    private TextView loading;
    private ProgressBar loadingSpinner;
    private WebViewAssetLoader assetLoader;
    private View.OnLayoutChangeListener viewportListener;
    private boolean touchTestMode;
    private boolean touchSuiteMode;
    private boolean researchSuiteMode;
    private boolean isolationAllowlistAvailable;
    private boolean startupAutomationStarted;
    private String webViewVersion = "unknown";
    private GraphicsPackStore graphicsStore;
    private GraphicsSetupView graphicsSetup;
    private String graphicsMode = "normal";
    private String mapId = "td2";
    private MusicPackStore musicStore;
    private MusicSetupView musicSetup;
    private MusicTrackCatalog musicCatalog;
    private boolean musicEnabled, musicCached;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::onBackPressed);
        }
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        touchTestMode = getIntent().getBooleanExtra("touch_test", false);
        touchSuiteMode = getIntent().getBooleanExtra("touch_suite", false);
        researchSuiteMode = getIntent().getBooleanExtra("research_suite", false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        createWebView();
        graphicsStore = new GraphicsPackStore(this);
        musicStore = new MusicPackStore(this);
        musicCatalog = new MusicTrackCatalog(this);
        musicEnabled = getPreferences(MODE_PRIVATE).getBoolean("music_enabled", false);
        graphicsMode = getPreferences(MODE_PRIVATE).getString("graphics_mode", "normal");
        String requestedMap = getIntent().getStringExtra("map");
        mapId = "td1".equals(requestedMap != null ? requestedMap : getPreferences(MODE_PRIVATE).getString("map_id", "td2")) ? "td1" : "td2";
        showGraphicsSetup();
    }

    private void showGraphicsSetup() {
        graphicsSetup = new GraphicsSetupView(this, graphicsMode, mapId, new GraphicsSetupView.Actions() {
            @Override public void start(String mode, String map) { mapId=map;startWithGraphics(mode); }
            @Override public void cancel() { graphicsStore.cancel(); }
            @Override public void music() { showMusicSetup(); }
            @Override public void download() { downloadGraphics(); }
            @Override public void map(String id) { mapId=id;getPreferences(MODE_PRIVATE).edit().putString("map_id",id).apply(); }
        });
        root.addView(graphicsSetup, new FrameLayout.LayoutParams(-1, -1));
        graphicsStore.inspect(cached -> {
            if (graphicsSetup != null && !isFinishing()) graphicsSetup.setCached(cached);
        });
        inspectMusic();
    }

    private void inspectMusic() {
        musicStore.inspect(cached -> {
            musicCached = cached;
            if (!cached) musicEnabled = false;
            if (graphicsSetup != null && !isFinishing()) graphicsSetup.setMusicState(cached, musicEnabled);
            if (musicSetup != null && !isFinishing()) musicSetup.setCached(cached, musicEnabled);
        });
    }

    private void showMusicSetup() {
        if (musicSetup != null) return;
        if (graphicsSetup != null) graphicsSetup.setVisibility(View.GONE);
        musicSetup = new MusicSetupView(this, musicCatalog, selectedMusicTracks(), new MusicSetupView.Actions() {
            @Override public void download() { downloadMusic(); }
            @Override public void cancel() { musicStore.cancel(); }
            @Override public void enabled(boolean on) {
                musicEnabled = musicCached && on;
                getPreferences(MODE_PRIVATE).edit().putBoolean("music_enabled", musicEnabled).apply();
            }
            @Override public void close() { closeMusicSetup(); }
            @Override public void tracks(Set<String> selected) {
                getPreferences(MODE_PRIVATE).edit().putStringSet("music_tracks",new HashSet<>(selected)).apply();
            }
            @Override public void start() {
                String mode=graphicsSetup != null ? graphicsSetup.selectedMode() : graphicsMode;
                closeMusicSetup();startWithGraphics(mode);
            }
        });
        musicSetup.setCached(musicCached, musicEnabled);
        root.addView(musicSetup, new FrameLayout.LayoutParams(-1, -1));
    }

    private void downloadMusic() {
        if (musicSetup != null) musicSetup.progress(0, false);
        musicStore.download(new OptionalPackStore.Listener() {
            @Override public void progress(long bytes, boolean verifying) {
                if (musicSetup != null) musicSetup.progress(bytes, verifying);
            }
            @Override public void ready() {
                musicCached = true; musicEnabled = musicEnabled && !selectedMusicTracks().isEmpty();
                getPreferences(MODE_PRIVATE).edit().putBoolean("music_enabled", musicEnabled).apply();
                if (musicSetup != null) musicSetup.ready(musicEnabled);
                if (graphicsSetup != null) graphicsSetup.setMusicState(true, musicEnabled);
            }
            @Override public void failed(String message) {
                if (musicSetup != null) musicSetup.failed(message);
            }
        });
    }

    private void closeMusicSetup() {
        musicStore.cancel();
        if (musicSetup != null) { root.removeView(musicSetup); musicSetup = null; }
        if (graphicsSetup != null) graphicsSetup.setVisibility(View.VISIBLE);
        inspectMusic();
    }

    private void startWithGraphics(String mode) {
        if (musicEnabled && musicCached && selectedMusicTracks().isEmpty()) {
            showMusicSetup();return;
        }
        graphicsMode = "high".equals(mode) ? "high" : "normal";
        if ("normal".equals(graphicsMode) || graphicsStore.readyFile()!=null) { graphicsStore.cancel();launchGame();return; }
        if (graphicsSetup!=null) graphicsSetup.showError("Download the HQ pack, or choose Normal to play offline.");
    }

    private void downloadGraphics() {
        if (graphicsSetup != null) graphicsSetup.downloadProgress(0, false);
        graphicsStore.download(new GraphicsPackStore.Listener() {
            @Override public void progress(long bytes, boolean verifying) {
                if (graphicsSetup != null) graphicsSetup.downloadProgress(bytes, verifying);
            }
            @Override public void ready() { if(graphicsSetup!=null){graphicsSetup.setDownloading(false);graphicsSetup.setCached(true);graphicsSetup.showStatus("HQ ready offline. Choose your graphics and play.",false);} }
            @Override public void failed(String message) {
                if (graphicsSetup != null) graphicsSetup.showError(message);
            }
        });
    }

    private void launchGame() {
        nativeUi.resetForBattle();
        getPreferences(MODE_PRIVATE).edit().putString("graphics_mode", graphicsMode).putString("map_id", mapId).apply();
        if (graphicsSetup != null) { root.removeView(graphicsSetup); graphicsSetup = null; }
        createLoadingPanel();
        webView.loadUrl(gameUrl());
    }

    private Set<String> selectedMusicTracks() {
        Set<String> allowed=musicCatalog.allIds();
        Set<String> selected=new HashSet<>(getPreferences(MODE_PRIVATE).getStringSet("music_tracks",Collections.emptySet()));
        selected.retainAll(allowed);return selected;
    }

    private String gameUrl() {
        String url = URL + "&map=" + mapId + "&graphics=" + graphicsMode + "&music=" + (musicEnabled && musicCached ? "1" : "0");
        if (getIntent().getBooleanExtra("graphics_probe", false)) url += "&graphics_probe=1";
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                || getIntent().getBooleanExtra("music_probe", false)) url += "&music_probe=1";
        return url;
    }

    private void createWebView() {
        webView = new EngineWebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        webView.setLongClickable(false);
        webView.setOnLongClickListener(view -> true);
        webView.setHapticFeedbackEnabled(false);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.addJavascriptInterface(new EngineBridge(), "BlockNightAndroid");
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/warzone/", new WarzoneAssetHandler())
                .build();
        configureIsolationAllowlist();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"appassets.androidplatform.net".equalsIgnoreCase(uri.getHost());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!url.startsWith(ORIGIN + "/warzone/mobile.html")) return;
                verifyEnginePrerequisites();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i("BlockNightWZConsole", message.messageLevel() + " "
                        + message.message() + " (" + message.lineNumber() + ")");
                return true;
            }
        });

        nativeUi = new TowersNativeUi(this, webView);
        root.addView(nativeUi.shell, new FrameLayout.LayoutParams(-1,-1));
        webView.setPivotX(0f);
        webView.setPivotY(0f);
        viewportListener = (view, left, top, right, bottom,
                            oldLeft, oldTop, oldRight, oldBottom) -> fitViewport();
        nativeUi.stage.addOnLayoutChangeListener(viewportListener);
        root.post(this::fitViewport);
    }

    /** Scale only the engine surface above its minimum; Android controls use dp/sp. */
    private void fitViewport() {
        if (root == null || webView == null) return;
        int width = nativeUi.stage.getWidth();
        int height = nativeUi.stage.getHeight();
        if (width <= 0 || height <= 0) return;
        float density = getResources().getDisplayMetrics().density;
        // Warzone's blocker uses inclusive max-width/max-height media queries.
        // Give the unmodified engine a small margin above its documented minimum.
        float scale = Math.min(1f, Math.min(width / (MIN_ENGINE_CSS_WIDTH * density),
                height / (MIN_ENGINE_CSS_HEIGHT * density)));
        int virtualWidth = (int) Math.ceil(width / scale);
        int virtualHeight = (int) Math.ceil(height / scale);
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) webView.getLayoutParams();
        int gravity = Gravity.TOP | Gravity.START;
        // The root's layout callback also runs when its bounds have not changed.
        // Reapplying identical child parameters requests another layout, which
        // otherwise creates a continuous layout loop during play and loading.
        if (params.width != virtualWidth || params.height != virtualHeight || params.gravity != gravity) {
            params.width = virtualWidth;
            params.height = virtualHeight;
            params.gravity = gravity;
            webView.setLayoutParams(params);
        }
        if (webView.getScaleX() != scale) webView.setScaleX(scale);
        if (webView.getScaleY() != scale) webView.setScaleY(scale);
    }

    private void createLoadingPanel() {
        if (loadingOverlay != null) root.removeView(loadingOverlay);

        loadingOverlay = new FrameLayout(this);
        loadingOverlay.setBackgroundColor(0xFF08110C);
        // Loading taps must not reach the covered native lobby or battlefield.
        loadingOverlay.setClickable(true);
        loadingOverlay.setFocusable(true);

        WarzoneSplashView artwork = new WarzoneSplashView(this);
        loadingOverlay.addView(artwork, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable cardBackground = new GradientDrawable();
        cardBackground.setColor(0xE6071215);
        cardBackground.setCornerRadius(dp(9));
        card.setBackground(cardBackground);

        loadingSpinner = new ProgressBar(this, null, android.R.attr.progressBarStyleSmall);
        loadingSpinner.setIndeterminate(true);
        loadingSpinner.getIndeterminateDrawable().setTint(0xFF83CDD1);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(24), dp(24));
        spinnerParams.rightMargin = dp(12);
        card.addView(loadingSpinner, spinnerParams);

        loading = new TextView(this);
        loading.setText("STARTING WARZONE 2100 ENGINE…");
        loading.setTextColor(0xFFF0F5E9);
        loading.setTextSize(12);
        loading.setGravity(Gravity.CENTER_VERTICAL);
        loading.setLetterSpacing(0.04f);
        loading.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        card.addView(loading, statusParams);

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cardParams.setMargins(dp(20), dp(12), dp(20), dp(16));
        loadingOverlay.addView(card, cardParams);
        root.addView(loadingOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loadingOverlay.bringToFront();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void updateLoadingStatus(String detail) {
        if (loading != null) loading.setText(detail);
    }

    private void hideLoadingPanel() {
        if (loadingOverlay != null) {
            root.removeView(loadingOverlay);
            loadingOverlay = null;
        }
        loading = null;
        loadingSpinner = null;
    }

    private void configureIsolationAllowlist() {
        PackageInfo provider = WebView.getCurrentWebViewPackage();
        if (provider != null) {
            webViewVersion = provider.versionName;
        }
        boolean profilesAvailable = WebViewFeature.isFeatureSupported(
                WebViewFeature.MULTI_PROFILE);
        isolationAllowlistAvailable = WebViewFeature.isFeatureSupported(
                WebViewFeature.CROSS_ORIGIN_ISOLATED_ALLOWLIST);
        Log.i(TAG, "WebView " + webViewVersion
                + ", profile=" + profilesAvailable
                + ", cross-origin allowlist=" + isolationAllowlistAvailable);
        try {
            if (profilesAvailable && isolationAllowlistAvailable) {
                WebViewCompat.getProfile(webView).setCrossOriginIsolatedAllowlist(
                        Collections.singleton(ORIGIN));
            }
        } catch (RuntimeException error) {
            Log.w(TAG, "Cross-origin isolation profile unavailable", error);
        }
    }

    private void verifyEnginePrerequisites() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "JSON.stringify({crossOriginIsolated:Boolean(window.crossOriginIsolated),"
                        + "sharedArrayBuffer:typeof SharedArrayBuffer==='function',"
                        + "innerWidth:window.innerWidth,innerHeight:window.innerHeight})",
                result -> Log.i(TAG, "Warzone WebView capabilities: " + result));
        webView.evaluateJavascript("typeof SharedArrayBuffer==='function'", result -> {
            if ("true".equals(result)) {
                installTouchControls();
                installAutoLauncher();
                return;
            }
            String detail = "Android System WebView " + webViewVersion
                    + " does not expose SharedArrayBuffer. "
                    + "Cross-origin allowlist support: " + isolationAllowlistAvailable + ".";
            showEngineFailure(detail);
        });
    }

    private void showEngineFailure(String detail) {
        Log.e(TAG, "Warzone engine unavailable: " + detail);
        if (loading == null) return;
        if (loadingSpinner != null) loadingSpinner.setVisibility(View.GONE);
        loading.setTextColor(0xFFFF8B7B);
        loading.setText("WARZONE ENGINE CANNOT START\n\n" + detail
                + "\n\nThe packaged official engine was not modified.");
    }

    private void installAutoLauncher() {
        // Explicit ADB diagnostic mode gets an isolated save directory and
        // verbose engine logs. Normal launches retain the player's data.
        if (getIntent().getBooleanExtra("engine_debug", false)) {
            webView.evaluateJavascript("(() => {const original=constructWZModuleConfig;"
                    + "constructWZModuleConfig=(args)=>{WZ_CONFIG_DIR_SUFFIX='-emulator-v22';"
                    + "const m=original(args);m.arguments.push('--debug=all');return m;};})()", null);
        }
        String js = "(() => {"
                + "if(window.__blockNightAutoLaunch)return;window.__blockNightAutoLaunch=true;"
                + "if(typeof SharedArrayBuffer!=='function'){"
                + "BlockNightAndroid.engineFailed('SharedArrayBuffer is unavailable');return;}"
                + "const music=document.getElementById('launchOption_loadMusic');"
                + "if(music)music.checked=false;"
                + "const terrain=document.getElementById('launchOption_loadClassicTerrain');"
                + "if(terrain)terrain.checked=false;"
                + "const deadline=Date.now()+90000;const timer=setInterval(()=>{"
                + "const b=document.getElementById('start-button');"
                + "if(b&&!b.disabled){clearInterval(timer);b.click();"
                + "const e=setInterval(()=>{if(window.LaunchedModule?.calledRun){"
                + "clearInterval(e);BlockNightAndroid.engineReady();}},400);"
                + "}else if(Date.now()>deadline){clearInterval(timer);"
                + "BlockNightAndroid.engineFailed('Launcher timeout');}},200);"
                + "})();";
        webView.evaluateJavascript(js, null);
    }

    private void installTouchControls() {
        String[] scripts = {
                "warzone-native-bridge.js",
                "warzone-terrain-picker.js",
                "warzone-command-core.js",
                "warzone-engine-input.js",
                "warzone-research-core.js",
                "warzone-wave-core.js"
        };
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (String script : scripts) {
                try (InputStream input = getAssets().open(script)) {
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                    }
                    output.write('\n');
                }
            }
            webView.evaluateJavascript(
                    "window.__towersNativeSession="+JSONObject.quote(nativeUi.session())+";\n"+new String(output.toByteArray(), StandardCharsets.UTF_8), null);
        } catch (IOException error) {
            Log.e(TAG, "Touch controls unavailable", error);
        }
    }

    public final class EngineBridge {
        @JavascriptInterface public void nativeModel(String json) {
            runOnUiThread(() -> { if(nativeUi!=null) nativeUi.receiveModel(json); });
        }
        @JavascriptInterface public void nativeResult(int id,String json) {
            runOnUiThread(() -> { if(nativeUi!=null) nativeUi.receiveResult(id,json); });
        }
        @JavascriptInterface public void nativeNotice(String session,String message,boolean error) {
            runOnUiThread(() -> { if(nativeUi!=null&&nativeUi.session().equals(session)) nativeUi.notice(message,error); });
        }
        @JavascriptInterface public void nativeNavigate(String session,String page) {
            if(!"help".equals(page)&&!"back".equals(page)) return;
            runOnUiThread(() -> { if(nativeUi!=null&&nativeUi.session().equals(session)){if("help".equals(page))nativeUi.open(page);else if(!nativeUi.back())nativeUi.pauseGame();} });
        }
        @JavascriptInterface public void nativeFreeze(String session,int id,boolean show) {
            runOnUiThread(() -> { if(nativeUi!=null&&nativeUi.session().equals(session)) nativeUi.freeze(id,show); });
        }
        @JavascriptInterface public void nativeFeedback(String session,float x,float y,float width,float height,String kind) {
            if(width<=0||height<=0) return;
            runOnUiThread(() -> { if(nativeUi!=null&&nativeUi.session().equals(session)) nativeUi.feedback(x,y,width,height,kind); });
        }
        @JavascriptInterface public String nativeDiagnostics() {
            // QA reads real Java objects, not WebView's virtual accessibility nodes.
            // This method only exposes geometry and class names, never game mutation.
            java.util.concurrent.FutureTask<String> task=new java.util.concurrent.FutureTask<>(()->nativeUi==null?"{}":nativeUi.diagnostics());
            runOnUiThread(task);
            try{return task.get(2,java.util.concurrent.TimeUnit.SECONDS);}catch(Exception e){return "{}";}
        }
        @JavascriptInterface
        public String loadDesigns() {
            return getPreferences(MODE_PRIVATE).getString("saved_designs_v1", "{\"version\":1,\"designs\":[]}");
        }

        @JavascriptInterface
        public boolean saveDesigns(String data) {
            if (data == null || data.length() > 262144) return false;
            try {
                JSONObject document = new JSONObject(data);
                org.json.JSONArray designs = document.getJSONArray("designs");
                if (document.optInt("version") != 1 || designs.length() > 100) return false;
                for (int i = 0; i < designs.length(); i++) {
                    JSONObject design = designs.getJSONObject(i);
                    for (String key : new String[]{"id", "name", "body", "propulsion"}) {
                        String value = design.getString(key);
                        if (value.isEmpty() || value.length() > 128) return false;
                    }
                    org.json.JSONArray turrets = design.getJSONArray("turrets");
                    if (turrets.length() < 1 || turrets.length() > 3) return false;
                    for (int j = 0; j < turrets.length(); j++) {
                        String value = turrets.getString(j);
                        if (value.isEmpty() || value.length() > 128) return false;
                    }
                }
                return getPreferences(MODE_PRIVATE).edit().putString("saved_designs_v1", document.toString()).commit();
            } catch (Exception error) { return false; }
        }

        @JavascriptInterface
        public String musicSelection() {
            return musicCatalog.selectionJson(selectedMusicTracks());
        }
        @JavascriptInterface
        public void musicFailed(String detail) {
            runOnUiThread(() -> {
                showEngineFailure("Music could not load. " + detail);
                if (loading != null) {
                    loading.append("\n\nTAP HERE TO CONTINUE WITHOUT MUSIC");
                    loading.setOnClickListener(v -> {
                        getPreferences(MODE_PRIVATE).edit().putBoolean("music_enabled", false).apply();
                        recreate();
                    });
                }
            });
        }
        @JavascriptInterface
        public void showNotice(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }
        @JavascriptInterface
        public void graphicsFailed(String detail) {
            runOnUiThread(() -> {
                showEngineFailure("High Quality graphics could not load. " + detail);
                if (loading != null) {
                    loading.append("\n\nTAP HERE TO CHOOSE NORMAL GRAPHICS");
                    loading.setOnClickListener(v -> {
                        getPreferences(MODE_PRIVATE).edit().putString("graphics_mode", "normal").apply();
                        recreate();
                    });
                }
            });
        }
        @JavascriptInterface
        public void engineReady() {
            runOnUiThread(() -> {
                if (getIntent().getBooleanExtra("engine_debug", false)) hideLoadingPanel();
                updateLoadingStatus("CONFIGURING TOWER DEFENSE…");
                webView.requestFocus();
                beginStartupAutomation();
                if (touchTestMode) {
                    webView.postDelayed(MainActivity.this::selectAllUnitsForTouchTest, 30000);
                    webView.postDelayed(MainActivity.this::issueTouchTestOrder, 32000);
                    webView.postDelayed(MainActivity.this::dumpTouchReport, 35000);
                }
                if (touchSuiteMode) {
                    webView.postDelayed(MainActivity.this::runTouchSuite, 30000);
                    webView.postDelayed(MainActivity.this::dumpTouchReport, 33000);
                }
                if (researchSuiteMode) {
                    webView.postDelayed(MainActivity.this::runResearchSuite, 30000);
                    webView.postDelayed(MainActivity.this::dumpResearchReport, 34000);
                }
                webView.postDelayed(MainActivity.this::dumpEngineErrors, 2000);
                webView.postDelayed(MainActivity.this::dumpEngineErrors, 18000);
            });
        }

        @JavascriptInterface
        public void engineFailed(String detail) {
            runOnUiThread(() -> {
                showEngineFailure(detail);
                Toast.makeText(MainActivity.this,
                        "Warzone engine failed: " + detail, Toast.LENGTH_LONG).show();
            });
        }

        @JavascriptInterface
        public void battleFinished(String session) {
            runOnUiThread(() -> { if(nativeUi!=null&&nativeUi.session().equals(session)) showReplayPanel(false); });
        }

        @JavascriptInterface
        public void battleWon(String session) {
            runOnUiThread(() -> { if(nativeUi!=null&&nativeUi.session().equals(session)) showReplayPanel(true); });
        }

    }

    private void showReplayPanel(boolean won) {
        if (root == null || isFinishing() || isDestroyed() || nativeUi==null || !nativeUi.gameReady()) return;
        nativeUi.suspend();
        TextView replay = new TextView(this);
        replay.setText(won ? "WARZONE TOWERS\n\nVICTORY\n\nAll 30 rounds cleared\n\nTap to play again"
                : "WARZONE TOWERS\n\nYOU HAVE FAILED\n\nCommand centre destroyed\n\nTap to try again");
        replay.setTextColor(0xFFF0B43C);
        replay.setTextSize(22);
        replay.setGravity(Gravity.CENTER);
        replay.setBackgroundColor(0xF7030705);
        replay.setClickable(true);
        replay.setOnClickListener(view -> {
            root.removeView(view);
            startupAutomationStarted = false;
            nativeUi.resetForBattle();
            createLoadingPanel();
            webView.loadUrl(gameUrl() + "&replay=" + System.currentTimeMillis());
        });
        root.addView(replay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void dumpEngineErrors() {
        if (webView == null) return;
        webView.evaluateJavascript(
                "JSON.stringify(Array.isArray(window.errorLog)?window.errorLog.slice(-40):[])",
                result -> Log.i(TAG, "Engine error buffer: " + result));
    }

    /**
     * Pace the native lobby interactions from completion callbacks. The engine can block
     * Android's UI thread while changing screens; independently posted delays then collapse
     * into a burst and miss the Limits/Ready controls on high-resolution devices.
     */
    private void beginStartupAutomation() {
        if (startupAutomationStarted || webView == null || isFinishing()) return;
        startupAutomationStarted = true;
        updateLoadingStatus("OPENING THE TOWER DEFENCE MAP…");
        webView.postDelayed(() -> evaluateTouchTapThen(
                170, 392, "Start Hosting", 1500,
                () -> evaluateTouchTapThen(
                        290, 327, "Limits", 1800,
                        () -> {
                            updateLoadingStatus("APPLYING TOWER DEFENSE LIMITS…");
                            decreaseVtolLimit(6);
                        })), 1200);
    }

    private void decreaseVtolLimit(int remaining) {
        if (remaining <= 0) {
            updateLoadingStatus("DEPLOYING TO THE BATTLEFIELD…");
            evaluateTouchTapThen(535, 431, "Accept limits", 1800,
                    () -> evaluateTouchTapThen(585, "td1".equals(mapId) ? 30 : 70,
                            "Ready", 1500, this::finishStartupAutomation));
            return;
        }
        evaluateTouchTapThen(376, 391, "VTOL minus", 320,
                () -> decreaseVtolLimit(remaining - 1));
    }

    private void finishStartupAutomation() {
        updateLoadingStatus("WAITING FOR TOWER DEFENSE RULES…");
        awaitBattlefieldReady(0);
    }

    private void awaitBattlefieldReady(int attempt) {
        if (webView == null || isFinishing()) return;
        String script = "(() => {const r=window.__warzoneTowersWaves?.report?.();"
                + "return Boolean(document.getElementById('canvas')"
                + "&&r?.snapshot?.mode==='tower-defense');})()";
        webView.evaluateJavascript(script, result -> {
            if ("true".equals(result)) {
                revealBattlefield();
                return;
            }
            if (attempt >= 240) {
                showEngineFailure("The tower-defence battlefield did not become ready in time.");
                return;
            }
            if (attempt == 40) updateLoadingStatus("LOADING MAP AND ENEMY ROUNDS…");
            if (attempt == 120) updateLoadingStatus("FINALISING BATTLEFIELD…");
            webView.postDelayed(() -> awaitBattlefieldReady(attempt + 1), 500);
        });
    }

    private void revealBattlefield() {
        if (webView == null || isFinishing()) return;
        // Establish this map's south-facing view while the splash still covers
        // the canvas. Waves and BASE must never change the camera direction.
        faceOpponent();
        showCombatHud();
        awaitNativeInterfaceReady(0);
    }

    private void awaitNativeInterfaceReady(int attempt) {
        if(webView==null||nativeUi==null||isFinishing())return;
        if(nativeUi.hasReadyModel()){
            hideLoadingPanel();
            nativeUi.ready();
            webView.requestFocus();
            return;
        }
        if(attempt>=300){showEngineFailure("The battlefield controls did not become ready.");return;}
        webView.postDelayed(()->awaitNativeInterfaceReady(attempt+1),100);
    }

    private void faceOpponent() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "Boolean(window.__kalaWarzoneTouch?.faceOpponent())",
                result -> Log.i(TAG, "Automatic Warzone Face South: " + result));
    }

    private void showCombatHud() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "Boolean(window.__kalaWarzoneTouch?.showCombatHud())",
                result -> Log.i(TAG, "Show Warzone Towers combat HUD: " + result));
    }

    /** A dormant ADB-only verification route; normal launches never execute it. */
    private void selectAllUnitsForTouchTest() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "Boolean(window.__kalaWarzoneTouch?.selectAllUnits())",
                result -> Log.i(TAG, "Touch test native Ctrl+U selection: " + result));
    }

    private void issueTouchTestOrder() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "Boolean(window.__kalaWarzoneTouch?.tapNormalized(0.42,0.18))",
                result -> Log.i(TAG, "Touch test single-tap destination: " + result));
    }

    private void dumpTouchReport() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "JSON.stringify(window.__kalaWarzoneTouch?.report?.() || {})",
                result -> Log.i(TAG, "Touch test report: " + result));
    }

    private void runTouchSuite() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "Boolean(window.__kalaWarzoneTouch?.runSyntheticSuite())",
                result -> Log.i(TAG, "Touch v2 synthetic suite started: " + result));
    }

    private void runResearchSuite() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "Boolean(window.__blockNightResearch?.runSyntheticSuite())",
                result -> Log.i(TAG, "Research v2.3 engine-sync suite started: " + result));
    }

    private void dumpResearchReport() {
        if (webView == null || isFinishing()) return;
        webView.evaluateJavascript(
                "JSON.stringify(window.__blockNightResearch?.report?.() || {})",
                result -> Log.i(TAG, "Research test report: " + result));
    }

    private void evaluateTouchTapThen(double x, double y, String label,
                                      long delayMs, Runnable next) {
        if (webView == null || isFinishing()) return;
        boolean lobby = "Start Hosting".equals(label) || "Limits".equals(label) || "Ready".equals(label);
        String script = "Boolean(window.__kalaWarzoneTouch?.tapFrontend(" + x + "," + y + "," + lobby + "))";
        webView.evaluateJavascript(script, result -> {
            Log.i(TAG, "Automatic Warzone " + label + " tap: " + result);
            if (next != null && webView != null && !isFinishing()) {
                webView.postDelayed(next, delayMs);
            }
        });
    }

    private final class WarzoneAssetHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(String path) {
            if (path == null || path.isEmpty() || path.startsWith("/")
                    || path.contains("..") || path.contains("\\")) {
                return response404(path);
            }
            try {
                if ("optional/high-v3.wz".equals(path) || "optional/music-v1.data".equals(path)) {
                    OptionalPackStore store = path.endsWith(".wz") ? graphicsStore : musicStore;
                    File archive = store == null ? null : store.readyFile();
                    if (archive == null) return response404(path);
                    return new WebResourceResponse("application/octet-stream", null, 200, "OK",
                            isolationHeaders(), new FileInputStream(archive));
                }
                if (path.endsWith(".data") || path.endsWith(".wasm")
                        || path.endsWith("blocknight-scenario.js")) {
                    Log.i(TAG, "Serving packaged engine asset: " + path);
                }
                InputStream stream = getAssets().open("warzone/" + path);
                Map<String, String> headers = isolationHeaders();
                if ("index.html".equals(path) || "mobile.html".equals(path)) {
                    headers.put("Cross-Origin-Opener-Policy", "same-origin");
                    headers.put("Document-Isolation-Policy", "isolate-and-require-corp");
                }
                return new WebResourceResponse(mimeType(path), isText(path) ? "UTF-8" : null,
                        200, "OK", headers, stream);
            } catch (IOException error) {
                Log.e(TAG, "Missing packaged engine asset: " + path, error);
                return response404(path);
            }
        }

        private WebResourceResponse response404(String path) {
            byte[] body = ("Missing packaged Warzone asset: " + path)
                    .getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    isolationHeaders(), new ByteArrayInputStream(body));
        }
    }

    private static Map<String, String> isolationHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("Cross-Origin-Resource-Policy", "same-origin");
        headers.put("Cross-Origin-Embedder-Policy", "require-corp");
        return headers;
    }

    private static boolean isText(String path) {
        return path.endsWith(".html") || path.endsWith(".js")
                || path.endsWith(".css") || path.endsWith(".json");
    }

    /** Keep existing bridge scripts in the engine frame's own JS realm. */
    private static final class EngineWebView extends WebView {
        EngineWebView(Context context) { super(context); }

        // The game is a fixed viewport. Android's focus reveal can scroll the
        // WebView itself even while both HTML documents report scrollY == 0.
        // Let HTML lists scroll, but never move the native viewport/header.
        @Override
        public void scrollTo(int x, int y) { super.scrollTo(0, 0); }

        @Override
        protected void onScrollChanged(int x, int y, int oldX, int oldY) {
            super.onScrollChanged(x, y, oldX, oldY);
            if (x != 0 || y != 0) super.scrollTo(0, 0);
        }

        @Override
        public void evaluateJavascript(String script, ValueCallback<String> callback) {
            String routed = "(() => {const f=document.getElementById('warzone-game-frame');"
                    + "if(!f?.contentWindow)return null;return f.contentWindow.eval("
                    + JSONObject.quote(script) + ");})()";
            super.evaluateJavascript(routed, callback);
        }
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".wasm")) return "application/wasm";
        if (path.endsWith(".data")) return "application/octet-stream";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if(nativeUi!=null)nativeUi.configurationChanged();
        root.post(this::fitViewport);
    }

    @Override
    protected void onDestroy() {
        if (graphicsStore != null) graphicsStore.close();
        if (musicStore != null) musicStore.close();
        if (nativeUi != null && viewportListener != null) {
            nativeUi.stage.removeOnLayoutChangeListener(viewportListener);
            viewportListener = null;
        }
        if (webView != null) {
            if(nativeUi!=null){nativeUi.destroy();nativeUi=null;}
            webView.stopLoading();
            if(webView.getParent() instanceof ViewGroup)((ViewGroup)webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if(nativeUi!=null&&nativeUi.dismissKeyboardIfVisible())return;
        if (musicSetup != null) { closeMusicSetup(); return; }
        if (nativeUi != null && nativeUi.back()) return;
        if (graphicsSetup == null && webView != null && nativeUi!=null && nativeUi.gameReady()) {
            nativeUi.pauseGame();
            return;
        }
        super.onBackPressed();
    }
}
