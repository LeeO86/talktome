@main
enum WatchGestureTests {
  static func main() {
    var g = WatchTalkGesture()
    precondition(g.begin(wasLocked: false) == .start)
    precondition(g.begin(wasLocked: false) == .none)
    precondition(g.move(x: -20, y: 0, startX: 100) == .none)
    precondition(g.move(x: -45, y: 5, startX: 100) == .lock)
    precondition(g.move(x: -60, y: 0, startX: 100) == .none)
    precondition(g.finish() == .none) // lifting after a swipe keeps the lock
    precondition(g.finish() == .none)
    precondition(!g.active)
    precondition(g.begin(wasLocked: true) == .stop)
    precondition(g.move(x: -60, y: 0, startX: 100) == .none)
    precondition(g.finish() == .none) // tap-to-stop must not restart or release
    precondition(g.begin(wasLocked: false) == .start)
    precondition(g.move(x: 60, y: 0, startX: 100) == .none)
    precondition(g.move(x: -60, y: 90, startX: 100) == .none)
    precondition(g.finish() == .release) // normal release or cancellation
    precondition(g.begin(wasLocked: false) == .start)
    precondition(g.move(x: -17, y: 0, startX: 20) == .lock) // near left edge
    precondition(g.finish() == .none)
    precondition(g.move(x: -60, y: 0, startX: 100) == .none) // no stray lock
    print("Watch hold/swipe/lock/release tests passed.")

    let fixed = WatchRemoteTarget(dictionary: ["slotKey": "conference-3", "key": "conference-3"])
    let reply = WatchRemoteTarget(dictionary: ["slotKey": "reply", "key": "conference-3", "pinned": true])
    let changedReply = WatchRemoteTarget(dictionary: ["slotKey": "reply", "key": "user-9", "pinned": true])
    let emptyReply = WatchRemoteTarget(dictionary: ["slotKey": "reply", "key": "reply", "pinned": true, "canTalk": false])
    precondition(fixed.id != reply.id) // two buttons can address the same destination
    precondition(reply.id == changedReply.id && reply.id == emptyReply.id)
    precondition(reply.key != changedReply.key) // commands still use the real destination
    precondition(WatchRemoteTarget(dictionary: ["key": "conference-3"]).id == fixed.id)
    let snapshot = WatchRemoteSnapshot(message: ["targets": [
      ["slotKey": "conference-3", "key": "conference-3"],
      ["slotKey": "reply", "key": "conference-3", "pinned": true],
    ]])
    precondition(snapshot.targets.count == 2 && snapshot.reply?.id == "reply")
    print("Watch fixed/Reply slot identity tests passed.")
  }
}
