package expo.modules.certtrust

object TalkToMeTrust {
  private val pins = LinkedHashMap<String, String>()

  @Synchronized
  fun replacePins(next: List<Map<String, String>>) {
    pins.clear()
    for (item in next) {
      val host = item["hostname"]?.lowercase()?.trim().orEmpty()
      val sha = item["sha256"]?.replace(Regex("[^0-9a-fA-F]"), "")?.lowercase().orEmpty()
      if (host.isNotEmpty() && sha.length === 64) {
        pins[host] = sha
      }
    }
  }

  @Synchronized
  fun pinFor(host: String): String? = pins[host.lowercase()]

  fun install() {
    // HTTP-stack hook is iOS-first (RCTHTTPRequestHandler category).
  }
}
