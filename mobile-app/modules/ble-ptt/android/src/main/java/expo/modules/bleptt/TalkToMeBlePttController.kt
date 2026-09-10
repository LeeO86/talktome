package expo.modules.bleptt

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.util.ArrayDeque
import java.util.UUID

@SuppressLint("MissingPermission")
class TalkToMeBlePttController(private val context: Context) {
  interface Listener {
    fun onState(payload: Map<String, Any?>)
    fun onButton(deviceId: String, pressed: Boolean)
    fun onNotify(deviceId: String, data: List<Int>, serviceUuid: String, characteristicUuid: String)
    fun onDiagnostic(message: String)
  }

  var listener: Listener? = null

  private class AccessoryLink(
    val id: String,
    var device: BluetoothDevice,
    var gatt: BluetoothGatt? = null,
    var profile: AccessoryScanProfile? = null,
    var kind: String = "connecting",
    var message: String? = null,
    val cccdQueue: ArrayDeque<BluetoothGattCharacteristic> = ArrayDeque(),
    var writingCccd: Boolean = false,
    var enabledNotifyCount: Int = 0,
    var autoReconnect: Boolean = true,
    var subscribeTimeout: Runnable? = null,
  )

  private val handler = Handler(Looper.getMainLooper())
  private val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private var adapter: BluetoothAdapter? = null
  private val links = mutableMapOf<String, AccessoryLink>()
  private var scanning = false
  private var catalog: List<AccessoryScanProfile> = BleAccessoryCatalog.parse(null)
  private val loggedScanAddresses = mutableSetOf<String>()
  private val scanTimeout = Runnable {
    if (!scanning) {
      return@Runnable
    }
    stopScan()
    if (links.isEmpty()) {
      emit(kindOverride = "failed", message = "No compatible Bluetooth accessory found.")
      emitDiagnostic("Bluetooth accessory scan timed out without a matching peripheral.")
    } else {
      emit()
      emitDiagnostic("Bluetooth accessory scan finished.")
    }
  }

  fun setCatalogJson(json: String?) {
    val parsed = BleAccessoryCatalog.parse(json)
    if (parsed.isNotEmpty()) {
      catalog = parsed
    }
  }

  fun currentState(): Map<String, Any?> = snapshot(null)

  fun start() {
    migrateStoredAddress()
    val bluetoothAdapter = bluetoothAdapter()
    if (bluetoothAdapter == null) {
      emit(kindOverride = "unavailable", message = "This device does not support Bluetooth LE.")
      return
    }
    if (!bluetoothAdapter.isEnabled) {
      emit(kindOverride = "unavailable", message = "Bluetooth is turned off on this phone.")
      return
    }
    if (!hasScanPermission() && !hasConnectPermission()) {
      emit()
      return
    }
    adapter = bluetoothAdapter
    reconnectStoredDevices()
  }

  fun scanAndConnect() {
    val bluetoothAdapter = bluetoothAdapter()
    if (bluetoothAdapter == null) {
      emit(kindOverride = "unavailable", message = "This device does not support Bluetooth LE.")
      return
    }
    if (!bluetoothAdapter.isEnabled) {
      emit(kindOverride = "unavailable", message = "Bluetooth is turned off on this phone.")
      return
    }
    if (!hasScanPermission()) {
      emit(kindOverride = "unavailable", message = "Bluetooth permission is required to scan for a PTT accessory.")
      return
    }
    adapter = bluetoothAdapter
    startScanning(reason = "add-accessory")
  }

  fun connectStored(id: String) {
    val bluetoothAdapter = bluetoothAdapter() ?: adapter
    if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
      start()
      return
    }
    adapter = bluetoothAdapter
    remember(id)
    val existing = links[id]
    if (existing?.kind == "connected") {
      emit()
      return
    }
    try {
      connect(
        bluetoothAdapter.getRemoteDevice(id),
        reason = "stored-id",
        requireCatalogMatch = false,
        autoReconnect = true,
      )
    } catch (_: IllegalArgumentException) {
      startScanning(reason = "reconnect")
    }
  }

  fun disconnect(id: String?) {
    val trimmed = id?.trim().orEmpty()
    if (trimmed.isEmpty()) {
      stopScan()
      for (link in links.values.toList()) {
        link.autoReconnect = false
        listener?.onButton(link.id, false)
        cancelSubscribeTimeout(link)
        try {
          link.gatt?.disconnect()
          link.gatt?.close()
        } catch (_: SecurityException) {
          // Permission was revoked while disconnecting.
        }
      }
      links.clear()
      clearStoredAddresses()
      emit()
      emitDiagnostic("Bluetooth accessories disconnected.")
      return
    }
    val link = links.remove(trimmed)
    forget(trimmed)
    if (link == null) {
      emit()
      return
    }
    link.autoReconnect = false
    listener?.onButton(link.id, false)
    cancelSubscribeTimeout(link)
    try {
      link.gatt?.disconnect()
      link.gatt?.close()
    } catch (_: SecurityException) {
      // Permission was revoked while disconnecting.
    }
    emit()
    emitDiagnostic("Bluetooth accessory disconnected from ${displayName(link)}.")
  }

  private fun bluetoothAdapter(): BluetoothAdapter? {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }

  private fun reconnectStoredDevices() {
    val bluetoothAdapter = adapter ?: bluetoothAdapter() ?: return
    val stored = storedAddresses()
    if (stored.isEmpty() && links.isEmpty()) {
      emit()
      return
    }
    for (address in stored) {
      try {
        connect(
          bluetoothAdapter.getRemoteDevice(address),
          reason = "stored-address",
          requireCatalogMatch = false,
          autoReconnect = true,
        )
      } catch (_: IllegalArgumentException) {
        forget(address)
      }
    }
    emit()
  }

  private fun startScanning(reason: String) {
    val scanner = adapter?.bluetoothLeScanner
    if (scanner == null) {
      emit(kindOverride = "unavailable", message = "Bluetooth scanning is unavailable.")
      return
    }
    stopScan()
    loggedScanAddresses.clear()
    scanning = true
    emit()
    emitDiagnostic("Bluetooth accessory scan started ($reason).")
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .build()
    try {
      scanner.startScan(emptyList(), settings, scanCallback)
    } catch (error: SecurityException) {
      scanning = false
      emit(kindOverride = "unavailable", message = "Bluetooth permission is required to scan for a PTT accessory.")
      return
    }
    handler.removeCallbacks(scanTimeout)
    handler.postDelayed(scanTimeout, 8_000)
  }

  private fun stopScan() {
    handler.removeCallbacks(scanTimeout)
    if (!scanning) {
      return
    }
    scanning = false
    try {
      adapter?.bluetoothLeScanner?.stopScan(scanCallback)
    } catch (_: SecurityException) {
      // Permission was revoked while scanning.
    }
  }

  private fun connect(
    device: BluetoothDevice,
    reason: String,
    requireCatalogMatch: Boolean,
    autoReconnect: Boolean,
    advertisedName: String? = null,
    advertisedServices: List<ParcelUuid>? = null,
  ) {
    if (!hasConnectPermission()) {
      emit(kindOverride = "unavailable", message = "Bluetooth permission is required to connect a PTT accessory.")
      return
    }
    val id = device.address
    val profile = BleAccessoryCatalog.match(catalog, advertisedName ?: safeName(device), advertisedServices)
    if (requireCatalogMatch && profile == null && !links.containsKey(id)) {
      return
    }
    val existing = links[id]
    if (existing != null && (existing.kind == "connected" || existing.kind == "connecting") && existing.gatt != null) {
      return
    }
    if (existing == null && links.size >= MAX_LINKS) {
      emitDiagnostic("Bluetooth accessory limit reached ($MAX_LINKS).")
      return
    }
    val link = existing ?: AccessoryLink(id = id, device = device, profile = profile ?: AccessoryScanProfile.vendorNotifyFallback)
    link.device = device
    link.profile = profile ?: link.profile ?: AccessoryScanProfile.vendorNotifyFallback
    link.autoReconnect = autoReconnect
    link.kind = "connecting"
    link.message = null
    resetSubscribe(link)
    links[id] = link
    remember(id)
    emit()
    emitDiagnostic("Bluetooth accessory connecting ($reason) to ${displayName(link)}.")
    try {
      existing?.gatt?.close()
      link.gatt = if (Build.VERSION.SDK_INT >= 23) {
        device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
      } else {
        device.connectGatt(context, false, gattCallback)
      }
    } catch (error: SecurityException) {
      emit(kindOverride = "unavailable", message = "Bluetooth permission is required to connect a PTT accessory.")
    }
  }

  private fun resetSubscribe(link: AccessoryLink) {
    link.cccdQueue.clear()
    link.writingCccd = false
    link.enabledNotifyCount = 0
    cancelSubscribeTimeout(link)
  }

  private fun handleValue(link: AccessoryLink, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
    val serviceUuid = characteristic.service?.uuid
    if (
      (serviceUuid != null && BleAccessoryCatalog.shouldSkipService(serviceUuid)) ||
      BleAccessoryCatalog.shouldSkipCharacteristic(characteristic.uuid)
    ) {
      val text = value.toString(Charsets.UTF_8).trim()
      if (text.isNotEmpty()) {
        emitDiagnostic("DIS ${characteristic.uuid} $text")
      }
      return
    }
    emitDiagnostic("notify ${displayName(link)} ${characteristic.uuid} ${BleAccessoryCatalog.hex(value)}")
    listener?.onNotify(
      link.id,
      value.map { it.toInt() and 0xff },
      serviceUuid?.toString().orEmpty(),
      characteristic.uuid.toString(),
    )
  }

  private fun advertisedName(result: ScanResult): String? {
    val fromRecord = result.scanRecord?.deviceName?.trim()?.takeIf { it.isNotEmpty() }
    return fromRecord ?: safeName(result.device)
  }

  private fun displayName(link: AccessoryLink): String {
    val name = safeName(link.device)
    return if (name.isNullOrEmpty()) link.profile?.id ?: "Bluetooth accessory" else name
  }

  private fun safeName(device: BluetoothDevice?): String? {
    if (device == null) {
      return null
    }
    return try {
      device.name?.trim()?.takeIf { it.isNotEmpty() }
    } catch (_: SecurityException) {
      null
    }
  }

  private fun hasConnectPermission(): Boolean {
    if (Build.VERSION.SDK_INT < 31) {
      return true
    }
    return context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun hasScanPermission(): Boolean {
    return if (Build.VERSION.SDK_INT >= 31) {
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    }
  }

  private fun aggregateKind(): String {
    if (scanning) {
      return "scanning"
    }
    val kinds = links.values.map { it.kind }
    if (kinds.contains("connected")) return "connected"
    if (kinds.contains("connecting")) return "connecting"
    if (kinds.contains("unavailable")) return "unavailable"
    if (kinds.contains("failed") && !kinds.contains("connected")) return "failed"
    if (kinds.contains("disconnected")) return "disconnected"
    return "idle"
  }

  private fun emit(kindOverride: String? = null, message: String? = null) {
    listener?.onState(snapshot(message, kindOverride))
  }

  private fun snapshot(message: String?, kindOverride: String? = null): Map<String, Any?> {
    val connectedNames = links.values
      .filter { it.kind == "connected" || it.kind == "connecting" }
      .map { displayName(it) }
      .filter { it.isNotBlank() }
      .joinToString(", ")
    val payload = mutableMapOf<String, Any?>(
      "kind" to (kindOverride ?: aggregateKind()),
      "scanning" to scanning,
      "devices" to links.values.map { deviceSnapshot(it) },
    )
    if (connectedNames.isNotEmpty()) {
      payload["name"] = connectedNames
    }
    if (!message.isNullOrEmpty()) {
      payload["message"] = message
    }
    return payload
  }

  private fun deviceSnapshot(link: AccessoryLink): Map<String, Any?> {
    val payload = mutableMapOf<String, Any?>(
      "id" to link.id,
      "kind" to link.kind,
      "name" to displayName(link),
    )
    link.profile?.id?.takeIf { it.isNotEmpty() }?.let { payload["profileId"] = it }
    link.message?.takeIf { it.isNotEmpty() }?.let { payload["message"] = it }
    return payload
  }

  private fun emitDiagnostic(message: String) {
    listener?.onDiagnostic(message)
  }

  private fun storedAddresses(): Set<String> =
    preferences.getStringSet(STORED_ADDRESSES, emptySet())?.toSet() ?: emptySet()

  private fun remember(address: String) {
    val next = storedAddresses().toMutableSet()
    if (next.add(address)) {
      preferences.edit().putStringSet(STORED_ADDRESSES, next).apply()
    }
  }

  private fun forget(address: String) {
    val next = storedAddresses().toMutableSet()
    if (next.remove(address)) {
      preferences.edit().putStringSet(STORED_ADDRESSES, next).apply()
    }
  }

  private fun clearStoredAddresses() {
    preferences.edit().remove(STORED_ADDRESSES).remove(STORED_ADDRESS).apply()
  }

  private fun migrateStoredAddress() {
    if (storedAddresses().isNotEmpty()) {
      return
    }
    val legacy = preferences.getString(STORED_ADDRESS, null) ?: return
    preferences.edit().putStringSet(STORED_ADDRESSES, setOf(legacy)).remove(STORED_ADDRESS).apply()
  }

  private fun cancelSubscribeTimeout(link: AccessoryLink) {
    link.subscribeTimeout?.let { handler.removeCallbacks(it) }
    link.subscribeTimeout = null
  }

  private fun armSubscribeTimeout(link: AccessoryLink) {
    cancelSubscribeTimeout(link)
    val id = link.id
    val timeout = Runnable {
      val current = links[id] ?: return@Runnable
      if (current.kind != "connecting") {
        return@Runnable
      }
      if (current.enabledNotifyCount > 0) {
        current.kind = "connected"
        current.message = null
        emit()
        emitDiagnostic("Bluetooth accessory notifications enabled on ${displayName(current)} (${current.enabledNotifyCount}).")
      } else {
        current.kind = "failed"
        current.message = "The connected accessory does not expose a vendor PTT notify characteristic."
        emit()
      }
    }
    link.subscribeTimeout = timeout
    handler.postDelayed(timeout, 5_000)
  }

  private fun enqueueNotify(link: AccessoryLink, characteristic: BluetoothGattCharacteristic) {
    link.cccdQueue.add(characteristic)
  }

  private fun pumpCccd(link: AccessoryLink, gatt: BluetoothGatt) {
    if (link.writingCccd) {
      return
    }
    val next = link.cccdQueue.poll()
    if (next == null) {
      cancelSubscribeTimeout(link)
      if (link.enabledNotifyCount > 0) {
        link.kind = "connected"
        link.message = null
        emit()
        emitDiagnostic("Bluetooth accessory notifications enabled on ${displayName(link)} (${link.enabledNotifyCount}).")
      } else {
        link.kind = "failed"
        link.message = "The connected accessory does not expose a vendor PTT notify characteristic."
        emit()
      }
      return
    }
    try {
      gatt.setCharacteristicNotification(next, true)
    } catch (_: SecurityException) {
      emit(kindOverride = "unavailable", message = "Bluetooth permission is required to connect a PTT accessory.")
      return
    }
    val descriptor = next.getDescriptor(CCCD_UUID)
    if (descriptor == null) {
      link.enabledNotifyCount += 1
      pumpCccd(link, gatt)
      return
    }
    val payload = if (BleAccessoryCatalog.prefersIndicate(next)) {
      BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
    } else {
      BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    }
    link.writingCccd = true
    val accepted = try {
      if (Build.VERSION.SDK_INT >= 33) {
        gatt.writeDescriptor(descriptor, payload) == BluetoothGatt.GATT_SUCCESS
      } else {
        @Suppress("DEPRECATION")
        descriptor.value = payload
        @Suppress("DEPRECATION")
        gatt.writeDescriptor(descriptor)
      }
    } catch (_: SecurityException) {
      link.writingCccd = false
      emit(kindOverride = "unavailable", message = "Bluetooth permission is required to connect a PTT accessory.")
      return
    }
    if (!accepted) {
      link.writingCccd = false
      emitDiagnostic("CCCD write not accepted for ${next.uuid}")
      pumpCccd(link, gatt)
    }
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val name = advertisedName(result)
      val services = result.scanRecord?.serviceUuids
      val address = result.device.address
      if (loggedScanAddresses.add(address) && !name.isNullOrEmpty()) {
        val serviceList = services?.joinToString(",") { it.uuid.toString() }.orEmpty()
        emitDiagnostic("Scan saw $name services=$serviceList")
      }
      val profile = BleAccessoryCatalog.match(catalog, name, services) ?: return
      connect(
        result.device,
        reason = "scan",
        requireCatalogMatch = true,
        autoReconnect = true,
        advertisedName = name,
        advertisedServices = services,
      )
      if (links.size >= MAX_LINKS) {
        stopScan()
        emit()
      }
    }

    override fun onScanFailed(errorCode: Int) {
      scanning = false
      emit(kindOverride = "failed", message = "Bluetooth scan failed ($errorCode).")
    }
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      handler.post {
        val id = gatt.device.address
        if (newState == BluetoothProfile.STATE_CONNECTED && !links.containsKey(id) && links.size >= MAX_LINKS) {
          try {
            gatt.close()
          } catch (_: SecurityException) {
            // Permission was revoked while dropping an overflow connection.
          }
          emitDiagnostic("Bluetooth accessory limit reached ($MAX_LINKS).")
          return@post
        }
        val link = links[id] ?: AccessoryLink(id = id, device = gatt.device).also { links[id] = it }
        link.device = gatt.device
        link.gatt = gatt
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          remember(id)
          link.kind = "connecting"
          emitDiagnostic("Bluetooth accessory connected to ${displayName(link)}.")
          try {
            gatt.discoverServices()
          } catch (_: SecurityException) {
            emit(kindOverride = "unavailable", message = "Bluetooth permission is required to connect a PTT accessory.")
          }
          emit()
          return@post
        }
        if (newState == BluetoothProfile.STATE_DISCONNECTED) {
          listener?.onButton(id, false)
          cancelSubscribeTimeout(link)
          try {
            gatt.close()
          } catch (_: SecurityException) {
            // Already gone.
          }
          link.gatt = null
          val name = displayName(link)
          if (link.autoReconnect && storedAddresses().contains(id)) {
            link.kind = "disconnected"
            emit()
            emitDiagnostic("Bluetooth accessory disconnected from $name. Reconnecting.")
            connect(link.device, reason = "auto-reconnect", requireCatalogMatch = false, autoReconnect = true)
          } else {
            links.remove(id)
            emit()
            emitDiagnostic("Bluetooth accessory disconnected from $name.")
          }
        }
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      handler.post {
        val link = links[gatt.device.address] ?: return@post
        if (status != BluetoothGatt.GATT_SUCCESS) {
          link.kind = "failed"
          link.message = "Bluetooth services could not be discovered."
          emit()
          return@post
        }
        val profile = link.profile
          ?: BleAccessoryCatalog.match(catalog, safeName(gatt.device), null)
          ?: AccessoryScanProfile.vendorNotifyFallback
        link.profile = profile
        resetSubscribe(link)
        armSubscribeTimeout(link)

        if (!profile.isVendorNotify) {
          val service = profile.serviceUuid?.let { gatt.getService(it) }
          val characteristic = profile.characteristicUuid?.let { uuid ->
            service?.getCharacteristic(uuid)
          } ?: service?.characteristics?.firstOrNull { BleAccessoryCatalog.canNotify(it) }
          if (characteristic == null) {
            cancelSubscribeTimeout(link)
            link.kind = "failed"
            link.message = "The connected accessory does not expose the expected PTT characteristic."
            emit()
            return@post
          }
          enqueueNotify(link, characteristic)
          pumpCccd(link, gatt)
          return@post
        }

        val services = gatt.services.orEmpty()
        if (services.isEmpty()) {
          cancelSubscribeTimeout(link)
          link.kind = "failed"
          link.message = "The connected accessory does not expose GATT services."
          emit()
          return@post
        }
        for (service in services) {
          val summary = service.characteristics.orEmpty()
            .joinToString(",") { "${it.uuid}(${BleAccessoryCatalog.propertyLabel(it)})" }
          emitDiagnostic("GATT ${displayName(link)} ${service.uuid} chars: $summary")
          if (BleAccessoryCatalog.isDeviceInformation(service.uuid)) {
            service.characteristics.orEmpty().firstOrNull { it.uuid == MANUFACTURER_UUID }?.let { characteristic ->
              try {
                gatt.readCharacteristic(characteristic)
              } catch (_: SecurityException) {
                // Best-effort Device Information read.
              }
            }
            continue
          }
          if (BleAccessoryCatalog.shouldSkipService(service.uuid)) {
            continue
          }
          for (characteristic in service.characteristics.orEmpty()) {
            if (
              BleAccessoryCatalog.canNotify(characteristic) &&
              !BleAccessoryCatalog.shouldSkipCharacteristic(characteristic.uuid)
            ) {
              enqueueNotify(link, characteristic)
            }
          }
        }
        if (link.cccdQueue.isEmpty()) {
          cancelSubscribeTimeout(link)
          link.kind = "failed"
          link.message = "The connected accessory does not expose a vendor PTT notify characteristic."
          emit()
          return@post
        }
        pumpCccd(link, gatt)
      }
    }

    override fun onDescriptorWrite(
      gatt: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int,
    ) {
      handler.post {
        val link = links[gatt.device.address] ?: return@post
        link.writingCccd = false
        if (status == BluetoothGatt.GATT_SUCCESS) {
          link.enabledNotifyCount += 1
          emitDiagnostic("notify enabled ${displayName(link)} ${descriptor.characteristic?.uuid}")
        } else {
          emitDiagnostic("notify failed ${descriptor.characteristic?.uuid} status=$status")
        }
        pumpCccd(link, gatt)
      }
    }

    override fun onCharacteristicRead(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int,
    ) {
      @Suppress("DEPRECATION")
      val value = characteristic.value ?: return
      handler.post {
        val link = links[gatt.device.address] ?: return@post
        handleValue(link, characteristic, value)
      }
    }

    override fun onCharacteristicRead(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
      status: Int,
    ) {
      handler.post {
        val link = links[gatt.device.address] ?: return@post
        handleValue(link, characteristic, value)
      }
    }

    @Deprecated("Deprecated in Android 13")
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
    ) {
      @Suppress("DEPRECATION")
      val value = characteristic.value ?: return
      handler.post {
        val link = links[gatt.device.address] ?: return@post
        handleValue(link, characteristic, value)
      }
    }

    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
    ) {
      handler.post {
        val link = links[gatt.device.address] ?: return@post
        handleValue(link, characteristic, value)
      }
    }
  }

  companion object {
    private const val PREFS = "talktome.ble"
    private const val STORED_ADDRESS = "peripheralAddress"
    private const val STORED_ADDRESSES = "peripheralAddresses"
    private const val MAX_LINKS = 8
    private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    private val MANUFACTURER_UUID: UUID = UUID.fromString("00002a29-0000-1000-8000-00805f9b34fb")
  }
}
