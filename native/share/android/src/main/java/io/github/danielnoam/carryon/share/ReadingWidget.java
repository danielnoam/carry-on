package io.github.danielnoam.carryon.share;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Keep reading (0.29.0): the page last read, see Widgets. */
public class ReadingWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, Widgets.reading(ctx));
    }
}
