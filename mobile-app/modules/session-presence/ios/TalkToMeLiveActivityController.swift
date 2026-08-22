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
      Task { @MainActor in
        await endAll()
      }
      return
    }
    Task { @MainActor in
      await requestOrUpdate(content)
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

  @MainActor
  private func endAll() async {
    for activity in Activity<TalkToMePresenceAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}
#endif
