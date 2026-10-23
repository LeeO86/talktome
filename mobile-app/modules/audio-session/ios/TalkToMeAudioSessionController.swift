import AVFAudio
import Foundation
import MediaPlayer
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
  private var preferredRouteId = "speaker"
  private var cuePlayer: AVAudioPlayer?
  var onRouteChange: (() -> Void)?

  init(notificationCenter: NotificationCenter = .default) {
    self.notificationCenter = notificationCenter
    claimManualAudio()
    installObservers()
    clearNowPlaying()
  }

  deinit {
    for observer in observers {
      notificationCenter.removeObserver(observer)
    }
  }

  func profile() -> String {
    activeProfile
  }

  /// Plays a bundled TalkToMe 1.5.6 cue on the current session. Idle sessions stay silent
  /// so a tone never activates the microphone by itself.
  func playConnectionCue(_ name: String) -> Bool {
    guard activeProfile != "idle", name == "disconnected" || name == "reconnected" else {
      return false
    }
    guard let url = cueURL(name) else {
      return false
    }
    do {
      cuePlayer?.stop()
      let player = try AVAudioPlayer(contentsOf: url)
      player.prepareToPlay()
      cuePlayer = player
      return player.play()
    } catch {
      return false
    }
  }

  private func cueURL(_ name: String) -> URL? {
    let candidates = [Bundle.main, Bundle(for: TalkToMeAudioSessionModule.self)]
    for bundle in candidates {
      if let url = bundle.url(forResource: name, withExtension: "mp3") {
        return url
      }
      if let nested = bundle.url(forResource: "TalkToMeAudioSession", withExtension: "bundle"),
         let resourceBundle = Bundle(url: nested),
         let url = resourceBundle.url(forResource: name, withExtension: "mp3") {
        return url
      }
    }
    return nil
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
    try applyPreferredRoute(AVAudioSession.sharedInstance())
    notifyWebRTCActivated()
    activeProfile = "intercom"
    Thread.sleep(forTimeInterval: 0.02)
    setWebRTCAudioEnabled(true)
    clearNowPlaying()
  }

  func startBackgroundKeepalive() throws {
    beginBackgroundTask()
    do {
      try configureIntercom(AVAudioSession.sharedInstance())
      try AVAudioSession.sharedInstance().setActive(true)
      try applyPreferredRoute(AVAudioSession.sharedInstance())
      notifyWebRTCActivated()
      setWebRTCAudioEnabled(true)
      wantsBackgroundReceiveKeepalive = true
      activeProfile = "keepalive"
      clearNowPlaying()
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

  func deactivate() {
    wantsBackgroundReceiveKeepalive = false
    endBackgroundTask()
    setWebRTCAudioEnabled(false)
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    notifyWebRTCDeactivated()
    activeProfile = "idle"
    clearNowPlaying()
  }

  func setPreferredRouteId(_ id: String) {
    preferredRouteId = id.isEmpty ? "speaker" : id
  }

  func selectRoute(_ id: String) throws {
    setPreferredRouteId(id)
    let session = AVAudioSession.sharedInstance()
    try applyPreferredRoute(session)
    onRouteChange?()
  }

  func routeSnapshot() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    let input = session.currentRoute.inputs.first
    let output = session.currentRoute.outputs.first
    let currentId = resolvedRouteId(session)
    return [
      "routes": listedRoutes(session, currentId: currentId),
      "currentId": currentId,
      "inputLabel": input?.portName ?? "Unknown",
      "outputLabel": output?.portName ?? "Unknown",
      "voiceProcessing": session.mode == .voiceChat,
    ]
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
    try applyPreferredRoute(session)
    #if targetEnvironment(simulator)
    Thread.sleep(forTimeInterval: 0.15)
    #endif
    notifyWebRTCActivated()
    setWebRTCAudioEnabled(true)
    activeProfile = profile
    clearNowPlaying()
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

  private func applyPreferredRoute(_ session: AVAudioSession) throws {
    if preferredRouteId == "receiver" {
      try session.overrideOutputAudioPort(.none)
      return
    }
    if preferredRouteId.hasPrefix("port:") {
      let uid = String(preferredRouteId.dropFirst(5))
      if let port = session.availableInputs?.first(where: { $0.uid == uid }) {
        try session.setPreferredInput(port)
        try session.overrideOutputAudioPort(.none)
        return
      }
      preferredRouteId = "speaker"
    }
    try session.overrideOutputAudioPort(.speaker)
  }

  private func listedRoutes(_ session: AVAudioSession, currentId: String) -> [[String: Any]] {
    var routes: [[String: Any]] = [
      routeEntry(id: "speaker", label: "Speaker", kind: "speaker", selected: currentId == "speaker"),
      routeEntry(id: "receiver", label: "iPhone", kind: "receiver", selected: currentId == "receiver"),
    ]
    for input in session.availableInputs ?? [] {
      guard let kind = routeKind(for: input.portType), kind != "other" else {
        continue
      }
      if input.portType == .builtInMic {
        continue
      }
      let id = "port:\(input.uid)"
      routes.append(routeEntry(id: id, label: input.portName, kind: kind, selected: currentId == id))
    }
    return routes
  }

  private func resolvedRouteId(_ session: AVAudioSession) -> String {
    let outputs = session.currentRoute.outputs
    if outputs.contains(where: { $0.portType == .builtInSpeaker }) {
      return "speaker"
    }
    if let bluetooth = outputs.first(where: {
      $0.portType == .bluetoothHFP || $0.portType == .bluetoothA2DP || $0.portType == .bluetoothLE
    }) {
      if let input = session.availableInputs?.first(where: { $0.portName == bluetooth.portName }) {
        return "port:\(input.uid)"
      }
    }
    if let wired = session.currentRoute.inputs.first(where: {
      $0.portType == .headsetMic || $0.portType == .usbAudio
    }) {
      return "port:\(wired.uid)"
    }
    if preferredRouteId.hasPrefix("port:"),
       session.availableInputs?.contains(where: { "port:\($0.uid)" == preferredRouteId }) == true {
      return preferredRouteId
    }
    return preferredRouteId == "receiver" ? "receiver" : "speaker"
  }

  private func routeKind(for portType: AVAudioSession.Port) -> String? {
    switch portType {
    case .builtInSpeaker:
      return "speaker"
    case .builtInReceiver, .builtInMic:
      return "receiver"
    case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE:
      return "bluetooth"
    case .headphones, .headsetMic:
      return "wired"
    case .usbAudio:
      return "usb"
    default:
      return "other"
    }
  }

  private func routeEntry(id: String, label: String, kind: String, selected: Bool) -> [String: Any] {
    ["id": id, "label": label, "kind": kind, "selected": selected]
  }

  /// Kept as a no-op publisher: TalkToMe is not a media player. Setting
  /// `nowPlayingInfo` (and enabling `MPRemoteCommandCenter`) puts a useless
  /// Now Playing card on Lock Screen / Control Center. Speaker selection uses
  /// `AVRoutePickerView` + `AVAudioSession` and does not need that card.
  /// Callers still invoke this so a previous build's Now Playing is cleared.
  func updateNowPlaying(title _: String, detail _: String, active _: Bool) {
    clearNowPlaying()
  }

  private func clearNowPlaying() {
    let commands = MPRemoteCommandCenter.shared()
    commands.playCommand.isEnabled = false
    commands.pauseCommand.isEnabled = false
    commands.stopCommand.isEnabled = false
    commands.nextTrackCommand.isEnabled = false
    commands.previousTrackCommand.isEnabled = false
    commands.togglePlayPauseCommand.isEnabled = false
    commands.playCommand.removeTarget(nil)
    commands.pauseCommand.removeTarget(nil)
    commands.stopCommand.removeTarget(nil)
    commands.togglePlayPauseCommand.removeTarget(nil)
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    if #available(iOS 13.0, *) {
      MPNowPlayingInfoCenter.default().playbackState = .stopped
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
         let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason) {
        let resolved = resolvedRouteId(session)
        let preferredStillAvailable =
          !preferredRouteId.hasPrefix("port:") ||
          session.availableInputs?.contains(where: { "port:\($0.uid)" == preferredRouteId }) == true
        switch reason {
        case .newDeviceAvailable:
          // Plug in EarPods / BT: follow the new device.
          preferredRouteId = resolved
        case .oldDeviceUnavailable:
          if !preferredStillAvailable {
            preferredRouteId = "speaker"
          }
        case .override:
          // Control Center / AVRoutePickerView is an explicit user choice.
          preferredRouteId = resolved
        default:
          // Do not adopt a transient headphones-only route after the user picked Speaker.
          break
        }
        try? applyPreferredRoute(session)
        onRouteChange?()
        return
      }
      try? applyPreferredRoute(session)
      onRouteChange?()
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
      try? applyPreferredRoute(session)
      notifyWebRTCActivated()
      setWebRTCAudioEnabled(true)
      onRouteChange?()
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
