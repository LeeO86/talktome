package expo.modules.ptthardware

import android.Manifest
import android.annotation.SuppressLint
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

@SuppressLint("MissingPermission")
class TalkToMePttHardwareController(private val appContext: Context) {
  interface Listener {
    fun onEvent(
      button: String,
      pressed: Boolean,
      channel: Int?,
      source: String,
      deviceId: String?,
      deviceName: String?,
      raw: String?,
    )
    fun onBytes(source: String, deviceId: String?, deviceName: String?, data: List<Int>, text: String?)
    fun onState(payload: Map<String, Any?>)
    fun onDiagnostic(message: String)
  }

  var listener: Listener? = null

  private val handler = Handler(Looper.getMainLooper())
  private var rules: List<IntentRule> = parseIntentCatalog(null)
  private var receiverRegistered = false
  private var listening = false
  private var pairing = false
  private var pairingBoundIds = emptySet<String>()
  private var pairingTimeout: Runnable? = null
  private var serviceContext: Context? = null

  private val spp = TalkToMeSppTransport(
    adapter = { bluetoothAdapter() },
    handler = handler,
    listener = object : TalkToMeSppTransport.Listener {
      override fun onSppBytes(deviceId: String, name: String, text: String, data: List<Int>) {
        listener?.onBytes("spp", deviceId, name, data, text)
      }

      override fun onSppStateChanged() {
        emit()
      }

      override fun onSppDisconnected(deviceId: String, heldButtons: Set<String>) {
        for (button in heldButtons) {
          emitEvent(button, pressed = false, source = "spp", deviceId = deviceId, deviceName = null, raw = "disconnect")
        }
        if (heldButtons.isEmpty()) {
          emitEvent("ptt", pressed = false, source = "spp", deviceId = deviceId, deviceName = null, raw = "disconnect")
        }
      }

      override fun onDiagnostic(message: String) {
        listener?.onDiagnostic(message)
      }
    },
  )

  private val usb = TalkToMeUsbCdcTransport(
    context = appContext,
    handler = handler,
    listener = object : TalkToMeUsbCdcTransport.Listener {
      override fun onUsbBytes(deviceId: String, name: String, data: List<Int>) {
        listener?.onBytes("usb", deviceId, name, data, null)
      }

      override fun onUsbStateChanged() {
        emit()
      }

      override fun onUsbDisconnected(deviceId: String) {
        emitEvent("ptt", pressed = false, source = "usb", deviceId = deviceId, deviceName = null, raw = "disconnect")
        emitEvent("ptt2", pressed = false, source = "usb", deviceId = deviceId, deviceName = null, raw = "disconnect")
        emitEvent("sos", pressed = false, source = "usb", deviceId = deviceId, deviceName = null, raw = "disconnect")
      }

      override fun onDiagnostic(message: String) {
        listener?.onDiagnostic(message)
      }
    },
  )

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val action = intent?.action ?: return
      val extras = extrasMap(intent)
      val rule = rules.firstOrNull { it.action == action }
      if (rule == null) {
        listener?.onDiagnostic("Unrecognized PTT intent $action extras=${extras.keys}")
        return
      }
      val pressed = rule.pressed ?: !action.endsWith(".up")
      val channel = if (rule.button == "setChannel") channelFromExtras(extras, rule.extraChannelKey) else null
      emitEvent(
        button = rule.button,
        pressed = pressed,
        channel = channel,
        source = "intent",
        deviceId = "onboard",
        deviceName = "This phone",
        raw = action,
      )
    }
  }

  fun currentState(): Map<String, Any?> = snapshot()

  fun setCatalogJson(json: String?) {
    rules = parseIntentCatalog(json)
  }

  fun start() {
    listening = true
    PttHardwareHost.pendingService?.let { serviceContext = it }
    registerReceiver()
    usb.start()
    reconnectStoredSpp()
    emit()
    listener?.onDiagnostic("PTT hardware listening for onboard keys, serial buttons, and USB CDC.")
  }

  fun stop() {
    listening = false
    pairing = false
    cancelPairingTimeout()
    spp.stop()
    usb.stop()
    unregisterReceiver()
    emit()
  }

  fun startPairing(timeoutMs: Int, boundIdsJson: String) {
    start()
    pairingBoundIds = parseIdList(boundIdsJson)
    pairing = true
    spp.startPairing(pairingBoundIds)
    cancelPairingTimeout()
    val timeout = Runnable {
      if (!pairing) {
        return@Runnable
      }
      pairing = false
      spp.dropPairingProbes()
      emit(message = "No PTT button was heard. Hold the button and try again.")
      listener?.onDiagnostic("Hardware pairing timed out.")
    }
    pairingTimeout = timeout
    handler.postDelayed(timeout, timeoutMs.coerceAtLeast(8_000).toLong())
    emit()
    listener?.onDiagnostic("Hardware pairing listening for phone keys and serial PTT.")
  }

  fun cancelPairing() {
    if (!pairing) {
      return
    }
    pairing = false
    cancelPairingTimeout()
    spp.dropPairingProbes()
    emit()
    listener?.onDiagnostic("Hardware pairing cancelled.")
  }

  fun acceptDevice(id: String) {
    pairing = false
    cancelPairingTimeout()
    when {
      id == "onboard" -> spp.dropPairingProbes()
      id.startsWith("usb:") -> {
        usb.connect(id)
        spp.dropPairingProbes()
      }
      else -> {
        spp.accept(id)
        spp.dropPairingProbes(keeping = id)
      }
    }
    emit()
  }

  fun connectDevice(id: String) {
    start()
    when {
      id == "onboard" -> emit()
      id.startsWith("usb:") -> usb.connect(id)
      else -> spp.connectStored(id, persist = true)
    }
  }

  fun disconnectDevice(id: String?) {
    when {
      id.isNullOrBlank() -> {
        spp.disconnect(null)
        usb.disconnect(null)
      }
      id.startsWith("usb:") -> usb.disconnect(id)
      id == "onboard" -> Unit
      else -> spp.disconnect(id)
    }
    emit()
  }

  fun listBondedSerial(): List<Map<String, Any?>> = spp.listBonded()

  fun attachService(service: Service) {
    serviceContext = service
    if (listening) {
      registerReceiver()
    }
  }

  fun detachService(service: Service) {
    if (serviceContext === service) {
      serviceContext = null
      if (listening) {
        registerReceiver()
      }
    }
  }

  fun noteSppButton(deviceId: String, button: String, pressed: Boolean) {
    spp.noteButton(deviceId, button, pressed)
  }

  private fun reconnectStoredSpp() {
    // JS asks connectDevice for each saved SPP accessory after hydrate.
  }

  private fun registerReceiver() {
    unregisterReceiver()
    val filter = IntentFilter()
    for (rule in rules) {
      filter.addAction(rule.action)
    }
    val context = serviceContext ?: appContext
    try {
      ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
      receiverRegistered = true
    } catch (error: Exception) {
      listener?.onDiagnostic("Could not register PTT intent receiver: ${error.message}")
    }
  }

  private fun unregisterReceiver() {
    if (!receiverRegistered) {
      return
    }
    val context = serviceContext ?: appContext
    try {
      context.unregisterReceiver(receiver)
    } catch (_: Exception) {
    }
    receiverRegistered = false
  }

  private fun cancelPairingTimeout() {
    pairingTimeout?.let { handler.removeCallbacks(it) }
    pairingTimeout = null
  }

  private fun emitEvent(
    button: String,
    pressed: Boolean,
    channel: Int? = null,
    source: String,
    deviceId: String?,
    deviceName: String?,
    raw: String?,
  ) {
    listener?.onEvent(button, pressed, channel, source, deviceId, deviceName, raw)
  }

  private fun emit(message: String? = null) {
    listener?.onState(snapshot(message))
  }

  private fun snapshot(message: String? = null): Map<String, Any?> {
    val devices = mutableListOf<Map<String, Any?>>()
    devices.addAll(spp.snapshot())
    devices.addAll(usb.snapshot())
    val payload = mutableMapOf<String, Any?>(
      "listening" to listening,
      "pairing" to pairing,
      "devices" to devices,
    )
    if (!message.isNullOrEmpty()) {
      payload["message"] = message
    }
    return payload
  }

  private fun bluetoothAdapter(): BluetoothAdapter? {
    if (Build.VERSION.SDK_INT >= 31 &&
      appContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
    ) {
      return null
    }
    val manager = appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }
}
