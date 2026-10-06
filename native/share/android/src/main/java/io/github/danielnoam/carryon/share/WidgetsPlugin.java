package io.github.danielnoam.carryon.share;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Home screen widgets (src/app.js, 0.29.0), drawn by Widgets:
 *
 *   update({ reading: { id, title, meta, at } | null,
 *            feeds: { following, fresh, posts: [{ title, site, url }] } })
 *   renamed({ from, to })   a collection widget follows a renamed collection
 *   take()    { kind: "page" | "post" | "feeds" | "library" | "favourites" | "collection", id, url, name } once,
 *             what a widget's tap asked to open, or {}
 *
 * and an "open" event when a tap brings the running app back.
 */
@CapacitorPlugin(name = "Widgets")
public class WidgetsPlugin extends Plugin {

    private JSObject pending;

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
        if (intent == null || !Widgets.OPEN.equals(intent.getAction()) || intent.getData() == null) return false;
        Uri u = intent.getData();
        JSObject out = new JSObject();
        String kind = u.getHost() == null ? "" : u.getHost();
        out.put("kind", kind);
        if (kind.equals("page") && u.getLastPathSegment() != null) out.put("id", u.getLastPathSegment());
        if (kind.equals("post")) out.put("url", u.getQueryParameter("url"));
        if (kind.equals("collection")) out.put("name", u.getQueryParameter("name"));
        pending = out;
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        return true;
    }

    @PluginMethod
    public void update(PluginCall call) {
        Widgets.save(getContext(), call.getData().toString());
        call.resolve();
    }

    @PluginMethod
    public void renamed(PluginCall call) {
        String from = call.getString("from", ""), to = call.getString("to", "");
        if (!from.isEmpty() && !to.isEmpty()) {
            Widgets.rename(getContext(), from, to);
            Widgets.refresh(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject out = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(out);
    }
}
