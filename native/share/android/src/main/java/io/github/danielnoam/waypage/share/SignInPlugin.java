package io.github.danielnoam.waypage.share;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Saving signed in (1.8.0): a site opened in a browser inside the app, so its
 * sign-in cookies land in the WebView's cookie store, which Waypage's own
 * requests to that site then carry (src/platform.js).
 *
 *   open({ url })        resolves { url } once the browser is closed
 *   cookies({ url })     { cookie }: the Cookie header for that address
 *   signOut({ host })    forgets the cookies and storage of the site
 *
 * The browser is a plain WebView: no Capacitor bridge, no JavaScript
 * interfaces, no file access, http(s) only.
 */
@CapacitorPlugin(name = "SignIn")
public class SignInPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Not a web address");
            return;
        }
        Activity a = getActivity();
        if (a == null) {
            call.reject("No window");
            return;
        }
        a.runOnUiThread(() -> show(a, call, url));
    }

    @PluginMethod
    public void cookies(PluginCall call) {
        String url = call.getString("url");
        String c = url == null ? null : CookieManager.getInstance().getCookie(url);
        JSObject out = new JSObject();
        out.put("cookie", c == null ? "" : c);
        call.resolve(out);
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        String host = call.getString("host");
        if (host == null || !host.contains(".")) {
            call.reject("Not a site");
            return;
        }
        CookieManager cm = CookieManager.getInstance();
        // CookieManager can't list a site's cookies, only hand back the ones an
        // address would send: each is set again already expired, under every
        // domain it could have been set for.
        for (String h : new String[] { host, "www." + host }) {
            String url = "https://" + h + "/";
            String have = cm.getCookie(url);
            if (have != null) {
                for (String part : have.split(";")) {
                    int eq = part.indexOf('=');
                    String name = (eq < 0 ? part : part.substring(0, eq)).trim();
                    if (name.isEmpty()) continue;
                    String gone = name + "=; Max-Age=0; Path=/; Secure";
                    cm.setCookie(url, gone);
                    cm.setCookie(url, gone + "; Domain=" + host);
                    cm.setCookie(url, gone + "; Domain=." + host);
                }
            }
            WebStorage.getInstance().deleteOrigin("https://" + h);
        }
        cm.flush();
        call.resolve();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void show(Activity a, PluginCall call, String url) {
        boolean night = (a.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        Dialog d = new Dialog(a, night ? android.R.style.Theme_DeviceDefault_NoActionBar : android.R.style.Theme_DeviceDefault_Light_NoActionBar);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        // Clear of the status bar and the gesture bar, however the window is drawn.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                top = i.top;
                bottom = i.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });

        LinearLayout bar = new LinearLayout(a);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int pad = dp(a, 16);
        bar.setPadding(pad, 0, dp(a, 4), 0);
        bar.setMinimumHeight(dp(a, 56));
        TextView title = new TextView(a);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setText(hostOf(url));
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button done = new Button(a, null, android.R.attr.borderlessButtonStyle);
        done.setText("Done");
        done.setMinWidth(dp(a, 64));
        done.setMinHeight(dp(a, 48));
        bar.addView(done, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        WebView web = new WebView(a);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        // Sign-ins that go through another site and back need its cookies too.
        cm.setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String scheme = req.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme));
            }

            @Override
            public void onPageStarted(WebView view, String at, android.graphics.Bitmap icon) {
                title.setText(hostOf(at));
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        done.setOnClickListener((v) -> d.dismiss());
        // Back goes back a page in the site, and closes the browser from its first.
        d.setOnKeyListener((dialog, code, e) -> {
            if (code != KeyEvent.KEYCODE_BACK || e.getAction() != KeyEvent.ACTION_UP) return code == KeyEvent.KEYCODE_BACK;
            if (web.canGoBack()) web.goBack();
            else d.dismiss();
            return true;
        });
        d.setOnDismissListener((dialog) -> {
            String at = web.getUrl();
            cm.flush();
            web.stopLoading();
            web.destroy();
            JSObject out = new JSObject();
            out.put("url", at != null ? at : url);
            call.resolve(out);
        });
        d.setContentView(root);
        Window w = d.getWindow();
        if (w != null) w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        d.show();
        web.loadUrl(url);
    }

    private static String hostOf(String url) {
        String h = url == null ? null : Uri.parse(url).getHost();
        return h == null ? "" : h.replaceFirst("^www\\.", "");
    }

    private static int dp(Activity a, int v) {
        return Math.round(v * a.getResources().getDisplayMetrics().density);
    }
}
