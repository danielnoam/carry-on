package io.github.danielnoam.waypage.share;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A saved page to the phone's print screen, where "Save as PDF" is one of
 * the printers (src/app.js, 0.20.0). The app's WebView ignores
 * window.print(), so the page is laid out in a WebView of its own:
 *
 *   print({ html, name })   resolves once the print screen is up
 *
 * The HTML is the page as one file, its pictures inlined (backup.js), and
 * is still untrusted: no JavaScript, no network, no file access.
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    // The print screen keeps reading from this WebView after print()
    // returns, so it lives until the next page is printed.
    private WebView last;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String name = call.getString("name", "Page");
        if (html == null) {
            call.reject("No page to print");
            return;
        }
        new Handler(Looper.getMainLooper()).post(() -> {
            if (last != null) last.destroy();
            WebView web = new WebView(getContext());
            last = web;
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(false);
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            s.setBlockNetworkLoads(true);
            web.setWebViewClient(new WebViewClient() {
                boolean shown;

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                    return true;
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (shown) return;
                    shown = true;
                    try {
                        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        pm.print(name, view.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Couldn't open printing", e);
                    }
                }
            });
            web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        });
    }
}
