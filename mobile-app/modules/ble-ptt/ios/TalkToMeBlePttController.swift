import CoreBluetooth
import Foundation

private final class AccessoryLink {
  let id: UUID
  var peripheral: CBPeripheral
  var profile: AccessoryScanProfile?
  var kind = "connecting"
  var message: String?
  var pendingCharacteristicDiscoveries = 0
  var pendingNotifyEnables = 0
  var enabledNotifyCount = 0
  var didFinishSubscribe = false
  var autoReconnect = true
  var pairingProbe = false
  var subscribeTimeoutWork: DispatchWorkItem?

  init(peripheral: CBPeripheral, profile: AccessoryScanProfile?) {
    self.id = peripheral.identifier
    self.peripheral = peripheral
    self.profile = profile
  }
}

private struct ProbeCandidate {
  let peripheral: CBPeripheral
  let name: String?
  let rssi: Int
  let advertisedServices: [CBUUID]
  let priority: Int
}

/// BLE central for several catalogued PTT accessories at once.
final class TalkToMeBlePttController: NSObject {
  var onState: (([String: Any]) -> Void)?
  var onButton: ((String, Bool) -> Void)?
  var onNotify: ((String, [Int], String, String) -> Void)?
  var onDiagnostic: ((String) -> Void)?

  private let userDefaults: UserDefaults
  private var centralManager: CBCentralManager?
  private var links: [UUID: AccessoryLink] = [:]
  private var scanning = false
  private var pairing = false
  private var pairingBoundIds = Set<UUID>()
  private var pairingTimeoutWork: DispatchWorkItem?
  private var probeQueue: [ProbeCandidate] = []
  private var scanTimeoutWork: DispatchWorkItem?
  private var catalog: [AccessoryScanProfile] = BleAccessoryCatalog.parse(nil)
  private var loggedScanIds = Set<UUID>()

  private static let restorationIdentifier = "io.github.leeo86.talktome-mobile.ble-button"
  private static let storedPeripheralIdentifierKey = "talktome.ble.peripheralIdentifier"
  private static let storedPeripheralIdentifiersKey = "talktome.ble.peripheralIdentifiers"
  private static let maxLinks = 8
  private static let maxConcurrentProbes = 2
  private static let maxPairingProbes = 4
  private static let minPairingRssi = -90

  init(userDefaults: UserDefaults = .standard) {
    self.userDefaults = userDefaults
    super.init()
    migrateStoredIdentifier()
  }

  func setCatalogJSON(_ json: String) {
    let parsed = BleAccessoryCatalog.parse(json)
    if parsed.isEmpty == false {
      catalog = parsed
    }
  }

  func currentState() -> [String: Any] {
    snapshot(message: nil)
  }

  func start() {
    ensureCentralManager()
    guard let centralManager else {
      emit(kindOverride: "unavailable", message: "Bluetooth is currently unavailable.")
      return
    }
    handle(managerState: centralManager.state)
  }

  func scanAndConnect() {
    startButtonPairing(timeoutMs: 20_000, boundIdsJSON: "[]")
  }

  func startButtonPairing(timeoutMs: Int, boundIdsJSON: String) {
    ensureCentralManager()
    guard let centralManager else {
      emit(kindOverride: "unavailable", message: "Bluetooth is currently unavailable.")
      return
    }
    guard centralManager.state == .poweredOn else {
      handle(managerState: centralManager.state)
      return
    }
    pairingBoundIds = parseBoundIds(boundIdsJSON)
    pairingBoundIds.formUnion(storedIdentifiers())
    pairing = true
    probeQueue.removeAll()
    cancelPairingTimeout()
    startScanning(reason: "button-pairing", timeout: max(8, Double(timeoutMs) / 1000))
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.pairing else {
        return
      }
      self.finishPairingWithoutMatch()
    }
    pairingTimeoutWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + max(8, Double(timeoutMs) / 1000), execute: work)
  }

  func cancelButtonPairing() {
    guard pairing else {
      return
    }
    pairing = false
    cancelPairingTimeout()
    cancelScanTimeout()
    centralManager?.stopScan()
    scanning = false
    dropPairingProbes()
    emit()
    emitDiagnostic("PTT button pairing cancelled.")
  }

  func acceptPairedDevice(id rawId: String) {
    pairing = false
    cancelPairingTimeout()
    cancelScanTimeout()
    centralManager?.stopScan()
    scanning = false
    guard let uuid = UUID(uuidString: rawId) else {
      dropPairingProbes()
      emit()
      return
    }
    if let link = links[uuid] {
      link.pairingProbe = false
      link.autoReconnect = true
      remember(uuid)
    } else {
      connectStored(id: rawId)
    }
    dropPairingProbes(keeping: uuid)
    emit()
    emitDiagnostic("PTT button pairing accepted \(rawId).")
  }

  func connectStored(id rawId: String) {
    ensureCentralManager()
    guard let centralManager, centralManager.state == .poweredOn else {
      start()
      return
    }
    guard let uuid = UUID(uuidString: rawId) else {
      startScanning(reason: "reconnect")
      return
    }
    remember(uuid)
    if let existing = links[uuid], existing.peripheral.state == .connected {
      existing.kind = existing.enabledNotifyCount > 0 ? "connected" : "connecting"
      emit()
      return
    }
    let peripherals = centralManager.retrievePeripherals(withIdentifiers: [uuid])
    if let peripheral = peripherals.first {
      connect(to: peripheral, reason: "stored-id", persist: true, autoReconnect: true)
      return
    }
    startScanning(reason: "reconnect")
  }

  func disconnect(id rawId: String?) {
    let trimmed = rawId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if trimmed.isEmpty {
      cancelScanTimeout()
      centralManager?.stopScan()
      scanning = false
      for link in Array(links.values) {
        link.autoReconnect = false
        onButton?(link.id.uuidString, false)
        cancelSubscribeTimeout(link)
        centralManager?.cancelPeripheralConnection(link.peripheral)
      }
      links.removeAll()
      clearStoredIdentifiers()
      emit()
      emitDiagnostic("Bluetooth accessories disconnected.")
      return
    }
    guard let uuid = UUID(uuidString: trimmed), let link = links[uuid] else {
      forget(UUID(uuidString: trimmed))
      emit()
      return
    }
    link.autoReconnect = false
    onButton?(link.id.uuidString, false)
    cancelSubscribeTimeout(link)
    forget(uuid)
    centralManager?.cancelPeripheralConnection(link.peripheral)
    links.removeValue(forKey: uuid)
    emit()
    emitDiagnostic("Bluetooth accessory disconnected from \(displayName(for: link)).")
  }

  private func ensureCentralManager() {
    guard centralManager == nil else {
      return
    }
    centralManager = CBCentralManager(
      delegate: self,
      queue: nil,
      options: [
        CBCentralManagerOptionShowPowerAlertKey: true,
        CBCentralManagerOptionRestoreIdentifierKey: Self.restorationIdentifier,
      ]
    )
  }

  private func handle(managerState: CBManagerState) {
    switch managerState {
    case .poweredOn:
      reconnectStoredPeripherals()
    case .poweredOff:
      emit(kindOverride: "unavailable", message: "Bluetooth is turned off on this iPhone.")
    case .unauthorized:
      emit(kindOverride: "unavailable", message: "Bluetooth access is denied for TalkToMe.")
    case .unsupported:
      emit(kindOverride: "unavailable", message: "This iPhone does not support Bluetooth LE.")
    case .resetting:
      emit(kindOverride: "unavailable", message: "Bluetooth is resetting.")
    case .unknown:
      emit()
    @unknown default:
      emit(kindOverride: "unavailable", message: "Bluetooth is in an unknown state.")
    }
  }

  private func reconnectStoredPeripherals() {
    guard let centralManager else {
      emit()
      return
    }
    let stored = storedIdentifiers()
    if stored.isEmpty, links.isEmpty {
      emit()
      return
    }
    for identifier in stored {
      if let existing = links[identifier], existing.peripheral.state == .connected {
        continue
      }
      let peripherals = centralManager.retrievePeripherals(withIdentifiers: [identifier])
      if let peripheral = peripherals.first {
        connect(to: peripheral, reason: "stored-identifier", persist: true, autoReconnect: true)
      }
    }
    let knownServices = catalog.compactMap(\.serviceUUID)
    if knownServices.isEmpty == false {
      let connected = centralManager.retrieveConnectedPeripherals(withServices: knownServices)
      for peripheral in connected where links[peripheral.identifier] == nil {
        if BleAccessoryCatalog.match(catalog, name: peripheral.name, advertisedServices: knownServices) != nil {
          connect(to: peripheral, reason: "connected-peripheral", persist: true, autoReconnect: true)
        }
      }
    }
    emit()
  }

  private func startScanning(reason: String, timeout: TimeInterval = 8) {
    guard let centralManager else {
      emit()
      return
    }
    cancelScanTimeout()
    centralManager.stopScan()
    loggedScanIds.removeAll()
    scanning = true
    emit()
    emitDiagnostic("Bluetooth accessory scan started (\(reason)).")
    centralManager.scanForPeripherals(
      withServices: nil,
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
    )
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.scanning else {
        return
      }
      self.centralManager?.stopScan()
      self.scanning = false
      if self.pairing {
        self.emit()
        self.emitDiagnostic("PTT button scan finished; still listening for a press.")
        return
      }
      if self.links.isEmpty {
        self.emit(kindOverride: "failed", message: "No compatible Bluetooth accessory found.")
        self.emitDiagnostic("Bluetooth accessory scan timed out without a matching peripheral.")
        return
      }
      self.emit()
      self.emitDiagnostic("Bluetooth accessory scan finished.")
    }
    scanTimeoutWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)
  }

  private func connect(
    to peripheral: CBPeripheral,
    reason: String,
    persist: Bool,
    autoReconnect: Bool,
    pairingProbe: Bool = false,
    advertisedName: String? = nil,
    advertisedServices: [CBUUID] = []
  ) {
    guard let centralManager else {
      return
    }
    let profile = BleAccessoryCatalog.match(
      catalog,
      name: advertisedName ?? peripheral.name,
      advertisedServices: advertisedServices
    )
    if let existing = links[peripheral.identifier] {
      existing.autoReconnect = autoReconnect
      existing.pairingProbe = pairingProbe
      existing.peripheral = peripheral
      existing.profile = profile ?? existing.profile ?? .vendorNotifyFallback
      peripheral.delegate = self
      if peripheral.state == .connected || peripheral.state == .connecting {
        emit()
        return
      }
      existing.kind = "connecting"
      existing.message = nil
      if persist {
        remember(existing.id)
      }
      emit()
      emitDiagnostic("Bluetooth accessory connecting (\(reason)) to \(displayName(for: existing)).")
      centralManager.connect(peripheral, options: nil)
      return
    }
    if links.count >= Self.maxLinks {
      emitDiagnostic("Bluetooth accessory limit reached (\(Self.maxLinks)).")
      return
    }
    let link = AccessoryLink(peripheral: peripheral, profile: profile ?? .vendorNotifyFallback)
    link.autoReconnect = autoReconnect
    link.pairingProbe = pairingProbe
    links[link.id] = link
    if persist {
      remember(link.id)
    }
    peripheral.delegate = self
    emit()
    emitDiagnostic("Bluetooth accessory connecting (\(reason)) to \(displayName(for: link)).")
    centralManager.connect(peripheral, options: nil)
  }

  private func discover(for link: AccessoryLink) {
    resetSubscribe(link)
    let profile = link.profile ?? BleAccessoryCatalog.match(catalog, name: link.peripheral.name, advertisedServices: []) ?? .vendorNotifyFallback
    link.profile = profile
    if profile.isVendorNotify {
      armSubscribeTimeout(link)
      link.peripheral.discoverServices(nil)
      return
    }
    if let service = profile.serviceUUID {
      link.peripheral.discoverServices([service])
    } else {
      armSubscribeTimeout(link)
      link.peripheral.discoverServices(nil)
    }
  }

  private func resetSubscribe(_ link: AccessoryLink) {
    link.pendingCharacteristicDiscoveries = 0
    link.pendingNotifyEnables = 0
    link.enabledNotifyCount = 0
    link.didFinishSubscribe = false
    cancelSubscribeTimeout(link)
  }

  private func emitNotify(_ link: AccessoryLink, _ characteristic: CBCharacteristic) {
    guard let value = characteristic.value, value.isEmpty == false else {
      return
    }
    let serviceUuid = characteristic.service?.uuid.uuidString ?? ""
    emitDiagnostic("notify \(displayName(for: link)) \(characteristic.uuid.uuidString) \(BleAccessoryCatalog.hex(value))")
    onNotify?(link.id.uuidString, value.map { Int($0) }, serviceUuid, characteristic.uuid.uuidString)
  }

  private func aggregateKind() -> String {
    if scanning {
      return "scanning"
    }
    let kinds = links.values.map(\.kind)
    if kinds.contains("connected") {
      return "connected"
    }
    if kinds.contains("connecting") {
      return "connecting"
    }
    if kinds.contains("unavailable") {
      return "unavailable"
    }
    if kinds.contains("failed") && kinds.contains("connected") == false {
      return "failed"
    }
    if kinds.contains("disconnected") {
      return "disconnected"
    }
    return "idle"
  }

  private func snapshot(message: String?, kindOverride: String? = nil) -> [String: Any] {
    let kind = kindOverride ?? aggregateKind()
    let connectedNames = links.values
      .filter { $0.kind == "connected" || $0.kind == "connecting" }
      .map { displayName(for: $0) }
      .joined(separator: ", ")
    var payload: [String: Any] = [
      "kind": kind,
      "scanning": scanning,
      "pairing": pairing,
      "devices": links.values.map { deviceSnapshot($0) },
    ]
    if connectedNames.isEmpty == false {
      payload["name"] = connectedNames
    }
    if let message, message.isEmpty == false {
      payload["message"] = message
    }
    return payload
  }

  private func deviceSnapshot(_ link: AccessoryLink) -> [String: Any] {
    var payload: [String: Any] = [
      "id": link.id.uuidString,
      "kind": link.kind,
      "name": displayName(for: link),
    ]
    if let profileId = link.profile?.id, profileId.isEmpty == false {
      payload["profileId"] = profileId
    }
    if let message = link.message, message.isEmpty == false {
      payload["message"] = message
    }
    return payload
  }

  private func emit(kindOverride: String? = nil, message: String? = nil) {
    onState?(snapshot(message: message, kindOverride: kindOverride))
  }

  private func emitDiagnostic(_ message: String) {
    onDiagnostic?(message)
  }

  private func displayName(for link: AccessoryLink) -> String {
    let rawName = link.peripheral.name?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let rawName, rawName.isEmpty == false {
      return rawName
    }
    return link.profile?.id ?? "Bluetooth accessory"
  }

  private func displayName(for peripheral: CBPeripheral) -> String {
    if let link = links[peripheral.identifier] {
      return displayName(for: link)
    }
    let rawName = peripheral.name?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let rawName, rawName.isEmpty == false {
      return rawName
    }
    return "Bluetooth accessory"
  }

  private func advertisedName(_ advertisementData: [String: Any], peripheral: CBPeripheral) -> String? {
    if let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
      let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty == false {
        return trimmed
      }
    }
    return peripheral.name
  }

  private func advertisedServices(_ advertisementData: [String: Any]) -> [CBUUID] {
    (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]) ?? []
  }

  private func link(for peripheral: CBPeripheral) -> AccessoryLink? {
    links[peripheral.identifier]
  }

  private func storedIdentifiers() -> [UUID] {
    (userDefaults.stringArray(forKey: Self.storedPeripheralIdentifiersKey) ?? []).compactMap(UUID.init(uuidString:))
  }

  private func remember(_ identifier: UUID) {
    var ids = storedIdentifiers()
    if ids.contains(identifier) == false {
      ids.append(identifier)
      userDefaults.set(ids.map(\.uuidString), forKey: Self.storedPeripheralIdentifiersKey)
    }
  }

  private func forget(_ identifier: UUID?) {
    guard let identifier else {
      return
    }
    let ids = storedIdentifiers().filter { $0 != identifier }
    userDefaults.set(ids.map(\.uuidString), forKey: Self.storedPeripheralIdentifiersKey)
  }

  private func clearStoredIdentifiers() {
    userDefaults.removeObject(forKey: Self.storedPeripheralIdentifiersKey)
    userDefaults.removeObject(forKey: Self.storedPeripheralIdentifierKey)
  }

  private func migrateStoredIdentifier() {
    guard storedIdentifiers().isEmpty,
          let legacy = userDefaults.string(forKey: Self.storedPeripheralIdentifierKey),
          let uuid = UUID(uuidString: legacy) else {
      return
    }
    userDefaults.set([uuid.uuidString], forKey: Self.storedPeripheralIdentifiersKey)
    userDefaults.removeObject(forKey: Self.storedPeripheralIdentifierKey)
  }

  private func cancelScanTimeout() {
    scanTimeoutWork?.cancel()
    scanTimeoutWork = nil
  }

  private func cancelPairingTimeout() {
    pairingTimeoutWork?.cancel()
    pairingTimeoutWork = nil
  }

  private func parseBoundIds(_ json: String) -> Set<UUID> {
    guard let data = json.data(using: .utf8),
          let parsed = try? JSONSerialization.jsonObject(with: data) as? [String] else {
      return []
    }
    return Set(parsed.compactMap(UUID.init(uuidString:)))
  }

  private func finishPairingWithoutMatch() {
    pairing = false
    cancelPairingTimeout()
    cancelScanTimeout()
    centralManager?.stopScan()
    scanning = false
    dropPairingProbes()
    emit(kindOverride: "failed", message: "No PTT button was heard. Hold the button and try again.")
    emitDiagnostic("PTT button pairing timed out without a press command.")
  }

  private func dropPairingProbes(keeping: UUID? = nil) {
    for link in Array(links.values) where link.pairingProbe && link.id != keeping {
      link.autoReconnect = false
      cancelSubscribeTimeout(link)
      centralManager?.cancelPeripheralConnection(link.peripheral)
      links.removeValue(forKey: link.id)
    }
    probeQueue.removeAll()
  }

  private func enqueueProbe(
    _ peripheral: CBPeripheral,
    name: String?,
    rssi: Int,
    advertisedServices: [CBUUID]
  ) {
    if pairingBoundIds.contains(peripheral.identifier) || links[peripheral.identifier] != nil {
      return
    }
    if BleAccessoryCatalog.shouldSkipPairingName(name) {
      return
    }
    if rssi < Self.minPairingRssi {
      return
    }
    if probeQueue.contains(where: { $0.peripheral.identifier == peripheral.identifier }) {
      return
    }
    let priority = BleAccessoryCatalog.pairingPriority(catalog, name: name, advertisedServices: advertisedServices)
    probeQueue.append(
      ProbeCandidate(
        peripheral: peripheral,
        name: name,
        rssi: rssi,
        advertisedServices: advertisedServices,
        priority: priority
      )
    )
    probeQueue.sort {
      if $0.priority != $1.priority {
        return $0.priority < $1.priority
      }
      return $0.rssi > $1.rssi
    }
    pumpProbes()
  }

  private func pumpProbes() {
    guard pairing else {
      return
    }
    let activeProbes = links.values.filter(\.pairingProbe)
    if activeProbes.count >= Self.maxPairingProbes {
      return
    }
    let connecting = activeProbes.filter { $0.kind == "connecting" }.count
    var slots = min(Self.maxConcurrentProbes - connecting, Self.maxPairingProbes - activeProbes.count)
    while slots > 0, probeQueue.isEmpty == false {
      let candidate = probeQueue.removeFirst()
      if pairingBoundIds.contains(candidate.peripheral.identifier) || links[candidate.peripheral.identifier] != nil {
        continue
      }
      slots -= 1
      connect(
        to: candidate.peripheral,
        reason: "pairing-probe",
        persist: false,
        autoReconnect: false,
        pairingProbe: true,
        advertisedName: candidate.name,
        advertisedServices: candidate.advertisedServices
      )
    }
  }

  private func cancelSubscribeTimeout(_ link: AccessoryLink) {
    link.subscribeTimeoutWork?.cancel()
    link.subscribeTimeoutWork = nil
  }

  private func armSubscribeTimeout(_ link: AccessoryLink) {
    cancelSubscribeTimeout(link)
    let id = link.id
    let work = DispatchWorkItem { [weak self] in
      guard let self, let current = self.links[id], current.kind == "connecting" else {
        return
      }
      current.pendingCharacteristicDiscoveries = 0
      current.pendingNotifyEnables = 0
      current.didFinishSubscribe = false
      self.finishVendorSubscribeIfReady(link: current)
    }
    link.subscribeTimeoutWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: work)
  }

  private func finishVendorSubscribeIfReady(link: AccessoryLink) {
    guard link.didFinishSubscribe == false else {
      return
    }
    guard link.pendingCharacteristicDiscoveries == 0, link.pendingNotifyEnables == 0 else {
      return
    }
    link.didFinishSubscribe = true
    cancelSubscribeTimeout(link)
    if link.enabledNotifyCount > 0 {
      link.kind = "connected"
      link.message = nil
      emit()
      emitDiagnostic("Bluetooth accessory notifications enabled on \(displayName(for: link)) (\(link.enabledNotifyCount)).")
      return
    }
    if link.pairingProbe {
      emitDiagnostic("Pairing probe dropped \(displayName(for: link)); no PTT notify characteristic.")
      link.autoReconnect = false
      centralManager?.cancelPeripheralConnection(link.peripheral)
      links.removeValue(forKey: link.id)
      pumpProbes()
      emit()
      return
    }
    link.kind = "failed"
    link.message = "The connected accessory does not expose a vendor PTT notify characteristic."
    emit()
  }
}

extension TalkToMeBlePttController: CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    handle(managerState: central.state)
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    if let restoredPeripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
      for peripheral in restoredPeripherals {
        peripheral.delegate = self
        connect(to: peripheral, reason: "restore", persist: true, autoReconnect: true)
      }
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let name = advertisedName(advertisementData, peripheral: peripheral)
    let services = advertisedServices(advertisementData)
    if loggedScanIds.contains(peripheral.identifier) == false {
      loggedScanIds.insert(peripheral.identifier)
      let serviceList = services.map(\.uuidString).joined(separator: ",")
      if let name, name.isEmpty == false {
        emitDiagnostic("Scan saw \(name) services=\(serviceList)")
      }
    }
    if pairing {
      enqueueProbe(
        peripheral,
        name: name,
        rssi: RSSI.intValue,
        advertisedServices: services
      )
      return
    }
    guard storedIdentifiers().contains(peripheral.identifier) else {
      return
    }
    connect(
      to: peripheral,
      reason: "scan-stored",
      persist: true,
      autoReconnect: true,
      advertisedName: name,
      advertisedServices: services
    )
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.delegate = self
    if link(for: peripheral) == nil, links.count >= Self.maxLinks {
      central.cancelPeripheralConnection(peripheral)
      emitDiagnostic("Bluetooth accessory limit reached (\(Self.maxLinks)).")
      return
    }
    let link = link(for: peripheral) ?? {
      let created = AccessoryLink(
        peripheral: peripheral,
        profile: BleAccessoryCatalog.match(catalog, name: peripheral.name, advertisedServices: []) ?? .vendorNotifyFallback
      )
      created.pairingProbe = pairing
      created.autoReconnect = pairing == false
      links[created.id] = created
      return created
    }()
    if link.pairingProbe == false {
      remember(peripheral.identifier)
    }
    link.peripheral = peripheral
    link.kind = "connecting"
    emitDiagnostic("Bluetooth accessory connected to \(displayName(for: link)).")
    discover(for: link)
    emit()
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    let message = error?.localizedDescription ?? "Unknown error."
    if let link = link(for: peripheral) {
      link.kind = "failed"
      link.message = "Bluetooth accessory connection failed: \(message)"
      emit()
      if link.autoReconnect {
        connect(to: peripheral, reason: "retry", persist: link.pairingProbe == false, autoReconnect: true, pairingProbe: link.pairingProbe)
      } else if link.pairingProbe {
        links.removeValue(forKey: link.id)
        pumpProbes()
      }
    }
    emitDiagnostic("Bluetooth accessory failed to connect: \(message)")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    guard let link = link(for: peripheral) else {
      emit()
      return
    }
    cancelSubscribeTimeout(link)
    onButton?(link.id.uuidString, false)
    let name = displayName(for: link)
    if link.autoReconnect, storedIdentifiers().contains(link.id) {
      link.kind = "disconnected"
      link.message = nil
      emit()
      emitDiagnostic("Bluetooth accessory disconnected from \(name). Reconnecting.")
      connect(to: peripheral, reason: "auto-reconnect", persist: true, autoReconnect: true)
      return
    }
    links.removeValue(forKey: link.id)
    if pairing, link.pairingProbe {
      pumpProbes()
    }
    emit()
    emitDiagnostic("Bluetooth accessory disconnected from \(name).")
  }
}

extension TalkToMeBlePttController: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let link = link(for: peripheral) else {
      return
    }
    if let error {
      link.kind = "failed"
      link.message = "Bluetooth services could not be discovered: \(error.localizedDescription)"
      emit()
      return
    }
    let profile = link.profile ?? .vendorNotifyFallback
    if profile.isVendorNotify == false, let serviceUUID = profile.serviceUUID {
      guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
        link.kind = "failed"
        link.message = "The connected accessory does not expose the expected PTT service."
        emit()
        return
      }
      if let characteristicUUID = profile.characteristicUUID {
        peripheral.discoverCharacteristics([characteristicUUID], for: service)
      } else {
        peripheral.discoverCharacteristics(nil, for: service)
      }
      return
    }

    let services = peripheral.services ?? []
    if services.isEmpty {
      link.kind = "failed"
      link.message = "The connected accessory does not expose GATT services."
      emit()
      return
    }
    link.pendingCharacteristicDiscoveries = 0
    for service in services {
      emitDiagnostic("GATT \(displayName(for: link)) service \(service.uuid.uuidString)")
      if BleAccessoryCatalog.isDeviceInformation(service.uuid) {
        link.pendingCharacteristicDiscoveries += 1
        peripheral.discoverCharacteristics(nil, for: service)
        continue
      }
      if BleAccessoryCatalog.shouldSkipService(service.uuid) {
        continue
      }
      link.pendingCharacteristicDiscoveries += 1
      peripheral.discoverCharacteristics(nil, for: service)
    }
    if link.pendingCharacteristicDiscoveries == 0 {
      finishVendorSubscribeIfReady(link: link)
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let link = link(for: peripheral) else {
      return
    }
    if let error {
      link.kind = "failed"
      link.message = "Bluetooth characteristics could not be discovered: \(error.localizedDescription)"
      emit()
      return
    }
    let profile = link.profile ?? .vendorNotifyFallback
    let characteristics = service.characteristics ?? []

    if profile.isVendorNotify == false {
      let wanted = profile.characteristicUUID
      guard let characteristic = characteristics.first(where: { wanted == nil || $0.uuid == wanted }) else {
        link.kind = "failed"
        link.message = "The connected accessory does not expose the expected PTT characteristic."
        emit()
        return
      }
      link.pendingNotifyEnables += 1
      peripheral.setNotifyValue(true, for: characteristic)
      return
    }

    link.pendingCharacteristicDiscoveries = max(0, link.pendingCharacteristicDiscoveries - 1)
    let summary = characteristics
      .map { "\($0.uuid.uuidString)(\(BleAccessoryCatalog.propertyLabel($0.properties)))" }
      .joined(separator: ",")
    emitDiagnostic("GATT \(displayName(for: link)) \(service.uuid.uuidString) chars: \(summary)")

    if BleAccessoryCatalog.isDeviceInformation(service.uuid) {
      for characteristic in characteristics {
        peripheral.readValue(for: characteristic)
      }
      finishVendorSubscribeIfReady(link: link)
      return
    }

    for characteristic in characteristics {
      if BleAccessoryCatalog.shouldSkipCharacteristic(characteristic.uuid) {
        continue
      }
      if characteristic.properties.contains(.notify) || characteristic.properties.contains(.indicate) {
        link.pendingNotifyEnables += 1
        peripheral.setNotifyValue(true, for: characteristic)
      }
    }
    finishVendorSubscribeIfReady(link: link)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    guard let link = link(for: peripheral) else {
      return
    }
    let profile = link.profile ?? .vendorNotifyFallback
    if profile.isVendorNotify == false {
      if let error {
        link.kind = "failed"
        link.message = "Bluetooth notifications could not be enabled: \(error.localizedDescription)"
        emit()
        return
      }
      guard characteristic.isNotifying else {
        return
      }
      link.enabledNotifyCount += 1
      link.kind = "connected"
      link.message = nil
      emit()
      emitDiagnostic("Bluetooth accessory notifications enabled on \(displayName(for: link)) \(characteristic.uuid.uuidString).")
      return
    }

    link.pendingNotifyEnables = max(0, link.pendingNotifyEnables - 1)
    if error == nil, characteristic.isNotifying {
      link.enabledNotifyCount += 1
      emitDiagnostic("notify enabled \(displayName(for: link)) \(characteristic.uuid.uuidString)")
    } else if let error {
      emitDiagnostic("notify failed \(characteristic.uuid.uuidString): \(error.localizedDescription)")
    }
    finishVendorSubscribeIfReady(link: link)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard let link = link(for: peripheral) else {
      return
    }
    if let error {
      emitDiagnostic("Bluetooth accessory value update failed: \(error.localizedDescription)")
      return
    }
    if let serviceUUID = characteristic.service?.uuid, BleAccessoryCatalog.shouldSkipService(serviceUUID) {
      if let value = characteristic.value, let text = String(data: value, encoding: .utf8), text.isEmpty == false {
        emitDiagnostic("DIS \(characteristic.uuid.uuidString) \(text)")
      }
      return
    }
    if BleAccessoryCatalog.shouldSkipCharacteristic(characteristic.uuid) {
      if let value = characteristic.value, let text = String(data: value, encoding: .utf8), text.isEmpty == false {
        emitDiagnostic("DIS \(characteristic.uuid.uuidString) \(text)")
      }
      return
    }
    emitNotify(link, characteristic)
  }
}
