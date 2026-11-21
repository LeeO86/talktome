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

function normalizeMediaInterfaceNames(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map(name => String(name || "").trim()).filter(Boolean))];
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

  const selectedNames = normalizeMediaInterfaceNames(env.TALKTOME_MEDIA_INTERFACE);
  if (selectedNames.length) {
    const matches = selectedNames.map(name => availableInterfaces.find(entry => entry.name === name)).filter(Boolean);
    const candidateAddresses = [...new Set(matches.map(entry => entry.address))];
    return {
      announcedAddress: candidateAddresses[0] || null,
      candidateAddresses,
      interfaces: matches,
      mode: "interface",
      interfaceName: selectedNames.join(","),
      source: env.TALKTOME_MEDIA_NETWORK_SOURCE || "config",
      error: matches.length ? null : `Selected media interfaces "${selectedNames.join(", ")}" have no usable IPv4 address`,
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
  if (!["auto", "interface"].includes(mediaRoute?.mode)) return fallback;
  const normalizedLocalAddress = normalizeSocketAddress(localAddress);
  const candidates = Array.isArray(mediaRoute?.candidateAddresses)
    ? mediaRoute.candidateAddresses
    : [];
  return candidates.includes(normalizedLocalAddress) ? normalizedLocalAddress : fallback;
}

function selectMdnsAddresses(mediaRoute, localAddresses = []) {
  // A public/manual RTC address need not belong to a local network interface.
  // Only a selected local adapter restricts the server's mDNS announcement.
  const addresses = mediaRoute?.mode === "interface"
    ? (mediaRoute.candidateAddresses || [mediaRoute.announcedAddress])
    : localAddresses;
  return [...new Set(addresses.filter((address) => net.isIP(String(address || "")) === 4))];
}

module.exports = {
  normalizeMediaInterfaceNames,
  isLinkLocalIpv4,
  listMediaNetworkInterfaces,
  normalizeSocketAddress,
  resolveTransportMediaRoute,
  selectAutomaticMediaInterfaces,
  selectMediaRouteAddress,
  selectMdnsAddresses,
};
