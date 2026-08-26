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
import java.util.UUID

/// Ported GATT map from talktome-apple BluetoothButtonController @ 004d6e76 by Daniel Jocher.
@SuppressLint("MissingPermission")
class TalkToMeBlePttController(private val context: Context) {
  interface Listener {
    fun onState(payload: Map<String, Any?>)
    fun onButton(pressed: Boolean)
    fun onDiagnostic(message: String)
  }

  var listener: Listener? = null

  private val handler = Handler(Looper.getMainLooper())
  private val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private var adapter: BluetoothAdapter? = null
  private var gatt: BluetoothGatt? = null
  private var connectedDevice: BluetoothDevice? = null
  private var stateKind = "idle"
  private var lastPressedValue: Boolean? = null
  private var shouldReconnectAutomatically = true
  private var scanning = false
  private val scanTimeout = Runnable {
    if (stateKind == "scanning") {
      stopScan()
      emit(kind = "failed", message = "No compatible Bluetooth button found.")
      emitDiagnostic("Bluetooth button scan timed out without a matching peripheral.")
    }
  }

  fun currentState(): Map<String, Any?> = snapshot(stateKind, safeName(connectedDevice), null)

  fun start() {
    val bluetoothAdapter = bluetoothAdapter()
    if (bluetoothAdapter == null) {
      emit(kind = "unavailable", message = "This device does not support Bluetooth LE.")
      return
    }
    if (!bluetoothAdapter.isEnabled) {
      emit(kind = "unavailable", message = "Bluetooth is turned off on this phone.")
      return
    }
    if (!hasScanPermission() && !hasConnectPermission()) {
      emit(kind = "idle")
      return
    }
    adapter = bluetoothAdapter
    reconnectStoredDevice(startScanningIfNecessary = true)
  }

  fun scanAndConnect() {
    val bluetoothAdapter = bluetoothAdapter()
    if (bluetoothAdapter == null) {
      emit(kind = "unavailable", message = "This device does not support Bluetooth LE.")
      return
    }
    if (!bluetoothAdapter.isEnabled) {
      emit(kind = "unavailable", message = "Bluetooth is turned off on this phone.")
      return
    }
    if (!hasScanPermission()) {
      emit(kind = "unavailable", message = "Bluetooth permission is required to scan for a PTT button.")
      return
    }
    adapter = bluetoothAdapter
    shouldReconnectAutomatically = true
    startScanning(reason = "manual-connect")
  }

  fun disconnect() {
    shouldReconnectAutomatically = false
    stopScan()
    lastPressedValue = null
    preferences.edit().remove(STORED_ADDRESS).apply()
    val current = gatt
    if (current == null) {
      connectedDevice = null
      emit(kind = "idle")
      emitDiagnostic("Bluetooth button disconnected.")
      return
    }
    current.disconnect()
    current.close()
    gatt = null
    connectedDevice = null
    emit(kind = "idle")
    emitDiagnostic("Bluetooth button disconnected.")
  }

  private fun bluetoothAdapter(): BluetoothAdapter? {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }

  private fun reconnectStoredDevice(startScanningIfNecessary: Boolean) {
    val bluetoothAdapter = adapter ?: bluetoothAdapter() ?: return
    val stored = preferences.getString(STORED_ADDRESS, null)
    if (stored != null) {
      try {
        connect(bluetoothAdapter.getRemoteDevice(stored), reason = "stored-address")
        return
      } catch (_: IllegalArgumentException) {
        preferences.edit().remove(STORED_ADDRESS).apply()
      }
    }
    if (startScanningIfNecessary && stored != null) {
      startScanning(reason = "auto-reconnect")
      return
    }
    emit(kind = "idle")
  }

  private fun startScanning(reason: String) {
    val scanner = adapter?.bluetoothLeScanner
    if (scanner == null) {
      emit(kind = "unavailable", message = "Bluetooth scanning is unavailable.")
      return
    }
    stopScan()
    emit(kind = "scanning")
    emitDiagnostic("Bluetooth button scan started ($reason).")
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .build()
    scanning = true
    try {
      // Unfiltered scan: match FFE0 or the PTT-Z01 name in the callback. Cheap
      // CC2541 buttons often omit the service UUID from the advertisement.
      scanner.startScan(emptyList(), settings, scanCallback)
    } catch (error: SecurityException) {
      scanning = false
      emit(kind = "unavailable", message = "Bluetooth permission is required to scan for a PTT button.")
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

  private fun connect(device: BluetoothDevice, reason: String) {
    if (!hasConnectPermission()) {
      emit(kind = "unavailable", message = "Bluetooth permission is required to connect a PTT button.")
      return
    }
    stopScan()
    shouldReconnectAutomatically = true
    connectedDevice = device
    emit(kind = "connecting", name = displayName(device))
    emitDiagnostic("Bluetooth button connecting ($reason) to ${displayName(device)}.")
    gatt?.close()
    gatt = try {
      if (Build.VERSION.SDK_INT >= 23) {
        device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
      } else {
        device.connectGatt(context, false, gattCallback)
      }
    } catch (error: SecurityException) {
      emit(kind = "unavailable", message = "Bluetooth permission is required to connect a PTT button.")
      null
    }
  }

  private fun handleValue(value: ByteArray) {
    val first = value.firstOrNull()?.toInt()?.and(0xff) ?: return
    val pressed = when (first) {
      0x01, 0xAB -> true
      0x00, 0xCD -> false
      else -> return
    }
    if (lastPressedValue == pressed) {
      return
    }
    lastPressedValue = pressed
    emitDiagnostic("Bluetooth button ${if (pressed) "pressed" else "released"}.")
    listener?.onButton(pressed)
  }

  private fun matchesExpected(device: BluetoothDevice, serviceUuids: List<ParcelUuid>?): Boolean {
    val name = safeName(device)?.uppercase()
    if (name != null && EXPECTED_NAMES.contains(name)) {
      return true
    }
    return serviceUuids?.any { it.uuid == SERVICE_UUID } == true
  }

  private fun displayName(device: BluetoothDevice): String {
    val name = safeName(device)
    return if (name.isNullOrEmpty()) "PTT-Z01" else name
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

  private fun emit(kind: String, name: String? = null, message: String? = null) {
    stateKind = kind
    listener?.onState(snapshot(kind, name, message))
  }

  private fun snapshot(kind: String, name: String?, message: String?): Map<String, Any?> {
    val payload = mutableMapOf<String, Any?>("kind" to kind)
    if (!name.isNullOrEmpty()) {
      payload["name"] = name
    }
    if (!message.isNullOrEmpty()) {
      payload["message"] = message
    }
    return payload
  }

  private fun emitDiagnostic(message: String) {
    listener?.onDiagnostic(message)
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      if (matchesExpected(result.device, result.scanRecord?.serviceUuids)) {
        connect(result.device, reason = "scan")
      }
    }

    override fun onScanFailed(errorCode: Int) {
      emit(kind = "failed", message = "Bluetooth scan failed ($errorCode).")
    }
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      handler.post {
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          preferences.edit().putString(STORED_ADDRESS, gatt.device.address).apply()
          connectedDevice = gatt.device
          lastPressedValue = null
          emitDiagnostic("Bluetooth button connected to ${displayName(gatt.device)}.")
          try {
            gatt.discoverServices()
          } catch (_: SecurityException) {
            emit(kind = "unavailable", message = "Bluetooth permission is required to connect a PTT button.")
          }
          return@post
        }
        if (newState == BluetoothProfile.STATE_DISCONNECTED) {
          val name = displayName(gatt.device)
          gatt.close()
          this@TalkToMeBlePttController.gatt = null
          connectedDevice = null
          lastPressedValue = null
          if (shouldReconnectAutomatically) {
            emit(kind = "disconnected", name = name)
            emitDiagnostic("Bluetooth button disconnected from $name. Reconnecting.")
            reconnectStoredDevice(startScanningIfNecessary = true)
          } else {
            emit(kind = "idle")
            emitDiagnostic("Bluetooth button disconnected from $name.")
          }
        }
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      handler.post {
        val service = gatt.getService(SERVICE_UUID)
        val characteristic = service?.getCharacteristic(CHARACTERISTIC_UUID)
        if (characteristic == null) {
          emit(kind = "failed", message = "The connected accessory does not expose the expected PTT characteristic.")
          return@post
        }
        gatt.setCharacteristicNotification(characteristic, true)
        val descriptor = characteristic.getDescriptor(CCCD_UUID)
        if (descriptor != null) {
          if (Build.VERSION.SDK_INT >= 33) {
            gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
          } else {
            @Suppress("DEPRECATION")
            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            @Suppress("DEPRECATION")
            gatt.writeDescriptor(descriptor)
          }
        } else {
          emit(kind = "connected", name = displayName(gatt.device))
          emitDiagnostic("Bluetooth button notifications enabled on FFE1.")
        }
      }
    }

    override fun onDescriptorWrite(
      gatt: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int,
    ) {
      handler.post {
        if (status != BluetoothGatt.GATT_SUCCESS) {
          emit(kind = "failed", message = "Bluetooth notifications could not be enabled.")
          return@post
        }
        emit(kind = "connected", name = displayName(gatt.device))
        emitDiagnostic("Bluetooth button notifications enabled on FFE1.")
      }
    }

    @Deprecated("Deprecated in Android 13")
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
    ) {
      @Suppress("DEPRECATION")
      val value = characteristic.value ?: return
      handler.post { handleValue(value) }
    }

    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
    ) {
      handler.post { handleValue(value) }
    }
  }

  companion object {
    private const val PREFS = "talktome.ble"
    private const val STORED_ADDRESS = "peripheralAddress"
    private val SERVICE_UUID: UUID = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb")
    private val CHARACTERISTIC_UUID: UUID = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb")
    private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    private val EXPECTED_NAMES = setOf("PTT-Z01")
  }
}
