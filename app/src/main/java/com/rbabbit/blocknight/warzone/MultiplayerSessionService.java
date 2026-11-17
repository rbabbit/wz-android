package com.rbabbit.blocknight.warzone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Lifetime/CPU protection only for a user-started, still-live multiplayer session. */
public final class MultiplayerSessionService extends Service {
  static final String BACKGROUND = "background";
  private static final String CHANNEL = "multiplayer-session";
  private static final int NOTIFICATION = 86;
  private PowerManager.WakeLock wakeLock;

  @Override public void onCreate() {
    super.onCreate();
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(new NotificationChannel(
        CHANNEL, "Live multiplayer session", NotificationManager.IMPORTANCE_LOW));
    PowerManager power = getSystemService(PowerManager.class);
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":multiplayer");
    wakeLock.setReferenceCounted(false);
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    Intent back = new Intent(this, MultiplayerActivity.class)
        .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent returnToGame = PendingIntent.getActivity(this, 0, back,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification notification = new Notification.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_multiplayer_session)
        .setContentTitle("Warzone multiplayer is active")
        .setContentText("Tap to return to your room or match. Leave in game to disconnect.")
        .setContentIntent(returnToGame).setOngoing(true).setOnlyAlertOnce(true)
        .setCategory(Notification.CATEGORY_SERVICE).build();
    if (Build.VERSION.SDK_INT >= 34)
      startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    else startForeground(NOTIFICATION, notification);
    boolean background = intent != null && intent.getBooleanExtra(BACKGROUND, false);
    if (background && !wakeLock.isHeld()) wakeLock.acquire();
    else if (!background && wakeLock.isHeld()) wakeLock.release();
    // An ended/killed session cannot be recreated from a service intent.
    return START_NOT_STICKY;
  }

  @Override public void onDestroy() {
    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
