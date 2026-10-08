package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Translate on the selection bar (1.8.1): the words go to Google Translate
 * the way the phone's own text menu sends them, as a popup over Waypage.
 * A translate.google.com link opened the app with its box empty.
 *
 *   translate({ text })   { done }: false when the app isn't there
 */
@CapacitorPlugin(name = "Translate")
public class TranslatePlugin extends Plugin {

    private static final String APP = "com.google.android.apps.translate";

    @PluginMethod
    public void translate(PluginCall call) {
        String text = call.getString("text", "");
        Activity a = getActivity();
        boolean done = false;
        if (a != null && !text.isEmpty()) {
            Intent popup = new Intent(Intent.ACTION_PROCESS_TEXT)
                .setType("text/plain")
                .setPackage(APP)
                .putExtra(Intent.EXTRA_PROCESS_TEXT, text)
                .putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
            Intent share = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .setPackage(APP)
                .putExtra(Intent.EXTRA_TEXT, text);
            done = start(a, popup) || start(a, share);
        }
        JSObject out = new JSObject();
        out.put("done", done);
        call.resolve(out);
    }

    private static boolean start(Activity a, Intent i) {
        try {
            a.startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }
}
