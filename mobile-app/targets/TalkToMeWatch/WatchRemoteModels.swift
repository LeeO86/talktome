import Foundation

struct WatchRemoteTarget: Identifiable, Equatable {
  var slotKey: String
  var key: String
  var type: String
  var targetId: String
  var label: String
  var canTalk: Bool
  var pinned: Bool
  var highlighted: Bool

  var id: String { slotKey }

  var kindLabel: String {
    switch type {
    case "conference":
      return "Conference"
    case "guest":
      return "Guest"
    default:
      return "User"
    }
  }

  init(dictionary: [String: Any]) {
    key = dictionary["key"] as? String ?? ""
    slotKey = dictionary["slotKey"] as? String ?? key
    type = dictionary["type"] as? String ?? "user"
    targetId = dictionary["id"] as? String ?? ""
    label = dictionary["label"] as? String ?? "Target"
    canTalk = dictionary["canTalk"] as? Bool ?? false
    pinned = dictionary["pinned"] as? Bool ?? false
    highlighted = dictionary["highlighted"] as? Bool ?? false
  }
}

struct WatchRemoteSnapshot: Equatable {
  var connected: Bool
  var singleTargetMode: Bool
  var twoTargetMode: Bool
  var lockedTargetKeys: [String]
  var username: String
  var productionName: String
  var talking: Bool
  var talkingTargetKey: String
  var replyTargetKey: String
  var targets: [WatchRemoteTarget]

  static let empty = WatchRemoteSnapshot(
    connected: false,
    username: "",
    productionName: "",
    talking: false,
    talkingTargetKey: "",
    replyTargetKey: "",
    targets: []
  )

  init(
    connected: Bool,
    username: String,
    productionName: String,
    talking: Bool,
    talkingTargetKey: String,
    replyTargetKey: String,
    targets: [WatchRemoteTarget],
    singleTargetMode: Bool = false,
    twoTargetMode: Bool = false,
    lockedTargetKeys: [String] = []
  ) {
    self.singleTargetMode = singleTargetMode
    self.twoTargetMode = twoTargetMode
    self.lockedTargetKeys = lockedTargetKeys
    self.connected = connected
    self.username = username
    self.productionName = productionName
    self.talking = talking
    self.talkingTargetKey = talkingTargetKey
    self.replyTargetKey = replyTargetKey
    self.targets = targets
  }

  init(message: [String: Any]) {
    singleTargetMode = message["singleTargetMode"] as? Bool ?? false
    twoTargetMode = message["twoTargetMode"] as? Bool ?? false
    lockedTargetKeys = message["lockedTargetKeys"] as? [String] ?? []
    connected = message["connected"] as? Bool ?? false
    username = message["username"] as? String ?? ""
    productionName = message["productionName"] as? String ?? ""
    talking = message["talking"] as? Bool ?? false
    talkingTargetKey = message["talkingTargetKey"] as? String ?? ""
    replyTargetKey = message["replyTargetKey"] as? String ?? ""
    let rows = message["targets"] as? [[String: Any]] ?? []
    targets = rows.map(WatchRemoteTarget.init(dictionary:))
  }

  var reply: WatchRemoteTarget? {
    targets.first(where: \.pinned)
  }
}
