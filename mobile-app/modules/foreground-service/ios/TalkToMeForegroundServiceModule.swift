import ExpoModulesCore

public final class TalkToMeForegroundServiceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TalkToMeForegroundService")

    Events("onStopRequested", "onStarted", "onStopped")

    Function("isAvailable") {
      false
    }

    Function("isRunning") {
      false
    }

    AsyncFunction("start") { (_includeConnectedDevice: Bool, _title: String, _text: String) in
      false
    }

    AsyncFunction("update") { (_includeConnectedDevice: Bool, _title: String, _text: String) in
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
