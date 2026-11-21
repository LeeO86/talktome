package expo.modules.ptthardware

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean

class TalkToMeUsbCdcTransport(
  private val context: Context,
  private val handler: Handler,
  private val listener: Listener,
) {
  interface Listener {
    fun onUsbBytes(deviceId: String, name: String, data: List<Int>)
    fun onUsbStateChanged()
    fun onUsbDisconnected(deviceId: String)
    fun onDiagnostic(message: String)
  }

  private class Link(
    val device: UsbDevice,
    var connection: UsbDeviceConnection? = null,
    var intf: UsbInterface? = null,
    var endpoint: UsbEndpoint? = null,
    var thread: Thread? = null,
    var status: String = "connecting",
    var message: String? = null,
  )

  private val links = mutableMapOf<String, Link>()
  private val running = AtomicBoolean(false)
  private var receiverRegistered = false

  private val permissionReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != ACTION_USB_PERMISSION) {
        return
      }
      val device = intent.device() ?: return
      val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
      if (granted) {
        open(device)
      } else {
        listener.onDiagnostic("USB permission denied for ${device.deviceName}.")
      }
    }
  }

  private val detachReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != UsbManager.ACTION_USB_DEVICE_DETACHED) {
        return
      }
      val device = intent.device() ?: return
      close(usbId(device), emitRelease = true)
    }
  }

  fun snapshot(): List<Map<String, Any?>> {
    return links.values.map { link ->
      val payload = mutableMapOf<String, Any?>(
        "id" to usbId(link.device),
        "kind" to "usb",
        "name" to displayName(link.device),
        "status" to link.status,
      )
      link.message?.let { payload["message"] = it }
      payload
    }
  }

  fun start() {
    if (running.getAndSet(true)) {
      scan()
      return
    }
    registerReceivers()
    scan()
  }

  fun stop() {
    running.set(false)
    for (id in links.keys.toList()) {
      close(id, emitRelease = true)
    }
    unregisterReceivers()
  }

  fun connect(id: String) {
    running.set(true)
    registerReceivers()
    val manager = usbManager() ?: return
    val match = manager.deviceList.values.firstOrNull { usbId(it) == id || it.deviceName == id }
    if (match == null) {
      listener.onDiagnostic("USB accessory $id is not attached.")
      return
    }
    requestOrOpen(match)
  }

  fun disconnect(id: String?) {
    if (id.isNullOrBlank()) {
      for (item in links.keys.toList()) {
        close(item, emitRelease = true)
      }
      return
    }
    close(id, emitRelease = true)
  }

  private fun scan() {
    val manager = usbManager() ?: return
    for (device in manager.deviceList.values) {
      if (cdcInterface(device) != null) {
        requestOrOpen(device)
      }
    }
  }

  private fun requestOrOpen(device: UsbDevice) {
    val manager = usbManager() ?: return
    if (manager.hasPermission(device)) {
      open(device)
      return
    }
    val flags = if (Build.VERSION.SDK_INT >= 31) {
      PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val pending = PendingIntent.getBroadcast(
      context,
      device.deviceId,
      Intent(ACTION_USB_PERMISSION).setPackage(context.packageName),
      flags,
    )
    try {
      manager.requestPermission(device, pending)
      listener.onDiagnostic("Requesting USB permission for ${displayName(device)}.")
    } catch (error: Exception) {
      listener.onDiagnostic("USB permission request failed: ${error.message}")
    }
  }

  private fun open(device: UsbDevice) {
    if (links[usbId(device)]?.status == "connected") {
      return
    }
    val manager = usbManager() ?: return
    val found = cdcInterface(device)
    if (found == null) {
      listener.onDiagnostic("USB ${displayName(device)} has no CDC-DATA interface.")
      return
    }
    val connection = try {
      manager.openDevice(device)
    } catch (error: Exception) {
      listener.onDiagnostic("USB open failed: ${error.message}")
      return
    }
    if (connection == null) {
      listener.onDiagnostic("USB openDevice returned null for ${displayName(device)}.")
      return
    }
    if (!connection.claimInterface(found.first, true)) {
      connection.close()
      listener.onDiagnostic("USB could not claim CDC-DATA on ${displayName(device)}.")
      return
    }
    val link = Link(device = device, connection = connection, intf = found.first, endpoint = found.second)
    link.status = "connected"
    links[usbId(device)] = link
    listener.onUsbStateChanged()
    listener.onDiagnostic("USB CDC connected to ${displayName(device)}.")
    val thread = Thread({
      readLoop(link)
    }, "talktome-usb-${device.deviceId}")
    link.thread = thread
    thread.start()
  }

  private fun readLoop(link: Link) {
    val connection = link.connection ?: return
    val endpoint = link.endpoint ?: return
    val buffer = ByteArray(endpoint.maxPacketSize.coerceAtLeast(16))
    while (running.get() && !Thread.currentThread().isInterrupted) {
      val count = try {
        connection.bulkTransfer(endpoint, buffer, buffer.size, 1_000)
      } catch (_: Exception) {
        break
      }
      if (count <= 0) {
        continue
      }
      val data = buffer.copyOf(count).map { it.toInt() and 0xff }
      handler.post {
        listener.onUsbBytes(usbId(link.device), displayName(link.device), data)
      }
    }
    handler.post {
      close(usbId(link.device), emitRelease = true)
    }
  }

  private fun close(id: String, emitRelease: Boolean) {
    val link = links.remove(id) ?: return
    try {
      link.intf?.let { link.connection?.releaseInterface(it) }
      link.connection?.close()
    } catch (_: Exception) {
    }
    link.thread?.interrupt()
    listener.onUsbStateChanged()
    if (emitRelease) {
      listener.onUsbDisconnected(id)
    }
    listener.onDiagnostic("USB accessory disconnected.")
  }

  private fun cdcInterface(device: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
    for (index in 0 until device.interfaceCount) {
      val intf = device.getInterface(index)
      if (intf.interfaceClass != UsbConstants.USB_CLASS_CDC_DATA && intf.interfaceClass != 10) {
        continue
      }
      for (endpointIndex in 0 until intf.endpointCount) {
        val endpoint = intf.getEndpoint(endpointIndex)
        if (
          endpoint.direction == UsbConstants.USB_DIR_IN &&
          endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK
        ) {
          return intf to endpoint
        }
      }
    }
    return null
  }

  private fun registerReceivers() {
    if (receiverRegistered) {
      return
    }
    ContextCompat.registerReceiver(
      context,
      permissionReceiver,
      IntentFilter(ACTION_USB_PERMISSION),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
    ContextCompat.registerReceiver(
      context,
      detachReceiver,
      IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED),
      ContextCompat.RECEIVER_EXPORTED,
    )
    receiverRegistered = true
  }

  private fun unregisterReceivers() {
    if (!receiverRegistered) {
      return
    }
    try {
      context.unregisterReceiver(permissionReceiver)
    } catch (_: Exception) {
    }
    try {
      context.unregisterReceiver(detachReceiver)
    } catch (_: Exception) {
    }
    receiverRegistered = false
  }

  private fun usbManager(): UsbManager? {
    return context.getSystemService(Context.USB_SERVICE) as? UsbManager
  }

  private fun displayName(device: UsbDevice): String {
    val product = if (Build.VERSION.SDK_INT >= 21) device.productName?.trim() else null
    return product?.takeIf { it.isNotEmpty() } ?: device.deviceName
  }

  private fun Intent.device(): UsbDevice? {
    return if (Build.VERSION.SDK_INT >= 33) {
      getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      getParcelableExtra(UsbManager.EXTRA_DEVICE)
    }
  }

  companion object {
    const val ACTION_USB_PERMISSION = "expo.modules.ptthardware.USB_PERMISSION"

    fun usbId(device: UsbDevice): String = "usb:${device.vendorId}:${device.productId}:${device.deviceName}"
  }
}
