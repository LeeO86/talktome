import Foundation
import WidgetKit

/// Home-widget view of the App Group presence snapshot written by the app
/// (`modules/session-presence/ios/TalkToMePresenceStore.swift`).
///
/// There is no process-liveness probe on purpose. Builds 15/16 had the app hold a
/// lock on an App Group file so this extension could tell a suspended app from a
/// swipe-killed one. iOS terminates an app that holds a lock on a shared-container
/// file when it suspends it (RunningBoard 0xDEAD10CC); TestFlight showed that as
/// "TalkToMe crashed" 20–30 s after every backgrounding. An extension also cannot
/// end the app's Live Activity. So this widget paints the snapshot as written, and
/// the app clears it on `willTerminate` (still running) or on its next launch
/// (swipe-killed while suspended).
enum TalkToMeWidgetPresence {
  static let suiteName = Bundle.main.object(forInfoDictionaryKey: "TalkToMeAppGroup") as? String
    ?? "group.io.github.leeo86.talktome-mobile"
  static let snapshotKey = "talktome.presence.snapshot"

  static func disconnectedHomeEntry(date: Date = Date()) -> TalkToMeHomeEntry {
    TalkToMeHomeEntry(date: date, connected: false, title: "talktome", detail: "Not connected", talking: false)
  }

  static func homeEntry() -> TalkToMeHomeEntry {
    let snapshot = readSnapshot()
    return TalkToMeHomeEntry(
      date: Date(),
      connected: snapshot.connected,
      title: snapshot.title,
      detail: snapshot.detail,
      talking: snapshot.talking
    )
  }

  /// The app reloads timelines on every presence change, so no periodic recheck.
  static func timeline(from entry: TalkToMeHomeEntry) -> Timeline<TalkToMeHomeEntry> {
    Timeline(entries: [entry], policy: .never)
  }

  private static func readSnapshot() -> Snapshot {
    guard
      let data = UserDefaults(suiteName: suiteName)?.data(forKey: snapshotKey),
      let state = try? JSONDecoder().decode(Snapshot.self, from: data)
    else {
      return Snapshot(
        connected: false,
        title: "talktome",
        detail: "Not connected",
        audioActive: false,
        talking: false,
        listening: false
      )
    }
    return state
  }

  private struct Snapshot: Codable {
    var connected: Bool
    var title: String
    var detail: String
    var audioActive: Bool
    var talking: Bool
    var listening: Bool

    init(
      connected: Bool,
      title: String,
      detail: String,
      audioActive: Bool,
      talking: Bool,
      listening: Bool
    ) {
      self.connected = connected
      self.title = title
      self.detail = detail
      self.audioActive = audioActive
      self.talking = talking
      self.listening = listening
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      connected = try container.decode(Bool.self, forKey: .connected)
      title = try container.decodeIfPresent(String.self, forKey: .title) ?? "talktome"
      detail = try container.decodeIfPresent(String.self, forKey: .detail) ?? "Not connected"
      audioActive = try container.decodeIfPresent(Bool.self, forKey: .audioActive) ?? false
      talking = try container.decodeIfPresent(Bool.self, forKey: .talking) ?? false
      listening = try container.decodeIfPresent(Bool.self, forKey: .listening) ?? false
    }
  }
}
