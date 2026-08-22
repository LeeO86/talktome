const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function readInstalledClientVersion() {
  let packageDirectory = path.dirname(require.resolve("mediasoup-client"));
  while (!fs.existsSync(path.join(packageDirectory, "package.json"))) {
    const parentDirectory = path.dirname(packageDirectory);
    assert.notEqual(parentDirectory, packageDirectory, "mediasoup-client package metadata missing");
    packageDirectory = parentDirectory;
  }

  return JSON.parse(
    fs.readFileSync(path.join(packageDirectory, "package.json"), "utf8")
  ).version;
}

test("browser bundle matches the installed mediasoup-client", () => {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { userAgent: "" },
    window: {},
    self: {}
  };
  context.globalThis = context;

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "public", "mediasoup-client.js"), "utf8"),
    context,
    { filename: "mediasoup-client.js" }
  );

  assert.equal(context.mediasoupClient.version, readInstalledClientVersion());
  assert.equal(typeof context.mediasoupClient.Device, "function");
});
