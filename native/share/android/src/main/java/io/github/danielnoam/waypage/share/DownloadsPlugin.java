package io.github.danielnoam.waypage.share;

import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Downloads (src/app.js, 0.27.9): keeps the app running while pages are
 * saved, through DownloadService.
 *
 *   update({ title, text, done, total })   starts or updates it
 *   stop()                                 once nothing is left
 *
 * and a "stop" event when the notification's Stop is tapped.
 */
@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    private boolean asked;

    @Override
    public void load() {
        DownloadService.onStop = () -> notifyListeners("stop", new JSObject());
    }

    @PluginMethod
    public void update(PluginCall call) {
        askToNotify();
        DownloadService.show(getContext(), call.getString("title", "Saving"), call.getString("text", ""),
            call.getInt("done", 0), call.getInt("total", 0));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        DownloadService.end();
        call.resolve();
    }

    // Android 13 hides the progress notification until it's allowed; asked
    // once a run of the app, at the first download.
    private void askToNotify() {
        if (asked || Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        asked = true;
        String p = "android.permission.POST_NOTIFICATIONS";
        if (getContext().checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) getActivity().requestPermissions(new String[] { p }, 2709);
    }
}
