package com.rbabbit.blocknight.warzone;

import android.util.Log;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.HttpsURLConnection;

/** Sends a mode-only count without blocking the battlefield or queuing offline reports. */
final class GameModeTotals {
    private static final String TAG = "WarzoneModeTotals";
    private static final String ENDPOINT = "https://wz2100.uk/api/game-mode-count";
    private static final int TIMEOUT_MS = 8000;
    private static final ThreadPoolExecutor WORKER = new ThreadPoolExecutor(
            0, 1, 15, TimeUnit.SECONDS, new ArrayBlockingQueue<>(8),
            new ThreadPoolExecutor.DiscardPolicy());

    private GameModeTotals() {}

    static void matchStarted(String mode) {
        WORKER.execute(() -> send(mode));
    }

    private static void send(String mode) {
        byte[] payload = mode.getBytes(StandardCharsets.US_ASCII);
        for (int attempt = 0; attempt < 2; attempt++) {
            HttpsURLConnection request = null;
            boolean writing = false;
            try {
                request = (HttpsURLConnection) new URL(ENDPOINT).openConnection();
                request.setInstanceFollowRedirects(false);
                request.setConnectTimeout(TIMEOUT_MS);
                request.setReadTimeout(TIMEOUT_MS);
                request.setRequestMethod("POST");
                request.setDoOutput(true);
                request.setUseCaches(false);
                request.setRequestProperty("User-Agent", "WarzoneModeTotals");
                request.setRequestProperty("Content-Type", "text/plain");
                request.setFixedLengthStreamingMode(payload.length);
                try (OutputStream output = request.getOutputStream()) {
                    writing = true;
                    output.write(payload);
                }
                int status = request.getResponseCode();
                if (status == 204) Log.d(TAG, "Match start accepted");
                else Log.w(TAG, "Match-start response HTTP " + status);
                return;
            } catch (IOException ignored) {
                // Retry only before writing. A lost response after writing may already be counted.
                if (writing || attempt == 1) {
                    Log.w(TAG, writing ? "Match-start acknowledgement unavailable" : "Match-start connection unavailable");
                    return;
                }
            } finally {
                if (request != null) request.disconnect();
            }
        }
    }
}
