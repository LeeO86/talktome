package expo.modules.pushtotalk

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalkToMePttModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TalkToMePtt")

    Events(
      "onDiagnostic",
      "onPushToken",
      "onBeginTransmitting",
      "onEndTransmitting",
      "onAudioActivated",
      "onAudioDeactivated",
      "onServiceUpdate",
      "onJoined",
      "onLeft",
      "onJoinFailed",
      "onIncomingPush",
    )

    Function("isAvailable") {
      false
    }

    AsyncFunction("updateChannel") { _channelUUID: String?, _channelName: String? ->
      false
    }

    AsyncFunction("updateActiveRemoteParticipant") { _name: String? ->
      false
    }

    AsyncFunction("leave") {
      false
    }
  }
}
