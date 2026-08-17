import CommonCrypto
import ExpoModulesCore
import Foundation
import Security

public final class TalkToMeCertTrustModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TalkToMeCertTrust")

    Function("isAvailable") {
      true
    }

    Function("setPins") { (pins: [[String: String]]) in
      TalkToMePinStore.shared().replacePins(pins)
    }

    AsyncFunction("probe") { (url: String) -> [String: String] in
      try await probeCertificate(url: url)
    }
  }
}

private func probeCertificate(url: String) async throws -> [String: String] {
  guard let target = URL(string: url) else {
    throw Exception(name: "InvalidURL", description: "Could not parse \(url)")
  }

  let delegate = ProbeDelegate()
  let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
  defer { session.invalidateAndCancel() }

  var request = URLRequest(url: target)
  request.httpMethod = "HEAD"
  request.timeoutInterval = 8

  do {
    _ = try await session.data(for: request)
  } catch {
    if delegate.sha256 == nil {
      throw error
    }
  }

  guard let hostname = delegate.hostname, let sha256 = delegate.sha256 else {
    throw Exception(name: "NoCertificate", description: "The server did not present a certificate.")
  }

  var result = ["hostname": hostname, "sha256": sha256]
  if let issuer = delegate.issuer {
    result["issuer"] = issuer
  }
  return result
}

private final class ProbeDelegate: NSObject, URLSessionDelegate {
  var hostname: String?
  var sha256: String?
  var issuer: String?

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    hostname = challenge.protectionSpace.host
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
       let trust = challenge.protectionSpace.serverTrust {
      sha256 = sha256OfTrust(trust)
      issuer = issuerOfTrust(trust)
      completionHandler(.useCredential, URLCredential(trust: trust))
      return
    }
    completionHandler(.performDefaultHandling, nil)
  }
}

private func sha256OfTrust(_ trust: SecTrust) -> String? {
  guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
        let certificate = chain.first else {
    return nil
  }
  let der = SecCertificateCopyData(certificate) as Data
  var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
  der.withUnsafeBytes { buffer in
    _ = CC_SHA256(buffer.baseAddress, CC_LONG(buffer.count), &digest)
  }
  return digest.map { String(format: "%02x", $0) }.joined()
}

private func issuerOfTrust(_ trust: SecTrust) -> String? {
  guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
        let certificate = chain.first else {
    return nil
  }
  return SecCertificateCopySubjectSummary(certificate) as String?
}
