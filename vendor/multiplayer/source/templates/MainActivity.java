package com.rbabbit.multiplayer;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
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
public final class MainActivity extends Activity {
  private static final String TAG = "PcLobbyTest";
  private static final String ORIGIN = "https://appassets.androidplatform.net";
  private static final String START_URL = ORIGIN + "/warzone/index.html";
  private static final int MAX_CONNECTIONS = 8;
  private static final int CONNECT_TIMEOUT_MS = 10_000;
  private static final int MAX_SEND_BYTES = 8 * 1024 * 1024;
  private static final long MAX_QUEUED_BYTES = 32L * 1024 * 1024;
  private static final int MAX_HTTP_BYTES = 4 * 1024 * 1024;

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

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    WebView.setWebContentsDebuggingEnabled(true);
    webView = new WebView(this);
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

    WebViewAssetLoader.AssetsPathHandler assets =
        new WebViewAssetLoader.AssetsPathHandler(this);
    WebViewAssetLoader loader =
        new WebViewAssetLoader.Builder()
            .addPathHandler(
                "/warzone/",
                path -> {
                  WebResourceResponse response = assets.handle("warzone/" + path);
                  if (response != null) {
                    response.setResponseHeaders(isolationHeaders());
                    if (path.endsWith(".wasm")) response.setMimeType("application/wasm");
                    if (path.endsWith(".data")) response.setMimeType("application/octet-stream");
                  }
                  return response;
                })
            .build();
    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            if (!isLocal(request.getUrl())) return blockedResponse(403, "External request blocked");
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
    setContentView(webView);
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
    if (focused) immersive();
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
    webView.evaluateJavascript("Boolean(window.LaunchedModule)", active -> {
      if (!"true".equals(active)) { finish(); return; }
      new android.app.AlertDialog.Builder(this)
          .setMessage("Leave this game and return to the multiplayer lobby?")
          .setNegativeButton("Stay", null)
          .setPositiveButton("Return", (dialog, which) -> {
            for (Connection connection : connections.values()) connection.finish(null);
            if (webView != null) webView.loadUrl(START_URL);
          }).show();
    });
  }

  @Override
  protected void onDestroy() {
    destroyed.set(true);
    for (Connection connection : connections.values()) connection.finish(null);
    timeouts.shutdownNow();
    httpExecutor.shutdownNow();
    for (HttpURLConnection connection : activeHttp) connection.disconnect();
    if (webView != null) {
      webView.removeJavascriptInterface("AndroidSocketBridge");
      webView.removeJavascriptInterface("AndroidLobbyHttp");
      webView.stopLoading();
      webView.destroy();
      webView = null;
    }
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
