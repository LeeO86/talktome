import ExpoModulesCore

public final class TalkToMeBlePttModule: Module {
  private let controller = TalkToMeBlePttController()

  public func definition() -> ModuleDefinition {
    Name("TalkToMeBlePtt")

    Events("onState", "onButton", "onDiagnostic")

    OnCreate {
      self.controller.onState = { [weak self] payload in
        self?.sendEvent("onState", payload)
      }
      self.controller.onButton = { [weak self] pressed in
        self?.sendEvent("onButton", ["pressed": pressed])
      }
      self.controller.onDiagnostic = { [weak self] message in
        self?.sendEvent("onDiagnostic", ["message": message])
      }
    }

    Function("isAvailable") {
      true
    }

    Function("getState") {
      self.controller.currentState()
    }

    AsyncFunction("start") {
      self.controller.start()
      return self.controller.currentState()
    }

    AsyncFunction("scanAndConnect") {
      self.controller.scanAndConnect()
      return self.controller.currentState()
    }

    AsyncFunction("disconnect") {
      self.controller.disconnect()
      return self.controller.currentState()
    }
  }
}
