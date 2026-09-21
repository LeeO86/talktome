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

/// Owns the single TalkToMe Live Activity of this process.
///
/// Threading: ActivityKit calls are `async` and not main-actor bound, so every
/// job runs on a detached task. Nothing here spins the main run loop. The one
/// synchronous wait, `endAllAndWait`, is for `willTerminate` only: the process is
/// about to die, a fire-and-forget task would die with it, and a bounded
/// `DispatchSemaphore` wait is what the system gives us (~5 s) to let ActivityKit
/// dismiss the Dynamic Island.
///
/// Ordering: end and request/update jobs are chained on `TalkToMeLiveActivityQueue`,
/// so a restored session published right after launch cannot request a new activity
/// while the orphan from the previous process is still being ended.
@available(iOS 16.2, *)
final class TalkToMeLiveActivityController {
  static let terminateTimeout: TimeInterval = 2.0

  private static let log = Logger(subsystem: "io.github.leeo86.talktome-mobile", category: "LiveActivity")

  func update(state: TalkToMePresenceState) {
    let content = Self.content(from: state)
    if !state.connected {
      Self.endAll(finalContent: content)
      return
    }
    TalkToMeLiveActivityQueue.enqueue {
      await Self.requestOrUpdate(content)
    }
  }

  /// End every activity of this process without blocking the caller.
  /// Used at launch (orphans of the previous process) and on in-app disconnect.
  @discardableResult
  static func endAll(finalContent: TalkToMePresenceAttributes.ContentState? = nil) -> Task<Void, Never> {
    TalkToMeLiveActivityQueue.enqueue {
      await Self.endAllNow(finalContent: finalContent)
    }
  }

  /// `willTerminate` only. Blocks the calling thread until ActivityKit has ended
  /// the activities or `timeout` passes, whichever comes first.
  static func endAllAndWait(timeout: TimeInterval = terminateTimeout) {
    guard !Activity<TalkToMePresenceAttributes>.activities.isEmpty else {
      return
    }
    let done = DispatchSemaphore(value: 0)
    let job = endAll(finalContent: disconnectedContent())
    Task.detached(priority: .userInitiated) {
      await job.value
      done.signal()
    }
    if done.wait(timeout: .now() + timeout) == .timedOut {
      log.error("Live Activity end did not finish within \(timeout, privacy: .public)s before termination")
    }
  }

  private static func endAllNow(finalContent: TalkToMePresenceAttributes.ContentState?) async {
    let existing = Array(Activity<TalkToMePresenceAttributes>.activities)
    let content = finalContent.map { ActivityContent(state: $0, staleDate: Date()) }
    for activity in existing {
      await activity.end(content, dismissalPolicy: .immediate)
    }
  }

  private static func requestOrUpdate(_ content: TalkToMePresenceAttributes.ContentState) async {
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

  private static func content(from state: TalkToMePresenceState) -> TalkToMePresenceAttributes.ContentState {
    TalkToMePresenceAttributes.ContentState(
      connected: state.connected,
      title: state.title,
      detail: state.detail,
      audioActive: state.audioActive,
      talking: state.talking,
      listening: state.listening
    )
  }

  private static func disconnectedContent() -> TalkToMePresenceAttributes.ContentState {
    TalkToMePresenceAttributes.ContentState(
      connected: false,
      title: "talktome",
      detail: "Not connected",
      audioActive: false,
      talking: false,
      listening: false
    )
  }
}

/// Serial chain of ActivityKit jobs. Each job starts after the previous one
/// finished, regardless of which thread enqueued it.
private enum TalkToMeLiveActivityQueue {
  private static let lock = NSLock()
  private static var tail: Task<Void, Never>?

  @discardableResult
  static func enqueue(_ job: @escaping @Sendable () async -> Void) -> Task<Void, Never> {
    lock.lock()
    defer { lock.unlock() }
    let previous = tail
    let next = Task.detached(priority: .userInitiated) {
      if let previous {
        await previous.value
      }
      await job()
    }
    tail = next
    return next
  }
}
#endif
