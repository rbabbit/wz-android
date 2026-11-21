package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.os.SystemClock;
import android.util.Log;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONException;
import org.json.JSONObject;

/** Sends aggregate inputs without blocking the battlefield or queuing offline reports. */
final class GameModeTotals {
    private static final String TAG = "WarzoneModeTotals";
    private static final String ENDPOINT = "https://wz2100.uk/api/game-mode-count";
    private static final int TIMEOUT_MS = 8000;
    private static final ThreadPoolExecutor WORKER = new ThreadPoolExecutor(
            0, 1, 15, TimeUnit.SECONDS, new ArrayBlockingQueue<>(8),
            new ThreadPoolExecutor.DiscardPolicy());

    private GameModeTotals() {}

    static void matchStarted(String mode) {
        submit(mode, "text/plain");
    }

    static String onlineMap(Context context, String candidate) {
        if (candidate != null && candidate.length() <= 160) {
            for (FfaMapCatalog.MapInfo map : FfaMapCatalog.get(context).maps()) {
                if (candidate.equalsIgnoreCase(map.name) || candidate.equalsIgnoreCase(map.level)) return map.name;
            }
            for (ChallengeMapCatalog.MapInfo map : ChallengeMapCatalog.get(context).maps()) {
                if (candidate.equalsIgnoreCase(map.name) || candidate.equalsIgnoreCase(map.level)) return map.name;
            }
        }
        return "Online map";
    }

    /** Lives only in the activity. All calls run on the UI thread. */
    static final class Tracker {
        private String mode;
        private String map;
        private String difficulty;
        private long elapsedMs;
        private long foregroundSince = -1;

        void start(String mode, String map, String difficulty, boolean foreground) {
            if (this.mode != null) return;
            this.mode = mode;
            this.map = map;
            this.difficulty = difficulty;
            elapsedMs = 0;
            setForeground(foreground);
        }

        void setForeground(boolean foreground) {
            if (mode == null) return;
            long now = SystemClock.elapsedRealtime();
            if (foreground && foregroundSince < 0) foregroundSince = now;
            if (!foreground && foregroundSince >= 0) {
                elapsedMs += now - foregroundSince;
                foregroundSince = -1;
            }
        }

        void setCampaignDifficulty(String value) {
            if (!"campaign".equals(mode)) return;
            switch (value) {
                case "easy": case "medium": case "hard": case "insane":
                    difficulty = value;
            }
        }

        void setOnlineMap(String value) {
            if ("multiplayer".equals(mode) && "Online map".equals(map)) map = value;
        }

        void finish(boolean finished) {
            if (mode == null) return;
            setForeground(false);
            String reportedMode = mode;
            mode = null;
            int seconds = (int) Math.min(604800L, (elapsedMs + 999L) / 1000L);
            if (seconds == 0) return;
            try {
                JSONObject report = new JSONObject()
                        .put("mode", reportedMode).put("map", map).put("difficulty", difficulty)
                        .put("seconds", seconds).put("result", finished ? "finished" : "left");
                submit(report.toString(), "application/json");
            } catch (JSONException ignored) {
                Log.w(TAG, "Could not encode play-time report");
            }
        }
    }

    private static void submit(String body, String contentType) {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        WORKER.execute(() -> send(payload, contentType));
    }

    private static void send(byte[] payload, String contentType) {
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
                request.setRequestProperty("Content-Type", contentType);
                request.setFixedLengthStreamingMode(payload.length);
                try (OutputStream output = request.getOutputStream()) {
                    writing = true;
                    output.write(payload);
                }
                int status = request.getResponseCode();
                if (status == 204) Log.d(TAG, "Game stats accepted");
                else Log.w(TAG, "Game stats response HTTP " + status);
                return;
            } catch (IOException ignored) {
                // Retry only before writing. A lost response after writing may already be counted.
                if (writing || attempt == 1) {
                    Log.w(TAG, writing ? "Game stats acknowledgement unavailable" : "Game stats connection unavailable");
                    return;
                }
            } finally {
                if (request != null) request.disconnect();
            }
        }
    }
}
