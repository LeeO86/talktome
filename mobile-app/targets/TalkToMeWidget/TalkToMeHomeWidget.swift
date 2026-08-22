import SwiftUI
import UIKit
import WidgetKit

struct TalkToMeHomeEntry: TimelineEntry {
  let date: Date
  let connected: Bool
  let title: String
  let detail: String
}

struct TalkToMeHomeProvider: TimelineProvider {
  func placeholder(in context: Context) -> TalkToMeHomeEntry {
    TalkToMeHomeEntry(date: Date(), connected: true, title: "Nobody Talking", detail: "Reply: none")
  }

  func getSnapshot(in context: Context, completion: @escaping (TalkToMeHomeEntry) -> Void) {
    completion(current())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TalkToMeHomeEntry>) -> Void) {
    completion(Timeline(entries: [current()], policy: .atEnd))
  }

  private func current() -> TalkToMeHomeEntry {
    let data = UserDefaults(suiteName: "group.io.github.leeo86.talktome-mobile")?.data(forKey: "talktome.presence.snapshot")
    if let data,
       let state = try? JSONDecoder().decode(TalkToMeHomeState.self, from: data) {
      return TalkToMeHomeEntry(
        date: Date(),
        connected: state.connected,
        title: state.title,
        detail: state.detail
      )
    }
    return TalkToMeHomeEntry(date: Date(), connected: false, title: "talktome", detail: "Not connected")
  }
}

struct TalkToMeHomeState: Codable {
  var connected: Bool
  var title: String
  var detail: String
  var audioActive: Bool
}

struct TalkToMeHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "TalkToMeHomeWidget", provider: TalkToMeHomeProvider()) { entry in
      if #available(iOS 17.0, *) {
        TalkToMeHomeView(entry: entry)
          .containerBackground(for: .widget) {
            Color(red: 0.07, green: 0.09, blue: 0.15)
          }
      } else {
        TalkToMeHomeView(entry: entry)
      }
    }
    .configurationDisplayName("TalkToMe")
    .description("Who is talking, and the current Reply or Talk target.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct TalkToMeHomeView: View {
  let entry: TalkToMeHomeEntry

  var body: some View {
    contents
      .padding()
      .background(Color(red: 0.07, green: 0.09, blue: 0.15))
  }

  private var contents: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        if let uiImage = UIImage(named: "TalkToMeMark") {
          Image(uiImage: uiImage)
            .resizable()
            .scaledToFit()
            .frame(width: 28, height: 28)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        }
        Text("talktome")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Spacer()
      }
      Text(entry.title)
        .font(.title3.weight(.bold))
        .foregroundStyle(.white)
        .minimumScaleFactor(0.7)
        .lineLimit(2)
      Text(entry.detail)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .lineLimit(2)
    }
  }
}
