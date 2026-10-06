package io.github.danielnoam.waypage.share;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps the app running while pages are being saved (0.27.9). The saving
 * itself stays in the WebView, whose timers Capacitor never pauses; what
 * stops it with the app put away is Android freezing or killing the
 * process. A foreground service of type dataSync, with a partial wake
 * lock, keeps the process up and shows the progress as a notification,
 * with Stop.
 *
 * DownloadsPlugin calls show() as the progress moves and end() once
 * nothing is left; both run in the app's process.
 */
public class DownloadService extends Service {

    static final String STOP = "stop";
    private static final String CHANNEL = "waypage-downloads";
    private static final int NOTE = 28;
    // The lock lapses on its own if the page stops sending progress.
    private static final long LEASE_MS = 10 * 60 * 1000;

    static String title = "Saving", text = "";
    static int done, total;
    static boolean wanted;
    static Runnable onStop;
    static DownloadService running;

    private PowerManager.WakeLock wake;

    static void show(Context ctx, String t, String x, int d, int n) {
        title = t;
        text = x;
        done = d;
        total = n;
        wanted = true;
        if (running != null) {
            running.post();
            return;
        }
        Intent i = new Intent(ctx, DownloadService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception e) {
            // Not allowed from the background (Android 12+): saving goes on
            // for as long as Android leaves the app running.
        }
    }

    static void end() {
        wanted = false;
        if (running != null) running.finish();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "waypage:downloads");
        wake.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // startForeground comes first every time: a service started with
        // startForegroundService that doesn't call it is a crash.
        foreground();
        if (intent != null && STOP.equals(intent.getAction())) {
            Runnable r = onStop;
            if (r != null) r.run();
            wanted = false;
        }
        if (!wanted) {
            finish();
            return START_NOT_STICKY;
        }
        wake.acquire(LEASE_MS);
        return START_NOT_STICKY;
    }

    private void foreground() {
        Notification n = notification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTE, n);
    }

    void post() {
        if (wake != null) wake.acquire(LEASE_MS);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTE, notification());
    }

    @SuppressWarnings("deprecation")
    void finish() {
        if (wake != null && wake.isHeld()) wake.release();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    // Android 14 and 15 end a dataSync service after its daily allowance.
    public void onTimeout(int startId) { finish(); }

    public void onTimeout(int startId, int type) { finish(); }

    @SuppressWarnings("deprecation")
    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            b.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        Intent stop = new Intent(this, DownloadService.class).setAction(STOP);
        PendingIntent stopIt = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return b.setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(text)
            .setProgress(Math.max(total, 0), Math.max(0, Math.min(done, total)), total <= 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIt).build())
            .build();
    }

    @Override
    public void onDestroy() {
        if (wake != null && wake.isHeld()) wake.release();
        if (running == this) running = null;
        super.onDestroy();
    }
}
