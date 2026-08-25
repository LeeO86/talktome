import Foundation

struct WatchRemoteTarget: Identifiable, Equatable {
  var key: String
  var type: String
  var targetId: String
  var label: String
  var canTalk: Bool
  var pinned: Bool
  var highlighted: Bool

  var id: String { key }

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
    targets: [WatchRemoteTarget]
  ) {
    self.connected = connected
    self.username = username
    self.productionName = productionName
    self.talking = talking
    self.talkingTargetKey = talkingTargetKey
    self.replyTargetKey = replyTargetKey
    self.targets = targets
  }

  init(message: [String: Any]) {
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
