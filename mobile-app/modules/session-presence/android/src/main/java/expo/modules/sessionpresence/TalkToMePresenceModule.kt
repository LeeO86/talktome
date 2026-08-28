package expo.modules.sessionpresence

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMePresenceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TalkToMePresence")

    Events("onTalkShortcut", "onDisconnectShortcut")

    OnCreate {
      appContext.reactContext?.applicationContext?.let { context ->
        TalkToMeSessionWidget.clearIfConnected(context)
      }
      Holder.listener = object : TalkToMePresenceListener {
        override fun onTalkRequested() {
          sendEvent("onTalkShortcut")
        }

        override fun onDisconnectRequested() {
          sendEvent("onDisconnectShortcut")
        }
      }
    }

    OnDestroy {
      Holder.listener = null
    }

    Function("isAvailable") {
      true
    }

    AsyncFunction("update") { snapshot: Map<String, Any?> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val talking = snapshot["talking"] as? Boolean ?: false
      TalkToMeSessionWidget.write(
        context,
        snapshot["connected"] as? Boolean ?: false,
        snapshot["title"] as? String ?: "talktome",
        snapshot["detail"] as? String ?: "",
        talking,
        snapshot["talkLabel"] as? String ?: if (talking) "Stop reply" else "Reply lock",
      )
      true
    }
  }
}

object Holder {
  @Volatile
  var listener: TalkToMePresenceListener? = null

  fun emitTalk(): Boolean {
    val active = this.listener ?: return false
    active.onTalkRequested()
    return true
  }

  fun emitDisconnect(): Boolean {
    val active = this.listener ?: return false
    active.onDisconnectRequested()
    return true
  }
}

interface TalkToMePresenceListener {
  fun onTalkRequested()
  fun onDisconnectRequested()
}
