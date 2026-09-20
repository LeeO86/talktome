import Darwin
import Foundation

/// Process-lifetime lock in the App Group container.
///
/// BSD `flock` is released on SIGKILL, including swipe-away of a suspended app
/// (JS `disconnect()` and often `willTerminate` never run). The widget
/// extension (`targets/TalkToMeWidget/TalkToMeProcessLiveness.swift`) tries
/// the same lock non-blocking: if it can take it, the app process is gone
/// and connected leftovers should not stay on screen.
/// A suspended or backgrounded app keeps the lock — lock-screen session
/// must remain connected until the process actually dies.
///
/// Call C `flock` through `sysFlock`. `import Darwin` also imports the
/// `fcntl` `flock` struct, so a `Darwin.flock` function call is a Swift
/// compile error (struct initializer, not the C function).
enum TalkToMeProcessLiveness {
  static let suiteName = TalkToMePresenceStore.suiteName
  static let fileName = TalkToMePresenceStore.processAliveFileName

  private static let gate = NSLock()
  private static var heldFd: Int32 = -1

  /// Hold an exclusive lock until this process exits. Safe to call often.
  static func claimForProcessLifetime() {
    gate.lock()
    defer { gate.unlock() }
    guard heldFd < 0, let path = lockPath() else {
      return
    }
    let fd = open(path, O_RDWR | O_CREAT, 0o664)
    guard fd >= 0 else {
      return
    }
    if sysFlock(fd, LOCK_EX) == 0 {
      heldFd = fd
    } else {
      close(fd)
    }
  }

  private static func lockPath() -> String? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: suiteName)?
      .appendingPathComponent(fileName)
      .path
  }
}

@_silgen_name("flock")
private func sysFlock(_ fd: Int32, _ operation: Int32) -> Int32
