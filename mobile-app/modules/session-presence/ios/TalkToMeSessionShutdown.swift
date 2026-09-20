import Foundation
import MediaPlayer
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

/// Lock-screen and widget leftovers that outlive JS (Live Activities, App Group
/// snapshot). Swipe-killing a suspended app does not run JS
/// `disconnect()`, so native code has to drop these surfaces itself.
/// The home widget also probes `TalkToMeProcessLiveness` after SIGKILL.
enum TalkToMeSessionShutdown {
  static func clearLockScreenSurfaces() {
    TalkToMePresenceStore.writeDisconnected()
    endLeftoverLiveActivities()
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }

  /// Wait for ActivityKit to dismiss the Dynamic Island. A detached `Task`
  /// is killed with the process and leaves the island on screen.
  static func endLeftoverLiveActivities() {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      TalkToMeLiveActivityController.endAllAndWait()
    }
    #endif
  }

  static func postWillTerminate() {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(TalkToMePresenceStore.sessionWillTerminateNotification),
      nil,
      nil,
      true
    )
  }

  /// Best-effort path while the process is still running (`willTerminate`).
  static func runForImminentTermination() {
    clearLockScreenSurfaces()
    postWillTerminate()
  }
}
