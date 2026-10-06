package io.github.danielnoam.waypage.share;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Feeds checked with the app closed (src/app.js, 0.28.4), through
 * FeedCheckJob:
 *
 *   watch({ feeds: [{ url, title, known }], ask })
 *                 the feeds to read and the posts the app has; none stops
 *                 the checks. `ask` asks to notify (Android 13), once a run.
 *   news()        { feeds: [url], open } once: the feeds with new posts
 *                 since, and whether the app was opened from the
 *                 notification. Takes the notification away.
 *
 * and an "open" event when the notification brings the running app back.
 */
@CapacitorPlugin(name = "Feeds")
public class FeedsPlugin extends Plugin {

    private boolean asked, opened;

    @Override
    public void load() {
        read(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (read(intent)) notifyListeners("open", new JSObject());
    }

    private boolean read(Intent intent) {
        if (intent == null || !FeedCheckJob.OPEN.equals(intent.getAction())) return false;
        intent.setAction(Intent.ACTION_MAIN);
        opened = true;
        return true;
    }

    @PluginMethod
    public void watch(PluginCall call) {
        JSArray feeds = call.getArray("feeds", new JSArray());
        try {
            FeedCheckJob.writeJson(new File(getContext().getFilesDir(), FeedCheckJob.WATCH), feeds.toString());
        } catch (Exception e) {
            call.reject("Couldn't keep the feeds");
            return;
        }
        FeedCheckJob.schedule(getContext(), feeds.length() > 0);
        if (call.getBoolean("ask", false)) askToNotify();
        call.resolve();
    }

    @PluginMethod
    public void news(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(FeedCheckJob.PREFS, android.content.Context.MODE_PRIVATE);
        JSArray urls = new JSArray();
        try {
            JSONObject waiting = new JSONObject(prefs.getString("waiting", "{}"));
            for (Iterator<String> it = waiting.keys(); it.hasNext(); ) urls.put(it.next());
        } catch (Exception e) { /* nothing waiting */ }
        FeedCheckJob.clear(getContext());
        JSObject out = new JSObject();
        out.put("feeds", urls);
        out.put("open", opened);
        opened = false;
        call.resolve(out);
    }

    private void askToNotify() {
        if (asked || Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        asked = true;
        String p = "android.permission.POST_NOTIFICATIONS";
        if (getContext().checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) getActivity().requestPermissions(new String[] { p }, 2710);
    }
}
