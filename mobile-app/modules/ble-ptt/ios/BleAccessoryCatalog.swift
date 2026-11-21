import CoreBluetooth
import Foundation

struct AccessoryScanProfile {
  let id: String
  let names: Set<String>
  let nameIncludes: [String]
  let serviceUUID: CBUUID?
  let characteristicUUID: CBUUID?
  let discovery: String

  static let vendorNotifyFallback = AccessoryScanProfile(
    id: "unknown",
    names: [],
    nameIncludes: [],
    serviceUUID: nil,
    characteristicUUID: nil,
    discovery: "vendor-notify"
  )

  var isVendorNotify: Bool {
    discovery == "vendor-notify" || serviceUUID == nil || characteristicUUID == nil
  }
}

enum BleAccessoryCatalog {
  static let ffe0 = CBUUID(string: "FFE0")
  static let pairingSkipFragments = [
    "IPHONE", "IPAD", "IPOD", "MACBOOK", "IMAC", "APPLE WATCH", "AIRPODS", "GALAXY BUDS", "PIXEL BUDS",
  ]
  static let defaultJSON = """
  [{"id":"ptt-z01","names":["PTT-Z01"],"nameIncludes":[],"serviceUuid":"FFE0","characteristicUuid":"FFE1","discovery":"fixed"},{"id":"herda-hb980-plus","names":["HB9800D","HB980D","HB980-PLUS","HB980PLUS","HB980D-Zello","Herdt980D-Zello","Herda PTT"],"nameIncludes":["HB980","HERDA PTT","HERDAPTT","HERDA-PTT","HERDT980","HERDA980"],"serviceUuid":"","characteristicUuid":"","discovery":"vendor-notify"}]
  """

  static func parse(_ json: String?) -> [AccessoryScanProfile] {
    let raw = json?.trimmingCharacters(in: .whitespacesAndNewlines)
    let payload = (raw?.isEmpty == false ? raw! : defaultJSON).data(using: .utf8)
    guard let payload,
          let parsed = try? JSONSerialization.jsonObject(with: payload) as? [[String: Any]],
          parsed.isEmpty == false else {
      if json != defaultJSON {
        return parse(defaultJSON)
      }
      return []
    }
    return parsed.compactMap { item in
      let id = (item["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      guard let id, id.isEmpty == false else {
        return nil
      }
      let names = Set(((item["names"] as? [String]) ?? []).map { $0.uppercased() }.filter { $0.isEmpty == false })
      let nameIncludes = ((item["nameIncludes"] as? [String]) ?? []).map { $0.uppercased() }.filter { $0.isEmpty == false }
      let service = cbuuid(item["serviceUuid"] as? String)
      let characteristic = cbuuid(item["characteristicUuid"] as? String)
      let discovery = (item["discovery"] as? String) ?? (service == nil ? "vendor-notify" : "fixed")
      return AccessoryScanProfile(
        id: id,
        names: names,
        nameIncludes: nameIncludes,
        serviceUUID: service,
        characteristicUUID: characteristic,
        discovery: discovery
      )
    }
  }

  static func match(
    _ profiles: [AccessoryScanProfile],
    name: String?,
    advertisedServices: [CBUUID]
  ) -> AccessoryScanProfile? {
    let normalized = name?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
    if normalized.isEmpty == false {
      if let exact = profiles.first(where: { $0.names.contains(normalized) }) {
        return exact
      }
      if let partial = profiles.first(where: { profile in
        profile.nameIncludes.contains { normalized.contains($0) }
      }) {
        return partial
      }
    }
    return profiles.first { profile in
      guard let service = profile.serviceUUID else {
        return false
      }
      return advertisedServices.contains(service)
    }
  }

  static func shouldSkipPairingName(_ name: String?) -> Bool {
    let normalized = name?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
    if normalized.isEmpty {
      return false
    }
    return pairingSkipFragments.contains { normalized.contains($0) }
  }

  static func pairingPriority(
    _ profiles: [AccessoryScanProfile],
    name: String?,
    advertisedServices: [CBUUID]
  ) -> Int {
    if match(profiles, name: name, advertisedServices: advertisedServices) != nil {
      return 0
    }
    if advertisedServices.contains(ffe0) {
      return 0
    }
    return 1
  }

  static func shouldSkipService(_ uuid: CBUUID) -> Bool {
    let compact = uuid.uuidString.replacingOccurrences(of: "-", with: "").uppercased()
    return compact.hasPrefix("000018") && compact.hasSuffix("00001000800000805F9B34FB")
  }

  static func shouldSkipCharacteristic(_ uuid: CBUUID) -> Bool {
    let compact = uuid.uuidString.replacingOccurrences(of: "-", with: "").uppercased()
    return compact.hasPrefix("00002A") && compact.hasSuffix("00001000800000805F9B34FB")
  }

  static func isDeviceInformation(_ uuid: CBUUID) -> Bool {
    uuid == CBUUID(string: "180A")
  }

  static func hex(_ data: Data) -> String {
    data.map { String(format: "%02X", $0) }.joined(separator: " ")
  }

  static func propertyLabel(_ properties: CBCharacteristicProperties) -> String {
    var labels: [String] = []
    if properties.contains(.notify) { labels.append("notify") }
    if properties.contains(.indicate) { labels.append("indicate") }
    if properties.contains(.read) { labels.append("read") }
    if properties.contains(.write) { labels.append("write") }
    if properties.contains(.writeWithoutResponse) { labels.append("write-nr") }
    return labels.isEmpty ? "none" : labels.joined(separator: ",")
  }

  private static func cbuuid(_ raw: String?) -> CBUUID? {
    let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if trimmed.isEmpty {
      return nil
    }
    return CBUUID(string: trimmed)
  }
}
