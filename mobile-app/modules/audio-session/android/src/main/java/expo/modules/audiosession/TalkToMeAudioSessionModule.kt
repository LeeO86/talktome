package expo.modules.audiosession

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMeAudioSessionModule : Module() {
  private var profile = "idle"
  private var previousMode = AudioManager.MODE_NORMAL
  private var focusRequest: AudioFocusRequest? = null

  override fun definition() = ModuleDefinition {
    Name("TalkToMeAudioSession")

    Function("isAvailable") {
      true
    }

    Function("profile") {
      profile
    }

    AsyncFunction("activateForMonitoring") {
      activate("monitoring")
    }

    AsyncFunction("activateForIntercom") {
      activate("intercom")
    }

    AsyncFunction("reactivateForOutgoingTalkCapture") {
      activate("intercom")
    }

    AsyncFunction("startBackgroundKeepalive") {
      activate("keepalive")
    }

    AsyncFunction("stopBackgroundKeepalive") {
      if (profile == "keepalive") {
        profile = "monitoring"
      }
      true
    }

    AsyncFunction("prepareForSystemManagedIntercom") {
      activate("intercom")
    }

    AsyncFunction("deactivate") {
      deactivate()
    }

    AsyncFunction("setWebRTCAudioEnabled") { _enabled: Boolean ->
      true
    }
  }

  private fun activate(nextProfile: String): Boolean {
    val manager = audioManager() ?: return false
    if (profile == "idle") {
      previousMode = manager.mode
    }
    requestFocus(manager)
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    @Suppress("DEPRECATION")
    manager.isSpeakerphoneOn = true
    profile = nextProfile
    return true
  }

  private fun deactivate(): Boolean {
    val manager = audioManager() ?: return false
    abandonFocus(manager)
    manager.mode = previousMode
    @Suppress("DEPRECATION")
    manager.isSpeakerphoneOn = false
    profile = "idle"
    return true
  }

  private fun audioManager(): AudioManager? {
    val context = appContext.reactContext ?: return null
    return context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
  }

  private fun requestFocus(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .build()
      focusRequest = request
      manager.requestAudioFocus(request)
      return
    }
    @Suppress("DEPRECATION")
    manager.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN)
  }

  private fun abandonFocus(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= 26) {
      focusRequest?.let { manager.abandonAudioFocusRequest(it) }
      focusRequest = null
      return
    }
    @Suppress("DEPRECATION")
    manager.abandonAudioFocus(null)
  }
}
