import ExpoModulesCore

public final class TalkToMeAudioSessionModule: Module {
  private let controller = TalkToMeAudioSessionController()

  public func definition() -> ModuleDefinition {
    Name("TalkToMeAudioSession")

    Events("onAudioRouteChange")

    OnCreate {
      self.controller.onRouteChange = { [weak self] in
        guard let self else { return }
        self.sendEvent("onAudioRouteChange", self.controller.routeSnapshot())
      }
    }

    Function("isAvailable") {
      true
    }

    Function("hasSystemRoutePicker") {
      true
    }

    View(TalkToMeAudioRoutePickerView.self) {}

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

    AsyncFunction("deactivate") {
      self.controller.deactivate()
      return true
    }

    AsyncFunction("setWebRTCAudioEnabled") { (enabled: Bool) in
      self.controller.setWebRTCAudioEnabled(enabled)
      return true
    }

    AsyncFunction("updateNowPlaying") { (title: String, detail: String, active: Bool) in
      self.controller.updateNowPlaying(title: title, detail: detail, active: active)
      return true
    }

    AsyncFunction("playConnectionCue") { (name: String) in
      self.controller.playConnectionCue(name)
    }

    AsyncFunction("playWatchReadyCue") {
      self.controller.playWatchReadyCue()
    }

    Function("audioRoutes") {
      self.controller.routeSnapshot()["routes"]
    }

    Function("currentAudioRoute") {
      self.controller.routeSnapshot()
    }

    AsyncFunction("selectAudioRoute") { (id: String) in
      try self.controller.selectRoute(id)
      return self.controller.routeSnapshot()
    }
  }
}
