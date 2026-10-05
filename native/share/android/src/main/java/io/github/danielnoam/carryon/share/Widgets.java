package io.github.danielnoam.carryon.share;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home screen widgets (0.29.0): Keep reading and Feeds. The app writes
 * what they show (WidgetsPlugin.update) and they only draw it; a tap opens
 * the app with an OPEN intent that names what to show, which the plugin
 * hands to the page.
 */
final class Widgets {

    static final String OPEN = "io.github.danielnoam.carryon.WIDGET";
    static final String PREFS = "carryon-widgets";
    private static final int[] POSTS = { R.id.w_post0, R.id.w_post1, R.id.w_post2 };
    private static final int[] TITLES = { R.id.w_post0_title, R.id.w_post1_title, R.id.w_post2_title };
    private static final int[] SITES = { R.id.w_post0_site, R.id.w_post1_site, R.id.w_post2_site };
    private static final int[] FAVS = { R.id.w_fav0, R.id.w_fav1, R.id.w_fav2, R.id.w_fav3 };
    private static final int[] FAV_TITLES = { R.id.w_fav0_title, R.id.w_fav1_title, R.id.w_fav2_title, R.id.w_fav3_title };
    private static final int[] FAV_METAS = { R.id.w_fav0_meta, R.id.w_fav1_meta, R.id.w_fav2_meta, R.id.w_fav3_meta };

    private Widgets() {}

    static JSONObject data(Context ctx) {
        try { return new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
        refresh(ctx);
    }

    static void refresh(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] reading = m.getAppWidgetIds(new ComponentName(ctx, ReadingWidget.class));
        for (int id : reading) m.updateAppWidget(id, reading(ctx, m, id));
        int[] feeds = m.getAppWidgetIds(new ComponentName(ctx, FeedsWidget.class));
        if (feeds.length > 0) m.updateAppWidget(feeds, feeds(ctx));
        int[] favs = m.getAppWidgetIds(new ComponentName(ctx, FavouritesWidget.class));
        if (favs.length > 0) m.updateAppWidget(favs, favourites(ctx));
    }

    // `what` goes in the intent's address so each tap is its own
    // PendingIntent: carryon-widget://page/<id>, …/post?url=…, …/feeds.
    private static PendingIntent open(Context ctx, int code, Uri what) {
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (i == null) return null;
        i.setAction(OPEN);
        i.setData(what);
        i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // Keep reading shrinks to one row (0.29.1): Android 12 and later pick
    // the layout for the size themselves; before that, it is picked from
    // the size the widget was given, which is the height in portrait.
    static RemoteViews reading(Context ctx, AppWidgetManager m, int id) {
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> sizes = new HashMap<>();
            sizes.put(new SizeF(110f, 40f), reading(ctx, R.layout.carryon_widget_reading_small));
            sizes.put(new SizeF(110f, 100f), reading(ctx, R.layout.carryon_widget_reading));
            return new RemoteViews(sizes);
        }
        Bundle o = m.getAppWidgetOptions(id);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return reading(ctx, h > 0 && h < 100 ? R.layout.carryon_widget_reading_small : R.layout.carryon_widget_reading);
    }

    private static RemoteViews reading(Context ctx, int layout) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        JSONObject r = data(ctx).optJSONObject("reading");
        if (r == null || r.optString("id", "").isEmpty()) {
            v.setTextViewText(R.id.w_title, "Nothing open yet");
            v.setTextViewText(R.id.w_meta, "Save a clip, and it waits here.");
            v.setViewVisibility(R.id.w_progress, View.GONE);
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, 10, Uri.parse("carryon-widget://library")));
            return v;
        }
        v.setTextViewText(R.id.w_title, r.optString("title", ""));
        v.setTextViewText(R.id.w_meta, r.optString("meta", ""));
        v.setViewVisibility(R.id.w_progress, View.VISIBLE);
        v.setProgressBar(R.id.w_progress, 1000, (int) Math.round(r.optDouble("at", 0) * 1000), false);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 11, Uri.parse("carryon-widget://page/" + Uri.encode(r.optString("id", "")))));
        return v;
    }

    static RemoteViews feeds(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.carryon_widget_feeds);
        JSONObject f = data(ctx).optJSONObject("feeds");
        JSONArray posts = f != null ? f.optJSONArray("posts") : null;
        int fresh = (f != null ? f.optInt("fresh", 0) : 0) + waiting(ctx);
        v.setTextViewText(R.id.w_fresh, fresh + " new");
        v.setViewVisibility(R.id.w_fresh, fresh > 0 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 20, Uri.parse("carryon-widget://feeds")));
        int n = posts == null ? 0 : Math.min(posts.length(), POSTS.length);
        v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, f == null || !f.optBoolean("following", false) ? "Follow a site in Feeds, and its newest posts show here." : "No new posts.");
        for (int i = 0; i < POSTS.length; i++) {
            JSONObject p = i < n ? posts.optJSONObject(i) : null;
            if (p == null) { v.setViewVisibility(POSTS[i], View.GONE); continue; }
            v.setViewVisibility(POSTS[i], View.VISIBLE);
            v.setTextViewText(TITLES[i], p.optString("title", ""));
            v.setTextViewText(SITES[i], p.optString("site", ""));
            v.setOnClickPendingIntent(POSTS[i], open(ctx, 21 + i, Uri.parse("carryon-widget://post").buildUpon().appendQueryParameter("url", p.optString("url", "")).build()));
        }
        return v;
    }

    static RemoteViews favourites(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.carryon_widget_favourites);
        JSONArray list = data(ctx).optJSONArray("favourites");
        int n = list == null ? 0 : Math.min(list.length(), FAVS.length);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 30, Uri.parse("carryon-widget://favourites")));
        v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, "Hold a clip in Carry-on and tap Favourite, and it shows here.");
        for (int i = 0; i < FAVS.length; i++) {
            JSONObject p = i < n ? list.optJSONObject(i) : null;
            if (p == null) { v.setViewVisibility(FAVS[i], View.GONE); continue; }
            v.setViewVisibility(FAVS[i], View.VISIBLE);
            v.setTextViewText(FAV_TITLES[i], p.optString("title", ""));
            v.setTextViewText(FAV_METAS[i], p.optString("meta", ""));
            v.setOnClickPendingIntent(FAVS[i], open(ctx, 31 + i, Uri.parse("carryon-widget://page/" + Uri.encode(p.optString("id", "")))));
        }
        return v;
    }

    // New posts the closed app's checks found (FeedCheckJob), not yet read.
    private static int waiting(Context ctx) {
        int n = 0;
        try {
            JSONObject w = new JSONObject(ctx.getSharedPreferences(FeedCheckJob.PREFS, Context.MODE_PRIVATE).getString("waiting", "{}"));
            for (Iterator<String> it = w.keys(); it.hasNext(); ) {
                JSONObject one = w.optJSONObject(it.next());
                if (one != null) n += one.optInt("count", 0);
            }
        } catch (Exception e) { /* none */ }
        return n;
    }
}
