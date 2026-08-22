package expo.modules.sessionpresence

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews

class TalkToMeSessionWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      update(context, manager, id)
    }
  }

  companion object {
    private const val PREFS = "talktome.presence"

    fun write(context: Context, connected: Boolean, title: String, detail: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean("connected", connected)
        .putString("title", title)
        .putString("detail", detail)
        .apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, TalkToMeSessionWidget::class.java))
      for (id in ids) {
        update(context, manager, id)
      }
    }

    fun update(context: Context, manager: AppWidgetManager, id: Int) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val connected = prefs.getBoolean("connected", false)
      val title = prefs.getString("title", "talktome") ?: "talktome"
      val detail = prefs.getString("detail", if (connected) "Nobody Talking" else "Not connected") ?: ""
      val views = RemoteViews(context.packageName, R.layout.talktome_session_widget)
      views.setTextViewText(R.id.widget_title, title)
      views.setTextViewText(R.id.widget_detail, detail)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        val flags =
          PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
        views.setOnClickPendingIntent(
          R.id.widget_root,
          PendingIntent.getActivity(context, 0, launch, flags),
        )
      }
      manager.updateAppWidget(id, views)
    }
  }
}
