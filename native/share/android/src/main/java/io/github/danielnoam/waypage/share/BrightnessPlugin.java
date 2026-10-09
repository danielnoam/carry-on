package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.provider.Settings;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The reader's brightness (1.10.0): a swipe on the left edge sets the
 * window's own brightness, which Android drops when you leave the app.
 *
 *   get()            { level 0 to 1, system }: system when nothing is set
 *   set({ level })   level 0 to 1, or no level for the system's again
 */
@CapacitorPlugin(name = "Brightness")
public class BrightnessPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("No window"); return; }
        a.runOnUiThread(() -> {
            float v = a.getWindow().getAttributes().screenBrightness;
            boolean system = v < 0;
            if (system) {
                try {
                    v = Settings.System.getInt(a.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS) / 255f;
                } catch (Exception e) {
                    v = 0.5f;
                }
            }
            JSObject out = new JSObject();
            out.put("level", (double) Math.max(0f, Math.min(1f, v)));
            out.put("system", system);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void set(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("No window"); return; }
        Double level = call.getDouble("level");
        a.runOnUiThread(() -> {
            WindowManager.LayoutParams lp = a.getWindow().getAttributes();
            lp.screenBrightness = level == null
                ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                : (float) Math.max(0.01, Math.min(1.0, level));
            a.getWindow().setAttributes(lp);
            call.resolve();
        });
    }
}
