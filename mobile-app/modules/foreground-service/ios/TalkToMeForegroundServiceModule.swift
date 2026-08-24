import ExpoModulesCore

public final class TalkToMeForegroundServiceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TalkToMeForegroundService")

    Events("onStopRequested", "onTalkRequested", "onStarted", "onStopped")

    Function("isAvailable") {
      false
    }

    Function("isRunning") {
      false
    }

    AsyncFunction("start") { (_includeConnectedDevice: Bool, _title: String, _text: String, _talking: Bool) in
      false
    }

    AsyncFunction("update") { (_includeConnectedDevice: Bool, _title: String, _text: String, _talking: Bool) in
      false
    }

    AsyncFunction("stop") {
      false
    }

    AsyncFunction("openBatterySettings") {
      false
    }
  }
}
