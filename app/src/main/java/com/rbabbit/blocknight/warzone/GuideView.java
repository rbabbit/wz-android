package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.net.Uri;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;

/** Offline reading surface. It has no game bridge and cannot issue engine orders. */
final class GuideView extends LinearLayout {
    private final WebView browser;
    private final Runnable close;
    private boolean disposed;

    GuideView(Context context, Runnable onClose) {
        super(context);
        close = onClose;
        setOrientation(VERTICAL);
        setBackgroundColor(TowersTheme.BACKGROUND);

        browser = new WebView(context);
        browser.setBackgroundColor(TowersTheme.BACKGROUND);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context)).build();
        browser.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())) {
                    WebResourceResponse response = loader.shouldInterceptRequest(uri);
                    if (response != null) return response;
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Offline guide", null,
                    new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())
                    || uri.getPath() == null || !uri.getPath().startsWith("/assets/guide/");
            }
        });
        addView(browser, new LayoutParams(-1, -1));
        browser.loadUrl("https://appassets.androidplatform.net/assets/guide/index.html");
    }

    void back() {
        browser.evaluateJavascript("(() => {const editor=document.activeElement;"
            + "if(editor?.matches('input,textarea,[contenteditable=true]')){editor.blur();return 'keyboard';}"
            + "return window.WarzoneGuide?.back() ? 'handled' : 'close';})()", handled -> {
            if (disposed) return;
            if ("\"keyboard\"".equals(handled)) {
                InputMethodManager keyboard = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
                if (keyboard != null) keyboard.hideSoftInputFromWindow(browser.getWindowToken(), 0);
            } else if (!"\"handled\"".equals(handled)) close.run();
        });
    }

    void dispose() {
        disposed = true;
        browser.stopLoading(); removeView(browser); browser.destroy();
    }
}
