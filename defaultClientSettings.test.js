const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BUILTIN_DEFAULT_CLIENT_SETTINGS,
  normalizeConfiguredDefaultClientSettings,
  resolveDefaultClientSettings,
  serializeDefaultClientSettingsScript,
} = require("./defaultClientSettings");

test("resolves built-in client defaults when no server settings exist", () => {
  assert.deepEqual(resolveDefaultClientSettings(null), BUILTIN_DEFAULT_CLIENT_SETTINGS);
});

test("keeps only valid configured client defaults", () => {
  assert.deepEqual(normalizeConfiguredDefaultClientSettings({
    audioProfile: "standard",
    dimAmountDb: -18,
    dimFeedsWhileSpeaking: true,
    unknown: "ignored",
  }), {
    audioProfile: "standard",
    dimAmountDb: -18,
    dimFeedsWhileSpeaking: true,
  });
});

test("rejects invalid admin client defaults in strict mode", () => {
  assert.throws(
    () => normalizeConfiguredDefaultClientSettings({ audioProfile: "studio" }, { strict: true }),
    /Invalid default audio profile/
  );
  assert.throws(
    () => normalizeConfiguredDefaultClientSettings({ leftHandMode: "yes" }, { strict: true }),
    /Invalid boolean value/
  );
});

test("serializes client defaults as a safe browser script", () => {
  const script = serializeDefaultClientSettingsScript({
    audioProfile: "low",
    lockMultipleTargets: true,
  });
  assert.equal(
    script,
    'window.TALKTOME_DEFAULT_CLIENT_SETTINGS = {"audioProfile":"low","lockMultipleTargets":true};\n'
  );
});
