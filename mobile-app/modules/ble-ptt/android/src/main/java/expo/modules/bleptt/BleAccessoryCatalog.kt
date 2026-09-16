package expo.modules.bleptt

import android.bluetooth.BluetoothGattCharacteristic
import android.os.ParcelUuid
import org.json.JSONArray
import java.util.UUID

data class AccessoryScanProfile(
  val id: String,
  val names: Set<String>,
  val nameIncludes: List<String>,
  val serviceUuid: UUID?,
  val characteristicUuid: UUID?,
  val discovery: String,
) {
  val isVendorNotify: Boolean
    get() = discovery == "vendor-notify" || serviceUuid == null || characteristicUuid == null

  companion object {
    val vendorNotifyFallback = AccessoryScanProfile(
      id = "unknown",
      names = emptySet(),
      nameIncludes = emptyList(),
      serviceUuid = null,
      characteristicUuid = null,
      discovery = "vendor-notify",
    )
    val FFE0: UUID = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb")
  }
}

object BleAccessoryCatalog {
  const val DEFAULT_JSON =
    """[{"id":"ptt-z01","names":["PTT-Z01"],"nameIncludes":[],"serviceUuid":"FFE0","characteristicUuid":"FFE1","discovery":"fixed"},{"id":"herda-hb980-plus","names":["HB9800D","HB980D","HB980-PLUS","HB980PLUS","HB980D-Zello","Herdt980D-Zello","Herda PTT"],"nameIncludes":["HB980","HERDA PTT","HERDAPTT","HERDA-PTT","HERDT980","HERDA980"],"serviceUuid":"","characteristicUuid":"","discovery":"vendor-notify"}]"""

  fun parse(json: String?): List<AccessoryScanProfile> {
    val raw = json?.trim().orEmpty().ifEmpty { DEFAULT_JSON }
    return try {
      val array = JSONArray(raw)
      if (array.length() == 0) {
        if (raw == DEFAULT_JSON) emptyList() else parse(DEFAULT_JSON)
      } else {
        buildList {
          for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val id = item.optString("id").trim()
            if (id.isEmpty()) {
              continue
            }
            val names = jsonStringList(item.optJSONArray("names")).map { it.uppercase() }.toSet()
            val nameIncludes = jsonStringList(item.optJSONArray("nameIncludes")).map { it.uppercase() }
            val service = parseUuid(item.optString("serviceUuid"))
            val characteristic = parseUuid(item.optString("characteristicUuid"))
            val discovery = item.optString("discovery").ifEmpty {
              if (service == null) "vendor-notify" else "fixed"
            }
            add(
              AccessoryScanProfile(
                id = id,
                names = names,
                nameIncludes = nameIncludes,
                serviceUuid = service,
                characteristicUuid = characteristic,
                discovery = discovery,
              ),
            )
          }
        }
      }
    } catch (_: Exception) {
      if (raw == DEFAULT_JSON) emptyList() else parse(DEFAULT_JSON)
    }
  }

  fun match(
    profiles: List<AccessoryScanProfile>,
    name: String?,
    advertisedServices: List<ParcelUuid>?,
  ): AccessoryScanProfile? {
    val normalized = name?.trim()?.uppercase().orEmpty()
    if (normalized.isNotEmpty()) {
      profiles.firstOrNull { it.names.contains(normalized) }?.let { return it }
      profiles.firstOrNull { profile ->
        profile.nameIncludes.any { fragment -> normalized.contains(fragment) }
      }?.let { return it }
    }
    val advertised = advertisedServices ?: return null
    return profiles.firstOrNull { profile ->
      val service = profile.serviceUuid ?: return@firstOrNull false
      advertised.any { it.uuid == service }
    }
  }

  fun shouldSkipPairingName(name: String?): Boolean {
    val normalized = name?.trim()?.uppercase().orEmpty()
    if (normalized.isEmpty()) {
      return false
    }
    return PAIRING_SKIP_FRAGMENTS.any { fragment -> normalized.contains(fragment) }
  }

  fun pairingPriority(
    profiles: List<AccessoryScanProfile>,
    name: String?,
    advertisedServices: List<ParcelUuid>?,
  ): Int {
    if (match(profiles, name, advertisedServices) != null) {
      return 0
    }
    if (advertisedServices?.any { it.uuid == AccessoryScanProfile.FFE0 } == true) {
      return 0
    }
    return 1
  }

  fun shouldSkipService(uuid: UUID): Boolean {
    val compact = uuid.toString().replace("-", "").uppercase()
    return compact.startsWith("000018") && compact.endsWith("00001000800000805F9B34FB")
  }

  fun shouldSkipCharacteristic(uuid: UUID): Boolean {
    val compact = uuid.toString().replace("-", "").uppercase()
    return compact.startsWith("00002A") && compact.endsWith("00001000800000805F9B34FB")
  }

  fun isDeviceInformation(uuid: UUID): Boolean = uuid == DIS_UUID

  fun hex(value: ByteArray): String =
    value.joinToString(" ") { String.format("%02X", it.toInt() and 0xff) }

  fun propertyLabel(characteristic: BluetoothGattCharacteristic): String {
    val props = characteristic.properties
    val labels = mutableListOf<String>()
    if (props and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) labels.add("notify")
    if (props and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0) labels.add("indicate")
    if (props and BluetoothGattCharacteristic.PROPERTY_READ != 0) labels.add("read")
    if (props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) labels.add("write")
    if (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) labels.add("write-nr")
    return if (labels.isEmpty()) "none" else labels.joinToString(",")
  }

  fun canNotify(characteristic: BluetoothGattCharacteristic): Boolean {
    val props = characteristic.properties
    return props and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 ||
      props and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0
  }

  fun prefersIndicate(characteristic: BluetoothGattCharacteristic): Boolean {
    val props = characteristic.properties
    return props and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0 &&
      props and BluetoothGattCharacteristic.PROPERTY_NOTIFY == 0
  }

  fun parseUuid(raw: String?): UUID? {
    val trimmed = raw?.trim().orEmpty()
    if (trimmed.isEmpty()) {
      return null
    }
    return try {
      if (trimmed.length == 4) {
        UUID.fromString("0000${trimmed.lowercase()}-0000-1000-8000-00805f9b34fb")
      } else {
        UUID.fromString(trimmed)
      }
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  private fun jsonStringList(array: JSONArray?): List<String> {
    if (array == null) {
      return emptyList()
    }
    return buildList {
      for (index in 0 until array.length()) {
        val value = array.optString(index).trim()
        if (value.isNotEmpty()) {
          add(value)
        }
      }
    }
  }

  val DIS_UUID: UUID = UUID.fromString("0000180a-0000-1000-8000-00805f9b34fb")
  private val PAIRING_SKIP_FRAGMENTS = listOf(
    "IPHONE",
    "IPAD",
    "IPOD",
    "MACBOOK",
    "IMAC",
    "APPLE WATCH",
    "AIRPODS",
    "GALAXY BUDS",
    "PIXEL BUDS",
  )
}
