package io.github.danielnoam.waypage.share;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** A highlight a day (1.9.0): one of your highlights, a new one each day, see Widgets. */
public class HighlightWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, Widgets.highlight(ctx));
    }
}
