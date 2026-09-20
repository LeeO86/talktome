import ActivityKit
import Foundation
import OSLog

#if canImport(ActivityKit)
@available(iOS 16.2, *)
struct TalkToMePresenceAttributes: ActivityAttributes {
  public static var activityIdentifier: String { "TalkToMePresence" }

  public struct ContentState: Codable, Hashable {
    var connected: Bool
    var title: String
    var detail: String
    var audioActive: Bool
    var talking: Bool
    var listening: Bool
  }

  var name: String
}

@available(iOS 16.2, *)
final class TalkToMeLiveActivityController {
  private let log = Logger(subsystem: "io.github.leeo86.talktome-mobile", category: "LiveActivity")

  func update(state: TalkToMePresenceState) {
    let content = TalkToMePresenceAttributes.ContentState(
      connected: state.connected,
      title: state.title,
      detail: state.detail,
      audioActive: state.audioActive,
      talking: state.talking,
      listening: state.listening
    )
    if !state.connected {
      Self.endAllAndWait()
      return
    }
    Task { @MainActor in
      await requestOrUpdate(content)
    }
  }

  static func endAllDetached() {
    Task { @MainActor in
      await endAll()
    }
  }

  /// `willTerminate` and module-create used to fire `Task { end }` and return.
  /// The process then died before ActivityKit dismissed the Dynamic Island.
  static func endAllAndWait(timeout: TimeInterval = 1.8) {
    let existing = Array(Activity<TalkToMePresenceAttributes>.activities)
    guard !existing.isEmpty else {
      return
    }
    let done = TalkToMeWaitFlag()
    Task { @MainActor in
      await endAll()
      done.set()
    }
    let deadline = Date().addingTimeInterval(timeout)
    if Thread.isMainThread {
      while !done.isSet && Date() < deadline {
        RunLoop.current.run(mode: .common, before: Date(timeIntervalSinceNow: 0.02))
      }
    } else {
      while !done.isSet && Date() < deadline {
        Thread.sleep(forTimeInterval: 0.02)
      }
    }
  }

  @MainActor
  static func endAll() async {
    let existing = Array(Activity<TalkToMePresenceAttributes>.activities)
    for activity in existing {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  @MainActor
  private func requestOrUpdate(_ content: TalkToMePresenceAttributes.ContentState) async {
    if !ActivityAuthorizationInfo().areActivitiesEnabled {
      log.error("Live Activities are disabled in iOS Settings")
      return
    }
    if let activity = Activity<TalkToMePresenceAttributes>.activities.first {
      await activity.update(ActivityContent(state: content, staleDate: nil))
      return
    }
    do {
      let attributes = TalkToMePresenceAttributes(name: "talktome")
      _ = try Activity.request(
        attributes: attributes,
        content: ActivityContent(state: content, staleDate: nil),
        pushType: nil
      )
    } catch {
      log.error("Live Activity request failed: \(error.localizedDescription, privacy: .public)")
    }
  }
}

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
#endif
