package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import org.chromium.net.CronetEngine;
import org.chromium.net.CronetException;
import org.chromium.net.CronetProvider;
import org.chromium.net.NetworkException;
import org.chromium.net.RequestFinishedInfo;
import org.chromium.net.UploadDataProviders;
import org.chromium.net.UrlRequest;
import org.chromium.net.UrlResponseInfo;
import org.json.JSONException;
import org.json.JSONObject;

/** Direct official-lobby transport only. No proxy, URL rewrite, request replay or TLS bypass. */
final class CronetLobbyHttp implements AutoCloseable {
  interface Callback {
    void complete(int id, int status, String headers, byte[] body, String error, BooleanSupplier claim);
  }
  private static final String TAG = "WarzoneMultiplayer";
  private final Context context;
  private final Callback callback;
  private final Supplier<String> networkSummary;
  private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(
      r -> new Thread(r, "pc-lobby-cronet"));
  private final LobbyHttpPolicy.Registry registry = new LobbyHttpPolicy.Registry();
  private final Map<LobbyHttpPolicy.Registry.Ticket, Job> jobs = new ConcurrentHashMap<>();
  private final AtomicBoolean closed = new AtomicBoolean();
  private CronetEngine engine;
  private String providerVersion = "not-initialized";

  CronetLobbyHttp(Context context, Callback callback, Supplier<String> networkSummary) {
    this.context = context.getApplicationContext();
    this.callback = callback;
    this.networkSummary = networkSummary;
  }

  void request(int id, String method, String url, String headersJson, String bodyBase64) {
    if (closed.get()) return;
    LobbyHttpPolicy.Registry.Ticket ticket = registry.begin(id);
    // A duplicate cannot be answered safely using an id belonging to another in-flight request.
    if (ticket == null) { Log.w(TAG, "Lobby request rejected: duplicate, invalid or busy identifier"); return; }
    Job job = new Job(ticket);
    jobs.put(ticket, job);
    if (closed.get()) { registry.cancel(id); jobs.remove(ticket); return; }
    submit(() -> start(job, method, url, headersJson, bodyBase64));
  }

  void cancel(int id) {
    // Retire synchronously before an already-posted UI completion can claim this id.
    LobbyHttpPolicy.Registry.Ticket ticket = registry.cancel(id);
    if (ticket != null) submit(() -> {
      Job job = jobs.remove(ticket);
      if (job != null) job.cancelTransport("canceled");
    });
  }

  private void submit(Runnable work) {
    try { executor.execute(work); }
    catch (RejectedExecutionException ignored) { /* Activity teardown has retired every request. */ }
  }

  private CronetEngine engine() throws IOException {
    if (engine != null) return engine;
    for (CronetProvider provider : CronetProvider.getAllProviders(context)) {
      if (!CronetProvider.PROVIDER_NAME_APP_PACKAGED.equals(provider.getName()) || !provider.isEnabled()) continue;
      providerVersion = provider.getVersion();
      engine = provider.createBuilder().setUserAgent(LobbyHttpPolicy.USER_AGENT)
          .enableQuic(true).enableHttp2(true).enableBrotli(true)
          .addQuicHint(LobbyHttpPolicy.HOST, 443, 443)
          .enableHttpCache(CronetEngine.Builder.HTTP_CACHE_DISABLED, 0).build();
      Log.i(TAG, "Lobby transport app-packaged Cronet " + providerVersion + "; QUIC/H2 enabled; ECH unverified");
      return engine;
    }
    throw new IOException("Bundled lobby networking provider unavailable");
  }

  private void start(Job job, String suppliedMethod, String suppliedUrl, String headersJson, String bodyBase64) {
    if (!job.current()) return;
    job.deadline = executor.schedule(() -> job.fail("Request timed out", true),
        Math.max(0, LobbyHttpPolicy.DEADLINE_MS - (SystemClock.elapsedRealtime() - job.started)), TimeUnit.MILLISECONDS);
    try {
      String method = LobbyHttpPolicy.method(suppliedMethod);
      job.method = method;
      URI url = LobbyHttpPolicy.allowedUrl(suppliedUrl);
      if (bodyBase64 != null && bodyBase64.length() > ((LobbyHttpPolicy.MAX_BYTES + 2L) / 3L) * 4L)
        throw new IOException("Lobby request exceeds size limit");
      byte[] body = bodyBase64 == null || bodyBase64.isEmpty() ? new byte[0] : Base64.decode(bodyBase64, Base64.DEFAULT);
      LobbyHttpPolicy.bodyAllowed(method, body.length);
      if (headersJson != null && headersJson.length() > 32 * 1024) throw new IOException("Lobby headers exceed size limit");
      JSONObject headers = new JSONObject(headersJson == null ? "{}" : headersJson);
      if (headers.length() > 64) throw new IOException("Too many lobby headers");
      job.category = url.getPath().endsWith("/request-join") ? "join" : url.getPath().endsWith("/games") ? "list" : "api";
      UrlRequest.Builder builder = engine().newUrlRequestBuilder(url.toString(), job, executor)
          .disableCache().setHttpMethod(method);
      Iterator<String> names = headers.keys();
      boolean contentType = false;
      while (names.hasNext()) {
        String name = names.next(), value = headers.getString(name);
        if (LobbyHttpPolicy.forwardedHeader(name, value)) builder.addHeader(name, value);
        if (name.equalsIgnoreCase("Content-Type")) contentType = true;
      }
      if (body.length > 0 || method.equals("POST") || method.equals("PUT") || method.equals("PATCH")) {
        if (!contentType) throw new IOException("Lobby upload requires Content-Type");
        builder.setUploadDataProvider(UploadDataProviders.create(body), executor);
      }
      builder.setRequestFinishedListener(new RequestFinishedInfo.Listener(executor) {
        @Override public void onRequestFinished(RequestFinishedInfo info) {
          RequestFinishedInfo.Metrics m = info.getMetrics();
          if (m != null) Log.i(TAG, "Lobby timing " + job.category + " dnsMs=" + span(m.getDnsStart(), m.getDnsEnd())
              + " connectMs=" + span(m.getConnectStart(), m.getConnectEnd())
              + " tlsMs=" + span(m.getSslStart(), m.getSslEnd()) + " totalMs=" + m.getTotalTimeMs());
        }
      });
      job.request = builder.build();
      if (!job.current()) { job.cancelTransport("canceled-before-start"); return; }
      if (SystemClock.elapsedRealtime() - job.started >= LobbyHttpPolicy.DEADLINE_MS) {
        job.fail("Request timed out", true); return;
      }
      job.stage = "connecting";
      job.request.start();
    } catch (IOException | JSONException | RuntimeException | LinkageError error) {
      Log.w(TAG, "Lobby transport setup failed: " + error.getClass().getSimpleName());
      job.fail(error instanceof IOException ? error.getMessage() : "Lobby networking initialization failed", true);
    }
  }

  private static String span(Date start, Date end) { return start == null || end == null ? "unavailable" : Long.toString(end.getTime() - start.getTime()); }

  private final class Job extends UrlRequest.Callback {
    final LobbyHttpPolicy.Registry.Ticket ticket;
    final long started = SystemClock.elapsedRealtime();
    final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    UrlRequest request;
    ScheduledFuture<?> deadline;
    String method = "GET", category = "api", stage = "preparing", protocol = "unavailable", responseHeaders = "{}";
    int status, redirects;

    Job(LobbyHttpPolicy.Registry.Ticket ticket) { this.ticket = ticket; }
    boolean current() { return !closed.get() && registry.active(ticket); }
    void cancelTransport(String reason) {
      if (deadline != null) deadline.cancel(false);
      if (request != null) request.cancel();
      log(reason);
    }
    void log(String result) {
      String network;
      try { network = networkSummary.get(); } catch (RuntimeException unavailable) { network = "unavailable"; }
      Log.i(TAG, "Lobby HTTP " + ticket.id + " " + category + " result=" + result + " stage=" + stage
          + " status=" + status + " bytes=" + bytes.size() + " protocol=" + protocol
          + " elapsedMs=" + (SystemClock.elapsedRealtime() - started) + " network=" + network);
    }
    void finish(int code, byte[] body, String error, boolean cancel) {
      if (!current() || !registry.terminal(ticket)) return;
      if (deadline != null) deadline.cancel(false);
      if (cancel && request != null) request.cancel();
      log(error.isEmpty() ? "complete" : error);
      callback.complete(ticket.id, code, error.isEmpty() ? responseHeaders : "{}", body, error, () -> {
        boolean claimed = registry.claim(ticket);
        jobs.remove(ticket);
        return claimed && !closed.get();
      });
    }
    void fail(String reason, boolean cancel) { finish(0, new byte[0], reason, cancel); }
    @Override public void onRedirectReceived(UrlRequest request, UrlResponseInfo info, String next) {
      if (!current()) return;
      try {
        LobbyHttpPolicy.allowedUrl(next);
        if (++redirects > 3) throw new IOException("Lobby redirect limit reached");
        if (!method.equals("GET") && !method.equals("HEAD")
            && info.getHttpStatusCode() != 307 && info.getHttpStatusCode() != 308)
          throw new IOException("Lobby upload redirect would change the signed request");
        stage = "redirect";
        request.followRedirect();
      } catch (IOException invalid) { fail(invalid.getMessage(), true); }
    }
    @Override public void onResponseStarted(UrlRequest request, UrlResponseInfo info) {
      if (!current()) return;
      status = info.getHttpStatusCode(); protocol = info.getNegotiatedProtocol(); stage = "reading";
      JSONObject headers = new JSONObject();
      try {
        for (Map.Entry<String, List<String>> header : info.getAllHeaders().entrySet())
          headers.put(header.getKey(), String.join(", ", header.getValue()));
        responseHeaders = headers.toString();
        request.read(ByteBuffer.allocateDirect(16 * 1024));
      } catch (JSONException | RuntimeException invalid) { fail("Invalid lobby response headers", true); }
    }
    @Override public void onReadCompleted(UrlRequest request, UrlResponseInfo info, ByteBuffer buffer) {
      if (!current()) return;
      buffer.flip();
      if (buffer.remaining() > LobbyHttpPolicy.MAX_BYTES - bytes.size()) { fail("Lobby response exceeds size limit", true); return; }
      byte[] part = new byte[buffer.remaining()]; buffer.get(part); bytes.write(part, 0, part.length);
      buffer.clear(); request.read(buffer);
    }
    @Override public void onSucceeded(UrlRequest request, UrlResponseInfo info) { finish(status, bytes.toByteArray(), "", false); }
    @Override public void onFailed(UrlRequest request, UrlResponseInfo info, CronetException error) {
      String code = error instanceof NetworkException ? " code=" + ((NetworkException) error).getErrorCode()
          + " internal=" + ((NetworkException) error).getCronetInternalErrorCode() : "";
      String reason = "Lobby network failed: ";
      if (error instanceof NetworkException) {
        int errorCode = ((NetworkException) error).getErrorCode();
        if (errorCode == NetworkException.ERROR_HOSTNAME_NOT_RESOLVED) reason = "DNS lookup failed: ";
        else if (errorCode == NetworkException.ERROR_TIMED_OUT || errorCode == NetworkException.ERROR_CONNECTION_TIMED_OUT)
          reason = "Lobby request timed out: ";
        else if (errorCode == NetworkException.ERROR_INTERNET_DISCONNECTED) reason = "Network is unreachable: ";
      }
      fail(reason + error.getClass().getSimpleName() + code, false);
    }
    @Override public void onCanceled(UrlRequest request, UrlResponseInfo info) { fail("Lobby request canceled", false); }
  }

  @Override public void close() {
    if (!closed.compareAndSet(false, true)) return;
    registry.clear();
    submit(() -> {
      for (Job job : jobs.values()) job.cancelTransport("activity-closed");
      jobs.clear();
      shutdownEngine(SystemClock.elapsedRealtime() + 2000);
    });
  }

  private void shutdownEngine(long until) {
    if (engine != null) {
      try { engine.shutdown(); }
      catch (IllegalStateException callbacksPending) {
        if (SystemClock.elapsedRealtime() < until) {
          executor.schedule(() -> shutdownEngine(until), 50, TimeUnit.MILLISECONDS);
          return;
        }
        Log.w(TAG, "Lobby engine shutdown did not finish after cancellation");
      }
    }
    executor.shutdown();
  }
}
