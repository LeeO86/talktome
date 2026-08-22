import AppIntents
import ExpoModulesCore
import Foundation
import WidgetKit

public final class TalkToMePresenceModule: Module {
  private var observer: UnsafeRawPointer?

  public func definition() -> ModuleDefinition {
    Name("TalkToMePresence")

    Events("onTalkShortcut")

    OnCreate {
      self.observeTalkShortcut()
    }

    OnDestroy {
      self.removeTalkObserver()
    }

    Function("isAvailable") {
      true
    }

    AsyncFunction("update") { (snapshot: [String: Any]) in
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

  private func observeTalkShortcut() {
    let observer = UnsafeRawPointer(Unmanaged.passUnretained(self).toOpaque())
    self.observer = observer
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      { _, observer, _, _, _ in
        guard let observer else {
          return
        }
        let module = Unmanaged<TalkToMePresenceModule>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
          module.sendEvent("onTalkShortcut", [:])
        }
      },
      TalkToMePresenceStore.talkNotification,
      nil,
      .deliverImmediately
    )
  }

  private func removeTalkObserver() {
    guard let observer else {
      return
    }
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      CFNotificationName(TalkToMePresenceStore.talkNotification),
      nil
    )
    self.observer = nil
  }
}
