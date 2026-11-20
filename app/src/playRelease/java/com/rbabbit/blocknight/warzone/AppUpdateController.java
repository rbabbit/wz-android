package com.rbabbit.blocknight.warzone;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;

/** Optional Play update notice; installation and downloads remain in Google Play. */
final class AppUpdateController {
    private static final long CHECK_TIMEOUT_MS = 5_000L;

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean homeVisible;
    private boolean closed;
    private boolean inFlight;
    private boolean promptConsumed;
    private boolean startupStarted;
    private long generation;
    private long installedVersion;
    private long availableVersion;
    private Runnable timeout;
    private AlertDialog dialog;

    AppUpdateController(Activity activity) { this.activity = activity; }

    /** The explicit Home action always opens this app's Play listing. */
    void show() {
        onMain(() -> {
            if (!live()) return;
            startupStarted = true;
            promptConsumed = true;
            stopRequest();
            dismissPrompt();
            openListing();
        });
    }

    void onHomeVisible(boolean visible) {
        onMain(() -> {
            if (closed) return;
            homeVisible = visible;
            if (!visible) {
                dismissPrompt();
                return;
            }
            if (!live()) return;
            if (!startupStarted) {
                startupStarted = true;
                checkQuietly();
            }
            maybePrompt();
        });
    }

    private void checkQuietly() {
        if (!live() || !homeVisible || promptConsumed) return;
        final long token = ++generation;
        try {
            PackageInfo installed = activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0);
            installedVersion = Build.VERSION.SDK_INT >= 28
                    ? installed.getLongVersionCode() : installed.versionCode;
            AppUpdateManager manager = AppUpdateManagerFactory.create(activity.getApplicationContext());
            inFlight = true;
            timeout = () -> {
                if (inFlight && generation == token) stopRequest();
            };
            main.postDelayed(timeout, CHECK_TIMEOUT_MS);
            manager.getAppUpdateInfo()
                    .addOnSuccessListener(info -> acceptInfo(token, info))
                    .addOnFailureListener(ignored -> finishRequest(token))
                    .addOnCanceledListener(() -> finishRequest(token));
        } catch (Exception ignored) {
            // Missing Play Store, offline devices and unavailable updates stay silent.
            stopRequest();
        }
    }

    private void acceptInfo(long token, AppUpdateInfo info) {
        if (!live() || !inFlight || generation != token) return;
        finishRequest(token);
        if (info != null && info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                && info.availableVersionCode() > installedVersion) {
            availableVersion = info.availableVersionCode();
            maybePrompt();
        }
    }

    private void maybePrompt() {
        if (!live() || !homeVisible || promptConsumed || dialog != null
                || availableVersion <= installedVersion) return;
        promptConsumed = true;
        final AlertDialog prompt = new AlertDialog.Builder(activity)
                .setTitle("Update available")
                .setMessage("A newer version is available on Google Play. You can update now or keep playing.")
                .setPositiveButton("Update", (ignored, which) -> {
                    if (live() && homeVisible) openListing();
                })
                .setNegativeButton("Later", null)
                .create();
        dialog = prompt;
        prompt.setOnDismissListener(ignored -> {
            if (dialog == prompt) dialog = null;
        });
        try {
            prompt.show();
            if (prompt.getWindow() != null) {
                prompt.getWindow().setBackgroundDrawable(new ColorDrawable(TowersTheme.PANEL));
            }
            int minHeight = Math.round(48 * activity.getResources().getDisplayMetrics().density);
            for (int which : new int[]{AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE}) {
                Button button = prompt.getButton(which);
                button.setTextColor(TowersTheme.TEXT);
                button.setMinHeight(minHeight);
            }
        } catch (RuntimeException ignored) {
            dismissPrompt();
        }
    }

    private void openListing() {
        if (!live()) return;
        String packageName = activity.getPackageName();
        Intent market = new Intent(Intent.ACTION_VIEW,
                Uri.parse("market://details?id=" + Uri.encode(packageName)))
                .setPackage("com.android.vending");
        try {
            activity.startActivity(market);
            return;
        } catch (ActivityNotFoundException | SecurityException ignored) {
            // Devices without Play Store can still open the app's public listing.
        }
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + Uri.encode(packageName))));
        } catch (ActivityNotFoundException | SecurityException ignored) {
            // This optional action must not interrupt the game.
        }
    }

    private void finishRequest(long token) {
        if (!inFlight || generation != token) return;
        inFlight = false;
        if (timeout != null) main.removeCallbacks(timeout);
        timeout = null;
    }

    private void stopRequest() {
        generation++;
        inFlight = false;
        if (timeout != null) main.removeCallbacks(timeout);
        timeout = null;
    }

    private void dismissPrompt() {
        AlertDialog shown = dialog;
        dialog = null;
        if (shown != null) shown.dismiss();
    }

    private boolean live() {
        return !closed && !activity.isFinishing() && !activity.isDestroyed();
    }

    private void onMain(Runnable action) {
        if (Looper.myLooper() == main.getLooper()) action.run();
        else main.post(action);
    }

    void close() {
        onMain(() -> {
            if (closed) return;
            closed = true;
            homeVisible = false;
            stopRequest();
            dismissPrompt();
        });
    }
}
