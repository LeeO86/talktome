import AVFAudio
import Foundation
import UIKit

#if canImport(WebRTC)
import WebRTC
#endif

/// Ported from talktome-apple AudioController @ 004d6e76 by Daniel Jocher.
final class TalkToMeAudioSessionController {
  private let notificationCenter: NotificationCenter
  private var observers: [NSObjectProtocol] = []
  private var activeProfile = "idle"
  private var wantsBackgroundReceiveKeepalive = false
  private var backgroundTask = UIBackgroundTaskIdentifier.invalid

  init(notificationCenter: NotificationCenter = .default) {
    self.notificationCenter = notificationCenter
    claimManualAudio()
    installObservers()
  }

  deinit {
    for observer in observers {
      notificationCenter.removeObserver(observer)
    }
  }

  func profile() -> String {
    activeProfile
  }

  func activateForMonitoring() throws {
    try activate(profile: "monitoring")
  }

  func activateForIntercom() throws {
    try activate(profile: "intercom")
  }

  func reactivateForOutgoingTalkCapture() throws {
    setWebRTCAudioEnabled(false)
    try configureIntercom(AVAudioSession.sharedInstance())
    try AVAudioSession.sharedInstance().setActive(true)
    try routeToSpeakerIfNeeded(AVAudioSession.sharedInstance())
    notifyWebRTCActivated()
    activeProfile = "intercom"
    Thread.sleep(forTimeInterval: 0.02)
    setWebRTCAudioEnabled(true)
  }

  func startBackgroundKeepalive() throws {
    beginBackgroundTask()
    do {
      try configureIntercom(AVAudioSession.sharedInstance())
      try AVAudioSession.sharedInstance().setActive(true)
      try routeToSpeakerIfNeeded(AVAudioSession.sharedInstance())
      notifyWebRTCActivated()
      setWebRTCAudioEnabled(true)
      wantsBackgroundReceiveKeepalive = true
      activeProfile = "keepalive"
    } catch {
      endBackgroundTask()
      throw error
    }
  }

  func stopBackgroundKeepalive() {
    wantsBackgroundReceiveKeepalive = false
    endBackgroundTask()
    if activeProfile == "keepalive" {
      activeProfile = "monitoring"
    }
  }

  func prepareForSystemManagedIntercom() throws {
    let session = AVAudioSession.sharedInstance()
    try configureIntercom(session)
    try routeToSpeakerIfNeeded(session)
    setWebRTCAudioEnabled(true)
    activeProfile = "intercom"
  }

  func deactivate() {
    wantsBackgroundReceiveKeepalive = false
    endBackgroundTask()
    setWebRTCAudioEnabled(false)
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    notifyWebRTCDeactivated()
    activeProfile = "idle"
  }

  func setWebRTCAudioEnabled(_ enabled: Bool) {
    #if canImport(WebRTC)
    let rtcSession = RTCAudioSession.sharedInstance()
    rtcSession.lockForConfiguration()
    rtcSession.useManualAudio = true
    rtcSession.isAudioEnabled = enabled
    rtcSession.unlockForConfiguration()
    #endif
  }

  private func claimManualAudio() {
    applyWebRTCSessionDefaults()
    setWebRTCAudioEnabled(false)
  }

  private func applyWebRTCSessionDefaults() {
    #if canImport(WebRTC)
    let config = RTCAudioSessionConfiguration.webRTC()
    config.category = AVAudioSession.Category.playAndRecord.rawValue
    config.categoryOptions = [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
    #if targetEnvironment(simulator)
    config.mode = AVAudioSession.Mode.default.rawValue
    config.sampleRate = 44_100
    config.ioBufferDuration = 0.02
    #else
    config.mode = AVAudioSession.Mode.voiceChat.rawValue
    config.sampleRate = 48_000
    config.ioBufferDuration = 0.01
    #endif
    RTCAudioSessionConfiguration.setWebRTC(config)
    #endif
  }

  private func activate(profile: String) throws {
    let session = AVAudioSession.sharedInstance()
    try configureIntercom(session)
    try session.setActive(true)
    try routeToSpeakerIfNeeded(session)
    #if targetEnvironment(simulator)
    Thread.sleep(forTimeInterval: 0.15)
    #endif
    notifyWebRTCActivated()
    setWebRTCAudioEnabled(true)
    activeProfile = profile
  }

  private func configureIntercom(_ session: AVAudioSession) throws {
    applyWebRTCSessionDefaults()
    #if targetEnvironment(simulator)
    // Voice Processing I/O (echo cancellation) deadlocks the iOS Simulator HAL
    // and abort()s the process. Use a plain duplex session instead.
    try session.setCategory(
      .playAndRecord,
      mode: .default,
      options: [.defaultToSpeaker]
    )
    try session.setPreferredSampleRate(44_100)
    try session.setPreferredIOBufferDuration(0.02)
    #else
    try session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [
        .allowBluetoothHFP,
        .allowBluetoothA2DP,
        .defaultToSpeaker,
      ]
    )
    try session.setPreferredSampleRate(48_000)
    try session.setPreferredIOBufferDuration(0.01)
    #endif
  }

  private func routeToSpeakerIfNeeded(_ session: AVAudioSession) throws {
    let outputs = session.currentRoute.outputs.map(\.portType)
    let hasExternalOutput = outputs.contains { portType in
      switch portType {
      case .headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .airPlay, .carAudio, .HDMI, .lineOut, .usbAudio:
        return true
      default:
        return false
      }
    }
    if hasExternalOutput {
      if outputs.contains(.builtInSpeaker) {
        try session.overrideOutputAudioPort(.none)
      }
    } else if !outputs.contains(.builtInSpeaker) {
      try session.overrideOutputAudioPort(.speaker)
    }
  }

  private func notifyWebRTCActivated() {
    #if canImport(WebRTC)
    RTCAudioSession.sharedInstance().audioSessionDidActivate(AVAudioSession.sharedInstance())
    #endif
  }

  private func notifyWebRTCDeactivated() {
    #if canImport(WebRTC)
    RTCAudioSession.sharedInstance().audioSessionDidDeactivate(AVAudioSession.sharedInstance())
    #endif
  }

  private func installObservers() {
    let names: [NSNotification.Name] = [
      AVAudioSession.routeChangeNotification,
      AVAudioSession.mediaServicesWereResetNotification,
      AVAudioSession.interruptionNotification,
    ]
    observers = names.map { name in
      notificationCenter.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
        self?.handle(notification)
      }
    }
  }

  private func handle(_ notification: Notification) {
    let session = AVAudioSession.sharedInstance()
    guard session.category == .playAndRecord else {
      return
    }

    switch notification.name {
    case AVAudioSession.routeChangeNotification:
      if let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
         let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason),
         reason == .override {
        return
      }
      try? routeToSpeakerIfNeeded(session)
    case AVAudioSession.mediaServicesWereResetNotification, AVAudioSession.interruptionNotification:
      if notification.name == AVAudioSession.interruptionNotification {
        guard
          let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: rawType),
          type == .ended
        else {
          return
        }
      }
      if wantsBackgroundReceiveKeepalive {
        beginBackgroundTask()
      }
      try? configureIntercom(session)
      try? session.setActive(true)
      try? routeToSpeakerIfNeeded(session)
      notifyWebRTCActivated()
      setWebRTCAudioEnabled(true)
    default:
      break
    }
  }

  private func beginBackgroundTask() {
    guard backgroundTask == .invalid else {
      return
    }
    backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "TalkToMeBackgroundReceive") { [weak self] in
      self?.endBackgroundTask()
    }
  }

  private func endBackgroundTask() {
    guard backgroundTask != .invalid else {
      return
    }
    let task = backgroundTask
    backgroundTask = .invalid
    UIApplication.shared.endBackgroundTask(task)
  }
}
