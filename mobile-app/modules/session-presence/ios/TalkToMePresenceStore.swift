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
  static let suiteName = "group.io.github.leeo86.talktome-mobile"
  static let snapshotKey = "talktome.presence.snapshot"
  static let talkNotification = "io.github.leeo86.talktome.talk" as CFString
  static let disconnectNotification = "io.github.leeo86.talktome.disconnect" as CFString
  /// Posted when the process is about to die. PushToTalk listens and leaves the channel.
  static let sessionWillTerminateNotification = "io.github.leeo86.talktome.session-will-terminate" as CFString

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
