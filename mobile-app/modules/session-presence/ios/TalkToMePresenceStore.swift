import Foundation

struct TalkToMePresenceState: Codable, Hashable {
  var connected: Bool
  var title: String
  var detail: String
  var audioActive: Bool
  var talking: Bool
  var listening: Bool
}

enum TalkToMePresenceStore {
  static let suiteName = Bundle.main.object(forInfoDictionaryKey: "TalkToMeAppGroup") as? String
    ?? "group.io.github.leeo86.talktome-mobile"
  static let snapshotKey = "talktome.presence.snapshot"
  /// Builds 15/16 held a process-lifetime file lock here so the widget could probe
  /// liveness. iOS kills an app that holds a lock on a shared-container file when it
  /// suspends it (RunningBoard 0xDEAD10CC), which TestFlight reports as a crash.
  /// Never lock files in the App Group container. The leftover file is deleted at launch.
  static let legacyProcessAliveFileName = "talktome.process.alive"
  static let talkNotification = "io.github.leeo86.talktome.talk" as CFString
  static let disconnectNotification = "io.github.leeo86.talktome.disconnect" as CFString

  static func writeDisconnected() {
    write(
      TalkToMePresenceState(
        connected: false,
        title: "talktome",
        detail: "Not connected",
        audioActive: false,
        talking: false,
        listening: false
      )
    )
  }

  static func write(_ state: TalkToMePresenceState) {
    guard let defaults = UserDefaults(suiteName: suiteName) else {
      return
    }
    if let data = try? JSONEncoder().encode(state) {
      defaults.set(data, forKey: snapshotKey)
      defaults.synchronize()
    }
  }

  static func removeLegacyProcessLockFile() {
    guard
      let url = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: suiteName)?
        .appendingPathComponent(legacyProcessAliveFileName)
    else {
      return
    }
    try? FileManager.default.removeItem(at: url)
  }

  static func read() -> TalkToMePresenceState {
    guard
      let data = UserDefaults(suiteName: suiteName)?.data(forKey: snapshotKey),
      let state = try? JSONDecoder().decode(TalkToMePresenceState.self, from: data)
    else {
      return TalkToMePresenceState(connected: false, title: "talktome", detail: "Not connected", audioActive: false, talking: false, listening: false)
    }
    return state
  }
}
