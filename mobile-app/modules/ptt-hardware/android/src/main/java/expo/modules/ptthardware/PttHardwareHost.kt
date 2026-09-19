package expo.modules.ptthardware

import android.app.Service
import org.json.JSONArray

data class IntentRule(
  val action: String,
  val button: String,
  val pressed: Boolean?,
  val extraChannelKey: String?,
)

object PttHardwareHost {
  @Volatile
  var controller: TalkToMePttHardwareController? = null

  @JvmStatic
  fun attachService(service: Service) {
    controller?.attachService(service) ?: run {
      pendingService = service
    }
  }

  @JvmStatic
  fun detachService(service: Service) {
    if (pendingService === service) {
      pendingService = null
    }
    controller?.detachService(service)
  }

  @Volatile
  var pendingService: Service? = null
}

fun parseIntentCatalog(json: String?): List<IntentRule> {
  if (json.isNullOrBlank()) {
    return DEFAULT_INTENT_RULES
  }
  return try {
    val array = JSONArray(json)
    val rules = mutableListOf<IntentRule>()
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      val action = item.optString("action").trim()
      val button = item.optString("button").trim()
      if (action.isEmpty() || button.isEmpty()) {
        continue
      }
      val pressed = if (item.has("pressed")) item.optBoolean("pressed") else null
      val extra = item.optString("extraChannelKey").trim().ifEmpty { null }
      rules.add(IntentRule(action, button, pressed, extra))
    }
    if (rules.isEmpty()) DEFAULT_INTENT_RULES else rules
  } catch (_: Exception) {
    DEFAULT_INTENT_RULES
  }
}

fun parseIdList(json: String?): Set<String> {
  if (json.isNullOrBlank()) {
    return emptySet()
  }
  return try {
    val array = JSONArray(json)
    buildSet {
      for (index in 0 until array.length()) {
        val id = array.optString(index).trim()
        if (id.isNotEmpty()) {
          add(id)
        }
      }
    }
  } catch (_: Exception) {
    emptySet()
  }
}

fun extrasMap(intent: android.content.Intent): Map<String, Any?> {
  val extras = intent.extras ?: return emptyMap()
  val mapped = mutableMapOf<String, Any?>()
  for (key in extras.keySet()) {
    mapped[key] = extras.get(key)
  }
  return mapped
}

fun channelFromExtras(extras: Map<String, Any?>, preferredKey: String?): Int? {
  val keys = listOfNotNull(preferredKey, "com.zello.extra.channel", "channel", "extra_channel")
  for (key in keys) {
    val value = extras[key] ?: continue
    when (value) {
      is Number -> return value.toInt()
      is String -> value.toIntOrNull()?.let { return it }
    }
  }
  return null
}

private val DEFAULT_INTENT_RULES = listOf(
  IntentRule("com.zello.ptt.down", "ptt", true, null),
  IntentRule("com.zello.ptt.up", "ptt", false, null),
  IntentRule("com.zello.intent.buttonExtra1.down", "ptt2", true, null),
  IntentRule("com.zello.intent.buttonExtra1.up", "ptt2", false, null),
  IntentRule("com.zello.intent.buttonExtra2.down", "ptt3", true, null),
  IntentRule("com.zello.intent.buttonExtra2.up", "ptt3", false, null),
  IntentRule("com.zello.intent.buttonExtra3.down", "ptt4", true, null),
  IntentRule("com.zello.intent.buttonExtra3.up", "ptt4", false, null),
  IntentRule("com.zello.intent.buttonExtra4.down", "ptt4", true, null),
  IntentRule("com.zello.intent.buttonExtra4.up", "ptt4", false, null),
  IntentRule("com.zello.intent.buttonSOS.down", "sos", true, null),
  IntentRule("com.zello.intent.buttonSOS.up", "sos", false, null),
  IntentRule("com.zello.intent.channelUp", "channelUp", true, null),
  IntentRule("com.zello.intent.channelDown", "channelDown", true, null),
  IntentRule("com.zello.intent.setChannel", "setChannel", true, "com.zello.extra.channel"),
)
