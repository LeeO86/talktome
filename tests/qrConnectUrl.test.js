const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGuestLoginUrl, buildLoginUrl, selectAdminQrUrl } = require("../src/server/qrConnectUrl");

test("prefers the selected adapter over a localhost admin URL", () => {
  assert.equal(selectAdminQrUrl({
    requestUrl: "https://localhost:8444",
    adapterUrl: "https://192.168.178.166:8444",
  }), "https://192.168.178.166:8444");
});

test("prefers the selected adapter over loopback and wildcard addresses", () => {
  for (const requestUrl of [
    "https://127.0.0.1:8444",
    "https://0.0.0.0:8444",
    "https://[::1]:8444",
    "https://[::]:8444",
  ]) {
    assert.equal(selectAdminQrUrl({
      requestUrl,
      adapterUrl: "https://192.168.178.166:8444",
    }), "https://192.168.178.166:8444");
  }
});

test("keeps an explicit public URL ahead of the selected adapter", () => {
  assert.equal(selectAdminQrUrl({
    configuredUrl: "https://intercom.example.com",
    requestUrl: "https://localhost:8444",
    adapterUrl: "https://192.168.178.166:8444",
  }), "https://intercom.example.com");
});

test("keeps a usable reverse proxy host ahead of the selected adapter", () => {
  assert.equal(selectAdminQrUrl({
    requestUrl: "https://intercom.example.com",
    adapterUrl: "https://192.168.178.166:8444",
  }), "https://intercom.example.com");
});

test("prefers the selected adapter over an mDNS request URL", () => {
  assert.equal(selectAdminQrUrl({
    requestUrl: "https://intercom.local:8444",
    adapterUrl: "https://192.168.178.166:8444",
  }), "https://192.168.178.166:8444");
});

test("respects an explicitly configured mDNS URL and external port", () => {
  assert.equal(selectAdminQrUrl({
    configuredUrl: "https://intercom.local:55443",
    requestUrl: "https://intercom.local:8444",
    adapterUrl: "https://192.168.178.166:8444",
  }), "https://intercom.local:55443");
});

test("falls back to mDNS when no adapter or public URL is available", () => {
  assert.equal(selectAdminQrUrl({
    requestUrl: "https://intercom.local:8444",
  }), "https://intercom.local:8444");
});

test("falls back to localhost when no adapter address is available", () => {
  assert.equal(selectAdminQrUrl({
    requestUrl: "https://localhost:8444",
  }), "https://localhost:8444");
});

test("builds a shareable login URL from the selected adapter URL", () => {
  assert.equal(
    buildLoginUrl("https://192.168.178.166:8444", "token/value"),
    "https://192.168.178.166:8444/#login=token%2Fvalue"
  );
});

test("does not build a login URL without a usable base URL or token", () => {
  assert.equal(buildLoginUrl("", "token"), "");
  assert.equal(buildLoginUrl("https://192.168.178.166:8444", ""), "");
});

test("builds a guest login URL without creating a credential token", () => {
  assert.equal(
    buildGuestLoginUrl("https://192.168.178.166:8444"),
    "https://192.168.178.166:8444/#guest"
  );
  assert.equal(buildGuestLoginUrl(""), "");
});

test("media network QR targets cover each active address directly", () => {
  const { buildMediaNetworkQrTargets } = require('../src/server/qrConnectUrl');
  assert.deepEqual(buildMediaNetworkQrTargets({ addresses: ['192.168.178.166', '192.168.178.88', '192.168.178.166'], port: 8443 }), [
    { address: '192.168.178.166', qrUrl: 'https://192.168.178.166:8443' },
    { address: '192.168.178.88', qrUrl: 'https://192.168.178.88:8443' },
  ]);
  assert.deepEqual(buildMediaNetworkQrTargets({ addresses: [], port: 8443 }), []);
  assert.equal(buildMediaNetworkQrTargets({ addresses: ['::1'], port: 8443 })[0].qrUrl, 'https://[::1]:8443');
});

test("reverse proxy QR targets use one public URL rather than duplicate backend URLs", () => {
  const { buildMediaNetworkQrTargets } = require('../src/server/qrConnectUrl');
  assert.deepEqual(buildMediaNetworkQrTargets({ addresses: ['192.168.178.166', '192.168.178.88'], tlsMode: 'proxy', proxyUrl: 'https://talktome.example.com' }), [
    { address: 'talktome.example.com', qrUrl: 'https://talktome.example.com' },
  ]);
});

test("public URLs take precedence for media QR codes and login links in both TLS modes", () => {
  const { buildMediaNetworkQrTargets } = require('../src/server/qrConnectUrl');
  for (const tlsMode of ['internal', 'proxy']) {
    for (const publicUrl of ['https://192.168.178.166:55443', 'https://intercom.local:55443', 'https://[2001:db8::1]:55443']) {
      const connectUrl = selectAdminQrUrl({ configuredUrl: publicUrl, requestUrl: 'https://localhost:8443', adapterUrl: 'https://192.168.178.166:8443' });
      assert.equal(connectUrl, publicUrl);
      const expected = [{ address: new URL(publicUrl).hostname, qrUrl: publicUrl }];
      for (const addresses of [['192.168.178.166', '192.168.178.88'], []]) {
        assert.deepEqual(buildMediaNetworkQrTargets({ addresses, port: 8443, tlsMode, publicUrl, proxyUrl: 'https://other.example.com' }), expected);
      }
      assert.equal(buildLoginUrl(connectUrl, 'token'), `${publicUrl}/#login=token`);
      assert.equal(buildGuestLoginUrl(connectUrl), `${publicUrl}/#guest`);
    }
  }
});
