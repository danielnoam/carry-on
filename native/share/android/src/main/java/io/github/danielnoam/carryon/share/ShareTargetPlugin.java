package io.github.danielnoam.carryon.share;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Pages shared to Carry-on from another app's share sheet (src/app.js):
 *
 *   take()    what was shared, once: { text, subject }, or for a file
 *             opened with Carry-on or shared to it (0.31.0) { file: { uri,
 *             name, mime, link } } with uri a file:// copy in the app's
 *             cache and link the original's address when the app that
 *             sent it let Carry-on keep reading it (0.32.2), or {}
 *
 * and a "shared" event with nothing in it, a nudge to call take() when a
 * share brings the running app to the front. The intent filter that puts
 * Carry-on in the share sheet is added to MainActivity by
 * tools/android-manifest.js.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private JSObject pending;
    private Uri pendingFile;
    private String pendingMime;

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
        if (intent == null) return false;
        String action = intent.getAction();
        Uri stream = null;
        if (Intent.ACTION_VIEW.equals(action)) stream = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) stream = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream != null) {
            pendingFile = stream;
            pendingMime = intent.getType();
            pending = null;
            intent.setAction(Intent.ACTION_MAIN);
            intent.setData(null);
            intent.removeExtra(Intent.EXTRA_STREAM);
            return true;
        }
        if (!Intent.ACTION_SEND.equals(action)) return false;
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
        if (pendingFile != null) {
            Uri uri = pendingFile;
            String mime = pendingMime;
            pendingFile = null;
            // A big book or comic is copied off the main thread.
            new Thread(() -> {
                try {
                    call.resolve(copy(uri, mime));
                } catch (Exception e) {
                    call.reject("Couldn't read the file", e);
                }
            }).start();
            return;
        }
        JSObject out = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(out);
    }

    // The file into cache/incoming under its own name; only the newest is
    // kept there.
    private JSObject copy(Uri uri, String mime) throws IOException {
        ContentResolver cr = getContext().getContentResolver();
        String name = null;
        try (Cursor c = cr.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception e) {
            name = null;
        }
        if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.trim().isEmpty()) name = "file";
        name = name.replaceAll("[\\\\/:*?\"<>|]+", "_");
        if (mime == null) mime = cr.getType(uri);
        File dir = new File(getContext().getCacheDir(), "incoming");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache directory");
        File out = new File(dir, name);
        try (InputStream in = cr.openInputStream(uri); OutputStream o = new FileOutputStream(out)) {
            if (in == null) throw new IOException("no stream");
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        }
        JSObject file = new JSObject();
        file.put("uri", Uri.fromFile(out).toString());
        file.put("name", name);
        if (mime != null) file.put("mime", mime);
        // Kept only when the sender granted a lasting permission (the
        // Files app usually does); then it can be read from where it is.
        if ("content".equals(uri.getScheme())) {
            try {
                cr.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                file.put("link", uri.toString());
            } catch (Exception e) {
                // A copy is the only way in.
            }
        }
        JSObject res = new JSObject();
        res.put("file", file);
        return res;
    }
}
