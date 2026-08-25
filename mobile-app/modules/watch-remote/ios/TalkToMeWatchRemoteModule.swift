import ExpoModulesCore
import WatchConnectivity

public final class TalkToMeWatchRemoteModule: Module {
  private let controller = TalkToMeWatchRemoteController()

  public func definition() -> ModuleDefinition {
    Name("TalkToMeWatchRemote")

    Events("onTalkStart", "onTalkStop")

    OnCreate {
      self.controller.onCommand = { [weak self] message in
        self?.handle(message)
      }
      self.controller.start()
    }

    Function("isAvailable") {
      WCSession.isSupported()
    }

    Function("status") {
      self.controller.status()
    }

    AsyncFunction("update") { (snapshot: [String: Any]) in
      self.controller.update(snapshot: snapshot)
      return true
    }

    AsyncFunction("ackTalk") { (payload: [String: Any]) in
      self.controller.sendAck(payload)
      return true
    }
  }

  private func handle(_ message: [String: Any]) {
    let type = (message["type"] as? String) ?? ""
    let payload: [String: Any] = [
      "key": message["key"] as? String ?? "",
      "targetType": message["targetType"] as? String ?? "",
      "targetId": message["targetId"] as? String ?? "",
    ]
    if type == "talk-start" {
      sendEvent("onTalkStart", payload)
    } else if type == "talk-stop" {
      sendEvent("onTalkStop", payload)
    }
  }
}
