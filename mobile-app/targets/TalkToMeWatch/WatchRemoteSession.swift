import Combine
import Foundation
import WatchConnectivity
import WatchKit

final class WatchRemoteSession: NSObject, ObservableObject {
  @Published var snapshot = WatchRemoteSnapshot.empty
  @Published var reachable = false
  @Published var holdingKey: String?
  @Published var status = "Open TalkToMe on iPhone"

  private var awaitingConfirmKey: String?

  var holdingTarget: WatchRemoteTarget? {
    guard let holdingKey else {
      return nil
    }
    return snapshot.targets.first(where: { $0.key == holdingKey })
  }

  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  func beginTalk(_ target: WatchRemoteTarget) {
    guard holdingKey != target.key else {
      return
    }
    holdingKey = target.key
    awaitingConfirmKey = target.key
    send(type: "talk-start", target: target, failClearsHold: true)
  }

  func endTalk(_ target: WatchRemoteTarget) {
    guard holdingKey == target.key else {
      return
    }
    holdingKey = nil
    awaitingConfirmKey = nil
    WKInterfaceDevice.current().play(.stop)
    send(type: "talk-stop", target: target, failClearsHold: false)
  }

  private func send(type: String, target: WatchRemoteTarget, failClearsHold: Bool) {
    let payload: [String: Any] = [
      "type": type,
      "key": target.key,
      "targetType": target.type,
      "targetId": target.targetId,
    ]
    guard WCSession.default.activationState == .activated, WCSession.default.isReachable else {
      fail("iPhone not reachable", clearHold: failClearsHold)
      return
    }
    WCSession.default.sendMessage(payload, replyHandler: { _ in }, errorHandler: { [weak self] _ in
      DispatchQueue.main.async {
        self?.fail("Could not reach iPhone", clearHold: failClearsHold)
      }
    })
  }

  private func fail(_ message: String, clearHold: Bool) {
    WKInterfaceDevice.current().play(.failure)
    status = message
    if clearHold {
      holdingKey = nil
      awaitingConfirmKey = nil
    }
  }

  private func apply(_ message: [String: Any]) {
    if (message["type"] as? String) == "talk-confirmed" {
      confirmTalk(message)
      return
    }
    if let type = message["type"] as? String, type.hasPrefix("talk-") {
      return
    }
    snapshot = WatchRemoteSnapshot(message: message)
    reachable = WCSession.default.isReachable
    if snapshot.connected {
      let place = snapshot.productionName.isEmpty ? "TalkToMe" : snapshot.productionName
      status = snapshot.username.isEmpty ? place : "\(snapshot.username) · \(place)"
    } else {
      status = "Sign in on iPhone"
    }
    if let key = awaitingConfirmKey, snapshot.talking, snapshot.talkingTargetKey == key {
      confirmTalk(["key": key, "talking": true])
    }
  }

  private func confirmTalk(_ message: [String: Any]) {
    let key = message["key"] as? String ?? holdingKey ?? ""
    let talking = boolValue(message["talking"])
    guard awaitingConfirmKey == key, holdingKey == key else {
      return
    }
    awaitingConfirmKey = nil
    if talking {
      WatchTalkBeep.playConfirmed()
      return
    }
    fail("Could not talk to this target", clearHold: true)
  }

  private func boolValue(_ value: Any?) -> Bool {
    if let flag = value as? Bool {
      return flag
    }
    return (value as? NSNumber)?.boolValue ?? false
  }
}

extension WatchRemoteSession: WCSessionDelegate {
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { [weak self] in
      self?.reachable = session.isReachable
      if !session.receivedApplicationContext.isEmpty {
        self?.apply(session.receivedApplicationContext)
      }
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      self?.apply(applicationContext)
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      self?.apply(message)
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in
      self?.reachable = session.isReachable
    }
  }
}
