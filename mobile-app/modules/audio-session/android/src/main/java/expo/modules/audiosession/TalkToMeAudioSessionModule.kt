package expo.modules.audiosession

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMeAudioSessionModule : Module() {
  private var profile = "idle"
  private var previousMode = AudioManager.MODE_NORMAL
  private var focusRequest: AudioFocusRequest? = null
  private var preferredRouteId = "speaker"
  private var deviceCallback: AudioDeviceCallback? = null
  private var cuePlayer: MediaPlayer? = null

  override fun definition() = ModuleDefinition {
    Name("TalkToMeAudioSession")

    Events("onAudioRouteChange")

    OnCreate {
      registerDeviceCallback()
    }

    OnDestroy {
      unregisterDeviceCallback()
    }

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

    AsyncFunction("deactivate") {
      deactivate()
    }

    AsyncFunction("setWebRTCAudioEnabled") { _enabled: Boolean ->
      true
    }

    AsyncFunction("updateNowPlaying") { _title: String, _detail: String, _active: Boolean ->
      true
    }

    AsyncFunction("playConnectionCue") { name: String ->
      playConnectionCue(name)
    }

    Function("audioRoutes") {
      routeSnapshot()["routes"]
    }

    Function("currentAudioRoute") {
      routeSnapshot()
    }

    AsyncFunction("selectAudioRoute") { id: String ->
      preferredRouteId = id.ifBlank { "speaker" }
      applyPreferredRoute()
      emitRouteChange()
      routeSnapshot()
    }
  }

  private fun activate(nextProfile: String): Boolean {
    val manager = audioManager() ?: return false
    if (profile == "idle") {
      previousMode = manager.mode
    }
    requestFocus(manager)
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    applyPreferredRoute(manager)
    profile = nextProfile
    emitRouteChange()
    return true
  }

  private fun playConnectionCue(name: String): Boolean {
    if (profile == "idle") return false
    val resName = when (name) {
      "disconnected" -> "talktome_disconnected"
      "reconnected" -> "talktome_reconnected"
      else -> return false
    }
    val context = appContext.reactContext ?: return false
    val resId = context.resources.getIdentifier(resName, "raw", context.packageName).takeIf { it != 0 }
      ?: context.resources.getIdentifier(resName, "raw", "expo.modules.audiosession")
    if (resId == 0) return false
    return try {
      cuePlayer?.release()
      val player = MediaPlayer()
      cuePlayer = player
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      context.resources.openRawResourceFd(resId).use { afd ->
        player.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        player.prepare()
      }
      player.setOnCompletionListener {
        it.release()
        if (cuePlayer == it) cuePlayer = null
      }
      player.start()
      true
    } catch (_: Exception) {
      cuePlayer?.release()
      cuePlayer = null
      false
    }
  }

  private fun deactivate(): Boolean {
    cuePlayer?.release()
    cuePlayer = null
    val manager = audioManager() ?: return false
    abandonFocus(manager)
    manager.mode = previousMode
    @Suppress("DEPRECATION")
    manager.isSpeakerphoneOn = false
    if (Build.VERSION.SDK_INT >= 31) {
      manager.clearCommunicationDevice()
    }
    profile = "idle"
    emitRouteChange()
    return true
  }

  private fun applyPreferredRoute(manager: AudioManager? = audioManager()) {
    val audioManager = manager ?: return
    if (Build.VERSION.SDK_INT >= 31) {
      val devices = audioManager.availableCommunicationDevices
      val match = devices.firstOrNull { deviceId(it) == preferredRouteId }
        ?: devices.firstOrNull { deviceKind(it) == preferredRouteId }
        ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
      if (match != null) {
        audioManager.setCommunicationDevice(match)
        preferredRouteId = deviceId(match)
      }
      return
    }
    @Suppress("DEPRECATION")
    when (preferredRouteId) {
      "receiver" -> {
        audioManager.isSpeakerphoneOn = false
        audioManager.stopBluetoothSco()
        audioManager.isBluetoothScoOn = false
      }
      "bluetooth" -> {
        audioManager.isSpeakerphoneOn = false
        audioManager.startBluetoothSco()
        audioManager.isBluetoothScoOn = true
      }
      else -> {
        audioManager.stopBluetoothSco()
        audioManager.isBluetoothScoOn = false
        audioManager.isSpeakerphoneOn = true
        preferredRouteId = "speaker"
      }
    }
  }

  private fun routeSnapshot(): Map<String, Any?> {
    val manager = audioManager()
    val routes = listedRoutes(manager)
    val currentId = currentRouteId(manager, routes)
    return mapOf(
      "routes" to routes.map { it + ("selected" to (it["id"] == currentId)) },
      "currentId" to currentId,
      "inputLabel" to currentInputLabel(manager),
      "outputLabel" to currentOutputLabel(manager),
      "voiceProcessing" to (manager?.mode == AudioManager.MODE_IN_COMMUNICATION),
    )
  }

  private fun listedRoutes(manager: AudioManager?): List<Map<String, Any?>> {
    if (manager == null) {
      return defaultRoutes()
    }
    if (Build.VERSION.SDK_INT >= 31) {
      val devices = manager.availableCommunicationDevices
      if (devices.isNotEmpty()) {
        return devices.map { device ->
          mapOf(
            "id" to deviceId(device),
            "label" to deviceLabel(device),
            "kind" to deviceKind(device),
          )
        }
      }
    }
    val routes = defaultRoutes().toMutableList()
    @Suppress("DEPRECATION")
    if (manager.isBluetoothScoAvailableOffCall) {
      routes.add(mapOf("id" to "bluetooth", "label" to "Bluetooth", "kind" to "bluetooth"))
    }
    return routes
  }

  private fun defaultRoutes(): List<Map<String, Any?>> {
    return listOf(
      mapOf("id" to "speaker", "label" to "Speaker", "kind" to "speaker"),
      mapOf("id" to "receiver", "label" to "Phone", "kind" to "receiver"),
    )
  }

  private fun currentRouteId(manager: AudioManager?, routes: List<Map<String, Any?>>): String {
    if (manager == null) {
      return preferredRouteId
    }
    if (Build.VERSION.SDK_INT >= 31) {
      val current = manager.communicationDevice
      if (current != null) {
        return deviceId(current)
      }
    }
    @Suppress("DEPRECATION")
    if (manager.isBluetoothScoOn) {
      return "bluetooth"
    }
    @Suppress("DEPRECATION")
    return if (manager.isSpeakerphoneOn) "speaker" else "receiver"
  }

  private fun currentInputLabel(manager: AudioManager?): String {
    if (manager == null) {
      return "Unknown"
    }
    if (Build.VERSION.SDK_INT >= 31) {
      manager.communicationDevice?.let { return deviceLabel(it) }
    }
    val inputs = manager.getDevices(AudioManager.GET_DEVICES_INPUTS)
    return inputs.firstOrNull()?.productName?.toString()?.ifBlank { null } ?: "Microphone"
  }

  private fun currentOutputLabel(manager: AudioManager?): String {
    if (manager == null) {
      return "Unknown"
    }
    if (Build.VERSION.SDK_INT >= 31) {
      manager.communicationDevice?.let { return deviceLabel(it) }
    }
    @Suppress("DEPRECATION")
    if (manager.isBluetoothScoOn) {
      return "Bluetooth"
    }
    @Suppress("DEPRECATION")
    return if (manager.isSpeakerphoneOn) "Speaker" else "Earpiece"
  }

  private fun deviceId(device: AudioDeviceInfo): String = "device:${device.id}"

  private fun deviceKind(device: AudioDeviceInfo): String {
    return when (device.type) {
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "receiver"
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired"
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE -> "usb"
      else -> "other"
    }
  }

  private fun deviceLabel(device: AudioDeviceInfo): String {
    val product = device.productName?.toString()?.trim().orEmpty()
    if (product.isNotEmpty() && !product.equals("null", ignoreCase = true)) {
      return product
    }
    return when (deviceKind(device)) {
      "speaker" -> "Speaker"
      "receiver" -> "Phone"
      "bluetooth" -> "Bluetooth"
      "wired" -> "Headphones"
      "usb" -> "USB"
      else -> "Audio"
    }
  }

  private fun emitRouteChange() {
    sendEvent("onAudioRouteChange", routeSnapshot())
  }

  private fun registerDeviceCallback() {
    if (Build.VERSION.SDK_INT < 23 || deviceCallback != null) {
      return
    }
    val manager = audioManager() ?: return
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
        emitRouteChange()
      }

      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
        emitRouteChange()
      }
    }
    deviceCallback = callback
    manager.registerAudioDeviceCallback(callback, null)
  }

  private fun unregisterDeviceCallback() {
    val callback = deviceCallback ?: return
    audioManager()?.unregisterAudioDeviceCallback(callback)
    deviceCallback = null
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
