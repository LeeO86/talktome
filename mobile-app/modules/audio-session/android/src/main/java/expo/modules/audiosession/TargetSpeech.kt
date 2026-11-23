package expo.modules.audiosession

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import java.util.Locale

/** Called on the main queue. A first announcement may have to wait for the system engine to bind. */
internal class TargetSpeech {
  private val main = Handler(Looper.getMainLooper())
  private var engine: TextToSpeech? = null
  private var initializing = false
  private data class Announcement(val label: String, val volume: Float, val result: Promise)
  private var pending: Announcement? = null
  private data class SettleTask(val callback: Runnable, val result: Promise, val wakeLock: PowerManager.WakeLock?)
  private var settling: SettleTask? = null

  fun waitForQuiet(context: Context, delayMs: Int, result: Promise) {
    finishSettling(false)
    val delay = delayMs.coerceIn(0, 1_000).toLong()
    val power = context.getSystemService(PowerManager::class.java)
    val wakeLock = power?.takeUnless { it.isInteractive }
      ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TalkToMe:TargetAnnouncement")
    // Cover the delay and the next JS-to-TTS handoff with a bounded CPU-only wake lock.
    wakeLock?.acquire(delay + 250)
    val callback = Runnable { finishSettling(true) }
    settling = SettleTask(callback, result, wakeLock)
    // React Native pauses JS timers when the activity goes to the lock screen.
    main.postDelayed(callback, delay)
  }

  private fun finishSettling(elapsed: Boolean) {
    val task = settling ?: return
    settling = null
    main.removeCallbacks(task.callback)
    if (!elapsed && task.wakeLock?.isHeld == true) task.wakeLock.release()
    task.result.resolve(elapsed)
  }

  fun speak(context: Context, label: String, volume: Float, result: Promise) {
    val announcement = Announcement(label, volume, result)
    if (initializing) {
      clearPending()
      pending = announcement
      return
    }
    engine?.let {
      result.resolve(speakNow(it, announcement))
      return
    }
    val service = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
    if (context.packageManager.queryIntentServices(service, 0).isEmpty()) {
      result.resolve(false)
      return
    }

    initializing = true
    pending = announcement
    engine = TextToSpeech(context.applicationContext) { status ->
      main.post { finishInitialization(status) }
    }
  }

  fun stop() {
    clearPending()
    if (!initializing) engine?.stop()
  }

  fun shutdown() {
    main.post {
      finishSettling(false)
      clearPending()
      initializing = false
      engine?.shutdown()
      engine = null
    }
  }

  private fun clearPending() {
    pending?.result?.resolve(false)
    pending = null
  }

  private fun finishInitialization(status: Int) {
    val synth = engine ?: return
    initializing = false
    if (status != TextToSpeech.SUCCESS) {
      clearPending()
      synth.shutdown()
      engine = null
      return
    }
    synth.setAudioAttributes(AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build())
    val announcement = pending
    pending = null
    announcement?.let { it.result.resolve(speakNow(synth, it)) }
  }

  private fun speakNow(synth: TextToSpeech, announcement: Announcement): Boolean {
    val current = synth.voice
    if (current == null || !isOffline(current)) {
      val locale = current?.locale ?: Locale.getDefault()
      val voices = synth.voices.orEmpty().filter(::isOffline)
      val voice = voices.firstOrNull { it.locale == locale }
        ?: voices.firstOrNull { it.locale.language == locale.language }
        ?: return false
      if (synth.setVoice(voice) != TextToSpeech.SUCCESS) return false
    }
    val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, announcement.volume) }
    return synth.speak(announcement.label, TextToSpeech.QUEUE_FLUSH, params, "talktome-target") == TextToSpeech.SUCCESS
  }

  private fun isOffline(voice: Voice): Boolean =
    !voice.isNetworkConnectionRequired && !voice.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
}
