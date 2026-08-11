const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProxySsoConfig, resolveProxySsoIdentity } = require("./proxySso");

function request(remoteAddress, headerValue, header = "x-forwarded-user") {
  return {
    socket: { remoteAddress },
    headers: headerValue === undefined ? {} : { [header]: headerValue },
  };
}

test("trusted-header SSO is disabled by default", () => {
  const config = loadProxySsoConfig({});
  assert.equal(config.enabled, false);
  assert.equal(resolveProxySsoIdentity(request("127.0.0.1", "Adi"), config).status, "disabled");
});

test("enabled SSO requires an explicit trusted proxy allowlist", () => {
  assert.throws(
    () => loadProxySsoConfig({ TALKTOME_SSO_ENABLED: "1" }),
    /TALKTOME_SSO_TRUSTED_PROXIES is required/
  );
});

test("accepts an exact identity from a trusted proxy CIDR", () => {
  const config = loadProxySsoConfig({
    TALKTOME_SSO_ENABLED: "true",
    TALKTOME_SSO_TRUSTED_PROXIES: "172.18.0.0/16, 127.0.0.1",
  });
  const result = resolveProxySsoIdentity(request("::ffff:172.18.4.2", "Adi"), config);
  assert.deepEqual(result, { status: "authenticated", identity: "Adi" });
});

test("ignores spoofed identity headers from untrusted clients", () => {
  const config = loadProxySsoConfig({
    TALKTOME_SSO_ENABLED: "yes",
    TALKTOME_SSO_TRUSTED_PROXIES: "172.18.0.0/16",
  });
  const result = resolveProxySsoIdentity(request("192.168.1.50", "admin"), config);
  assert.deepEqual(result, { status: "untrusted-proxy", identity: null });
});

test("supports a configurable header name", () => {
  const config = loadProxySsoConfig({
    TALKTOME_SSO_ENABLED: "on",
    TALKTOME_SSO_HEADER: "X-Auth-Request-Preferred-Username",
    TALKTOME_SSO_TRUSTED_PROXIES: "loopback",
  });
  const result = resolveProxySsoIdentity(
    request("127.0.0.1", "adi", "x-auth-request-preferred-username"),
    config
  );
  assert.equal(result.identity, "adi");
});

test("rejects ambiguous or malformed identity headers", () => {
  const config = loadProxySsoConfig({
    TALKTOME_SSO_ENABLED: "1",
    TALKTOME_SSO_TRUSTED_PROXIES: "loopback",
  });
  assert.equal(resolveProxySsoIdentity(request("127.0.0.1", "Adi,admin"), config).status, "invalid-header");
  assert.equal(resolveProxySsoIdentity(request("127.0.0.1", ["Adi", "admin"]), config).status, "invalid-header");
});
