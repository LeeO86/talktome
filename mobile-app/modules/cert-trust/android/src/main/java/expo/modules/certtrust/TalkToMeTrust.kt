package expo.modules.certtrust

import com.facebook.react.modules.network.OkHttpClientProvider
import java.net.Socket
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedTrustManager
import javax.net.ssl.X509TrustManager

object TalkToMeTrust {
  private val pins = LinkedHashMap<String, String>()
  private val lock = Any()
  @Volatile private var installed = false

  @Synchronized
  fun replacePins(next: List<Map<String, String>>) {
    synchronized(lock) {
      pins.clear()
      for (item in next) {
        val host = item["hostname"]?.lowercase()?.trim().orEmpty()
        val sha = item["sha256"]?.replace(Regex("[^0-9a-fA-F]"), "")?.lowercase().orEmpty()
        if (host.isNotEmpty() && sha.length == 64) {
          pins[host] = sha
        }
      }
    }
  }

  @Synchronized
  fun pinFor(host: String): String? = synchronized(lock) { pins[host.lowercase()] }

  fun hasPinForFingerprint(actual: String): Boolean = synchronized(lock) { pins.containsValue(actual) }

  @Synchronized
  fun install() {
    if (installed) {
      return
    }
    installed = true
    val trustManager = PinnedTrustManager()
    val context = SSLContext.getInstance("TLS")
    context.init(null, arrayOf(trustManager), null)
    val defaultVerifier = HttpsURLConnection.getDefaultHostnameVerifier()
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder()
        .sslSocketFactory(context.socketFactory, trustManager)
        .hostnameVerifier(PinnedHostnameVerifier(defaultVerifier))
        .build()
    }
  }
}

internal fun sha256Hex(bytes: ByteArray): String {
  val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
  return digest.joinToString("") { byte -> "%02x".format(byte) }
}

private class PinnedHostnameVerifier(
  private val defaultVerifier: HostnameVerifier,
) : HostnameVerifier {
  override fun verify(hostname: String, session: javax.net.ssl.SSLSession): Boolean {
    val pin = TalkToMeTrust.pinFor(hostname) ?: return defaultVerifier.verify(hostname, session)
    val cert = session.peerCertificates.firstOrNull() as? X509Certificate ?: return false
    return sha256Hex(cert.encoded) == pin
  }
}

private class PinnedTrustManager : X509ExtendedTrustManager() {
  private val defaultTrustManager: X509TrustManager = defaultTrustManager()

  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
    defaultTrustManager.checkClientTrusted(chain, authType)
  }

  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String, socket: Socket) {
    defaultTrustManager.checkClientTrusted(chain, authType)
  }

  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String, engine: SSLEngine) {
    defaultTrustManager.checkClientTrusted(chain, authType)
  }

  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    checkServer(chain, authType, null)
  }

  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String, socket: Socket) {
    // Must use the in-progress handshake session here: `socket.session` blocks
    // until the handshake finishes, but Conscrypt invokes this callback from
    // inside the handshake, so reading it deadlocks every TLS connection.
    val host = runCatching { (socket as? SSLSocket)?.handshakeSession?.peerHost }.getOrNull()
    checkServer(chain, authType, host)
  }

  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String, engine: SSLEngine) {
    checkServer(chain, authType, engine.peerHost)
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = defaultTrustManager.acceptedIssuers

  private fun checkServer(chain: Array<X509Certificate>, authType: String, hostname: String?) {
    try {
      defaultTrustManager.checkServerTrusted(chain, authType)
    } catch (error: CertificateException) {
      val leaf = chain.firstOrNull() ?: throw error
      val actual = sha256Hex(leaf.encoded)
      val hosts = linkedSetOf<String>()
      if (!hostname.isNullOrBlank()) {
        hosts.add(hostname.lowercase())
      }
      hosts.addAll(leaf.subjectAlternativeNames())
      val matched =
        if (hosts.isEmpty()) {
          TalkToMeTrust.hasPinForFingerprint(actual)
        } else {
          hosts.any { TalkToMeTrust.pinFor(it) == actual }
        }
      if (matched) {
        return
      }
      throw error
    }
  }
}

private fun defaultTrustManager(): X509TrustManager {
  val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
  factory.init(null as KeyStore?)
  return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
}

private fun X509Certificate.subjectAlternativeNames(): List<String> {
  val alt = this.subjectAlternativeNames ?: return emptyList()
  return alt.mapNotNull { entry ->
    val value = entry.getOrNull(1) as? String
    value?.lowercase()
  }
}
