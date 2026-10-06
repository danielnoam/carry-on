package io.github.danielnoam.waypage.share;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Keep reading (0.29.0): the page last read, see Widgets; one row high at its smallest (0.29.1). */
public class ReadingWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, Widgets.reading(ctx, m, id));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle options) {
        m.updateAppWidget(id, Widgets.reading(ctx, m, id));
    }
}
