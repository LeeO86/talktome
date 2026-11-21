import Foundation
import WatchConnectivity

final class TalkToMeWatchRemoteController: NSObject, WCSessionDelegate {
  var onCommand: (([String: Any]) -> Void)?

  private var pendingSnapshot: [String: Any]?

  func start() {
    guard WCSession.isSupported() else {
      return
    }
    let session = WCSession.default
    if session.delegate == nil {
      session.delegate = self
    }
    if session.activationState == .notActivated {
      session.activate()
    }
  }

  func status() -> [String: Any] {
    guard WCSession.isSupported() else {
      return [
        "supported": false,
        "paired": false,
        "appInstalled": false,
        "reachable": false,
      ]
    }
    let session = WCSession.default
    return [
      "supported": true,
      "paired": session.isPaired,
      "appInstalled": session.isWatchAppInstalled,
      "reachable": session.isReachable,
      "activated": session.activationState == .activated,
    ]
  }

  func update(snapshot: [String: Any]) {
    pendingSnapshot = snapshot
    pushPending()
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if activationState == .activated {
      pushPending()
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    WCSession.default.activate()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    pushPending()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    emit(message)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    replyHandler(["ok": true])
    emit(message)
  }

  private func emit(_ message: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      self?.onCommand?(message)
    }
  }

  private func pushPending() {
    guard
      let snapshot = pendingSnapshot,
      WCSession.isSupported(),
      WCSession.default.activationState == .activated
    else {
      return
    }
    do {
      try WCSession.default.updateApplicationContext(snapshot)
    } catch {
      // Counterpart may be unpaired; the next successful activate retries.
    }
    if WCSession.default.isReachable {
      WCSession.default.sendMessage(snapshot, replyHandler: nil, errorHandler: nil)
    }
  }

  func sendAck(_ payload: [String: Any]) {
    guard WCSession.isSupported(), WCSession.default.isReachable else {
      return
    }
    var message = payload
    message["type"] = payload["type"] as? String ?? "talk-confirmed"
    WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
  }
}
