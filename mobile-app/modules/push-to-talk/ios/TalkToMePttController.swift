import Foundation
import UIKit

#if canImport(PushToTalk)
import AVFAudio
import PushToTalk
#endif

/// Ported from talktome-apple ApplePushToTalkController @ 004d6e76 by Daniel Jocher.
/// Fixes: service-update must not leave the channel; join uses fullDuplex (unproven, D3).
final class TalkToMePttController: NSObject {
  var onDiagnostic: ((String) -> Void)?
  var onPushToken: ((String, String, String) -> Void)?
  var onBeginTransmitting: (() -> Void)?
  var onEndTransmitting: (() -> Void)?
  var onAudioActivated: (() -> Void)?
  var onAudioDeactivated: (() -> Void)?
  var onServiceUpdate: ((String?) -> Void)?
  var onJoined: (() -> Void)?
  var onLeft: (() -> Void)?
  var onIncomingPush: ((String, String?, String?) -> Void)?

  private var desiredChannelUUID: String?
  private var desiredChannelName: String?
  private var lastParticipantName: String?
  private let defaults = UserDefaults.standard
  private let persistedChannelKey = "io.github.leeo86.talktome-mobile.system-ptt-channel"
  private var appDidBecomeActiveObserver: NSObjectProtocol?
  private var lastDiagnosticMessage: String?

  private func emitDiagnostic(_ message: String) {
    lastDiagnosticMessage = message
    onDiagnostic?(message)
  }

  func lastDiagnostic() -> String {
    lastDiagnosticMessage ?? ""
  }

#if canImport(PushToTalk)
  private var channelManager: PTChannelManager?
  private var instantiationInFlight = false
  private var unrecoverableInstantiationError = false
#endif

  override init() {
    super.init()
    appDidBecomeActiveObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.reconcile()
    }
  }

  deinit {
    if let appDidBecomeActiveObserver {
      NotificationCenter.default.removeObserver(appDidBecomeActiveObserver)
    }
  }

  func isAvailable() -> Bool {
#if canImport(PushToTalk)
    if #available(iOS 16.0, *) {
      return true
    }
#endif
    return false
  }

  func updateChannel(channelUUID: String?, channelName: String?) {
    onMain {
      self.desiredChannelUUID = channelUUID
      self.desiredChannelName = channelName
      self.persist()
#if canImport(PushToTalk)
      if #available(iOS 16.0, *), channelUUID != nil {
        self.instantiateIfNeeded()
      }
#endif
      self.reconcile()
    }
  }

  func updateActiveRemoteParticipant(name: String?) {
    onMain {
      self.lastParticipantName = name
#if canImport(PushToTalk)
      if #available(iOS 16.0, *) {
        self.applyRemoteParticipant()
      }
#endif
    }
  }

  func leave() {
    onMain {
      self.desiredChannelUUID = nil
      self.desiredChannelName = nil
      self.persist()
#if canImport(PushToTalk)
      if #available(iOS 16.0, *), let uuid = self.channelManager?.activeChannelUUID {
        self.channelManager?.leaveChannel(channelUUID: uuid)
      }
#endif
    }
  }

  func prepareAtLaunch() {
#if canImport(PushToTalk)
    onMain {
      if #available(iOS 16.0, *) {
        self.instantiateIfNeeded()
      }
    }
#endif
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

#if canImport(PushToTalk)
  @available(iOS 16.0, *)
  private func instantiateIfNeeded() {
    if unrecoverableInstantiationError {
      emitDiagnostic(
        lastDiagnosticMessage
          ?? "System PTT manager previously failed. Rebuild on a physical iPhone."
      )
      return
    }
    if channelManager != nil {
      return
    }
    if instantiationInFlight {
      emitDiagnostic("System PTT manager is still starting…")
      return
    }
    instantiationInFlight = true
    emitDiagnostic("System PTT manager starting…")
    PTChannelManager.channelManager(delegate: self, restorationDelegate: self) { [weak self] manager, error in
      guard let self else {
        return
      }
      self.onMain {
        self.instantiationInFlight = false
        if let error {
          self.unrecoverableInstantiationError = Self.isUnrecoverableInstantiationError(error)
          self.emitDiagnostic(Self.describeChannelManagerError(error))
          return
        }
        self.channelManager = manager
        self.reconcile()
      }
    }
  }

  @available(iOS 16.0, *)
  private static func isUnrecoverableInstantiationError(_ error: Error) -> Bool {
    let nsError = error as NSError
    guard nsError.domain == PTInstantiationErrorDomain else {
      return false
    }
    switch nsError.code {
    case PTInstantiationError.invalidPlatform.rawValue,
         PTInstantiationError.missingBackgroundMode.rawValue,
         PTInstantiationError.missingPushServerEnvironment.rawValue,
         PTInstantiationError.missingEntitlement.rawValue:
      return true
    default:
      return false
    }
  }

  @available(iOS 16.0, *)
  private static func describeChannelManagerError(_ error: Error) -> String {
    let nsError = error as NSError
    if nsError.domain == PTInstantiationErrorDomain {
      switch nsError.code {
      case PTInstantiationError.invalidPlatform.rawValue:
        return "System PTT is not available on the Simulator. Install TalkToMe on a physical iPhone."
      case PTInstantiationError.missingBackgroundMode.rawValue:
        return "System PTT manager failed: Info.plist is missing UIBackgroundModes push-to-talk. Rebuild with EXPO_PUBLIC_ENABLE_IOS_PTT=1."
      case PTInstantiationError.missingPushServerEnvironment.rawValue:
        return "System PTT manager failed: missing Push Notifications (aps-environment). Enable it on the App ID and rebuild."
      case PTInstantiationError.missingEntitlement.rawValue:
        return "System PTT manager failed: missing com.apple.developer.push-to-talk. Enable Push to Talk on the App ID and rebuild."
      case PTInstantiationError.instantiationAlreadyInProgress.rawValue:
        return "System PTT manager is still starting…"
      default:
        break
      }
    }
    return "System PTT manager failed (\(nsError.domain) \(nsError.code)): \(error.localizedDescription)"
  }

  private func reconcile() {
    guard #available(iOS 16.0, *) else {
      return
    }
    guard let channelManager else {
      if instantiationInFlight {
        emitDiagnostic("System PTT manager is still starting…")
      } else if unrecoverableInstantiationError {
        emitDiagnostic(
          lastDiagnosticMessage
            ?? "System PTT manager previously failed. Rebuild on a physical iPhone."
        )
      }
      return
    }
    guard let desiredChannelUUID, let desiredChannelName else {
      if let active = channelManager.activeChannelUUID {
        channelManager.leaveChannel(channelUUID: active)
      }
      return
    }
    guard let desiredUUID = UUID(uuidString: desiredChannelUUID) else {
      emitDiagnostic("System PTT channel UUID is invalid.")
      return
    }
    if channelManager.activeChannelUUID == desiredUUID {
      emitDiagnostic("System PTT already on this channel.")
      onJoined?()
      applyRemoteParticipant()
      return
    }
    let state = UIApplication.shared.applicationState
    if state != .active {
      emitDiagnostic(
        "System PTT join needs the app in the foreground (state \(state.rawValue)). Close Settings and tap Join again."
      )
    }
    emitDiagnostic("System PTT requesting join…")
    let descriptor = PTChannelDescriptor(name: desiredChannelName, image: nil)
    channelManager.requestJoinChannel(channelUUID: desiredUUID, descriptor: descriptor)
  }

  @available(iOS 16.0, *)
  private func applyRemoteParticipant() {
    guard let channelManager, let active = channelManager.activeChannelUUID else {
      return
    }
    let participant = lastParticipantName.map { PTParticipant(name: $0, image: nil) }
    Task {
      do {
        try await channelManager.setActiveRemoteParticipant(participant, channelUUID: active)
      } catch {
        self.onDiagnostic?("System PTT remote participant update failed: \(error.localizedDescription)")
      }
    }
  }
#else
  private func reconcile() {}
#endif

  private func persist() {
    guard let desiredChannelUUID, let desiredChannelName else {
      defaults.removeObject(forKey: persistedChannelKey)
      return
    }
    defaults.set(
      ["channelUUID": desiredChannelUUID, "channelName": desiredChannelName],
      forKey: persistedChannelKey
    )
  }

  private func loadPersistedChannel() -> (uuid: String, name: String)? {
    guard let stored = defaults.dictionary(forKey: persistedChannelKey),
          let uuid = stored["channelUUID"] as? String,
          let name = stored["channelName"] as? String else {
      return nil
    }
    return (uuid, name)
  }

  private func parsePushPayload(_ pushPayload: [String: Any]) -> (type: String, name: String?, reason: String?)? {
    let ttm = (pushPayload["ttm"] as? [String: Any]) ?? pushPayload
    guard let type = ttm["type"] as? String else {
      return nil
    }
    let participant = ttm["participant"] as? [String: Any]
    let name = (participant?["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    return (
      type,
      (name?.isEmpty == false) ? name : nil,
      ttm["reason"] as? String
    )
  }

  /// Keep in sync with apps/mobile/src/ptt/policy.ts incomingPushResultForPayload.
  private func pushResult(type: String, name: String?) -> (leave: Bool, participantName: String?) {
    switch type {
    case "leave-channel":
      return (true, nil)
    case "active-remote-participant":
      if let name {
        return (false, name)
      }
      return (true, nil)
    case "service-update":
      return (false, name ?? lastParticipantName ?? "TalkToMe")
    default:
      return (true, nil)
    }
  }
}

#if canImport(PushToTalk)
@available(iOS 16.0, *)
extension TalkToMePttController: PTChannelManagerDelegate {
  func channelManager(_ channelManager: PTChannelManager, didJoinChannel channelUUID: UUID, reason: PTChannelJoinReason) {
    emitDiagnostic("System PTT joined channel (\(reason.rawValue)).")
    // Prototype hard-coded halfDuplex. Operators need RX during TX/lock; D3 is unproven.
    channelManager.setTransmissionMode(.fullDuplex, channelUUID: channelUUID, completionHandler: nil)
    if #available(iOS 17.0, *) {
      channelManager.setAccessoryButtonEventsEnabled(true, channelUUID: channelUUID, completionHandler: nil)
    }
    onJoined?()
    applyRemoteParticipant()
  }

  func channelManager(_ channelManager: PTChannelManager, didLeaveChannel channelUUID: UUID, reason: PTChannelLeaveReason) {
    _ = channelUUID
    emitDiagnostic("System PTT left channel (\(reason.rawValue)).")
    onLeft?()
    onServiceUpdate?("channel-left")
  }

  func channelManager(_ channelManager: PTChannelManager, failedToJoinChannel channelUUID: UUID, error: Error) {
    _ = channelUUID
    let nsError = error as NSError
    emitDiagnostic(
      "System PTT failed to join (\(nsError.domain) \(nsError.code)): \(error.localizedDescription)"
    )
  }

  func channelManager(_ channelManager: PTChannelManager, failedToLeaveChannel channelUUID: UUID, error: Error) {
    _ = channelUUID
    let nsError = error as NSError
    emitDiagnostic(
      "System PTT failed to leave (\(nsError.domain) \(nsError.code)): \(error.localizedDescription)"
    )
  }

  func channelManager(
    _ channelManager: PTChannelManager,
    channelUUID: UUID,
    didBeginTransmittingFrom source: PTChannelTransmitRequestSource
  ) {
    _ = channelUUID
    _ = source
    onBeginTransmitting?()
  }

  func channelManager(
    _ channelManager: PTChannelManager,
    channelUUID: UUID,
    didEndTransmittingFrom source: PTChannelTransmitRequestSource
  ) {
    _ = channelUUID
    _ = source
    onEndTransmitting?()
  }

  func channelManager(_ channelManager: PTChannelManager, receivedEphemeralPushToken pushToken: Data) {
    let persisted = loadPersistedChannel()
    guard let uuid = desiredChannelUUID ?? persisted?.uuid,
          let name = desiredChannelName ?? persisted?.name else {
      onDiagnostic?("System PTT push token arrived without a persisted channel.")
      return
    }
    let hex = pushToken.map { String(format: "%02x", $0) }.joined()
    onPushToken?(hex, uuid, name)
  }

  func incomingPushResult(
    channelManager: PTChannelManager,
    channelUUID: UUID,
    pushPayload: [String: Any]
  ) -> PTPushResult {
    _ = channelUUID
    guard let parsed = parsePushPayload(pushPayload) else {
      onDiagnostic?("System PTT received an invalid push payload.")
      return .leaveChannel
    }
    onIncomingPush?(parsed.type, parsed.name, parsed.reason)
    let result = pushResult(type: parsed.type, name: parsed.name)
    if parsed.type == "service-update" {
      onServiceUpdate?(parsed.reason)
    }
    if result.leave {
      return .leaveChannel
    }
    if let participantName = result.participantName {
      lastParticipantName = participantName
      return .activeRemoteParticipant(PTParticipant(name: participantName, image: nil))
    }
    return .leaveChannel
  }

  func channelManager(_ channelManager: PTChannelManager, didActivate audioSession: AVAudioSession) {
    _ = audioSession
    onAudioActivated?()
  }

  func channelManager(_ channelManager: PTChannelManager, didDeactivate audioSession: AVAudioSession) {
    _ = audioSession
    onAudioDeactivated?()
  }

  func incomingServiceUpdatePush(
    channelManager: PTChannelManager,
    channelUUID: UUID,
    pushPayload: [String: Any],
    isHighPriority: Bool,
    remainingHighPriorityBudget: Int,
    completion: @escaping () -> Void
  ) {
    _ = channelUUID
    _ = isHighPriority
    _ = remainingHighPriorityBudget
    let parsed = parsePushPayload(pushPayload)
    onIncomingPush?(parsed?.type ?? "service-update", parsed?.name, parsed?.reason)
    onServiceUpdate?(parsed?.reason)
    completion()
  }
}

@available(iOS 16.0, *)
extension TalkToMePttController: PTChannelRestorationDelegate {
  func channelDescriptor(restoredChannelUUID: UUID) -> PTChannelDescriptor {
    _ = restoredChannelUUID
    let name = loadPersistedChannel()?.name ?? "TalkToMe"
    return PTChannelDescriptor(name: name, image: nil)
  }
}
#endif
