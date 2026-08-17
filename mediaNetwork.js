const net = require("net");

function normalizeSocketAddress(value) {
  let address = String(value || "").trim();
  if (address.startsWith("::ffff:")) address = address.slice(7);
  if (address === "::1") return "127.0.0.1";
  return address;
}

function isLinkLocalIpv4(address) {
  return /^169\.254\./.test(String(address || "").trim());
}

function listMediaNetworkInterfaces(networkInterfaces = {}) {
  const entries = [];
  const seen = new Set();

  for (const [name, candidates] of Object.entries(networkInterfaces || {})) {
    for (const iface of candidates || []) {
      const address = normalizeSocketAddress(iface?.address);
      const family = iface?.family;
      if (!iface || iface.internal || !["IPv4", 4].includes(family) || net.isIP(address) !== 4) continue;
      const key = `${name}\0${address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        name,
        address,
        label: `${name} - ${address}`,
        linkLocal: isLinkLocalIpv4(address),
      });
    }
  }

  return entries;
}

function selectAutomaticMediaInterfaces(availableInterfaces = []) {
  const usable = availableInterfaces.filter((entry) => !entry.linkLocal);
  return usable.length ? usable : availableInterfaces;
}

function resolveTransportMediaRoute({ env = process.env, availableInterfaces = [] } = {}) {
  const explicitPublicIp = typeof env.PUBLIC_IP === "string" ? env.PUBLIC_IP.trim() : "";
  if (explicitPublicIp) {
    return {
      announcedAddress: explicitPublicIp,
      candidateAddresses: [explicitPublicIp],
      interfaces: [],
      mode: "manual",
      interfaceName: "",
      source: env.TALKTOME_MEDIA_NETWORK_SOURCE || "env",
      error: null,
    };
  }

  const preferredInterfaceName = typeof env.TALKTOME_MEDIA_INTERFACE === "string"
    ? env.TALKTOME_MEDIA_INTERFACE.trim()
    : "";
  if (preferredInterfaceName) {
    const match = availableInterfaces.find((entry) => entry.name === preferredInterfaceName);
    if (match) {
      return {
        announcedAddress: match.address,
        candidateAddresses: [match.address],
        interfaces: [match],
        mode: "interface",
        interfaceName: preferredInterfaceName,
        source: env.TALKTOME_MEDIA_NETWORK_SOURCE || "config",
        error: null,
      };
    }
    return {
      announcedAddress: null,
      candidateAddresses: [],
      interfaces: [],
      mode: "interface",
      interfaceName: preferredInterfaceName,
      source: env.TALKTOME_MEDIA_NETWORK_SOURCE || "config",
      error: `Configured media interface "${preferredInterfaceName}" has no usable IPv4 address`,
    };
  }

  const automaticInterfaces = selectAutomaticMediaInterfaces(availableInterfaces);
  const first = automaticInterfaces[0] || null;
  return {
    announcedAddress: first?.address || null,
    candidateAddresses: automaticInterfaces.map((entry) => entry.address),
    interfaces: automaticInterfaces,
    mode: "auto",
    interfaceName: first?.name || "",
    source: env.TALKTOME_MEDIA_NETWORK_SOURCE || "auto",
    error: first ? null : "No usable non-internal IPv4 interface found",
  };
}

function selectMediaRouteAddress(mediaRoute, localAddress) {
  const fallback = String(mediaRoute?.announcedAddress || "").trim();
  if (mediaRoute?.mode !== "auto") return fallback;
  const normalizedLocalAddress = normalizeSocketAddress(localAddress);
  const candidates = Array.isArray(mediaRoute?.candidateAddresses)
    ? mediaRoute.candidateAddresses
    : [];
  return candidates.includes(normalizedLocalAddress) ? normalizedLocalAddress : fallback;
}

module.exports = {
  isLinkLocalIpv4,
  listMediaNetworkInterfaces,
  normalizeSocketAddress,
  resolveTransportMediaRoute,
  selectAutomaticMediaInterfaces,
  selectMediaRouteAddress,
};
