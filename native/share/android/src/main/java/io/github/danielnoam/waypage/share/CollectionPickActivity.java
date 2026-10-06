package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Picks the collection a Collection widget shows (0.35.0), when it's placed
 * and again from the widget once its collection is gone. Lists the
 * collections the app last handed over (Widgets.collections).
 */
public class CollectionPickActivity extends Activity {

    private int id = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) id = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        int ink = getColor(R.color.waypage_w_ink), muted = getColor(R.color.waypage_w_muted);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(16), dp(16), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(getColor(R.color.waypage_w_bg));
        bg.setCornerRadius(dp(16));
        box.setBackground(bg);

        TextView head = text("Show which collection?", 18, ink);
        head.setTypeface(Typeface.DEFAULT_BOLD);
        head.setPadding(0, 0, 0, dp(8));
        box.addView(head);

        JSONArray all = Widgets.collections(this);
        if (all.length() == 0) {
            TextView none = text("No collections yet. Put clips in a collection in Waypage, then add this widget again.", 15, muted);
            none.setPadding(0, dp(8), 0, dp(8));
            box.addView(none);
            box.addView(row("Close", "", ink, muted, v -> finish()));
        }
        for (int i = 0; i < all.length(); i++) {
            JSONObject c = all.optJSONObject(i);
            if (c == null) continue;
            String name = c.optString("name", "");
            box.addView(row(name, c.optString("meta", ""), ink, muted, v -> {
                Widgets.pick(this, id, name);
                setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
                finish();
            }));
        }

        ScrollView scroll = new ScrollView(this);
        scroll.addView(box);
        setContentView(scroll);
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        return t;
    }

    private LinearLayout row(String title, String meta, int ink, int muted, android.view.View.OnClickListener tap) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.VERTICAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setMinimumHeight(dp(48));
        r.setPadding(0, dp(8), 0, dp(8));
        r.setClickable(true);
        r.setFocusable(true);
        TypedValue ripple = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, ripple, true);
        r.setForeground(getDrawable(ripple.resourceId));
        r.setOnClickListener(tap);
        TextView t = text(title, 16, ink);
        t.setTypeface(Typeface.SERIF, Typeface.BOLD);
        t.setSingleLine(true);
        r.addView(t);
        if (!meta.isEmpty()) r.addView(text(meta, 13, muted));
        return r;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
