import Foundation

/// Shared by the full-screen button, split buttons and list rows.
/// Kept independent of SwiftUI so release/cancel/lock behavior can be exercised.
struct WatchTalkGesture {
  enum Action: Equatable { case none, start, stop, lock, release }
  private(set) var active = false
  private var stoppedLock = false
  private var requestedLock = false

  mutating func begin(wasLocked: Bool) -> Action {
    guard !active else { return .none }
    active = true
    stoppedLock = wasLocked
    return wasLocked ? .stop : .start
  }

  mutating func move(x: Double, y: Double, startX: Double) -> Action {
    guard active, !stoppedLock, !requestedLock else { return .none }
    // A press near the left edge must still be able to lock before the finger
    // leaves the small Watch screen. Vertical list scrolling must not lock.
    let distance = min(44, max(16, startX * 0.5))
    guard x <= -distance, abs(y) < max(20, abs(x) * 0.75) else { return .none }
    requestedLock = true
    return .lock
  }

  mutating func finish() -> Action {
    let release = active && !stoppedLock && !requestedLock
    self = WatchTalkGesture()
    return release ? .release : .none
  }
}
