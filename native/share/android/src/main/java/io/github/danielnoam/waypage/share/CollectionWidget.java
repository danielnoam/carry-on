package io.github.danielnoam.waypage.share;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** One collection (0.35.0): its next clips to read, see Widgets. */
public class CollectionWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, Widgets.collection(ctx, id));
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        Widgets.forget(ctx, ids);
    }
}
