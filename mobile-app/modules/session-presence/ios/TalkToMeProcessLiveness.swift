import Darwin
import Foundation

/// Process-lifetime lock in the App Group container.
///
/// The widget extension (`targets/TalkToMeWidget/TalkToMeProcessLiveness.swift`)
/// probes the same file. Keep this protocol in sync with that copy.
///
/// Use POSIX `fcntl` `F_SETLKW` with the Darwin `flock` struct (that struct is
/// why calling Darwin flock as a function does not compile). The lock file is created with
/// `FileProtectionType.none` so a lock-screen Live Activity can open it.
/// SIGKILL still drops the lock. Never call the Darwin flock function.
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
    prepareLockFile(at: path)
    let fd = open(path, O_RDWR | O_CREAT, 0o664)
    guard fd >= 0 else {
      return
    }
    if setExclusiveLock(fd: fd, wait: true) {
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

  private static func prepareLockFile(at path: String) {
    let attrs: [FileAttributeKey: Any] = [
      .protectionKey: FileProtectionType.none,
    ]
    if !FileManager.default.fileExists(atPath: path) {
      FileManager.default.createFile(atPath: path, contents: Data(), attributes: attrs)
    } else {
      try? FileManager.default.setAttributes(attrs, ofItemAtPath: path)
    }
  }

  private static func setExclusiveLock(fd: Int32, wait: Bool) -> Bool {
    var spec = flock()
    spec.l_start = 0
    spec.l_len = 0
    spec.l_pid = 0
    spec.l_type = Int16(F_WRLCK)
    spec.l_whence = Int16(SEEK_SET)
    let cmd = wait ? F_SETLKW : F_SETLK
    return withUnsafeMutablePointer(to: &spec) { pointer in
      fcntl(fd, cmd, pointer) == 0
    }
  }
}
