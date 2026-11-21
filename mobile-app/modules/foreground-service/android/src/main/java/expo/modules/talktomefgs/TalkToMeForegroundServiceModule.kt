package expo.modules.talktomefgs

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMeForegroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TalkToMeForegroundService")

    Events("onStopRequested", "onTalkRequested", "onStarted", "onStopped")

    OnCreate {
      Holder.listener = object : TalkToMeForegroundServiceListener {
        override fun onStopRequested() {
          sendEvent("onStopRequested")
        }

        override fun onTalkRequested() {
          sendEvent("onTalkRequested")
        }

        override fun onStarted(includeConnectedDevice: Boolean) {
          sendEvent("onStarted", mapOf("includeConnectedDevice" to includeConnectedDevice))
        }

        override fun onStopped() {
          sendEvent("onStopped")
        }
      }
    }

    OnDestroy {
      if (Holder.listener != null) {
        Holder.listener = null
      }
    }

    Function("isAvailable") {
      true
    }

    Function("isRunning") {
      Holder.running
    }

    AsyncFunction("start") { includeConnectedDevice: Boolean, title: String, text: String, talking: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      TalkToMeForegroundService.start(context, includeConnectedDevice, title, text, talking)
    }

    AsyncFunction("update") { includeConnectedDevice: Boolean, title: String, text: String, talking: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      TalkToMeForegroundService.update(context, includeConnectedDevice, title, text, talking)
      Holder.running
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      TalkToMeForegroundService.stop(context)
      true
    }

    AsyncFunction("openBatterySettings") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = batteryIntent(context) ?: return@AsyncFunction false
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }
  }

  private fun batteryIntent(context: android.content.Context): Intent? {
    val samsung = samsungBatteryIntent(context)
    if (samsung != null) {
      return samsung
    }
    if (Build.VERSION.SDK_INT >= 23) {
      return Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
    }
    return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(
      Uri.fromParts("package", context.packageName, null),
    )
  }

  private fun samsungBatteryIntent(context: android.content.Context): Intent? {
    val candidates = listOf(
      ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"),
      ComponentName("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity"),
    )
    for (component in candidates) {
      val intent = Intent().setComponent(component)
      if (intent.resolveActivity(context.packageManager) != null) {
        return intent
      }
    }
    return null
  }
}
