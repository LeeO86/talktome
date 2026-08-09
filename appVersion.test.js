const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveServerAppVersion } = require("./appVersion");

test("explicit release version is authoritative", () => {
  const version = resolveServerAppVersion({
    environment: {
      TALKTOME_VERSION: "1.2.0",
      npm_package_version: "1.1.3",
    },
    packaged: false,
    packageVersion: () => "1.1.3",
    gitVersion: () => "v1.1.3-5-gabcdef",
  });

  assert.equal(version, "1.2.0");
});

test("development builds use Git metadata", () => {
  const version = resolveServerAppVersion({
    environment: { npm_package_version: "1.1.3" },
    packaged: false,
    packageVersion: () => "1.1.3",
    gitVersion: () => "v1.2.0-2-gabcdef-dirty",
  });

  assert.equal(version, "v1.2.0-2-gabcdef-dirty");
});

test("packaged builds use their embedded package version", () => {
  const version = resolveServerAppVersion({
    environment: {},
    packaged: true,
    packageVersion: () => "1.2.0",
    gitVersion: () => {
      throw new Error("Git must not be queried for packaged builds");
    },
  });

  assert.equal(version, "1.2.0");
});
