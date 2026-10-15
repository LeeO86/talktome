const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listMediaNetworkInterfaces,
  resolveTransportMediaRoute,
  selectMediaRouteAddress,
  selectMdnsAddresses,
} = require("../src/server/mediaNetwork");

const interfaces = listMediaNetworkInterfaces({
  en0: [{ address: "192.168.10.20", family: "IPv4", internal: false }],
  en7: [{ address: "10.20.30.40", family: 4, internal: false }],
  llw0: [{ address: "169.254.1.5", family: "IPv4", internal: false }],
  lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
});

test("automatic media routing exposes all usable IPv4 interfaces", () => {
  const route = resolveTransportMediaRoute({ env: {}, availableInterfaces: interfaces });
  assert.equal(route.mode, "auto");
  assert.equal(route.announcedAddress, "192.168.10.20");
  assert.deepEqual(route.candidateAddresses, ["192.168.10.20", "10.20.30.40"]);
  assert.deepEqual(route.interfaces.map((entry) => entry.name), ["en0", "en7"]);
});

test("automatic media routing keeps link-local as a last-resort network", () => {
  const linkLocalOnly = interfaces.filter((entry) => entry.linkLocal);
  const route = resolveTransportMediaRoute({ env: {}, availableInterfaces: linkLocalOnly });
  assert.deepEqual(route.candidateAddresses, ["169.254.1.5"]);
});

test("preferred and manual routing remain single-address modes", () => {
  const preferred = resolveTransportMediaRoute({
    env: { TALKTOME_MEDIA_INTERFACE: "en7" },
    availableInterfaces: interfaces,
  });
  assert.equal(preferred.mode, "interface");
  assert.deepEqual(preferred.candidateAddresses, ["10.20.30.40"]);

  const manual = resolveTransportMediaRoute({
    env: { PUBLIC_IP: "203.0.113.20" },
    availableInterfaces: interfaces,
  });
  assert.equal(manual.mode, "manual");
  assert.deepEqual(manual.candidateAddresses, ["203.0.113.20"]);
});

test("bridge requests use the matching local interface in automatic mode", () => {
  const route = resolveTransportMediaRoute({ env: {}, availableInterfaces: interfaces });
  assert.equal(selectMediaRouteAddress(route, "::ffff:10.20.30.40"), "10.20.30.40");
  assert.equal(selectMediaRouteAddress(route, "127.0.0.1"), "192.168.10.20");
});

test("mDNS advertises only the selected local adapter without falling back when unavailable", () => {
  const localAddresses = ["192.168.10.20", "10.20.30.40"];
  const route = resolveTransportMediaRoute({
    env: { TALKTOME_MEDIA_INTERFACE: "en7" }, availableInterfaces: interfaces,
  });
  assert.deepEqual(selectMdnsAddresses(route, localAddresses), ["10.20.30.40"]);
  const missing = resolveTransportMediaRoute({
    env: { TALKTOME_MEDIA_INTERFACE: "en9" }, availableInterfaces: interfaces,
  });
  assert.deepEqual(selectMdnsAddresses(missing, localAddresses), []);
});

test("automatic and manual mDNS keep local addresses rather than announcing a public RTC address", () => {
  const localAddresses = ["192.168.10.20", "10.20.30.40", "192.168.10.20", "::1"];
  for (const env of [{}, { PUBLIC_IP: "203.0.113.20" }, { PUBLIC_IP: "rtc.example.com" }]) {
    const route = resolveTransportMediaRoute({ env, availableInterfaces: interfaces });
    assert.deepEqual(selectMdnsAddresses(route, localAddresses), ["192.168.10.20", "10.20.30.40"]);
  }
});

test("selected adapters expose exactly the chosen networks and keep remaining adapters usable", () => {
  const route = resolveTransportMediaRoute({
    env: { TALKTOME_MEDIA_INTERFACE: " en7, en0, en7, missing " }, availableInterfaces: interfaces,
  });
  assert.equal(route.interfaceName, "en7,en0,missing");
  assert.equal(route.error, null);
  assert.deepEqual(route.candidateAddresses, ["10.20.30.40", "192.168.10.20"]);
  assert.deepEqual(selectMdnsAddresses(route, ["169.254.1.5"]), route.candidateAddresses);
  assert.equal(selectMediaRouteAddress(route, "::ffff:192.168.10.20"), "192.168.10.20");
  assert.equal(selectMediaRouteAddress(route, "169.254.1.5"), "10.20.30.40");
  const missing = resolveTransportMediaRoute({
    env: { TALKTOME_MEDIA_INTERFACE: "missing,other" }, availableInterfaces: interfaces,
  });
  assert.deepEqual(missing.candidateAddresses, []);
  assert.ok(missing.error);
});
