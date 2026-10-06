package io.github.danielnoam.carryon.share;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Files of your own, read where they are (src/files.js, 0.32.0). Android's
 * own picker is the only way to a file the app may still read tomorrow:
 * what the WebView's <input type="file"> hands over is readable once.
 *
 *   pick({ mimes })         the picker; { uri, name, size, mime } or { }
 *   pickFolder()            the folder picker; { uri, name } or { }
 *   info({ uri })           { ok, name, size }; ok false once it's gone
 *   read({ uri, offset, length })   { data } as base64, for that stretch
 *   release({ uri })        gives the lasting permission back
 *
 * The permission is taken as persistable, so it survives a restart. Android
 * keeps about 128 of them per app, so a file Carry-on forgets is released.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        JSArray mimes = call.getArray("mimes");
        List<String> list = new ArrayList<>();
        if (mimes != null) {
            try { for (Object m : mimes.toList()) if (m != null) list.add(String.valueOf(m)); } catch (Exception e) { /* all of them */ }
        }
        intent.setType(list.size() == 1 ? list.get(0) : "*/*");
        if (list.size() > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, list.toArray(new String[0]));
        startActivityForResult(call, intent, "picked");
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickedFolder");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        Uri uri = taken(result, false);
        if (call == null) return;
        if (uri == null) { call.resolve(new JSObject()); return; }
        JSObject out = describe(uri);
        out.put("uri", uri.toString());
        String mime = getContext().getContentResolver().getType(uri);
        if (mime != null) out.put("mime", mime);
        call.resolve(out);
    }

    @ActivityCallback
    private void pickedFolder(PluginCall call, ActivityResult result) {
        Uri uri = taken(result, true);
        if (call == null) return;
        if (uri == null) { call.resolve(new JSObject()); return; }
        JSObject out = new JSObject();
        out.put("uri", uri.toString());
        String last = uri.getLastPathSegment();
        out.put("name", last == null ? "Folder" : last.replaceFirst("^.*:", ""));
        call.resolve(out);
    }

    // The picked address, with its lasting permission taken. null when the
    // picker was put away, or the permission wasn't granted.
    private Uri taken(ActivityResult result, boolean write) {
        Intent data = result == null ? null : result.getData();
        if (result == null || result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) return null;
        Uri uri = data.getData();
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | (write ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (Exception e) {
            // Some providers don't offer one; the address still works until
            // the app stops, which is enough to copy the file in.
        }
        return uri;
    }

    @PluginMethod
    public void info(PluginCall call) {
        Uri uri = address(call);
        if (uri == null) return;
        JSObject out = describe(uri);
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            out.put("ok", in != null);
        } catch (Exception e) {
            out.put("ok", false);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void read(PluginCall call) {
        Uri uri = address(call);
        if (uri == null) return;
        long offset = call.getLong("offset", 0L);
        int length = call.getInt("length", 0);
        if (length <= 0 || length > (8 << 20)) {
            call.reject("Ask for between 1 byte and 8 MB");
            return;
        }
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) throw new java.io.IOException("not there");
                long left = offset;
                while (left > 0) {
                    long went = in.skip(left);
                    if (went <= 0) { if (in.read() < 0) break; went = 1; }
                    left -= went;
                }
                byte[] buf = new byte[length];
                int got = 0;
                while (got < length) {
                    int n = in.read(buf, got, length - got);
                    if (n < 0) break;
                    got += n;
                }
                JSObject out = new JSObject();
                out.put("data", Base64.encodeToString(buf, 0, got, Base64.NO_WRAP));
                call.resolve(out);
            } catch (Exception e) {
                call.reject("Couldn't read the file", e);
            }
        }).start();
    }

    @PluginMethod
    public void release(PluginCall call) {
        Uri uri = address(call);
        if (uri == null) return;
        try {
            getContext().getContentResolver().releasePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) {
            // Already gone.
        }
        call.resolve(new JSObject());
    }

    private Uri address(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("No file"); return null; }
        try {
            return Uri.parse(uri);
        } catch (Exception e) {
            call.reject("Not a file address");
            return null;
        }
    }

    private JSObject describe(Uri uri) {
        JSObject out = new JSObject();
        String name = null;
        long size = 0;
        try (Cursor c = getContext().getContentResolver().query(uri,
            new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                name = c.getString(0);
                if (!c.isNull(1)) size = c.getLong(1);
            }
        } catch (Exception e) {
            name = null;
        }
        if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment();
        out.put("name", name == null ? "file" : name);
        out.put("size", size);
        return out;
    }
}
