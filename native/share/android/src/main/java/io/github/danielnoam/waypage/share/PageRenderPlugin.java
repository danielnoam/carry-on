package io.github.danielnoam.waypage.share;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.JsonReader;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.StringReader;

/**
 * Pages that build themselves with JavaScript (src/save.js):
 *
 *   render({ url, timeoutMs })   { html, url } once the page has drawn its text
 *
 * The page runs in its own WebView, out of sight behind the app's: no
 * Capacitor bridge, no JavaScript interfaces, no file access, http(s) only,
 * no images. Only the HTML it ends up with comes back, and save.js turns that
 * into the same script-free copy as any other page.
 */
@CapacitorPlugin(name = "PageRender")
public class PageRenderPlugin extends Plugin {

    private static final long POLL_MS = 700;
    private static final int MIN_TEXT = 500;
    private static final String TEXT_LENGTH = "(document.body ? document.body.innerText.length : 0)";
    private static final String OUTER_HTML = "document.documentElement.outerHTML";

    @PluginMethod
    public void render(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Not a web address");
            return;
        }
        long timeout = Math.max(5000, Math.min(60000, call.getData().optLong("timeoutMs", 20000L)));
        new Handler(Looper.getMainLooper()).post(() -> new Job(call, url, timeout).start());
    }

    private class Job {
        final PluginCall call;
        final String url;
        final long timeout;
        final Handler main = new Handler(Looper.getMainLooper());
        WebView web;
        boolean done;
        boolean loaded;
        int lastLength = -1;
        int steady;

        Job(PluginCall call, String url, long timeout) {
            this.call = call;
            this.url = url;
            this.timeout = timeout;
        }

        @SuppressLint("SetJavaScriptEnabled")
        void start() {
            ViewGroup root = getActivity().findViewById(android.R.id.content);
            web = new WebView(getContext());
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            s.setBlockNetworkImage(true);
            s.setMediaPlaybackRequiresUserGesture(true);
            s.setSupportMultipleWindows(false);
            s.setJavaScriptCanOpenWindowsAutomatically(false);
            web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            web.setFocusable(false);
            web.setAlpha(0f);
            web.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                    String scheme = req.getUrl().getScheme();
                    return !("https".equals(scheme) || "http".equals(scheme));
                }

                @Override
                public void onPageFinished(WebView view, String finished) {
                    if (!loaded) {
                        loaded = true;
                        main.postDelayed(Job.this::poll, POLL_MS);
                    }
                }
            });
            // Behind the app's own WebView, so it never takes a touch.
            root.addView(web, 0, new FrameLayout.LayoutParams(root.getWidth() > 0 ? root.getWidth() : 1080,
                root.getHeight() > 0 ? root.getHeight() : 1920));
            main.postDelayed(this::take, timeout);
            web.loadUrl(url);
        }

        // Waits for the text to stop growing: most of these pages draw an
        // empty frame first, then fill it from a request of their own.
        void poll() {
            if (done) return;
            web.evaluateJavascript(TEXT_LENGTH, (v) -> {
                if (done) return;
                int n;
                try { n = Integer.parseInt(v.trim()); } catch (NumberFormatException e) { n = 0; }
                steady = n == lastLength ? steady + 1 : 0;
                lastLength = n;
                if (n >= MIN_TEXT && steady >= 2) take();
                else main.postDelayed(this::poll, POLL_MS);
            });
        }

        void take() {
            if (done) return;
            done = true;
            web.evaluateJavascript(OUTER_HTML, (v) -> {
                String html = decode(v);
                String at = web.getUrl();
                finish();
                if (html == null || html.isEmpty()) {
                    call.reject("The page didn't draw anything");
                    return;
                }
                JSObject out = new JSObject();
                out.put("html", html);
                out.put("url", at != null && Uri.parse(at).getScheme() != null ? at : url);
                call.resolve(out);
            });
        }

        void finish() {
            main.removeCallbacksAndMessages(null);
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.stopLoading();
            web.destroy();
        }
    }

    // evaluateJavascript hands back the value as JSON: a quoted string here.
    private static String decode(String json) {
        if (json == null || "null".equals(json)) return null;
        try (JsonReader r = new JsonReader(new StringReader(json))) {
            r.setLenient(true);
            return r.nextString();
        } catch (Exception e) {
            return null;
        }
    }
}
