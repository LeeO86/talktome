import ExpoModulesCore

public final class TalkToMeBlePttModule: Module {
  private let controller = TalkToMeBlePttController()

  public func definition() -> ModuleDefinition {
    Name("TalkToMeBlePtt")

    Events("onState", "onButton", "onDiagnostic", "onNotify")

    OnCreate {
      self.controller.onState = { [weak self] payload in
        self?.sendEvent("onState", payload)
      }
      self.controller.onButton = { [weak self] deviceId, pressed in
        self?.sendEvent("onButton", ["deviceId": deviceId, "pressed": pressed])
      }
      self.controller.onDiagnostic = { [weak self] message in
        self?.sendEvent("onDiagnostic", ["message": message])
      }
      self.controller.onNotify = { [weak self] deviceId, data, serviceUuid, characteristicUuid in
        self?.sendEvent("onNotify", [
          "deviceId": deviceId,
          "data": data,
          "serviceUuid": serviceUuid,
          "characteristicUuid": characteristicUuid,
        ])
      }
    }

    Function("isAvailable") {
      true
    }

    Function("getState") {
      self.controller.currentState()
    }

    AsyncFunction("start") { (catalogJson: String) in
      self.controller.setCatalogJSON(catalogJson)
      self.controller.start()
      return self.controller.currentState()
    }

    AsyncFunction("scanAndConnect") { (catalogJson: String) in
      self.controller.setCatalogJSON(catalogJson)
      self.controller.scanAndConnect()
      return self.controller.currentState()
    }

    AsyncFunction("startButtonPairing") { (catalogJson: String, timeoutMs: Int, boundIdsJson: String) in
      self.controller.setCatalogJSON(catalogJson)
      self.controller.startButtonPairing(timeoutMs: timeoutMs, boundIdsJSON: boundIdsJson)
      return self.controller.currentState()
    }

    AsyncFunction("cancelButtonPairing") {
      self.controller.cancelButtonPairing()
      return self.controller.currentState()
    }

    AsyncFunction("acceptPairedDevice") { (deviceId: String) in
      self.controller.acceptPairedDevice(id: deviceId)
      return self.controller.currentState()
    }

    AsyncFunction("connectDevice") { (deviceId: String, catalogJson: String) in
      self.controller.setCatalogJSON(catalogJson)
      self.controller.connectStored(id: deviceId)
      return self.controller.currentState()
    }

    AsyncFunction("disconnect") { (deviceId: String) in
      self.controller.disconnect(id: deviceId)
      return self.controller.currentState()
    }
  }
}
