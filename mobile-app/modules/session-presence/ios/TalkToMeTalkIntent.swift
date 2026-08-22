import AppIntents
import Foundation

@available(iOS 16.0, *)
struct TalkIntent: AppIntent {
  static var title: LocalizedStringResource = "Talk"
  static var description = IntentDescription(
    "Lock or unlock talk to Reply, or to the selected destination in Talk & select."
  )
  static var openAppWhenRun = false

  func perform() async throws -> some IntentResult {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(TalkToMePresenceStore.talkNotification),
      nil,
      nil,
      true
    )
    return .result()
  }
}

@available(iOS 16.0, *)
struct TalkToMeShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TalkIntent(),
      phrases: [
        "Talk with \(.applicationName)",
        "Toggle talk in \(.applicationName)",
      ],
      shortTitle: "Talk",
      systemImageName: "mic.fill"
    )
  }
}
