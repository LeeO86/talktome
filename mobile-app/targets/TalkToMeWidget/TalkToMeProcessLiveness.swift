import Darwin
import Foundation
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

/// Widget-side copy of the App Group process lock.
///
/// Keep the file name and flock protocol in sync with
/// `modules/session-presence/ios/TalkToMeProcessLiveness.swift`. The main app
/// holds `LOCK_EX` for its lifetime; this extension only probes with
/// `LOCK_EX | LOCK_NB`. Do not claim the lock from the widget — that would
/// look like the app is alive after a swipe-kill.
///
/// Call C `flock` through `sysFlock`. A `Darwin.flock` function call is the
/// `fcntl` struct, which fails Xcode with "argument passed to call that takes
/// no arguments".
enum TalkToMeProcessLiveness {
  static let suiteName = "group.io.github.leeo86.talktome-mobile"
  static let fileName = "talktome.process.alive"
  /// Keep in sync with `IOS_WIDGET_LIVENESS_RECHECK_SECONDS` in presenceShutdown.ts.
  static let connectedRecheckInterval: TimeInterval = 20

  /// True while the main app still holds the lock (foreground, background, or suspended).
  static func appProcessIsAlive() -> Bool {
    guard let path = lockPath() else {
      return true
    }
    let fd = open(path, O_RDWR)
    guard fd >= 0 else {
      return false
    }
    let acquired = sysFlock(fd, LOCK_EX | LOCK_NB) == 0
    if acquired {
      _ = sysFlock(fd, LOCK_UN)
    }
    close(fd)
    return !acquired
  }

  private static func lockPath() -> String? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: suiteName)?
      .appendingPathComponent(fileName)
      .path
  }
}

@_silgen_name("flock")
private func sysFlock(_ fd: Int32, _ operation: Int32) -> Int32

enum TalkToMeWidgetPresence {
  static let snapshotKey = "talktome.presence.snapshot"

  static func disconnectedHomeEntry(date: Date = Date()) -> TalkToMeHomeEntry {
    TalkToMeHomeEntry(date: date, connected: false, title: "talktome", detail: "Not connected", talking: false)
  }

  static func homeEntry() -> TalkToMeHomeEntry {
    let snapshot = readSnapshot()
    if snapshot.connected && !TalkToMeProcessLiveness.appProcessIsAlive() {
      persistDisconnected()
      return disconnectedHomeEntry()
    }
    return TalkToMeHomeEntry(
      date: Date(),
      connected: snapshot.connected,
      title: snapshot.title,
      detail: snapshot.detail,
      talking: snapshot.talking
    )
  }

  static func timeline(from entry: TalkToMeHomeEntry) -> Timeline<TalkToMeHomeEntry> {
    if entry.connected {
      return Timeline(
        entries: [entry],
        policy: .after(Date().addingTimeInterval(TalkToMeProcessLiveness.connectedRecheckInterval))
      )
    }
    return Timeline(entries: [entry], policy: .atEnd)
  }

  static func resolvedLiveActivityState(
    _ state: TalkToMePresenceAttributes.ContentState
  ) -> TalkToMePresenceAttributes.ContentState {
    if state.connected && !TalkToMeProcessLiveness.appProcessIsAlive() {
      persistDisconnected()
      return disconnectedLiveActivityState
    }
    return state
  }

  static var disconnectedLiveActivityState: TalkToMePresenceAttributes.ContentState {
    TalkToMePresenceAttributes.ContentState(
      connected: false,
      title: "talktome",
      detail: "Not connected",
      audioActive: false,
      talking: false,
      listening: false
    )
  }

  private static func persistDisconnected() {
    writeSnapshot(
      Snapshot(
        connected: false,
        title: "talktome",
        detail: "Not connected",
        audioActive: false,
        talking: false,
        listening: false
      )
    )
    endOrphanedLiveActivities()
  }

  private static func endOrphanedLiveActivities() {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      for activity in Activity<TalkToMePresenceAttributes>.activities {
        Task { @MainActor in
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
    }
    #endif
  }

  private static func readSnapshot() -> Snapshot {
    guard
      let data = UserDefaults(suiteName: TalkToMeProcessLiveness.suiteName)?.data(forKey: snapshotKey),
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

  private static func writeSnapshot(_ state: Snapshot) {
    guard let defaults = UserDefaults(suiteName: TalkToMeProcessLiveness.suiteName) else {
      return
    }
    if let data = try? JSONEncoder().encode(state) {
      defaults.set(data, forKey: snapshotKey)
      defaults.synchronize()
    }
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
