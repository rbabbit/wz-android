package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.view.Gravity;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;

/** Public results reader. No engine, game bridge, private profile or socket API. */
final class HubView extends FrameLayout {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String DATA_HOST = "warzone2100.retropaganda.info";
    private static final String START_URL = "https://" + APP_HOST + "/assets/hub/index.html";
    private final WebView browser;
    private final Runnable close;
    private volatile boolean disposed, paused;
    private boolean backPending;
    private int backGeneration;
    private Runnable backTimeout;

    HubView(Context context, Runnable onClose) {
        super(context); close = onClose;
        setBackgroundColor(TowersTheme.BACKGROUND);
        setFocusableInTouchMode(true);
        Typeface face = Typeface.createFromAsset(context.getAssets(), "warzone/ui/Oswald.ttf");
        Button back = RewardsView.action(context, face, "BACK", false);
        back.setTextSize(14); back.setContentDescription("Back within Game Hub, then return home");
        InsetDrawable control = new InsetDrawable(TowersTheme.control(context, TowersTheme.CONTROL, 6),
                0, dp(8), 0, dp(8));
        back.setBackground(new RippleDrawable(ColorStateList.valueOf(TowersTheme.RIPPLE), control, null));
        back.setOnClickListener(view -> back());

        browser = new WebView(context); browser.setBackgroundColor(TowersTheme.BACKGROUND);
        browser.setOverScrollMode(OVER_SCROLL_NEVER);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false); settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(context);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", path -> {
            if (!allowedAssetPath(path)) return blocked();
            WebResourceResponse response = assets.handle(path);
            if (response != null) {
                Map<String,String> headers = new HashMap<>();
                headers.put("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; "
                        + "font-src 'self'; worker-src 'self'; connect-src https://" + DATA_HOST
                        + "; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'");
                headers.put("X-Content-Type-Options", "nosniff"); response.setResponseHeaders(headers);
            }
            return response;
        }).build();
        browser.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (localAsset(uri)) {
                    WebResourceResponse response = loader.shouldInterceptRequest(uri);
                    return response == null ? blocked() : response;
                }
                if (!disposed && !paused && !request.isForMainFrame()
                        && publicData(uri, request.getMethod()) && dataDestination(request.getRequestHeaders())) return null;
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (localDocument(uri)) return false;
                if (request.hasGesture() && sourceLink(uri)) openSource(uri);
                return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !localDocument(Uri.parse(url));
            }
        });
        addView(browser, new LayoutParams(-1, -1));
        // The HTML header reserves 94 CSS pixels for this compact native Back.
        // Its 48dp hit area overlays only that reserved header slot.
        LayoutParams backBounds = new LayoutParams(dp(84), dp(48), Gravity.TOP | Gravity.RIGHT);
        backBounds.rightMargin = dp(8);
        addView(back, backBounds);
        setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
            } else {
                left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();
                right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                    left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());top=Math.max(top,insets.getDisplayCutout().getSafeInsetTop());
                    right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());bottom=Math.max(bottom,insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            if (getPaddingLeft()!=left||getPaddingTop()!=top||getPaddingRight()!=right||getPaddingBottom()!=bottom)
                setPadding(left,top,right,bottom);
            return insets;
        });
        browser.loadUrl(START_URL);
    }

    private static boolean trusted(Uri uri, String host) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && host.equalsIgnoreCase(uri.getHost())
                && (uri.getPort()==-1||uri.getPort()==443) && uri.getUserInfo()==null;
    }
    private static boolean allowedAssetPath(String path) {
        return "hub/index.html".equals(path) || "hub/hub.css".equals(path) || "hub/hub.js".equals(path)
                || "hub/hub-worker.js".equals(path) || "hub/hub-data.js".equals(path)
                || "warzone/ui/Oswald.ttf".equals(path);
    }
    private static boolean localAsset(Uri uri) {
        return trusted(uri, APP_HOST) && uri.getPath()!=null && uri.getPath().startsWith("/assets/")
                && allowedAssetPath(uri.getPath().substring("/assets/".length()));
    }
    private static boolean localDocument(Uri uri) {
        return trusted(uri, APP_HOST) && "/assets/hub/index.html".equals(uri.getPath());
    }
    private static boolean publicData(Uri uri, String method) {
        if (!"GET".equals(method) || !trusted(uri, DATA_HOST) || uri.getFragment()!=null) return false;
        String path=uri.getPath(), query=uri.getEncodedQuery();
        if ("/results.json".equals(path)) return query==null || query.matches("id=[0-9_]{0,100}");
        return ("/player-public-keys.json".equals(path) || "/player-spoiled-public-keys.json".equals(path)) && query==null;
    }
    private static boolean dataDestination(Map<String,String> headers) {
        for (Map.Entry<String,String> header : headers.entrySet())
            if ("Sec-Fetch-Dest".equalsIgnoreCase(header.getKey())) return "empty".equalsIgnoreCase(header.getValue());
        return true;
    }
    private static boolean sourceLink(Uri uri) {
        return trusted(uri, DATA_HOST) && ("/hub".equals(uri.getPath())||"/hub/".equals(uri.getPath()))
                && uri.getQuery()==null && uri.getFragment()==null;
    }
    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Hub resource blocked", null,
                new ByteArrayInputStream(new byte[0]));
    }
    private void openSource(Uri uri) {
        try { getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (android.content.ActivityNotFoundException ignored) { }
    }

    void back() {
        if (disposed || backPending) return;
        if (keyboardVisible()) { hideKeyboard(); browser.evaluateJavascript("document.activeElement?.blur();", null); return; }
        backPending=true; final int generation=++backGeneration;
        backTimeout=() -> { if (!disposed&&backPending&&generation==backGeneration) { backPending=false;close.run(); } };
        postDelayed(backTimeout,1000);
        browser.evaluateJavascript("(()=>{const e=document.activeElement;if(e?.matches('input,textarea,[contenteditable=true]'))"
                + "{e.blur();return 'keyboard';}return window.WarzoneHub?.back?.()?'handled':'close';})()", result -> {
            if (disposed||generation!=backGeneration) return;
            clearBack();
            if ("\"keyboard\"".equals(result)) hideKeyboard();
            else if (!"\"handled\"".equals(result)) close.run();
        });
    }
    private boolean keyboardVisible() {
        if (Build.VERSION.SDK_INT >= 30 && getRootWindowInsets()!=null)
            return getRootWindowInsets().isVisible(WindowInsets.Type.ime());
        Rect visible=new Rect();getWindowVisibleDisplayFrame(visible);
        return getRootView().getHeight()-visible.bottom>dp(100);
    }
    private void hideKeyboard() {
        InputMethodManager keyboard=(InputMethodManager)getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard!=null) keyboard.hideSoftInputFromWindow(browser.getWindowToken(),0);
        browser.clearFocus();
    }
    private void clearBack() {
        backPending=false; if (backTimeout!=null) removeCallbacks(backTimeout);backTimeout=null;
    }
    void pause() {
        if (disposed) return; paused=true;backGeneration++;clearBack();
        browser.evaluateJavascript("window.dispatchEvent(new Event('warzone-hub-pause'));", null);browser.onPause();
    }
    void resume() {
        if (disposed) return; paused=false;browser.onResume();
        browser.evaluateJavascript("window.dispatchEvent(new Event('warzone-hub-resume'));", null);
    }
    void dispose() {
        if (disposed) return;disposed=true;paused=true;backGeneration++;clearBack();
        browser.evaluateJavascript("window.WarzoneHub?.dispose?.();", null);
        browser.stopLoading();removeView(browser);browser.destroy();
    }
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow();requestApplyInsets(); }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
}
