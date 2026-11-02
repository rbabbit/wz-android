package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Optional, unmodified official terrain pack. The APK remains usable offline. */
final class GraphicsPackStore {
    static final String URL = "https://krishna.org.uk/game/graphics/hq-v3/high.wz";
    static final long BYTES = 99_639_408L;
    static final String SHA256 = "a16a06c2a6b68e86a03934240880ec0b0fd72666606af3bf12ed5ffda7734f0e";
    interface Listener {
        void progress(long bytes, boolean verifying);
        void ready();
        void failed(String message);
    }
    private final File archive, partial;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile int generation;
    private volatile HttpURLConnection connection;
    private volatile boolean verified;

    GraphicsPackStore(Context context) {
        File directory = new File(context.getFilesDir(), "graphics/hq-v3");
        directory.mkdirs();
        archive = new File(directory, "high.wz");
        partial = new File(directory, "high.wz.part");
    }
    File readyFile() { return verified && archive.length() == BYTES ? archive : null; }
    void inspect(java.util.function.Consumer<Boolean> callback) {
        worker.execute(() -> {
            verified = valid(archive);
            main.post(() -> callback.accept(verified));
        });
    }
    void cancel() {
        generation++;
        HttpURLConnection active = connection;
        if (active != null) active.disconnect();
    }
    void download(Listener listener) {
        cancel();
        final int token = generation;
        worker.execute(() -> {
            try {
                if (token != generation) return;
                if (verified && archive.length() == BYTES) {
                    deliver(token, listener::ready); return;
                }
                long offset = partial.isFile() ? partial.length() : 0;
                if (offset > BYTES) { partial.delete(); offset = 0; }
                if (archive.getParentFile().getUsableSpace() < BYTES - offset + 32L * 1024 * 1024)
                    throw new IOException("Not enough free space. Free at least 130 MiB, or choose Normal.");
                if (offset < BYTES) {
                    HttpURLConnection request = (HttpURLConnection) new URL(URL).openConnection();
                    connection = request;
                    request.setConnectTimeout(20_000); request.setReadTimeout(25_000);
                    request.setRequestProperty("Accept-Encoding", "identity");
                    if (offset > 0) request.setRequestProperty("Range", "bytes=" + offset + "-");
                    int code = request.getResponseCode();
                    if (code == 206) {
                        String range = request.getHeaderField("Content-Range");
                        if (range == null || !range.startsWith("bytes " + offset + "-") || !range.endsWith("/" + BYTES))
                            throw new IOException("The download could not resume. Please retry.");
                    } else if (code == 200) offset = 0;
                    else throw new IOException("Download unavailable. Check your connection and retry, or choose Normal.");
                    long received = offset, lastUpdate = 0;
                    try (InputStream input = request.getInputStream(); RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
                        if (offset == 0) output.setLength(0);
                        output.seek(offset);
                        byte[] buffer = new byte[64 * 1024]; int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (token != generation) return;
                            received += count;
                            if (received > BYTES) throw new IOException("Unexpected download size.");
                            output.write(buffer, 0, count);
                            if (System.currentTimeMillis() - lastUpdate > 120) {
                                long progress = received; deliver(token, () -> listener.progress(progress, false));
                                lastUpdate = System.currentTimeMillis();
                            }
                        }
                        output.getFD().sync();
                    } finally { request.disconnect(); connection = null; }
                }
                if (token != generation) return;
                deliver(token, () -> listener.progress(BYTES, true));
                if (!valid(partial)) {
                    partial.delete();
                    throw new IOException("The download could not be verified. Retry, or choose Normal.");
                }
                if (token != generation) return;
                Files.move(partial.toPath(), archive.toPath(), StandardCopyOption.REPLACE_EXISTING);
                verified = true; deliver(token, listener::ready);
            } catch (Exception error) {
                String message = error.getMessage();
                if (error instanceof java.net.SocketException || error instanceof java.net.SocketTimeoutException
                        || error instanceof java.net.UnknownHostException)
                    message = "Connection unavailable. Check your internet and retry, or choose Normal.";
                if (error instanceof javax.net.ssl.SSLException)
                    message = "A secure connection could not be made. Retry, or choose Normal.";
                String detail = message == null ? "Download interrupted. Retry, or choose Normal." : message;
                if (token == generation) deliver(token, () -> listener.failed(detail));
            } finally {
                HttpURLConnection active = connection;
                if (active != null) active.disconnect();
                connection = null;
            }
        });
    }
    private void deliver(int token, Runnable action) { main.post(() -> { if (token == generation) action.run(); }); }
    private static boolean valid(File file) {
        if (!file.isFile() || file.length() != BYTES) return false;
        try (InputStream input = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[128 * 1024]; int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return SHA256.contentEquals(hex);
        } catch (Exception error) { return false; }
    }
    void close() { cancel(); worker.shutdownNow(); }
}
