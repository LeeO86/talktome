import AppIntents
import ExpoModulesCore
import Foundation
import UIKit
import WidgetKit

public final class TalkToMePresenceModule: Module {
  private var observer: UnsafeRawPointer?
  private var terminateObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("TalkToMePresence")

    Events("onTalkShortcut", "onDisconnectShortcut", "onAppTerminating")

    OnCreate {
      self.observeShortcuts()
      self.observeWillTerminate()
      // Claim before clearing so a lock-screen widget probe during launch
      // cannot treat this new process as dead. Then drop leftovers from the
      // previous process; wait so ActivityKit actually dismisses the island
      // before JS publishes the restored session.
      TalkToMeProcessLiveness.claimForProcessLifetime()
      TalkToMeSessionShutdown.clearLockScreenSurfaces()
    }

    OnDestroy {
      self.removeShortcutObservers()
      self.removeTerminateObserver()
    }

    Function("isAvailable") {
      true
    }

    AsyncFunction("update") { (snapshot: [String: Any]) in
      TalkToMeProcessLiveness.claimForProcessLifetime()
      let state = TalkToMePresenceState(
        connected: snapshot["connected"] as? Bool ?? false,
        title: snapshot["title"] as? String ?? "talktome",
        detail: snapshot["detail"] as? String ?? "",
        audioActive: snapshot["audioActive"] as? Bool ?? false,
        talking: snapshot["talking"] as? Bool ?? false,
        listening: snapshot["listening"] as? Bool ?? false
      )
      TalkToMePresenceStore.write(state)
      if #available(iOS 16.2, *) {
        TalkToMeLiveActivityController().update(state: state)
      }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
      return true
    }
  }

  private func observeShortcuts() {
    let observer = UnsafeRawPointer(Unmanaged.passUnretained(self).toOpaque())
    self.observer = observer
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterAddObserver(
      center,
      observer,
      { _, observer, _, _, _ in
        TalkToMePresenceModule.emit(observer, event: "onTalkShortcut")
      },
      TalkToMePresenceStore.talkNotification,
      nil,
      .deliverImmediately
    )
    CFNotificationCenterAddObserver(
      center,
      observer,
      { _, observer, _, _, _ in
        TalkToMePresenceModule.emit(observer, event: "onDisconnectShortcut")
      },
      TalkToMePresenceStore.disconnectNotification,
      nil,
      .deliverImmediately
    )
  }

  private func removeShortcutObservers() {
    guard let observer else {
      return
    }
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      nil,
      nil
    )
    self.observer = nil
  }

  private func observeWillTerminate() {
    terminateObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willTerminateNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      TalkToMeSessionShutdown.runForImminentTermination()
      self?.sendEvent("onAppTerminating", [:])
    }
  }

  private func removeTerminateObserver() {
    if let terminateObserver {
      NotificationCenter.default.removeObserver(terminateObserver)
      self.terminateObserver = nil
    }
  }

  private static func emit(_ observer: UnsafeRawPointer?, event: String) {
    guard let observer else {
      return
    }
    let module = Unmanaged<TalkToMePresenceModule>.fromOpaque(observer).takeUnretainedValue()
    DispatchQueue.main.async {
      module.sendEvent(event, [:])
    }
  }
}
