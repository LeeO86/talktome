import CoreBluetooth
import Foundation

/// Ported from talktome-apple BluetoothButtonController @ 004d6e76 by Daniel Jocher.
/// Emits press/release only; short-press lock policy lives in JS.
final class TalkToMeBlePttController: NSObject {
  var onState: (([String: Any]) -> Void)?
  var onButton: ((Bool) -> Void)?
  var onDiagnostic: ((String) -> Void)?

  private let userDefaults: UserDefaults
  private var centralManager: CBCentralManager?
  private var peripheral: CBPeripheral?
  private var buttonCharacteristic: CBCharacteristic?
  private var stateKind = "idle"
  private var lastPressedValue: Bool?
  private var scanTimeoutWork: DispatchWorkItem?
  private var shouldReconnectAutomatically = true

  private static let buttonServiceUUID = CBUUID(string: "FFE0")
  private static let buttonCharacteristicUUID = CBUUID(string: "FFE1")
  private static let restorationIdentifier = "io.github.leeo86.talktome-mobile.ble-button"
  private static let storedPeripheralIdentifierKey = "talktome.ble.peripheralIdentifier"
  private static let expectedNames = ["PTT-Z01"]

  init(userDefaults: UserDefaults = .standard) {
    self.userDefaults = userDefaults
    super.init()
  }

  func currentState() -> [String: Any] {
    snapshot(kind: stateKind, name: peripheral.flatMap { displayName(for: $0) }, message: nil)
  }

  func start() {
    ensureCentralManager()
    guard let centralManager else {
      emit(kind: "unavailable", message: "Bluetooth is currently unavailable.")
      return
    }
    handle(managerState: centralManager.state)
  }

  func scanAndConnect() {
    ensureCentralManager()
    guard let centralManager else {
      emit(kind: "unavailable", message: "Bluetooth is currently unavailable.")
      return
    }
    guard centralManager.state == .poweredOn else {
      handle(managerState: centralManager.state)
      return
    }
    startScanning(reason: "manual-connect")
  }

  func disconnect() {
    shouldReconnectAutomatically = false
    cancelScanTimeout()
    centralManager?.stopScan()
    lastPressedValue = nil
    buttonCharacteristic = nil

    guard let peripheral else {
      clearStoredPeripheralIdentifier()
      emit(kind: "idle")
      emitDiagnostic("Bluetooth button disconnected.")
      return
    }

    centralManager?.cancelPeripheralConnection(peripheral)
    clearStoredPeripheralIdentifier()
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
      reconnectStoredPeripheralIfNeeded(startScanningIfNecessary: true)
    case .poweredOff:
      emit(kind: "unavailable", message: "Bluetooth is turned off on this iPhone.")
    case .unauthorized:
      emit(kind: "unavailable", message: "Bluetooth access is denied for TalkToMe.")
    case .unsupported:
      emit(kind: "unavailable", message: "This iPhone does not support Bluetooth LE.")
    case .resetting:
      emit(kind: "unavailable", message: "Bluetooth is resetting.")
    case .unknown:
      emit(kind: "idle")
    @unknown default:
      emit(kind: "unavailable", message: "Bluetooth is in an unknown state.")
    }
  }

  private func reconnectStoredPeripheralIfNeeded(startScanningIfNecessary: Bool) {
    guard buttonCharacteristic == nil else {
      if let peripheral {
        emit(kind: "connected", name: displayName(for: peripheral))
      }
      return
    }

    if let peripheral, peripheral.state == .connected {
      peripheral.delegate = self
      peripheral.discoverServices([Self.buttonServiceUUID])
      emit(kind: "connecting", name: displayName(for: peripheral))
      return
    }

    guard let centralManager else {
      emit(kind: "idle")
      return
    }

    if let storedIdentifier = storedPeripheralIdentifier() {
      let peripherals = centralManager.retrievePeripherals(withIdentifiers: [storedIdentifier])
      if let restoredPeripheral = peripherals.first {
        connect(to: restoredPeripheral, reason: "stored-identifier")
        return
      }
    }

    let connectedPeripherals = centralManager.retrieveConnectedPeripherals(withServices: [Self.buttonServiceUUID])
    if let connectedPeripheral = connectedPeripherals.first(where: { matchesExpectedPeripheral($0, advertisementData: [:]) }) {
      connect(to: connectedPeripheral, reason: "connected-peripheral")
      return
    }

    if startScanningIfNecessary, storedPeripheralIdentifier() != nil {
      startScanning(reason: "auto-reconnect")
      return
    }

    emit(kind: "idle")
  }

  private func startScanning(reason: String) {
    guard let centralManager else {
      emit(kind: "idle")
      return
    }

    cancelScanTimeout()
    centralManager.stopScan()
    shouldReconnectAutomatically = true
    emit(kind: "scanning")
    emitDiagnostic("Bluetooth button scan started (\(reason)).")

    centralManager.scanForPeripherals(
      withServices: [Self.buttonServiceUUID],
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
    )

    let work = DispatchWorkItem { [weak self] in
      guard let self, self.stateKind == "scanning" else {
        return
      }
      self.centralManager?.stopScan()
      self.emit(kind: "failed", message: "No compatible Bluetooth button found.")
      self.emitDiagnostic("Bluetooth button scan timed out without a matching peripheral.")
    }
    scanTimeoutWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
  }

  private func connect(to peripheral: CBPeripheral, reason: String) {
    guard let centralManager else {
      return
    }
    shouldReconnectAutomatically = true
    cancelScanTimeout()
    centralManager.stopScan()
    self.peripheral = peripheral
    self.peripheral?.delegate = self
    emit(kind: "connecting", name: displayName(for: peripheral))
    emitDiagnostic("Bluetooth button connecting (\(reason)) to \(displayName(for: peripheral)).")
    centralManager.connect(peripheral, options: nil)
  }

  private func handleDiscoveredValue(_ data: Data) {
    guard let firstByte = data.first else {
      return
    }
    let pressed: Bool?
    switch firstByte {
    case 0x01, 0xAB:
      pressed = true
    case 0x00, 0xCD:
      pressed = false
    default:
      pressed = nil
    }
    guard let pressed, lastPressedValue != pressed else {
      return
    }
    lastPressedValue = pressed
    emitDiagnostic("Bluetooth button \(pressed ? "pressed" : "released").")
    onButton?(pressed)
  }

  private func emit(kind: String, name: String? = nil, message: String? = nil) {
    stateKind = kind
    onState?(snapshot(kind: kind, name: name, message: message))
  }

  private func snapshot(kind: String, name: String?, message: String?) -> [String: Any] {
    var payload: [String: Any] = ["kind": kind]
    if let name, name.isEmpty == false {
      payload["name"] = name
    }
    if let message, message.isEmpty == false {
      payload["message"] = message
    }
    return payload
  }

  private func emitDiagnostic(_ message: String) {
    onDiagnostic?(message)
  }

  private func displayName(for peripheral: CBPeripheral) -> String {
    let rawName = peripheral.name?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let rawName, rawName.isEmpty == false {
      return rawName
    }
    return "PTT-Z01"
  }

  private func matchesExpectedPeripheral(_ peripheral: CBPeripheral, advertisementData: [String: Any]) -> Bool {
    if let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)?.uppercased(),
       Self.expectedNames.contains(name) {
      return true
    }
    if let name = peripheral.name?.uppercased(),
       Self.expectedNames.contains(name) {
      return true
    }
    if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID],
       serviceUUIDs.contains(Self.buttonServiceUUID) {
      return true
    }
    return false
  }

  private func storedPeripheralIdentifier() -> UUID? {
    guard let value = userDefaults.string(forKey: Self.storedPeripheralIdentifierKey) else {
      return nil
    }
    return UUID(uuidString: value)
  }

  private func storePeripheralIdentifier(_ identifier: UUID) {
    userDefaults.set(identifier.uuidString, forKey: Self.storedPeripheralIdentifierKey)
  }

  private func clearStoredPeripheralIdentifier() {
    userDefaults.removeObject(forKey: Self.storedPeripheralIdentifierKey)
  }

  private func cancelScanTimeout() {
    scanTimeoutWork?.cancel()
    scanTimeoutWork = nil
  }
}

extension TalkToMeBlePttController: CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    handle(managerState: central.state)
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    if let restoredPeripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral],
       let restoredPeripheral = restoredPeripherals.first {
      peripheral = restoredPeripheral
      peripheral?.delegate = self
      emitDiagnostic("Bluetooth button restore received \(displayName(for: restoredPeripheral)).")
      reconnectStoredPeripheralIfNeeded(startScanningIfNecessary: false)
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    _ = RSSI
    guard matchesExpectedPeripheral(peripheral, advertisementData: advertisementData) else {
      return
    }
    connect(to: peripheral, reason: "scan")
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    storePeripheralIdentifier(peripheral.identifier)
    self.peripheral = peripheral
    self.peripheral?.delegate = self
    lastPressedValue = nil
    emitDiagnostic("Bluetooth button connected to \(displayName(for: peripheral)).")
    peripheral.discoverServices([Self.buttonServiceUUID])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    let message = error?.localizedDescription ?? "Unknown error."
    emit(kind: "failed", message: "Bluetooth button connection failed: \(message)")
    emitDiagnostic("Bluetooth button failed to connect: \(message)")
    if shouldReconnectAutomatically {
      reconnectStoredPeripheralIfNeeded(startScanningIfNecessary: true)
    }
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    buttonCharacteristic = nil
    lastPressedValue = nil
    let name = displayName(for: peripheral)
    self.peripheral = nil
    if shouldReconnectAutomatically {
      emit(kind: "disconnected", name: name)
      emitDiagnostic("Bluetooth button disconnected from \(name). Reconnecting.")
      reconnectStoredPeripheralIfNeeded(startScanningIfNecessary: true)
      return
    }
    emit(kind: "idle")
    emitDiagnostic("Bluetooth button disconnected from \(name).")
  }
}

extension TalkToMeBlePttController: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error {
      emit(kind: "failed", message: "Bluetooth services could not be discovered: \(error.localizedDescription)")
      return
    }
    guard let service = peripheral.services?.first(where: { $0.uuid == Self.buttonServiceUUID }) else {
      emit(kind: "failed", message: "The connected accessory does not expose the expected PTT service.")
      return
    }
    peripheral.discoverCharacteristics([Self.buttonCharacteristicUUID], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    if let error {
      emit(kind: "failed", message: "Bluetooth characteristics could not be discovered: \(error.localizedDescription)")
      return
    }
    guard let characteristic = service.characteristics?.first(where: { $0.uuid == Self.buttonCharacteristicUUID }) else {
      emit(kind: "failed", message: "The connected accessory does not expose the expected PTT characteristic.")
      return
    }
    buttonCharacteristic = characteristic
    peripheral.setNotifyValue(true, for: characteristic)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    if let error {
      emit(kind: "failed", message: "Bluetooth notifications could not be enabled: \(error.localizedDescription)")
      return
    }
    guard characteristic.uuid == Self.buttonCharacteristicUUID, characteristic.isNotifying else {
      return
    }
    emit(kind: "connected", name: displayName(for: peripheral))
    emitDiagnostic("Bluetooth button notifications enabled on FFE1.")
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error {
      emitDiagnostic("Bluetooth button value update failed: \(error.localizedDescription)")
      return
    }
    guard characteristic.uuid == Self.buttonCharacteristicUUID, let value = characteristic.value else {
      return
    }
    handleDiscoveredValue(value)
  }
}
