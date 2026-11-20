package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.util.function.Consumer;
import org.json.JSONException;
import org.json.JSONTokener;

/** Reads the old WebView library before cloud actions, even from the home screen. */
final class LegacyBlueprintImport extends WebViewClient {
    private static final String URL = "https://appassets.androidplatform.net/warzone/blueprint-import.html";
    private final BlueprintStore store;
    private final Consumer<Boolean> result;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> finish(false);
    private WebView reader;

    static void prepare(Activity activity, Consumer<Boolean> result) {
        BlueprintStore store = new BlueprintStore(activity);
        if (store.importedLegacy()) {
            result.accept(true);
            return;
        }
        new LegacyBlueprintImport(store, result).read(activity);
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
            reader.setWebViewClient(this);
            handler.postDelayed(timeout, 8000);
            reader.loadUrl(URL);
        } catch (RuntimeException unavailable) {
            if (reader == null) result.accept(false); else finish(false);
        }
    }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!URL.equals(request.getUrl().toString()))
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0]));
        return new WebResourceResponse("text/html", "UTF-8",
            new ByteArrayInputStream("<!doctype html><title>Blueprint storage</title>".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    @Override public void onPageFinished(WebView view, String url) {
        if (view != reader || !URL.equals(url)) return;
        view.evaluateJavascript("localStorage.getItem('wt-designs-v1') || ''", raw -> {
            if (view != reader) return;
            try {
                Object value = new JSONTokener(raw == null ? "null" : raw).nextValue();
                finish(value instanceof String && store.importLegacy((String) value));
            } catch (JSONException invalid) { finish(false); }
        });
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
