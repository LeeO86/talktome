package expo.modules.talktomefgs

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class TalkToMeForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        Holder.listener?.onStopRequested()
        stopSession()
        return START_NOT_STICKY
      }
      ACTION_TOGGLE_TALK -> {
        Holder.listener?.onTalkRequested()
        return START_STICKY
      }
      ACTION_UPDATE -> {
        includeConnectedDevice = intent.getBooleanExtra(EXTRA_INCLUDE_CONNECTED_DEVICE, includeConnectedDevice)
        talking = intent.getBooleanExtra(EXTRA_TALKING, talking)
        intent.getStringExtra(EXTRA_TITLE)?.let { contentTitle = it }
        intent.getStringExtra(EXTRA_TEXT)?.let { contentText = it }
        if (Holder.running) {
          startInForeground()
        }
        return START_STICKY
      }
      else -> {
        includeConnectedDevice = intent?.getBooleanExtra(EXTRA_INCLUDE_CONNECTED_DEVICE, false) == true
        talking = intent?.getBooleanExtra(EXTRA_TALKING, false) == true
        intent?.getStringExtra(EXTRA_TITLE)?.let { contentTitle = it }
        intent?.getStringExtra(EXTRA_TEXT)?.let { contentText = it }
        startInForeground()
        Holder.running = true
        Holder.listener?.onStarted(includeConnectedDevice)
        return START_STICKY
      }
    }
  }

  override fun onDestroy() {
    Holder.running = false
    Holder.listener?.onStopped()
    super.onDestroy()
  }

  private fun startInForeground() {
    ensureChannel()
    val notification = buildNotification()
    val types = serviceTypes()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, notification, types)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopSession() {
    Holder.running = false
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    Holder.listener?.onStopped()
  }

  private fun serviceTypes(): Int {
    var types = 0
    if (Build.VERSION.SDK_INT >= 30) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    }
    if (Build.VERSION.SDK_INT >= 29) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    }
    if (includeConnectedDevice && Build.VERSION.SDK_INT >= 31) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    }
    return types
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) {
      return
    }
    val manager = getSystemService(NotificationManager::class.java) ?: return
    manager.deleteNotificationChannel(LEGACY_CHANNEL_ID)
    manager.deleteNotificationChannel(LEGACY_CHANNEL_ID_V2)
    manager.deleteNotificationChannel(LEGACY_CHANNEL_ID_V3)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "TalkToMe session",
      NotificationManager.IMPORTANCE_DEFAULT,
    )
    channel.description = "Keeps the intercom microphone and playback running in the background."
    channel.setShowBadge(false)
    channel.enableVibration(false)
    channel.enableLights(false)
    channel.setSound(null, null)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentPending = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )
    val talkIntent = Intent(this, TalkToMeForegroundService::class.java).setAction(ACTION_TOGGLE_TALK)
    val talkPending = PendingIntent.getService(
      this,
      2,
      talkIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )
    val stopIntent = Intent(this, TalkToMeForegroundService::class.java).setAction(ACTION_STOP)
    val stopPending = PendingIntent.getService(
      this,
      1,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_DEFAULT)
    }
    builder
      .setContentTitle(contentTitle)
      .setContentText(contentText)
      .setStyle(Notification.BigTextStyle().bigText(contentText))
      .setSmallIcon(sessionSmallIcon())
      .setColor(0xFF000000.toInt())
      .setContentIntent(contentPending)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(0, if (talking) "Stop reply" else "Reply lock", talkPending)
      .addAction(0, "Disconnect", stopPending)
    if (Build.VERSION.SDK_INT >= 31) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    return builder.build()
  }

  private fun sessionSmallIcon(): Int {
    val fromApp = resources.getIdentifier("ic_stat_talktome", "drawable", packageName)
    if (fromApp != 0) {
      return fromApp
    }
    return R.drawable.ic_stat_talktome
  }

  private fun immutableFlag(): Int {
    return if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
  }

  companion object {
    const val ACTION_START = "expo.modules.talktomefgs.START"
    const val ACTION_STOP = "expo.modules.talktomefgs.STOP"
    const val ACTION_TOGGLE_TALK = "expo.modules.talktomefgs.TOGGLE_TALK"
    const val ACTION_UPDATE = "expo.modules.talktomefgs.UPDATE"
    const val EXTRA_INCLUDE_CONNECTED_DEVICE = "includeConnectedDevice"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_TALKING = "talking"
    const val CHANNEL_ID = "talktome.session.v4"
    const val LEGACY_CHANNEL_ID = "talktome.session"
    const val LEGACY_CHANNEL_ID_V2 = "talktome.session.v2"
    const val LEGACY_CHANNEL_ID_V3 = "talktome.session.v3"
    const val NOTIFICATION_ID = 5602

    @Volatile
    var talking: Boolean = false

    @Volatile
    var includeConnectedDevice: Boolean = false

    @Volatile
    var contentTitle: String = "Nobody Talking"

    @Volatile
    var contentText: String = "Disconnect ends the session."

    fun start(context: Context, includeConnectedDevice: Boolean, title: String, text: String, talking: Boolean) {
      contentTitle = title
      contentText = text
      this.talking = talking
      val intent = Intent(context, TalkToMeForegroundService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_INCLUDE_CONNECTED_DEVICE, includeConnectedDevice)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_TALKING, talking)
      if (Build.VERSION.SDK_INT >= 26) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun update(context: Context, includeConnectedDevice: Boolean, title: String, text: String, talking: Boolean) {
      if (!Holder.running) {
        return
      }
      contentTitle = title
      contentText = text
      this.talking = talking
      val intent = Intent(context, TalkToMeForegroundService::class.java)
        .setAction(ACTION_UPDATE)
        .putExtra(EXTRA_INCLUDE_CONNECTED_DEVICE, includeConnectedDevice)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_TALKING, talking)
      context.startService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, TalkToMeForegroundService::class.java))
    }
  }
}

object Holder {
  @Volatile
  var running: Boolean = false

  @Volatile
  var listener: TalkToMeForegroundServiceListener? = null
}

interface TalkToMeForegroundServiceListener {
  fun onStopRequested()
  fun onTalkRequested()
  fun onStarted(includeConnectedDevice: Boolean)
  fun onStopped()
}
