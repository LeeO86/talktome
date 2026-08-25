package expo.modules.watchremote

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMeWatchRemoteModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TalkToMeWatchRemote")

    Events("onTalkStart", "onTalkStop")

    Function("isAvailable") {
      false
    }

    Function("status") {
      mapOf(
        "supported" to false,
        "paired" to false,
        "appInstalled" to false,
        "reachable" to false,
      )
    }

    AsyncFunction("update") { _: Map<String, Any?> ->
      false
    }

    AsyncFunction("ackTalk") { _: Map<String, Any?> ->
      false
    }
  }
}
