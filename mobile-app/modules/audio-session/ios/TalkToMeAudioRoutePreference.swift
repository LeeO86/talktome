/// iOS owns routing unless a legacy/remote caller explicitly selects a route.
/// Opening the system picker gives ownership back to iOS, including routes
/// that cannot be represented by AVAudioSession.availableInputs.
struct TalkToMeAudioRoutePreference {
  enum ChangeReason: UInt {
    case other = 0
    case newDeviceAvailable = 1
    case oldDeviceUnavailable = 2
    case override = 4
    case routeConfigurationChange = 8
  }

  private(set) var preferredId = "speaker"
  private(set) var usesSystemRouting = true
  private(set) var isPickerPresented = false

  mutating func selectRoute(_ id: String) {
    preferredId = id.isEmpty || id == "receiver" ? "speaker" : id
    usesSystemRouting = false
  }

  mutating func beginPicker() {
    usesSystemRouting = true
    isPickerPresented = true
  }

  mutating func endPicker(currentId: String) {
    preferredId = currentId
    isPickerPresented = false
  }

  /// Returns whether an explicit legacy/remote preference should be restored.
  mutating func routeDidChange(
    reason: ChangeReason,
    currentId: String,
    preferredStillAvailable: Bool,
    selectionInProgress: Bool = false
  ) -> Bool {
    if usesSystemRouting {
      preferredId = currentId
      return false
    }
    if selectionInProgress && preferredStillAvailable {
      return currentId != preferredId
    }
    switch reason {
    case .newDeviceAvailable, .override:
      preferredId = currentId
    case .oldDeviceUnavailable:
      if !preferredStillAvailable { preferredId = "speaker" }
    default:
      break
    }
    return true
  }
}
