import Foundation
import MediaPlayer
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

/// Lock-screen and widget leftovers that outlive JS (Live Activities, App Group
/// snapshot). Swipe-killing a suspended app does not run JS `disconnect()` and
/// does not deliver `willTerminate` either, so native code drops these surfaces
/// on the next launch. `willTerminate` only reaches a process that is still
/// running in the background (active audio); that path is the one place that
/// may block, and only for a bounded time.
///
/// There is deliberately no process-liveness probe: holding a lock on an App Group
/// file across suspension gets the app killed with 0xDEAD10CC (builds 15/16).
enum TalkToMeSessionShutdown {
  /// Launch path. Never blocks: the process lives on, and the Live Activity
  /// controller serializes this end before any request from the restored session.
  static func clearLockScreenSurfaces() {
    TalkToMePresenceStore.removeLegacyProcessLockFile()
    TalkToMePresenceStore.writeDisconnected()
    endLeftoverLiveActivities(wait: false)
    reloadWidgetsAndClearNowPlaying()
  }

  /// `willTerminate` path, while the process is still running. JS gets its
  /// disconnect event before the wait on ActivityKit.
  static func runForImminentTermination(beforeWait: () -> Void = {}) {
    TalkToMePresenceStore.writeDisconnected()
    beforeWait()
    endLeftoverLiveActivities(wait: true)
    reloadWidgetsAndClearNowPlaying()
  }

  static func endLeftoverLiveActivities(wait: Bool) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      if wait {
        TalkToMeLiveActivityController.endAllAndWait()
      } else {
        TalkToMeLiveActivityController.endAll()
      }
    }
    #endif
  }

  private static func reloadWidgetsAndClearNowPlaying() {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }
}
