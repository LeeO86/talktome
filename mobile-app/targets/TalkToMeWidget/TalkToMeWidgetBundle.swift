import SwiftUI
import WidgetKit

@main
struct TalkToMeWidgetBundle: WidgetBundle {
  var body: some Widget {
    TalkToMeHomeWidget()
    TalkToMeLiveActivity()
    if #available(iOS 18.0, *) {
      TalkToMeReplyControl()
      TalkToMeDisconnectControl()
    }
  }
}
