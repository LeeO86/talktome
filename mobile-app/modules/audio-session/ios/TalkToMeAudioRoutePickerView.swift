import AVKit
import ExpoModulesCore
import UIKit

/// Apple's unmodified route-picker control owns both the button and device list.
public final class TalkToMeAudioRoutePickerView: ExpoView, AVRoutePickerViewDelegate {
  static let willPresentRoutes = Notification.Name("TalkToMeAudioRoutePickerWillPresent")
  static let didDismissRoutes = Notification.Name("TalkToMeAudioRoutePickerDidDismiss")
  private let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    picker.prioritizesVideoDevices = false
    picker.delegate = self
    picker.tintColor = .systemBlue
    picker.activeTintColor = .systemTeal
    addSubview(picker)
  }

  public func routePickerViewWillBeginPresentingRoutes(_ routePickerView: AVRoutePickerView) {
    NotificationCenter.default.post(name: Self.willPresentRoutes, object: self)
  }

  public func routePickerViewDidEndPresentingRoutes(_ routePickerView: AVRoutePickerView) {
    NotificationCenter.default.post(name: Self.didDismissRoutes, object: self)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
