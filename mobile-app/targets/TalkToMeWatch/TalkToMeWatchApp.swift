import SwiftUI

@main
struct TalkToMeWatchApp: App {
  @StateObject private var remote = WatchRemoteSession()

  var body: some Scene {
    WindowGroup {
      WatchRemoteView()
        .environmentObject(remote)
    }
  }
}
