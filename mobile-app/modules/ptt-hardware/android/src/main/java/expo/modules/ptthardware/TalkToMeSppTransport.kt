package expo.modules.ptthardware

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.os.Handler
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

@SuppressLint("MissingPermission")
class TalkToMeSppTransport(
  private val adapter: () -> BluetoothAdapter?,
  private val handler: Handler,
  private val listener: Listener,
) {
  interface Listener {
    fun onSppBytes(deviceId: String, name: String, text: String, data: List<Int>)
    fun onSppStateChanged()
    fun onSppDisconnected(deviceId: String, heldButtons: Set<String>)
    fun onDiagnostic(message: String)
  }

  private class Link(
    val id: String,
    val device: BluetoothDevice,
    var socket: BluetoothSocket? = null,
    var thread: Thread? = null,
    var status: String = "connecting",
    var message: String? = null,
    var autoReconnect: Boolean = true,
    var pairingProbe: Boolean = false,
    val held: MutableSet<String> = mutableSetOf(),
    var backoffMs: Long = 1_000,
  )

  private val links = mutableMapOf<String, Link>()
  private val running = AtomicBoolean(false)

  fun snapshot(): List<Map<String, Any?>> {
    return links.values.map { link ->
      val payload = mutableMapOf<String, Any?>(
        "id" to sppId(link.device.address),
        "kind" to "spp",
        "name" to displayName(link.device),
        "status" to link.status,
      )
      link.message?.let { payload["message"] = it }
      payload
    }
  }

  fun listBonded(): List<Map<String, Any?>> {
    val bonded = try {
      adapter()?.bondedDevices ?: return emptyList()
    } catch (_: SecurityException) {
      return emptyList()
    }
    return bonded.map { device ->
      val name = displayName(device)
      mapOf(
        "id" to sppId(device.address),
        "name" to name,
        "pttHint" to name.contains("PTT"),
      )
    }
  }

  fun startPairing(boundIds: Set<String>) {
    running.set(true)
    val bonded = try {
      adapter()?.bondedDevices ?: emptySet()
    } catch (_: SecurityException) {
      emptySet()
    }
    for (device in bonded) {
      val id = sppId(device.address)
      if (boundIds.contains(id) || boundIds.contains(device.address) || links.containsKey(device.address)) {
        continue
      }
      if (!displayName(device).contains("PTT")) {
        continue
      }
      connect(device, autoReconnect = false, pairingProbe = true)
    }
  }

  fun connectStored(id: String, persist: Boolean, pairingProbe: Boolean = false) {
    running.set(true)
    val address = nativeAddress(id)
    val bluetooth = adapter() ?: return
    try {
      connect(bluetooth.getRemoteDevice(address), autoReconnect = persist, pairingProbe = pairingProbe)
    } catch (_: IllegalArgumentException) {
      listener.onDiagnostic("SPP address is invalid: $address")
    }
  }

  fun accept(id: String) {
    val address = nativeAddress(id)
    val link = links[address]
    if (link != null) {
      link.pairingProbe = false
      link.autoReconnect = true
      return
    }
    connectStored(id, persist = true)
  }

  fun dropPairingProbes(keeping: String? = null) {
    val keep = keeping?.let { nativeAddress(it) }
    for (link in links.values.toList()) {
      if (link.pairingProbe && link.device.address != keep) {
        close(link, reconnect = false, emitRelease = false)
        links.remove(link.device.address)
      }
    }
    listener.onSppStateChanged()
  }

  fun disconnect(id: String?) {
    val trimmed = id?.trim().orEmpty()
    if (trimmed.isEmpty()) {
      for (link in links.values.toList()) {
        close(link, reconnect = false, emitRelease = true)
      }
      links.clear()
      listener.onSppStateChanged()
      return
    }
    val address = nativeAddress(trimmed)
    val link = links.remove(address) ?: return
    close(link, reconnect = false, emitRelease = true)
    listener.onSppStateChanged()
  }

  fun stop() {
    running.set(false)
    disconnect(null)
  }

  fun noteButton(deviceId: String, button: String, pressed: Boolean) {
    val link = links[nativeAddress(deviceId)] ?: return
    if (pressed) {
      link.held.add(button)
    } else {
      link.held.remove(button)
    }
  }

  private fun connect(
    device: BluetoothDevice,
    autoReconnect: Boolean,
    pairingProbe: Boolean,
  ) {
    val existing = links[device.address]
    if (existing?.status == "connected" || existing?.thread?.isAlive == true) {
      existing.autoReconnect = autoReconnect
      existing.pairingProbe = pairingProbe
      return
    }
    val link = existing ?: Link(id = device.address, device = device)
    link.autoReconnect = autoReconnect
    link.pairingProbe = pairingProbe
    link.status = "connecting"
    link.message = null
    links[device.address] = link
    listener.onSppStateChanged()
    listener.onDiagnostic("SPP connecting to ${displayName(device)}.")
    val thread = Thread({
      runReader(link)
    }, "talktome-spp-${device.address}")
    link.thread = thread
    thread.start()
  }

  private fun runReader(link: Link) {
    var socket: BluetoothSocket? = null
    try {
      socket = link.device.createRfcommSocketToServiceRecord(SPP_UUID)
      adapter()?.cancelDiscovery()
      socket.connect()
      link.socket = socket
      link.status = "connected"
      link.message = null
      link.backoffMs = 1_000
      handler.post {
        listener.onSppStateChanged()
        listener.onDiagnostic("SPP connected to ${displayName(link.device)}.")
      }
      val input = socket.inputStream
      val buffer = ByteArray(256)
      while (running.get() && !Thread.currentThread().isInterrupted) {
        val count = input.read(buffer)
        if (count < 0) {
          break
        }
        if (count == 0) {
          continue
        }
        val slice = buffer.copyOf(count)
        val text = slice.toString(Charsets.US_ASCII)
        val data = slice.map { it.toInt() and 0xff }
        handler.post {
          listener.onSppBytes(sppId(link.device.address), displayName(link.device), text, data)
        }
      }
    } catch (error: IOException) {
      val wasConnecting = link.status == "connecting"
      val message = error.message.orEmpty()
      val busy = wasConnecting && (
        message.contains("busy", ignoreCase = true) ||
          message.contains("read failed", ignoreCase = true) ||
          message.contains("closed", ignoreCase = true) ||
          message.contains("connected", ignoreCase = true)
      )
      link.status = "failed"
      link.message = if (busy) {
        "Another app is using this button."
      } else {
        error.message ?: "SPP connection failed."
      }
      if (!message.contains("closed", ignoreCase = true)) {
        handler.post {
          listener.onDiagnostic("SPP ${displayName(link.device)}: ${link.message}")
        }
      }
    } catch (error: SecurityException) {
      link.status = "failed"
      link.message = "Bluetooth permission is required for serial PTT accessories."
    } finally {
      val held = link.held.toSet()
      link.held.clear()
      try {
        socket?.close()
      } catch (_: Exception) {
      }
      link.socket = null
      val reconnect = running.get() && link.autoReconnect && !link.pairingProbe
      if (!reconnect) {
        if (link.pairingProbe) {
          links.remove(link.device.address)
        } else if (link.status != "failed") {
          link.status = "disconnected"
        }
      } else {
        link.status = "disconnected"
      }
      handler.post {
        if (held.isNotEmpty()) {
          listener.onSppDisconnected(sppId(link.device.address), held)
        }
        listener.onSppStateChanged()
        if (reconnect) {
          scheduleReconnect(link)
        }
      }
    }
  }

  private fun scheduleReconnect(link: Link) {
    val delay = link.backoffMs
    link.backoffMs = (link.backoffMs * 2).coerceAtMost(15_000)
    handler.postDelayed({
      if (!running.get() || !link.autoReconnect) {
        return@postDelayed
      }
      connect(link.device, autoReconnect = true, pairingProbe = false)
    }, delay)
  }

  private fun close(link: Link, reconnect: Boolean, emitRelease: Boolean) {
    link.autoReconnect = reconnect
    val held = link.held.toSet()
    link.held.clear()
    try {
      link.socket?.close()
    } catch (_: Exception) {
    }
    link.thread?.interrupt()
    if (emitRelease && held.isNotEmpty()) {
      listener.onSppDisconnected(sppId(link.device.address), held)
    }
  }

  private fun displayName(device: BluetoothDevice): String {
    return try {
      device.name?.trim()?.takeIf { it.isNotEmpty() } ?: device.address
    } catch (_: SecurityException) {
      device.address
    }
  }

  companion object {
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private const val TAG = "TalkToMeSpp"

    fun sppId(address: String): String = if (address.startsWith("spp:")) address else "spp:$address"

    fun nativeAddress(id: String): String = id.removePrefix("spp:")
  }
}
