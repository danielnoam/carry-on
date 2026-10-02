package io.github.danielnoam.carryon.share;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pages shared to Carry-on from another app's share sheet (src/app.js):
 *
 *   take()    what was shared, once: { text, subject } or {}
 *
 * and a "shared" event with nothing in it, a nudge to call take() when a
 * share brings the running app to the front. The intent filter that puts
 * Carry-on in the share sheet is added to MainActivity by
 * tools/android-manifest.js.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private JSObject pending;

    @Override
    public void load() {
        read(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (read(intent)) notifyListeners("shared", new JSObject());
    }

    private boolean read(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return false;
        JSObject shared = new JSObject();
        shared.put("text", text);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null) shared.put("subject", subject);
        pending = shared;
        // Taken off the intent, so recreating the activity doesn't save it twice.
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_SUBJECT);
        return true;
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject out = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(out);
    }
}
