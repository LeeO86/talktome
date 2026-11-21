const proxyaddr = require("proxy-addr");

const DEFAULT_SSO_HEADER = "x-forwarded-user";
const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const MAX_IDENTITY_LENGTH = 254;

function parseEnabled(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function parseTrustedProxies(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function loadProxySsoConfig(environment = process.env) {
  const enabled = parseEnabled(environment.TALKTOME_SSO_ENABLED);
  const configuredHeader = String(
    environment.TALKTOME_SSO_HEADER || DEFAULT_SSO_HEADER
  ).trim();
  if (!HEADER_NAME_PATTERN.test(configuredHeader)) {
    throw new Error(`Invalid TALKTOME_SSO_HEADER: ${configuredHeader || "(empty)"}`);
  }

  const header = configuredHeader.toLowerCase();
  const trustedProxies = parseTrustedProxies(environment.TALKTOME_SSO_TRUSTED_PROXIES);
  if (enabled && trustedProxies.length === 0) {
    throw new Error(
      "TALKTOME_SSO_TRUSTED_PROXIES is required when trusted-header SSO is enabled"
    );
  }

  let trustProxy = () => false;
  if (trustedProxies.length > 0) {
    try {
      trustProxy = proxyaddr.compile(trustedProxies);
    } catch (error) {
      throw new Error(`Invalid TALKTOME_SSO_TRUSTED_PROXIES: ${error.message}`);
    }
  }

  return {
    enabled,
    header,
    trustedProxies,
    isTrustedProxy(address) {
      if (!address) return false;
      try {
        return trustProxy(String(address));
      } catch {
        return false;
      }
    },
  };
}

function resolveProxySsoIdentity(request, config) {
  if (!config?.enabled) return { status: "disabled", identity: null };

  const remoteAddress = request?.socket?.remoteAddress || "";
  if (!config.isTrustedProxy(remoteAddress)) {
    return { status: "untrusted-proxy", identity: null };
  }

  const rawHeader = request?.headers?.[config.header];
  if (rawHeader === undefined || rawHeader === null || rawHeader === "") {
    return { status: "missing-header", identity: null };
  }
  if (Array.isArray(rawHeader) || typeof rawHeader !== "string") {
    return { status: "invalid-header", identity: null };
  }

  const identity = rawHeader.trim();
  if (
    !identity
    || identity.length > MAX_IDENTITY_LENGTH
    || identity.includes(",")
    || /[\u0000-\u001f\u007f]/.test(identity)
  ) {
    return { status: "invalid-header", identity: null };
  }

  return { status: "authenticated", identity };
}

module.exports = {
  DEFAULT_SSO_HEADER,
  loadProxySsoConfig,
  resolveProxySsoIdentity,
};
