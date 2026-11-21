package expo.modules.audiosession

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import java.util.Locale

/** Called on the main queue. A first announcement may have to wait for the system engine to bind. */
internal class TargetSpeech {
  private val main = Handler(Looper.getMainLooper())
  private var engine: TextToSpeech? = null
  private var initializing = false
  private data class Announcement(val label: String, val result: Promise)
  private var pending: Announcement? = null

  fun speak(context: Context, label: String, result: Promise) {
    if (initializing) {
      clearPending()
      pending = Announcement(label, result)
      return
    }
    engine?.let {
      result.resolve(speakNow(it, label))
      return
    }
    val service = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
    if (context.packageManager.queryIntentServices(service, 0).isEmpty()) {
      result.resolve(false)
      return
    }

    initializing = true
    pending = Announcement(label, result)
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
    announcement?.let { it.result.resolve(speakNow(synth, it.label)) }
  }

  private fun speakNow(synth: TextToSpeech, label: String): Boolean {
    val current = synth.voice
    if (current == null || !isOffline(current)) {
      val locale = current?.locale ?: Locale.getDefault()
      val voices = synth.voices.orEmpty().filter(::isOffline)
      val voice = voices.firstOrNull { it.locale == locale }
        ?: voices.firstOrNull { it.locale.language == locale.language }
        ?: return false
      if (synth.setVoice(voice) != TextToSpeech.SUCCESS) return false
    }
    return synth.speak(label, TextToSpeech.QUEUE_FLUSH, null, "talktome-target") == TextToSpeech.SUCCESS
  }

  private fun isOffline(voice: Voice): Boolean =
    !voice.isNetworkConnectionRequired && !voice.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
}
