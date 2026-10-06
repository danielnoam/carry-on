package io.github.danielnoam.waypage.share;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Favourites (0.29.2): the pages favourited last, see Widgets. */
public class FavouritesWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, Widgets.favourites(ctx));
    }
}
