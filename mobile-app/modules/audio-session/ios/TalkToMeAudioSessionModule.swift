import ExpoModulesCore

public final class TalkToMeAudioSessionModule: Module {
  private let controller = TalkToMeAudioSessionController()

  public func definition() -> ModuleDefinition {
    Name("TalkToMeAudioSession")

    Function("isAvailable") {
      true
    }

    Function("profile") {
      self.controller.profile()
    }

    AsyncFunction("activateForMonitoring") {
      try self.controller.activateForMonitoring()
      return true
    }

    AsyncFunction("activateForIntercom") {
      try self.controller.activateForIntercom()
      return true
    }

    AsyncFunction("reactivateForOutgoingTalkCapture") {
      try self.controller.reactivateForOutgoingTalkCapture()
      return true
    }

    AsyncFunction("startBackgroundKeepalive") {
      try self.controller.startBackgroundKeepalive()
      return true
    }

    AsyncFunction("stopBackgroundKeepalive") {
      self.controller.stopBackgroundKeepalive()
      return true
    }

    AsyncFunction("prepareForSystemManagedIntercom") {
      try self.controller.prepareForSystemManagedIntercom()
      return true
    }

    AsyncFunction("deactivate") {
      self.controller.deactivate()
      return true
    }

    AsyncFunction("setWebRTCAudioEnabled") { (enabled: Bool) in
      self.controller.setWebRTCAudioEnabled(enabled)
      return true
    }
  }
}
