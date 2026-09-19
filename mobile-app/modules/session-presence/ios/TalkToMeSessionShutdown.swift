import Foundation
import MediaPlayer
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

/// Lock-screen and widget leftovers that outlive JS (Live Activities, App Group
/// snapshot). Swipe-killing a suspended app does not run JS
/// `disconnect()`, so native code has to drop these surfaces itself.
enum TalkToMeSessionShutdown {
  static func clearLockScreenSurfaces() {
    TalkToMePresenceStore.writeDisconnected()
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      TalkToMeLiveActivityController.endAllDetached()
    }
    #endif
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
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
