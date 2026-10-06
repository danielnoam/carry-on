package io.github.danielnoam.waypage.share;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Feeds (0.29.0): the newest posts waiting, see Widgets. */
public class FeedsWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, Widgets.feeds(ctx));
    }
}
