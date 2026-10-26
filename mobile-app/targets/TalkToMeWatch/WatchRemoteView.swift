import SwiftUI

private let ttmBg = Color(red: 7 / 255, green: 11 / 255, blue: 20 / 255)
private let ttmText = Color(red: 244 / 255, green: 247 / 255, blue: 251 / 255)
private let ttmMuted = Color.white.opacity(0.62)
private let ttmAccent = Color(red: 61 / 255, green: 214 / 255, blue: 245 / 255)
/// Outgoing talk — same purple as iOS `colors.talking` / web `.talking-to`.
private let ttmTalking = Color(red: 122 / 255, green: 71 / 255, blue: 199 / 255)
/// Incoming talk — same green as iOS `colors.speaking` / web `.speaking`.
private let ttmSpeaking = Color(red: 117 / 255, green: 242 / 255, blue: 184 / 255)

struct WatchRemoteView: View {
  @EnvironmentObject private var remote: WatchRemoteSession

  var body: some View {
    ZStack {
      ttmBg.ignoresSafeArea()
      content
      if let holding = remote.holdingTarget {
        TalkingOverlay(target: holding)
          // The hold gesture lives on the list row. This overlay must not steal
          // the touch, or release would fire immediately. Scroll is locked instead.
          .allowsHitTesting(false)
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    if !remote.snapshot.connected {
      StatusScreen(
        title: "TalkToMe",
        detail: remote.status,
        hint: "Keep the iPhone session connected. The watch only remotes talk — audio stays on the phone."
      )
    } else if remote.snapshot.targets.isEmpty {
      StatusScreen(
        title: remote.status,
        detail: "No talk targets",
        hint: "Join a production with conferences or online users you can talk to."
      )
    } else {
      List {
        header
        if let reply = remote.snapshot.reply {
          Section("Reply") {
            HoldTalkRow(target: reply, asReply: true)
              .id("reply-\(reply.key)")
          }
        }
        Section {
          ForEach(remote.snapshot.targets) { target in
            HoldTalkRow(target: target, asReply: false)
          }
        }
      }
      .listStyle(.elliptical)
      .scrollDisabled(remote.holdingKey != nil)
      .scrollIndicators(remote.holdingKey == nil ? .automatic : .hidden)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 6) {
        Circle()
          .fill(remote.reachable ? ttmAccent : Color.orange)
          .frame(width: 7, height: 7)
        Text(remote.reachable ? "Live" : "iPhone away")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(remote.reachable ? ttmAccent : Color.orange)
      }
      Text(remote.status)
        .font(.caption)
        .foregroundStyle(ttmMuted)
        .lineLimit(2)
    }
    .listRowBackground(Color.clear)
  }
}

private struct HoldTalkRow: View {
  @EnvironmentObject private var remote: WatchRemoteSession
  let target: WatchRemoteTarget
  var asReply = false

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(asReply ? "Reply" : target.kindLabel)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(target.highlighted ? ttmSpeaking : ttmMuted)
      Text(target.label)
        .font(.headline)
        .foregroundStyle(ttmText)
        .lineLimit(2)
      Text("Hold to talk")
        .font(.caption2)
        .foregroundStyle(ttmMuted)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 8)
    .listRowBackground(rowBackground)
    .contentShape(Rectangle())
    // maximumDistance .infinity keeps the press alive while the finger drifts;
    // talk only stops when the finger lifts. Scroll is disabled while holding.
    .onLongPressGesture(minimumDuration: 0.01, maximumDistance: .infinity, pressing: { pressing in
      if pressing {
        remote.beginTalk(target)
      } else {
        remote.endTalk(target)
      }
    }, perform: {})
  }

  private var rowBackground: Color {
    if remote.holdingKey == target.key || remote.snapshot.talkingTargetKey == target.key {
      return ttmTalking.opacity(0.88)
    }
    if target.highlighted {
      return ttmSpeaking.opacity(0.22)
    }
    return Color.white.opacity(0.08)
  }
}

private struct TalkingOverlay: View {
  let target: WatchRemoteTarget

  var body: some View {
    ZStack {
      ttmTalking.ignoresSafeArea()
      VStack(spacing: 8) {
        Text("TALKING")
          .font(.caption.weight(.bold))
          .tracking(1.4)
        Text(target.label)
          .font(.title3.weight(.bold))
          .multilineTextAlignment(.center)
        Text("Release to stop")
          .font(.caption)
          .opacity(0.86)
      }
      .foregroundStyle(.white)
      .padding()
    }
  }
}

private struct StatusScreen: View {
  let title: String
  let detail: String
  let hint: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.headline)
        .foregroundStyle(ttmText)
      Text(detail)
        .font(.caption)
        .foregroundStyle(ttmAccent)
      Text(hint)
        .font(.caption2)
        .foregroundStyle(ttmMuted)
    }
    .padding(.horizontal, 8)
  }
}
