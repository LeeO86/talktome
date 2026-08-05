const test = require("node:test");
const assert = require("node:assert/strict");
const { selectAdminQrUrl } = require("./qrConnectUrl");

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

test("falls back to localhost when no adapter address is available", () => {
  assert.equal(selectAdminQrUrl({
    requestUrl: "https://localhost:8444",
  }), "https://localhost:8444");
});
