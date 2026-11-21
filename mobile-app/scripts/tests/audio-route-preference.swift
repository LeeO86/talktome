@main
enum AudioRoutePreferenceTests {
  static func main() {
    var route = TalkToMeAudioRoutePreference()
    precondition(route.usesSystemRouting)
    // Starting/reconfiguring audio must not force the saved Speaker preference.
    precondition(!route.routeDidChange(reason: .routeConfigurationChange,
      currentId: "port:airpods", preferredStillAvailable: true))
    route.selectRoute("speaker")
    precondition(!route.usesSystemRouting)
    route.beginPicker()
    for current in ["speaker", "receiver", "port:airpods", "output:a2dp-only"] {
      precondition(!route.routeDidChange(reason: .routeConfigurationChange,
        currentId: current, preferredStillAvailable: true))
    }
    route.endPicker(currentId: "output:a2dp-only")
    precondition(route.usesSystemRouting && !route.isPickerPresented)
    precondition(route.preferredId == "output:a2dp-only")
    // Even delayed notifications after dismissal do not trigger our overrides.
    for reason in [TalkToMeAudioRoutePreference.ChangeReason.other, .override,
                   .oldDeviceUnavailable, .newDeviceAvailable, .routeConfigurationChange] {
      precondition(!route.routeDidChange(reason: reason, currentId: "port:airpods",
        preferredStillAvailable: false, selectionInProgress: true))
    }
    route.beginPicker()
    route.endPicker(currentId: "receiver")
    precondition(route.preferredId == "receiver") // iOS may expose its receiver.
    precondition(!route.routeDidChange(reason: .other, currentId: "receiver", preferredStillAvailable: true))
    // Explicit legacy/remote requests retain their bounded selection behavior.
    route.selectRoute("speaker")
    precondition(route.routeDidChange(reason: .override, currentId: "port:airpods",
      preferredStillAvailable: true, selectionInProgress: true))
    precondition(route.preferredId == "speaker")
    precondition(!route.routeDidChange(reason: .override, currentId: "speaker",
      preferredStillAvailable: true, selectionInProgress: true))
    route.beginPicker()
    route.endPicker(currentId: "port:airpods")
    precondition(!route.routeDidChange(reason: .other, currentId: "speaker", preferredStillAvailable: true))
    print("Native system routing ownership tests passed.")
  }
}
