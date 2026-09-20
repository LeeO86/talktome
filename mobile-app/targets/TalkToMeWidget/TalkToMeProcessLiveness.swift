import Darwin
import Foundation
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

/// Widget-side copy of the App Group process lock.
///
/// Keep the file name and fcntl F_SETLK protocol in sync with
/// `modules/session-presence/ios/TalkToMeProcessLiveness.swift`. The main app
/// holds `F_SETLKW` for its lifetime; this extension only probes with
/// `F_SETLK`. Do not claim the lock from the widget — that would look like
/// the app is alive after a swipe-kill.
///
/// `import Darwin` also imports the `fcntl` `flock` struct, so never call
/// the Darwin flock function.
enum TalkToMeProcessLiveness {
  static let suiteName = "group.io.github.leeo86.talktome-mobile"
  static let fileName = "talktome.process.alive"
  /// Keep in sync with `IOS_WIDGET_LIVENESS_RECHECK_SECONDS` in presenceShutdown.ts.
  static let connectedRecheckInterval: TimeInterval = 20

  /// True while the main app still holds the lock (foreground, background, or suspended).
  ///
  /// A lock-screen Live Activity must not treat "cannot open the file" as death.
  /// That happens when data protection blocks the extension while the device is
  /// locked, and it was painting "Not connected" over a live session.
  static func appProcessIsAlive() -> Bool {
    guard let path = lockPath() else {
      return true
    }
    if !FileManager.default.fileExists(atPath: path) {
      return false
    }
    let fd = open(path, O_RDWR)
    if fd < 0 {
      let err = errno
      if err == ENOENT {
        return false
      }
      if err == EACCES || err == EPERM {
        return true
      }
      return true
    }
    let acquired = setExclusiveLock(fd: fd, wait: false)
    if acquired {
      unlock(fd: fd)
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

  private static func setExclusiveLock(fd: Int32, wait: Bool) -> Bool {
    var spec = flock()
    spec.l_start = 0
    spec.l_len = 0
    spec.l_pid = 0
    spec.l_type = Int16(F_WRLCK)
    spec.l_whence = Int16(SEEK_SET)
    let cmd = wait ? F_SETLKW : F_SETLK
    return withUnsafeMutablePointer(to: &spec) { pointer in
      fcntl(fd, cmd, pointer) == 0
    }
  }

  private static func unlock(fd: Int32) {
    var spec = flock()
    spec.l_start = 0
    spec.l_len = 0
    spec.l_pid = 0
    spec.l_type = Int16(F_UNLCK)
    spec.l_whence = Int16(SEEK_SET)
    _ = withUnsafeMutablePointer(to: &spec) { pointer in
      fcntl(fd, F_SETLK, pointer)
    }
  }
}

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
      let activities = Array(Activity<TalkToMePresenceAttributes>.activities)
      guard !activities.isEmpty else {
        return
      }
      let done = TalkToMeWaitFlag()
      Task { @MainActor in
        for activity in activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        done.set()
      }
      let deadline = Date().addingTimeInterval(0.8)
      while !done.isSet && Date() < deadline {
        RunLoop.current.run(mode: .common, before: Date(timeIntervalSinceNow: 0.02))
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

/// WidgetKit/ActivityKit `end` is async; swipe-kill must actually wait for it.
private final class TalkToMeWaitFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var value = false

  func set() {
    lock.lock()
    value = true
    lock.unlock()
  }

  var isSet: Bool {
    lock.lock()
    defer { lock.unlock() }
    return value
  }
}
