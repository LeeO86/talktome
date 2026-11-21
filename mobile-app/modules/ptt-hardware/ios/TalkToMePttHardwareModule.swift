import ExpoModulesCore

public final class TalkToMePttHardwareModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TalkToMePttHardware")

    Events("onEvent", "onBytes", "onState", "onDiagnostic")

    Function("isAvailable") {
      false
    }

    Function("getState") {
      ["listening": false, "devices": [] as [String]]
    }

    AsyncFunction("start") { (_intentCatalogJson: String) in
      ["listening": false, "devices": [] as [String]]
    }

    AsyncFunction("stop") {
      ["listening": false, "devices": [] as [String]]
    }

    AsyncFunction("startPairing") { (_timeoutMs: Int, _boundIdsJson: String) in
      ["listening": false, "pairing": false, "devices": [] as [String]]
    }

    AsyncFunction("cancelPairing") {
      ["listening": false, "pairing": false, "devices": [] as [String]]
    }

    AsyncFunction("acceptDevice") { (_deviceId: String) in
      ["listening": false, "devices": [] as [String]]
    }

    AsyncFunction("connectDevice") { (_deviceId: String) in
      ["listening": false, "devices": [] as [String]]
    }

    AsyncFunction("disconnectDevice") { (_deviceId: String) in
      ["listening": false, "devices": [] as [String]]
    }

    Function("listBondedSerial") {
      [] as [[String: Any]]
    }
  }
}
