package expo.modules.sessionpresence

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import java.util.UUID

class TalkToMeSessionWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      update(context, manager, id)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action == ACTION_SESSION_ENDED) {
      writeDisconnected(context)
      return
    }
    super.onReceive(context, intent)
    if (action != ACTION_TALK && action != ACTION_DISCONNECT) {
      return
    }
    if (intent.getStringExtra(EXTRA_TOKEN) != actionToken(context)) {
      return
    }
    val connected = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getBoolean("connected", false)
    if (!connected) {
      return
    }
    when (action) {
      ACTION_TALK -> {
        if (!Holder.emitTalk()) {
          launchApp(context)
        }
      }
      ACTION_DISCONNECT -> {
        if (!Holder.emitDisconnect()) {
          launchApp(context)
        }
      }
    }
  }

  companion object {
    private const val PREFS = "talktome.presence"
    const val ACTION_TALK = "expo.modules.sessionpresence.TALK"
    const val ACTION_DISCONNECT = "expo.modules.sessionpresence.DISCONNECT"
    const val ACTION_SESSION_ENDED = "expo.modules.sessionpresence.SESSION_ENDED"
    private const val EXTRA_TOKEN = "token"

    fun write(
      context: Context,
      connected: Boolean,
      title: String,
      detail: String,
      talking: Boolean,
      talkLabel: String,
    ) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean("connected", connected)
        .putString("title", title)
        .putString("detail", detail)
        .putBoolean("talking", talking)
        .putString("talkLabel", talkLabel)
        .apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, TalkToMeSessionWidget::class.java))
      for (id in ids) {
        update(context, manager, id)
      }
    }

    fun writeDisconnected(context: Context) {
      write(context, false, "talktome", "Not connected", false, "Reply lock")
    }

    fun clearIfConnected(context: Context) {
      val connected = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getBoolean("connected", false)
      if (connected) {
        writeDisconnected(context)
      }
    }

    fun update(context: Context, manager: AppWidgetManager, id: Int) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val connected = prefs.getBoolean("connected", false)
      val title = prefs.getString("title", "talktome") ?: "talktome"
      val detail = prefs.getString("detail", if (connected) "Nobody Talking" else "Not connected") ?: ""
      val talking = prefs.getBoolean("talking", false)
      val talkLabel = prefs.getString("talkLabel", null)
        ?: if (talking) "Stop reply" else "Reply lock"
      val views = RemoteViews(context.packageName, R.layout.talktome_session_widget)
      views.setTextViewText(R.id.widget_title, title)
      views.setTextViewText(R.id.widget_detail, detail)
      views.setTextViewText(R.id.widget_talk, talkLabel)
      views.setViewVisibility(R.id.widget_actions, if (connected) View.VISIBLE else View.GONE)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        val openApp = activityPending(context, 0, launch)
        views.setOnClickPendingIntent(R.id.widget_root, openApp)
        views.setOnClickPendingIntent(R.id.widget_title, openApp)
        views.setOnClickPendingIntent(R.id.widget_detail, openApp)
      }
      views.setOnClickPendingIntent(
        R.id.widget_talk,
        broadcastPending(context, 1, ACTION_TALK),
      )
      views.setOnClickPendingIntent(
        R.id.widget_disconnect,
        broadcastPending(context, 2, ACTION_DISCONNECT),
      )
      manager.updateAppWidget(id, views)
    }

    private fun launchApp(context: Context) {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(launch)
    }

    private fun activityPending(context: Context, requestCode: Int, launch: Intent): PendingIntent {
      return PendingIntent.getActivity(
        context,
        requestCode,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
      )
    }

    private fun broadcastPending(context: Context, requestCode: Int, action: String): PendingIntent {
      val intent = Intent(context, TalkToMeSessionWidget::class.java)
        .setAction(action)
        .putExtra(EXTRA_TOKEN, actionToken(context))
      return PendingIntent.getBroadcast(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
      )
    }

    private fun actionToken(context: Context): String {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val existing = prefs.getString(EXTRA_TOKEN, null)
      if (existing != null) {
        return existing
      }
      val token = UUID.randomUUID().toString()
      prefs.edit().putString(EXTRA_TOKEN, token).apply()
      return token
    }

    private fun immutableFlag(): Int {
      return if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
    }
  }
}
