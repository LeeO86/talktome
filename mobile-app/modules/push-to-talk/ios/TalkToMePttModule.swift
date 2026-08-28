import ExpoModulesCore

public final class TalkToMePttModule: Module {
  private let controller = TalkToMePttController()
  private var terminateObserver: UnsafeRawPointer?

  public func definition() -> ModuleDefinition {
    Name("TalkToMePtt")

    Events(
      "onDiagnostic",
      "onPushToken",
      "onBeginTransmitting",
      "onEndTransmitting",
      "onAudioActivated",
      "onAudioDeactivated",
      "onServiceUpdate",
      "onJoined",
      "onLeft",
      "onJoinFailed",
      "onIncomingPush"
    )

    OnCreate {
      self.observeSessionWillTerminate()
      self.controller.onDiagnostic = { [weak self] message in
        self?.sendEvent("onDiagnostic", ["message": message])
      }
      self.controller.onPushToken = { [weak self] token, channelUUID, channelName in
        self?.sendEvent("onPushToken", [
          "token": token,
          "channelUUID": channelUUID,
          "channelName": channelName,
        ])
      }
      self.controller.onBeginTransmitting = { [weak self] in
        self?.sendEvent("onBeginTransmitting", [:])
      }
      self.controller.onEndTransmitting = { [weak self] in
        self?.sendEvent("onEndTransmitting", [:])
      }
      self.controller.onAudioActivated = { [weak self] in
        self?.sendEvent("onAudioActivated", [:])
      }
      self.controller.onAudioDeactivated = { [weak self] in
        self?.sendEvent("onAudioDeactivated", [:])
      }
      self.controller.onServiceUpdate = { [weak self] reason in
        self?.sendEvent("onServiceUpdate", reason.map { ["reason": $0] } ?? [:])
      }
      self.controller.onJoined = { [weak self] in
        self?.sendEvent("onJoined", [:])
      }
      self.controller.onLeft = { [weak self] in
        self?.sendEvent("onLeft", [:])
      }
      self.controller.onJoinFailed = { [weak self] message in
        self?.sendEvent("onJoinFailed", ["message": message])
      }
      self.controller.onIncomingPush = { [weak self] type, name, reason in
        var body: [String: Any] = ["type": type]
        if let name { body["participantName"] = name }
        if let reason { body["reason"] = reason }
        self?.sendEvent("onIncomingPush", body)
      }
      self.controller.prepareAtLaunch()
    }

    OnDestroy {
      self.removeSessionWillTerminateObserver()
    }

    Function("isAvailable") {
      self.controller.isAvailable()
    }

    Function("lastDiagnostic") {
      self.controller.lastDiagnostic()
    }

    AsyncFunction("updateChannel") { (channelUUID: String?, channelName: String?) in
      self.controller.updateChannel(channelUUID: channelUUID, channelName: channelName)
      return true
    }

    AsyncFunction("updateActiveRemoteParticipant") { (name: String?) in
      self.controller.updateActiveRemoteParticipant(name: name)
      return true
    }

    AsyncFunction("leave") {
      self.controller.leave()
      return true
    }
  }

  private func observeSessionWillTerminate() {
    let observer = UnsafeRawPointer(Unmanaged.passUnretained(self).toOpaque())
    terminateObserver = observer
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      { _, observer, _, _, _ in
        TalkToMePttModule.leaveFromObserver(observer)
      },
      TalkToMePttModule.sessionWillTerminateNotification,
      nil,
      .deliverImmediately
    )
  }

  private func removeSessionWillTerminateObserver() {
    guard let terminateObserver else {
      return
    }
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      terminateObserver,
      nil,
      nil
    )
    self.terminateObserver = nil
  }

  private static func leaveFromObserver(_ observer: UnsafeRawPointer?) {
    guard let observer else {
      return
    }
    let module = Unmanaged<TalkToMePttModule>.fromOpaque(observer).takeUnretainedValue()
    module.controller.leave()
  }

  /// Must match `TalkToMePresenceStore.sessionWillTerminateNotification`.
  private static let sessionWillTerminateNotification =
    "io.github.leeo86.talktome.session-will-terminate" as CFString
}
