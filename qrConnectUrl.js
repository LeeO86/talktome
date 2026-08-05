function normalizeConnectUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLocalOnlyConnectUrl(value) {
  const normalized = normalizeConnectUrl(value);
  if (!normalized) return false;

  const hostname = new URL(normalized).hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "");

  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "0.0.0.0"
    || hostname === "::"
    || hostname === "::1"
    || hostname === "0:0:0:0:0:0:0:0"
    || hostname === "0:0:0:0:0:0:0:1"
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    || hostname.endsWith(":127.0.0.1");
}

function selectAdminQrUrl({ configuredUrl, requestUrl, adapterUrl } = {}) {
  const configured = normalizeConnectUrl(configuredUrl);
  const requested = normalizeConnectUrl(requestUrl);
  const adapter = normalizeConnectUrl(adapterUrl);

  if (configured) return configured;
  if (requested && !isLocalOnlyConnectUrl(requested)) return requested;
  return adapter || requested;
}

module.exports = {
  isLocalOnlyConnectUrl,
  normalizeConnectUrl,
  selectAdminQrUrl,
};
