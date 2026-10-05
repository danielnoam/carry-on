package io.github.danielnoam.carryon.share;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Xml;
import android.webkit.WebSettings;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

/**
 * Reads the followed feeds every few hours while the app is closed
 * (0.28.4), and says in a notification when they have new posts. Nothing
 * is saved here: the app reads the feeds itself when it's opened, as it
 * always has, and saves what it's set to save then.
 *
 * The app hands over feeds.json (FeedsPlugin.watch): each feed's address,
 * title and the posts it already has (ids and addresses). A post is new
 * when none of its ids is among them, nor among those told about already
 * (told.json), so a post is never announced twice. What's waiting is kept
 * in preferences for the app to take when it opens (FeedsPlugin.news).
 */
public class FeedCheckJob extends JobService {

    static final String OPEN = "io.github.danielnoam.carryon.FEEDS";
    static final String PREFS = "carryon-feeds";
    static final String WATCH = "feeds.json";
    private static final String TOLD = "feeds-told.json";
    private static final String CHANNEL = "carryon-feeds";
    private static final int JOB = 2804;
    private static final int NOTE = 29;
    private static final long EVERY_MS = 3 * 60 * 60 * 1000L;
    private static final long FLEX_MS = 60 * 60 * 1000L;
    private static final int MAX_ITEMS = 50;
    private static final int MAX_TOLD = 300;
    private static final int MAX_BYTES = 4 * 1024 * 1024;
    private static final int TIMEOUT_MS = 20000;
    private static final String ACCEPT = "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8";

    private volatile boolean stopped;

    static void schedule(Context ctx, boolean on) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (!on) {
            js.cancel(JOB);
            return;
        }
        if (js.getPendingJob(JOB) != null) return;
        JobInfo job = new JobInfo.Builder(JOB, new ComponentName(ctx, FeedCheckJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(EVERY_MS, FLEX_MS)
            .setPersisted(true)
            .build();
        try { js.schedule(job); } catch (Exception e) { /* refused: checks wait for the app */ }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        stopped = false;
        new Thread(() -> {
            try { run(); } catch (Exception e) { /* the next run tries again */ }
            jobFinished(params, false);
        }, "carryon-feeds").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        stopped = true;
        return true;
    }

    private void run() throws Exception {
        JSONArray watch = readJson(new File(getFilesDir(), WATCH), new JSONArray());
        if (watch.length() == 0) return;
        File toldFile = new File(getFilesDir(), TOLD);
        JSONObject told = readJson(toldFile, new JSONObject());
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONObject waiting = new JSONObject(prefs.getString("waiting", "{}"));
        boolean found = false;
        for (int i = 0; i < watch.length() && !stopped; i++) {
            JSONObject f = watch.optJSONObject(i);
            if (f == null) continue;
            String url = f.optString("url", "");
            if (!url.startsWith("http")) continue;
            List<Set<String>> posts;
            try { posts = read(url); } catch (Exception e) { continue; }
            Set<String> known = new HashSet<>();
            JSONArray k = f.optJSONArray("known");
            if (k != null) for (int j = 0; j < k.length(); j++) known.add(k.optString(j));
            JSONArray t = told.optJSONArray(url);
            if (t != null) for (int j = 0; j < t.length(); j++) known.add(t.optString(j));
            List<String> fresh = new ArrayList<>();
            int n = 0;
            for (Set<String> keys : posts) {
                boolean seen = false;
                for (String key : keys) if (known.contains(key)) { seen = true; break; }
                if (!seen) { fresh.addAll(keys); n++; }
            }
            if (n == 0) continue;
            JSONArray now = new JSONArray();
            for (String key : fresh) now.put(key);
            if (t != null) for (int j = 0; j < t.length() && now.length() < MAX_TOLD; j++) now.put(t.optString(j));
            told.put(url, now);
            JSONObject w = waiting.optJSONObject(url);
            if (w == null) w = new JSONObject().put("title", f.optString("title", "")).put("count", 0);
            w.put("count", w.optInt("count", 0) + n);
            waiting.put(url, w);
            found = true;
        }
        if (!found) return;
        writeJson(toldFile, told.toString());
        prefs.edit().putString("waiting", waiting.toString()).apply();
        notify(this, waiting);
    }

    // ---- Reading a feed: each post as the set of ids it can go by ----

    private List<Set<String>> read(String address) throws Exception {
        URL url = new URL(address);
        HttpURLConnection c = null;
        for (int hop = 0; hop < 5; hop++) {
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Accept", ACCEPT);
            c.setRequestProperty("User-Agent", userAgent(this));
            int code = c.getResponseCode();
            if (code < 300 || code >= 400) break;
            String to = c.getHeaderField("Location");
            c.disconnect();
            if (to == null) throw new Exception("redirect");
            url = new URL(url, to);
        }
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        byte[] body;
        try (InputStream in = c.getInputStream()) { body = readAll(in, MAX_BYTES); }
        finally { c.disconnect(); }
        int at = 0;
        while (at < body.length && (Character.isWhitespace(body[at]) || (body[at] & 0xff) >= 0xef)) at++;
        if (at < body.length && body[at] == '{') return fromJson(new String(body, StandardCharsets.UTF_8), url);
        return fromXml(body, url);
    }

    private static List<Set<String>> fromXml(byte[] body, URL base) throws Exception {
        XmlPullParser p = Xml.newPullParser();
        p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
        p.setInput(new ByteArrayInputStream(body), null);
        List<Set<String>> out = new ArrayList<>();
        Set<String> post = null;
        int postDepth = -1;
        String field = null;
        StringBuilder text = new StringBuilder();
        for (int e = p.getEventType(); e != XmlPullParser.END_DOCUMENT && out.size() < MAX_ITEMS; e = p.next()) {
            if (e == XmlPullParser.START_TAG) {
                String name = local(p.getName());
                if (post == null && (name.equals("item") || name.equals("entry"))) {
                    post = new LinkedHashSet<>();
                    postDepth = p.getDepth();
                } else if (post != null && p.getDepth() == postDepth + 1) {
                    if (name.equals("link")) {
                        String href = p.getAttributeValue(null, "href");
                        String rel = p.getAttributeValue(null, "rel");
                        if (href != null && (rel == null || rel.equals("alternate"))) add(post, absolute(href, base));
                    }
                    if (name.equals("guid") || name.equals("id") || name.equals("link")) { field = name; text.setLength(0); }
                }
            } else if (e == XmlPullParser.TEXT || e == XmlPullParser.CDSECT) {
                if (field != null) text.append(p.getText());
            } else if (e == XmlPullParser.END_TAG) {
                if (post != null && field != null && p.getDepth() == postDepth + 1) {
                    String v = clean(text.toString());
                    if (!v.isEmpty() && field.equals("link")) add(post, absolute(v, base));
                    else if (!v.isEmpty()) { add(post, v); add(post, absolute(v, base)); }
                    field = null;
                } else if (post != null && p.getDepth() == postDepth) {
                    if (!post.isEmpty()) out.add(post);
                    post = null;
                }
            }
        }
        return out;
    }

    private static List<Set<String>> fromJson(String body, URL base) throws Exception {
        JSONArray items = new JSONObject(body).optJSONArray("items");
        List<Set<String>> out = new ArrayList<>();
        if (items == null) return out;
        for (int i = 0; i < items.length() && out.size() < MAX_ITEMS; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            Set<String> post = new LinkedHashSet<>();
            if (it.has("id")) add(post, clean(String.valueOf(it.opt("id"))));
            add(post, absolute(it.optString("url", ""), base));
            add(post, absolute(it.optString("external_url", ""), base));
            if (!post.isEmpty()) out.add(post);
        }
        return out;
    }

    private static String local(String name) {
        int i = name.indexOf(':');
        return i < 0 ? name : name.substring(i + 1);
    }

    // As src/feeds.js's clean(): spaces run together, ends trimmed.
    private static String clean(String s) {
        String v = s.replaceAll("\\s+", " ").trim();
        return v.length() > 500 ? v.substring(0, 500) : v;
    }

    private static String absolute(String href, URL base) {
        if (href == null || href.trim().isEmpty()) return null;
        try {
            URL u = new URL(base, href.trim());
            String p = u.getProtocol();
            return p.equals("http") || p.equals("https") ? u.toString() : null;
        } catch (Exception e) { return null; }
    }

    private static void add(Set<String> post, String key) {
        if (key != null && !key.isEmpty()) post.add(key);
    }

    // ---- The notification ----

    static void notify(Context ctx, JSONObject waiting) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
        int total = 0;
        List<String> names = new ArrayList<>();
        for (Iterator<String> it = waiting.keys(); it.hasNext(); ) {
            JSONObject w = waiting.optJSONObject(it.next());
            if (w == null || w.optInt("count", 0) <= 0) continue;
            total += w.optInt("count", 0);
            String t = w.optString("title", "");
            if (!t.isEmpty()) names.add(t);
        }
        if (total == 0) return;
        String title = (total == 1 ? "A new post" : total + " new posts") + (names.size() == 1 ? " from " + names.get(0) : "");
        String text = names.size() == 1 ? (total == 1 ? "Tap to see it in Feeds." : "Tap to see them in Feeds.")
            : names.size() == 2 ? "From " + names.get(0) + " and " + names.get(1) + "."
            : names.size() > 2 ? "From " + names.get(0) + ", " + names.get(1) + " and " + (names.size() - 2) + " more." : "In your feeds.";
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "New posts", NotificationManager.IMPORTANCE_DEFAULT));
            b = new Notification.Builder(ctx, CHANNEL);
        } else b = new Notification.Builder(ctx);
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open != null) {
            open.setAction(OPEN);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            b.setContentIntent(PendingIntent.getActivity(ctx, 3, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        nm.notify(NOTE, b.setSmallIcon(R.drawable.carryon_feed)
            .setContentTitle(title)
            .setContentText(text)
            .setNumber(total)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build());
    }

    static void clear(Context ctx) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("waiting").apply();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(NOTE);
    }

    // ---- Files ----

    private static String agent;

    // The WebView's own string with the app named, as src/platform.js sends.
    private static String userAgent(Context ctx) {
        if (agent == null) {
            String base = "";
            try { base = WebSettings.getDefaultUserAgent(ctx) + " "; } catch (Exception e) { /* no WebView */ }
            agent = base + "Carry-on (offline reader; https://github.com/danielnoam/carry-on)";
        }
        return agent;
    }

    private static byte[] readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) {
            out.write(buf, 0, n);
            if (out.size() > max) throw new Exception("too big");
        }
        return out.toByteArray();
    }

    @SuppressWarnings("unchecked")
    static <T> T readJson(File f, T fallback) {
        if (!f.exists()) return fallback;
        try (FileInputStream in = new FileInputStream(f)) {
            String s = new String(readAll(in, MAX_BYTES), StandardCharsets.UTF_8);
            return (T) (fallback instanceof JSONArray ? new JSONArray(s) : new JSONObject(s));
        } catch (Exception e) { return fallback; }
    }

    static void writeJson(File f, String s) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(s.getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(f)) throw new Exception("rename");
    }
}
