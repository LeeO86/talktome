package expo.modules.talktomefgs

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

class TalkToMeForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    attachPttHardware()
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
          try {
            startInForeground()
          } catch (error: Exception) {
            Log.e(TAG, "Unable to update foreground notification", error)
          }
        }
        return START_STICKY
      }
      else -> {
        includeConnectedDevice = intent?.getBooleanExtra(EXTRA_INCLUDE_CONNECTED_DEVICE, false) == true
        talking = intent?.getBooleanExtra(EXTRA_TALKING, false) == true
        intent?.getStringExtra(EXTRA_TITLE)?.let { contentTitle = it }
        intent?.getStringExtra(EXTRA_TEXT)?.let { contentText = it }
        try {
          startInForeground()
          Holder.running = true
          Holder.listener?.onStarted(includeConnectedDevice)
        } catch (error: Exception) {
          Log.e(TAG, "Unable to enter foreground", error)
          Holder.running = false
          try {
            stopForeground(STOP_FOREGROUND_REMOVE)
          } catch (_: Exception) {
            // Never reached startForeground.
          }
          stopSelf()
          Holder.listener?.onStopped()
        }
        return START_STICKY
      }
    }
  }

  override fun onDestroy() {
    detachPttHardware()
    Holder.running = false
    Holder.listener?.onStopped()
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    Holder.listener?.onStopRequested()
    // Must match TalkToMeSessionWidget.ACTION_SESSION_ENDED.
    sendBroadcast(
      Intent()
        .setClassName(packageName, "expo.modules.sessionpresence.TalkToMeSessionWidget")
        .setAction("expo.modules.sessionpresence.SESSION_ENDED"),
    )
    stopSession()
    super.onTaskRemoved(rootIntent)
  }

  private fun startInForeground() {
    ensureChannel()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT < 29) {
      startForeground(NOTIFICATION_ID, notification)
      return
    }
    val wanted = serviceTypes()
    try {
      startForeground(NOTIFICATION_ID, notification, wanted)
    } catch (error: Exception) {
      Log.e(TAG, "startForeground($wanted) rejected; retrying with mediaPlayback only", error)
      val playback = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      if (wanted == playback) {
        throw error
      }
      startForeground(NOTIFICATION_ID, notification, playback)
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
    if (Build.VERSION.SDK_INT >= 29) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    }
    // Android 14+ throws SecurityException if we claim microphone/connectedDevice
    // without the matching runtime permission.
    if (Build.VERSION.SDK_INT >= 30 && hasPermission(Manifest.permission.RECORD_AUDIO)) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    }
    if (
      includeConnectedDevice &&
      Build.VERSION.SDK_INT >= 31 &&
      hasPermission(Manifest.permission.BLUETOOTH_CONNECT)
    ) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    }
    return types
  }

  private fun hasPermission(permission: String): Boolean {
    return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
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
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(0, if (talking) "Stop reply" else "Reply lock", talkPending)
      .addAction(0, "Disconnect", stopPending)
    if (launchIntent != null) {
      builder.setContentIntent(
        PendingIntent.getActivity(
          this,
          0,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
        ),
      )
    }
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

  private fun attachPttHardware() {
    try {
      val host = Class.forName("expo.modules.ptthardware.PttHardwareHost")
      host.getMethod("attachService", Service::class.java).invoke(null, this)
    } catch (_: Throwable) {
      // Hardware module is optional at runtime until the native client is rebuilt.
    }
  }

  private fun detachPttHardware() {
    try {
      val host = Class.forName("expo.modules.ptthardware.PttHardwareHost")
      host.getMethod("detachService", Service::class.java).invoke(null, this)
    } catch (_: Throwable) {
      // Ignore missing hardware module.
    }
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
    private const val TAG = "TalkToMeFgs"

    @Volatile
    var talking: Boolean = false

    @Volatile
    var includeConnectedDevice: Boolean = false

    @Volatile
    var contentTitle: String = "Nobody Talking"

    @Volatile
    var contentText: String = "Disconnect ends the session."

    fun start(context: Context, includeConnectedDevice: Boolean, title: String, text: String, talking: Boolean): Boolean {
      contentTitle = title
      contentText = text
      this.talking = talking
      val intent = Intent(context, TalkToMeForegroundService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_INCLUDE_CONNECTED_DEVICE, includeConnectedDevice)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_TALKING, talking)
      return try {
        if (Build.VERSION.SDK_INT >= 26) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (error: Exception) {
        Log.e(TAG, "Unable to start session service", error)
        false
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
      try {
        context.startService(intent)
      } catch (error: Exception) {
        Log.e(TAG, "Unable to update session service", error)
      }
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
