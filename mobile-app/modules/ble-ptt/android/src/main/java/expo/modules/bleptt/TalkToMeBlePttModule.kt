package expo.modules.bleptt

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMeBlePttModule : Module() {
  private var controller: TalkToMeBlePttController? = null

  override fun definition() = ModuleDefinition {
    Name("TalkToMeBlePtt")

    Events("onState", "onButton", "onDiagnostic", "onNotify")

    Function("isAvailable") {
      true
    }

    Function("getState") {
      try {
        controller()?.currentState() ?: mapOf("kind" to "idle", "devices" to emptyList<Map<String, Any?>>())
      } catch (_: SecurityException) {
        mapOf("kind" to "idle", "devices" to emptyList<Map<String, Any?>>())
      }
    }

    AsyncFunction("start") { catalogJson: String ->
      try {
        val current = controller() ?: return@AsyncFunction mapOf(
          "kind" to "unavailable",
          "message" to "Bluetooth is currently unavailable.",
          "devices" to emptyList<Map<String, Any?>>(),
        )
        current.setCatalogJson(catalogJson)
        current.start()
        current.currentState()
      } catch (_: SecurityException) {
        mapOf("kind" to "idle", "devices" to emptyList<Map<String, Any?>>())
      }
    }

    AsyncFunction("scanAndConnect") { catalogJson: String ->
      try {
        val current = controller() ?: return@AsyncFunction mapOf(
          "kind" to "unavailable",
          "message" to "Bluetooth is currently unavailable.",
          "devices" to emptyList<Map<String, Any?>>(),
        )
        current.setCatalogJson(catalogJson)
        current.scanAndConnect()
        current.currentState()
      } catch (_: SecurityException) {
        mapOf(
          "kind" to "unavailable",
          "message" to "Bluetooth permission is required to scan for a PTT accessory.",
          "devices" to emptyList<Map<String, Any?>>(),
        )
      }
    }

    AsyncFunction("startButtonPairing") { catalogJson: String, timeoutMs: Int, boundIdsJson: String ->
      try {
        val current = controller() ?: return@AsyncFunction mapOf(
          "kind" to "unavailable",
          "message" to "Bluetooth is currently unavailable.",
          "devices" to emptyList<Map<String, Any?>>(),
        )
        current.setCatalogJson(catalogJson)
        current.startButtonPairing(timeoutMs, boundIdsJson)
        current.currentState()
      } catch (_: SecurityException) {
        mapOf(
          "kind" to "unavailable",
          "message" to "Bluetooth permission is required to scan for a PTT accessory.",
          "devices" to emptyList<Map<String, Any?>>(),
        )
      }
    }

    AsyncFunction("cancelButtonPairing") {
      val current = controller() ?: return@AsyncFunction mapOf("kind" to "idle", "devices" to emptyList<Map<String, Any?>>())
      current.cancelButtonPairing()
      current.currentState()
    }

    AsyncFunction("acceptPairedDevice") { deviceId: String ->
      val current = controller() ?: return@AsyncFunction mapOf("kind" to "idle", "devices" to emptyList<Map<String, Any?>>())
      current.acceptPairedDevice(deviceId)
      current.currentState()
    }

    AsyncFunction("connectDevice") { deviceId: String, catalogJson: String ->
      try {
        val current = controller() ?: return@AsyncFunction mapOf(
          "kind" to "unavailable",
          "message" to "Bluetooth is currently unavailable.",
          "devices" to emptyList<Map<String, Any?>>(),
        )
        current.setCatalogJson(catalogJson)
        current.connectStored(deviceId)
        current.currentState()
      } catch (_: SecurityException) {
        mapOf("kind" to "idle", "devices" to emptyList<Map<String, Any?>>())
      }
    }

    AsyncFunction("disconnect") { deviceId: String ->
      val current = controller() ?: return@AsyncFunction mapOf("kind" to "idle", "devices" to emptyList<Map<String, Any?>>())
      current.disconnect(deviceId)
      current.currentState()
    }
  }

  private fun controller(): TalkToMeBlePttController? {
    val existing = controller
    if (existing != null) {
      return existing
    }
    val context = appContext.reactContext ?: return null
    val created = TalkToMeBlePttController(context.applicationContext)
    created.listener = object : TalkToMeBlePttController.Listener {
      override fun onState(payload: Map<String, Any?>) {
        sendEvent("onState", payload)
      }

      override fun onButton(deviceId: String, pressed: Boolean) {
        sendEvent("onButton", mapOf("deviceId" to deviceId, "pressed" to pressed))
      }

      override fun onNotify(deviceId: String, data: List<Int>, serviceUuid: String, characteristicUuid: String) {
        sendEvent(
          "onNotify",
          mapOf(
            "deviceId" to deviceId,
            "data" to data,
            "serviceUuid" to serviceUuid,
            "characteristicUuid" to characteristicUuid,
          ),
        )
      }

      override fun onDiagnostic(message: String) {
        sendEvent("onDiagnostic", mapOf("message" to message))
      }
    }
    controller = created
    return created
  }
}
