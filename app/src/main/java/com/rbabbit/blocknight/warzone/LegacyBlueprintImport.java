package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.function.Consumer;

/** Reads the legacy library and prior Warzone profiles on the app's WebView origin. */
final class LegacyBlueprintImport extends WebViewClient {
    private static final String URL = "https://appassets.androidplatform.net/warzone/blueprint-import.html";
    private static final String SCRIPT = "warzone/blueprint-recovery.js";
    private final BlueprintStore store;
    private final Consumer<Boolean> result;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> finish(false);
    private volatile WebView reader;

    static void prepare(Activity activity, Consumer<Boolean> result) {
        new LegacyBlueprintImport(new BlueprintStore(activity), result).read(activity);
    }

    private LegacyBlueprintImport(BlueprintStore store, Consumer<Boolean> result) {
        this.store = store;
        this.result = result;
    }

    private void read(Activity activity) {
        try {
            reader = new WebView(activity);
            reader.getSettings().setJavaScriptEnabled(true);
            reader.getSettings().setDomStorageEnabled(true);
            reader.getSettings().setAllowFileAccess(false);
            reader.getSettings().setAllowContentAccess(false);
            reader.addJavascriptInterface(new RecoveryBridge(), "AndroidBlueprintRecovery");
            reader.setWebViewClient(this);
            handler.postDelayed(timeout, 8000);
            reader.loadUrl(URL);
        } catch (RuntimeException unavailable) {
            if (reader == null) result.accept(false); else finish(false);
        }
    }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (URL.equals(url)) {
            String html = "<!doctype html><meta charset=utf-8><script defer src=/"
                    + SCRIPT + "></script>";
            return new WebResourceResponse("text/html", "UTF-8",
                    new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
        }
        if (("https://appassets.androidplatform.net/" + SCRIPT).equals(url)) {
            try {
                return new WebResourceResponse("application/javascript", "UTF-8",
                        view.getContext().getAssets().open(SCRIPT));
            } catch (IOException missing) { handler.post(() -> finish(false)); }
        }
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0]));
    }

    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return true;
    }

    public final class RecoveryBridge {
        @JavascriptInterface public boolean importLegacyDesigns(String data) {
            return reader != null && store.importLegacy(data);
        }

        @JavascriptInterface public boolean importNativeTemplates(String data) {
            return reader != null && store.importNativeTemplates(data);
        }

        @JavascriptInterface public void complete(boolean ok) {
            handler.post(() -> finish(ok));
        }
    }

    @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        finish(false);
        return true;
    }

    private void finish(boolean ok) {
        if (reader == null) return;
        WebView view = reader;
        reader = null;
        handler.removeCallbacks(timeout);
        view.destroy();
        result.accept(ok);
    }
}
