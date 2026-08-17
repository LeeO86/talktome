package expo.modules.bleptt

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMeBlePttModule : Module() {
  private var controller: TalkToMeBlePttController? = null

  override fun definition() = ModuleDefinition {
    Name("TalkToMeBlePtt")

    Events("onState", "onButton", "onDiagnostic")

    Function("isAvailable") {
      true
    }

    Function("getState") {
      controller()?.currentState() ?: mapOf("kind" to "idle")
    }

    AsyncFunction("start") {
      val current = controller() ?: return@AsyncFunction mapOf(
        "kind" to "unavailable",
        "message" to "Bluetooth is currently unavailable.",
      )
      current.start()
      current.currentState()
    }

    AsyncFunction("scanAndConnect") {
      val current = controller() ?: return@AsyncFunction mapOf(
        "kind" to "unavailable",
        "message" to "Bluetooth is currently unavailable.",
      )
      current.scanAndConnect()
      current.currentState()
    }

    AsyncFunction("disconnect") {
      val current = controller() ?: return@AsyncFunction mapOf("kind" to "idle")
      current.disconnect()
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

      override fun onButton(pressed: Boolean) {
        sendEvent("onButton", mapOf("pressed" to pressed))
      }

      override fun onDiagnostic(message: String) {
        sendEvent("onDiagnostic", mapOf("message" to message))
      }
    }
    controller = created
    return created
  }
}
