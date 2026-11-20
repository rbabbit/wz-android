package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Quiet startup metadata check; full signed-APK downloads remain user-initiated. */
final class AppUpdateController {
    private static final int STARTUP_TIMEOUT_MS = 4000;
    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile HttpURLConnection connection;
    private volatile int generation;
    private boolean closed;
    private boolean homeVisible, startupStarted, startupPromptShown;
    private AppUpdatePolicy pendingStartupUpdate;
    private AlertDialog startupPrompt;
    private AlertDialog dialog;
    private TextView message;
    private ProgressBar progress;

    AppUpdateController(Activity activity) { this.activity = activity; }

    void onHomeVisible(boolean visible) {
        if (closed) return;
        homeVisible = visible;
        if (!visible) {
            if (startupPrompt != null) { startupPrompt.dismiss(); startupPrompt = null; }
            return;
        }
        if (!startupStarted) {
            startupStarted = true;
            checkQuietly();
        }
        showStartupUpdateIfReady();
    }

    private void checkQuietly() {
        int token = cancelWork();
        worker.execute(() -> {
            try {
                AppUpdatePolicy feed = fetchFeed(token, STARTUP_TIMEOUT_MS, STARTUP_TIMEOUT_MS);
                if (!feed.newerThan(version(installedPackage()))) return;
                ensureActive(token);
                main.post(() -> {
                    if (closed || token != generation) return;
                    pendingStartupUpdate = feed;
                    showStartupUpdateIfReady();
                });
            } catch (Exception ignored) { /* Startup failures stay silent; manual checks remain available. */ }
        });
    }

    private void showStartupUpdateIfReady() {
        if (closed || !homeVisible || startupPromptShown || pendingStartupUpdate == null
                || dialog != null || startupPrompt != null || activity.isFinishing() || activity.isDestroyed()) return;
        AppUpdatePolicy feed = pendingStartupUpdate;
        pendingStartupUpdate = null;
        startupPromptShown = true;
        String whatsNew = feed.notes.isEmpty() ? "" : "\n\nWhat's new\n" + feed.notes;
        AlertDialog prompt = new AlertDialog.Builder(activity).setTitle("Update available")
                .setMessage("Version " + feed.versionName + " is available from wz2100.uk."
                        + whatsNew + "\n\nDownload the complete app (" + megabytes(feed.sizeBytes)
                        + ")? Your saves and progress stay in place.")
                .setPositiveButton("Update", (ignored, which) -> {
                    startupPrompt = null;
                    if (!closed && homeVisible && !activity.isFinishing() && !activity.isDestroyed()) showDialog(feed);
                })
                .setNegativeButton("Later", null).create();
        startupPrompt = prompt;
        prompt.setOnDismissListener(ignored -> { if (startupPrompt == prompt) startupPrompt = null; });
        try {
            prompt.show();
            if (prompt.getWindow() != null) prompt.getWindow().setBackgroundDrawableResource(android.R.color.black);
            for (int which : new int[]{AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE}) {
                prompt.getButton(which).setTextColor(TowersTheme.TEXT);
                prompt.getButton(which).setMinHeight(dp(48));
            }
        } catch (RuntimeException ignored) { startupPrompt = null; }
    }

    void show() {
        if (closed || dialog != null || activity.isFinishing() || activity.isDestroyed()) return;
        // An explicit check takes priority over every in-flight or deferred startup result.
        startupStarted = true;
        pendingStartupUpdate = null;
        cancelWork();
        if (startupPrompt != null) { startupPrompt.dismiss(); startupPrompt = null; }
        showDialog(null);
    }

    private void showDialog(AppUpdatePolicy acceptedUpdate) {
        if (closed || activity.isFinishing() || activity.isDestroyed()) return;
        if (dialog != null) return;
        LinearLayout body = new LinearLayout(activity);
        body.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        body.setPadding(pad, dp(8), pad, 0);
        message = new TextView(activity);
        message.setTextColor(TowersTheme.TEXT);
        message.setTextSize(15);
        message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        body.addView(message, new LinearLayout.LayoutParams(-1, -2));
        progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        LinearLayout.LayoutParams bar = new LinearLayout.LayoutParams(-1, dp(12));
        bar.topMargin = dp(16); bar.bottomMargin = dp(12);
        body.addView(progress, bar);
        dialog = new AlertDialog.Builder(activity).setTitle("App updates").setView(body)
                .setPositiveButton("Check", null).setNegativeButton("Close", null).create();
        dialog.setOnDismissListener(ignored -> {
            cancelWork(); dialog = null; message = null; progress = null;
        });
        dialog.show();
        if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawableResource(android.R.color.black);
        for (int which : new int[]{AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE}) {
            Button button = dialog.getButton(which);
            button.setTextColor(TowersTheme.TEXT);
            button.setMinHeight(dp(48));
        }
        if (acceptedUpdate == null) check();
        else download(acceptedUpdate);
    }

    private void check() {
        int token = cancelWork();
        state("Checking wz2100.uk...", true, null, null);
        worker.execute(() -> {
            try {
                AppUpdatePolicy feed = fetchFeed(token);
                PackageInfo installed = installedPackage();
                ensureActive(token);
                post(token, () -> {
                    if (!feed.newerThan(version(installed))) {
                        state("You have the latest available version.\nInstalled: " + installed.versionName,
                                false, "Check again", this::check);
                    } else {
                        String notes = feed.notes.isEmpty() ? "" : "\n\n" + feed.notes;
                        state("Version " + feed.versionName + " is available (" + megabytes(feed.sizeBytes)
                                + ").\n\nThis downloads the complete app. Your saves, designs and preferences stay in place."
                                + " Android will ask you to approve installation." + notes,
                                false, "Download", () -> download(feed));
                    }
                });
            } catch (Exception error) { failure(token, error, this::check); }
        });
    }

    private AppUpdatePolicy fetchFeed(int token) throws Exception {
        return fetchFeed(token, 15000, 20000);
    }

    private AppUpdatePolicy fetchFeed(int token, int connectTimeout, int readTimeout) throws Exception {
        HttpURLConnection request = open(AppUpdatePolicy.FEED_URL, token, connectTimeout, readTimeout);
        try {
            request.setRequestProperty("Accept", "application/json");
            if (request.getResponseCode() != 200) throw new IOException("The update server is unavailable.");
            if (request.getContentLengthLong() > 32768) throw new IllegalArgumentException("The update information is too large.");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = request.getInputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    ensureActive(token);
                    if (bytes.size() + count > 32768) throw new IllegalArgumentException("The update information is too large.");
                    bytes.write(buffer, 0, count);
                }
            }
            JSONObject json = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            return new AppUpdatePolicy((int) integer(json, "schemaVersion"), json.getString("applicationId"),
                    integer(json, "versionCode"), json.getString("versionName"), json.getString("apkUrl"),
                    integer(json, "sizeBytes"), json.getString("sha256"), json.optString("notes", ""));
        } finally { request.disconnect(); clearConnection(request); }
    }

    private static long integer(JSONObject json, String key) throws Exception {
        Object value = json.get(key);
        if (!(value instanceof Integer) && !(value instanceof Long)) {
            throw new IllegalArgumentException("The update information is invalid.");
        }
        long number = ((Number) value).longValue();
        if (number < 0 || ("schemaVersion".equals(key) && number > Integer.MAX_VALUE)) {
            throw new IllegalArgumentException("The update information is invalid.");
        }
        return number;
    }

    private void download(AppUpdatePolicy feed) {
        int token = cancelWork();
        state("Downloading " + feed.versionName + "...\n0 / " + megabytes(feed.sizeBytes), true, null, null);
        progress.setIndeterminate(false); progress.setMax(100); progress.setProgress(0);
        worker.execute(() -> {
            File part = new File(AppUpdateProvider.apkFile(activity).getParentFile(), "download.part.apk");
            try {
                File apk = AppUpdateProvider.apkFile(activity), directory = apk.getParentFile();
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Could not prepare the update download.");
                if (!matches(apk, feed, token)) {
                    if (directory.getUsableSpace() < feed.sizeBytes + 32L * 1024 * 1024) {
                        throw new IOException("Not enough free space for the update. Free some storage and retry.");
                    }
                    downloadBytes(part, feed, token);
                    ensureActive(token);
                    if (!matches(part, feed, token)) throw new IllegalArgumentException("The download failed its checksum. Retry the download.");
                    validateApk(part, feed);
                    ensureActive(token);
                    Files.move(part.toPath(), apk.toPath(), StandardCopyOption.REPLACE_EXISTING);
                } else validateApk(apk, feed);
                post(token, () -> state("Version " + feed.versionName
                        + " is downloaded and verified.\n\nTap Install to open Android's installation approval."
                        + " Your existing app data stays in place.", false, "Install", this::install));
            } catch (Exception error) { failure(token, error, () -> download(feed)); }
            finally { if (part.exists()) part.delete(); }
        });
    }

    private void downloadBytes(File part, AppUpdatePolicy feed, int token) throws Exception {
        HttpURLConnection request = open(feed.apkUrl, token);
        try {
            request.setRequestProperty("Accept", "application/vnd.android.package-archive");
            if (request.getResponseCode() != 200) throw new IOException("The update download is unavailable. Retry shortly.");
            long declared = request.getContentLengthLong();
            if (declared >= 0 && declared != feed.sizeBytes) throw new IllegalArgumentException("The download size does not match the update information.");
            long[] lastProgress = {0};
            try (InputStream input = request.getInputStream(); FileOutputStream output = new FileOutputStream(part)) {
                AppUpdateTransfer.copy(input, output, feed.sizeBytes, () -> ensureActive(token), downloaded -> {
                    long now = android.os.SystemClock.uptimeMillis();
                    if (now - lastProgress[0] >= 250 || downloaded == feed.sizeBytes) {
                        lastProgress[0] = now;
                        post(token, () -> {
                            progress.setProgress((int) (downloaded * 100 / feed.sizeBytes));
                            message.setText("Downloading " + feed.versionName + "...\n" + megabytes(downloaded)
                                    + " / " + megabytes(feed.sizeBytes));
                        });
                    }
                });
                output.getFD().sync();
            }
            post(token, () -> {
                progress.setIndeterminate(true);
                message.setText("Verifying the download and app signature...");
            });
        } finally { request.disconnect(); clearConnection(request); }
    }

    private boolean matches(File file, AppUpdatePolicy feed, int token) throws Exception {
        return AppUpdateTransfer.matches(file, feed.sizeBytes, feed.sha256, () -> ensureActive(token));
    }

    private void validateApk(File apk, AppUpdatePolicy feed) throws Exception {
        PackageManager manager = activity.getPackageManager();
        PackageInfo candidate = manager.getPackageArchiveInfo(apk.getAbsolutePath(), signingFlags());
        PackageInfo installed = installedPackage();
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName)
                || version(candidate) != feed.versionCode || !feed.versionName.equals(candidate.versionName)
                || !feed.newerThan(version(installed)) || candidate.applicationInfo == null
                || candidate.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT
                || !AppUpdatePolicy.sameSigners(signers(installed), signers(candidate))) {
            throw new IllegalArgumentException("This APK does not match the installed app and update version. Nothing was installed.");
        }
        // The system installer performs the final APK signature/integrity verification.
    }

    private static int signingFlags() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }
    private PackageInfo installedPackage() throws PackageManager.NameNotFoundException {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(), signingFlags());
    }
    private static long version(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }
    private static byte[][] signers(PackageInfo info) {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
                ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        if (signatures == null) return null;
        byte[][] bytes = new byte[signatures.length][];
        for (int i = 0; i < signatures.length; i++) bytes[i] = signatures[i].toByteArray();
        return bytes;
    }

    private void install() {
        if (dialog == null || closed || activity.isFinishing()) return;
        try {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                state("Android requires permission to install an update from this app.\n\nAllow this source in Settings, then return here and tap Install."
                        + " Android will still ask you to approve the update.", false, "Allow installs", () -> {
                    try {
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.getPackageName())));
                        state("Return from Settings, then tap Install to open Android's installation approval.",
                                false, "Install", this::install);
                    } catch (RuntimeException error) {
                        state("Could not open Android installation settings. Try again.", false, "Install", this::install);
                    }
                });
                return;
            }
            Uri uri = AppUpdateProvider.apkUri(activity);
            Intent installer = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installer.setClipData(ClipData.newRawUri("Warzone update", uri));
            activity.startActivity(installer);
            state("Android is handling the update. Approve installation there.\n\nIf you cancel, you can tap Install again.",
                    false, "Install", this::install);
        } catch (RuntimeException error) {
            state("Android could not open the installer. You can retry or download the APK from wz2100.uk.",
                    false, "Install", this::install);
        }
    }

    private HttpURLConnection open(String url, int token) throws Exception {
        return open(url, token, 15000, 20000);
    }

    private HttpURLConnection open(String url, int token, int connectTimeout, int readTimeout) throws Exception {
        ensureActive(token);
        HttpURLConnection request = (HttpURLConnection) new URL(url).openConnection();
        connection = request;
        request.setConnectTimeout(connectTimeout); request.setReadTimeout(readTimeout);
        request.setInstanceFollowRedirects(false); request.setUseCaches(false);
        request.setRequestProperty("Accept-Encoding", "identity");
        try { ensureActive(token); }
        catch (IOException cancelled) { request.disconnect(); clearConnection(request); throw cancelled; }
        return request;
    }
    private void clearConnection(HttpURLConnection request) { if (connection == request) connection = null; }
    private int cancelWork() {
        int token = ++generation;
        HttpURLConnection request = connection;
        if (request != null) request.disconnect();
        return token;
    }
    private void ensureActive(int token) throws IOException {
        if (token != generation || Thread.currentThread().isInterrupted()) throw new IOException("Cancelled");
    }
    private void post(int token, Runnable action) {
        main.post(() -> { if (token == generation && !closed && dialog != null
                && !activity.isFinishing() && !activity.isDestroyed()) action.run(); });
    }
    private void failure(int token, Exception error, Runnable retry) {
        String text;
        if (error instanceof IllegalArgumentException) text = error.getMessage();
        else if (error instanceof java.net.UnknownHostException) text = "Could not reach wz2100.uk. Check your connection and retry.";
        else if (error instanceof java.net.SocketTimeoutException) text = "The update server took too long to respond. Retry when connected.";
        else if (error instanceof org.json.JSONException) text = "The update information is invalid. Retry later.";
        else if (error instanceof IOException && error.getMessage() != null
                && (error.getMessage().startsWith("Not enough free space")
                || error.getMessage().startsWith("Could not prepare"))) text = error.getMessage();
        else text = "The update could not finish. Check your connection and free storage, then retry.";
        final String detail = text == null ? "The update could not finish. Retry later." : text;
        post(token, () -> state(detail, false, "Retry", retry));
    }
    private void state(String text, boolean busy, String actionLabel, Runnable action) {
        if (dialog == null) return;
        message.setText(text);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        if (busy) progress.setIndeterminate(true);
        Button button = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
        button.setVisibility(action == null ? View.GONE : View.VISIBLE);
        if (action != null) { button.setText(actionLabel); button.setOnClickListener(ignored -> action.run()); }
    }
    private static String megabytes(long bytes) { return String.format(Locale.ROOT, "%.1f MB", bytes / 1000000d); }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    void close() {
        closed = true; cancelWork();
        homeVisible = false; pendingStartupUpdate = null;
        if (startupPrompt != null) { startupPrompt.dismiss(); startupPrompt = null; }
        if (dialog != null) dialog.dismiss();
        worker.shutdownNow();
    }
}
