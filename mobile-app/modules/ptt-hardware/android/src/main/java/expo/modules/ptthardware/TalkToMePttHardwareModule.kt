package expo.modules.ptthardware

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMePttHardwareModule : Module() {
  private var controller: TalkToMePttHardwareController? = null

  override fun definition() = ModuleDefinition {
    Name("TalkToMePttHardware")

    Events("onEvent", "onBytes", "onState", "onDiagnostic")

    Function("isAvailable") {
      true
    }

    Function("getState") {
      controller()?.currentState() ?: mapOf("listening" to false, "devices" to emptyList<Map<String, Any?>>())
    }

    AsyncFunction("start") { intentCatalogJson: String ->
      val current = controller() ?: return@AsyncFunction mapOf(
        "listening" to false,
        "devices" to emptyList<Map<String, Any?>>(),
      )
      current.setCatalogJson(intentCatalogJson)
      current.start()
      current.currentState()
    }

    AsyncFunction("stop") {
      val current = controller() ?: return@AsyncFunction mapOf(
        "listening" to false,
        "devices" to emptyList<Map<String, Any?>>(),
      )
      current.stop()
      current.currentState()
    }

    AsyncFunction("startPairing") { timeoutMs: Int, boundIdsJson: String ->
      val current = controller() ?: return@AsyncFunction mapOf(
        "listening" to false,
        "pairing" to false,
        "devices" to emptyList<Map<String, Any?>>(),
      )
      current.startPairing(timeoutMs, boundIdsJson)
      current.currentState()
    }

    AsyncFunction("cancelPairing") {
      val current = controller() ?: return@AsyncFunction mapOf(
        "listening" to false,
        "pairing" to false,
        "devices" to emptyList<Map<String, Any?>>(),
      )
      current.cancelPairing()
      current.currentState()
    }

    AsyncFunction("acceptDevice") { deviceId: String ->
      val current = controller() ?: return@AsyncFunction mapOf(
        "listening" to false,
        "devices" to emptyList<Map<String, Any?>>(),
      )
      current.acceptDevice(deviceId)
      current.currentState()
    }

    AsyncFunction("connectDevice") { deviceId: String ->
      val current = controller() ?: return@AsyncFunction mapOf(
        "listening" to false,
        "devices" to emptyList<Map<String, Any?>>(),
      )
      current.connectDevice(deviceId)
      current.currentState()
    }

    AsyncFunction("disconnectDevice") { deviceId: String ->
      val current = controller() ?: return@AsyncFunction mapOf(
        "listening" to false,
        "devices" to emptyList<Map<String, Any?>>(),
      )
      current.disconnectDevice(deviceId)
      current.currentState()
    }

    Function("listBondedSerial") {
      controller()?.listBondedSerial() ?: emptyList<Map<String, Any?>>()
    }
  }

  private fun controller(): TalkToMePttHardwareController? {
    val existing = controller
    if (existing != null) {
      return existing
    }
    val context = appContext.reactContext ?: return null
    val created = TalkToMePttHardwareController(context.applicationContext)
    created.listener = object : TalkToMePttHardwareController.Listener {
      override fun onEvent(
        button: String,
        pressed: Boolean,
        channel: Int?,
        source: String,
        deviceId: String?,
        deviceName: String?,
        raw: String?,
      ) {
        val payload = mutableMapOf<String, Any?>(
          "button" to button,
          "pressed" to pressed,
          "source" to source,
        )
        if (channel != null) {
          payload["channel"] = channel
        }
        if (!deviceId.isNullOrEmpty()) {
          payload["deviceId"] = deviceId
        }
        if (!deviceName.isNullOrEmpty()) {
          payload["deviceName"] = deviceName
        }
        if (!raw.isNullOrEmpty()) {
          payload["raw"] = raw
        }
        sendEvent("onEvent", payload)
      }

      override fun onBytes(
        source: String,
        deviceId: String?,
        deviceName: String?,
        data: List<Int>,
        text: String?,
      ) {
        val payload = mutableMapOf<String, Any?>(
          "source" to source,
          "data" to data,
        )
        if (!deviceId.isNullOrEmpty()) {
          payload["deviceId"] = deviceId
        }
        if (!deviceName.isNullOrEmpty()) {
          payload["deviceName"] = deviceName
        }
        if (!text.isNullOrEmpty()) {
          payload["text"] = text
        }
        sendEvent("onBytes", payload)
      }

      override fun onState(payload: Map<String, Any?>) {
        sendEvent("onState", payload)
      }

      override fun onDiagnostic(message: String) {
        sendEvent("onDiagnostic", mapOf("message" to message))
      }
    }
    controller = created
    PttHardwareHost.controller = created
    PttHardwareHost.pendingService?.let { created.attachService(it) }
    return created
  }
}
