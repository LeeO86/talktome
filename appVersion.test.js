const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveServerAppVersion } = require("./appVersion");

test("explicit release version is authoritative", () => {
  const version = resolveServerAppVersion({
    environment: {
      TALKTOME_VERSION: "1.2.0",
      npm_package_version: "0.0.0",
    },
    packaged: false,
    packageVersion: () => "0.0.0",
    gitVersion: () => "1.2.0-dev.5",
  });

  assert.equal(version, "1.2.0");
});

test("development builds use Git metadata", () => {
  const version = resolveServerAppVersion({
    environment: { npm_package_version: "0.0.0" },
    packaged: false,
    packageVersion: () => "0.0.0",
    gitVersion: () => "1.2.0-dev.2.dirty",
  });

  assert.equal(version, "1.2.0-dev.2.dirty");
});

test("packaged builds use their generated Git version", () => {
  const version = resolveServerAppVersion({
    environment: {},
    packaged: true,
    embeddedVersion: () => "1.2.0-dev.2",
    packageVersion: () => "0.0.0",
    gitVersion: () => {
      throw new Error("Git must not be queried for packaged builds");
    },
  });

  assert.equal(version, "1.2.0-dev.2");
});

test("the neutral manifest placeholder is never reported as an app version", () => {
  const version = resolveServerAppVersion({
    environment: { npm_package_version: "0.0.0" },
    packaged: true,
    embeddedVersion: () => "",
    packageVersion: () => "0.0.0",
  });

  assert.equal(version, "unknown");
});
