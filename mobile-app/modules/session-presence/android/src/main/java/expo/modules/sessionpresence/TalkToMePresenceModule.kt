package expo.modules.sessionpresence

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMePresenceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TalkToMePresence")

    Events("onTalkShortcut")

    Function("isAvailable") {
      true
    }

    AsyncFunction("update") { snapshot: Map<String, Any?> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      TalkToMeSessionWidget.write(
        context,
        snapshot["connected"] as? Boolean ?: false,
        snapshot["title"] as? String ?: "talktome",
        snapshot["detail"] as? String ?: "",
      )
      true
    }
  }
}
