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

/** Verified optional content from the owner's VPS; no redirects to other hosts. */
class OptionalPackStore {
    interface Listener {
        void progress(long bytes, boolean verifying);
        void ready();
        void failed(String message);
    }
    private final File archive, partial;
    private final String downloadUrl, expectedHash;
    private final long expectedBytes;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile int generation;
    private volatile HttpURLConnection connection;
    private volatile boolean verified;

    OptionalPackStore(Context context, String folder, String filename, String url, long bytes, String hash) {
        downloadUrl = url; expectedBytes = bytes; expectedHash = hash;
        File directory = new File(context.getFilesDir(), folder);
        directory.mkdirs();
        archive = new File(directory, filename);
        partial = new File(directory, filename + ".part");
    }
    File readyFile() { return verified && archive.length() == expectedBytes ? archive : null; }
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
                if (verified && archive.length() == expectedBytes) {
                    deliver(token, listener::ready); return;
                }
                long offset = partial.isFile() ? partial.length() : 0;
                if (offset > expectedBytes) { partial.delete(); offset = 0; }
                long required = expectedBytes - offset + 32L * 1024 * 1024;
                if (archive.getParentFile().getUsableSpace() < required)
                    throw new IOException("Not enough free space. Free at least " + ((required + 1048575) / 1048576) + " MiB and retry.");
                if (offset < expectedBytes) {
                    HttpURLConnection request = (HttpURLConnection) new URL(downloadUrl).openConnection();
                    connection = request;
                    request.setInstanceFollowRedirects(false);
                    request.setConnectTimeout(20_000); request.setReadTimeout(25_000);
                    request.setRequestProperty("Accept-Encoding", "identity");
                    if (offset > 0) request.setRequestProperty("Range", "bytes=" + offset + "-");
                    int code = request.getResponseCode();
                    if (code == 206) {
                        String range = request.getHeaderField("Content-Range");
                        if (range == null || !range.startsWith("bytes " + offset + "-") || !range.endsWith("/" + expectedBytes))
                            throw new IOException("The download could not resume. Please retry.");
                    } else if (code == 200) offset = 0;
                    else throw new IOException("Download unavailable. Check your connection and retry.");
                    long received = offset, lastUpdate = 0;
                    try (InputStream input = request.getInputStream(); RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
                        if (offset == 0) output.setLength(0);
                        output.seek(offset);
                        byte[] buffer = new byte[64 * 1024]; int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (token != generation) return;
                            received += count;
                            if (received > expectedBytes) throw new IOException("Unexpected download size.");
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
                deliver(token, () -> listener.progress(expectedBytes, true));
                if (!valid(partial)) {
                    partial.delete();
                    throw new IOException("The download could not be verified. Please retry.");
                }
                if (token != generation) return;
                Files.move(partial.toPath(), archive.toPath(), StandardCopyOption.REPLACE_EXISTING);
                verified = true; deliver(token, listener::ready);
            } catch (Exception error) {
                String message = error.getMessage();
                if (error instanceof java.net.SocketException || error instanceof java.net.SocketTimeoutException
                        || error instanceof java.net.UnknownHostException)
                    message = "Connection unavailable. Check your internet and retry.";
                if (error instanceof javax.net.ssl.SSLException)
                    message = "A secure connection could not be made. Please retry.";
                String detail = message == null ? "Download interrupted. Please retry." : message;
                if (token == generation) deliver(token, () -> listener.failed(detail));
            } finally {
                HttpURLConnection active = connection;
                if (active != null) active.disconnect();
                connection = null;
            }
        });
    }
    private void deliver(int token, Runnable action) { main.post(() -> { if (token == generation) action.run(); }); }
    private boolean valid(File file) {
        if (!file.isFile() || file.length() != expectedBytes) return false;
        try (InputStream input = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[128 * 1024]; int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return expectedHash.contentEquals(hex);
        } catch (Exception error) { return false; }
    }
    void close() { cancel(); worker.shutdownNow(); }
}
