const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getBetterSqliteBindingCandidates,
  getBetterSqliteTarget,
  resolveBetterSqliteBinding,
} = require("./betterSqliteBinding");

test("uses the N-API better-sqlite3 generation that replaces the Node 24 ObjectWrap path", () => {
  const { version } = require("better-sqlite3/package.json");
  assert.equal(version, "13.0.3");
});

test("selects the platform-specific N-API prebuild", () => {
  assert.equal(getBetterSqliteTarget({ platform: "darwin", arch: "arm64" }), "darwin-arm64");
  assert.equal(
    getBetterSqliteTarget({ platform: "linux", arch: "x64", linuxMusl: true }),
    "linuxmusl-x64"
  );
  assert.equal(getBetterSqliteTarget({ platform: "freebsd", arch: "x64" }), null);
});

test("prefers a shipped prebuild and falls back to the staged pkg binding", (t) => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "talktome-sqlite-binding-"));
  t.after(() => fs.rmSync(packageRoot, { recursive: true, force: true }));

  const candidates = getBetterSqliteBindingCandidates({
    packageRoot,
    platform: "win32",
    arch: "x64",
  });
  const [prebuildPath, stagedPath] = candidates;
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  fs.writeFileSync(stagedPath, "staged");
  assert.equal(resolveBetterSqliteBinding({ packageRoot, platform: "win32", arch: "x64" }), stagedPath);

  fs.mkdirSync(path.dirname(prebuildPath), { recursive: true });
  fs.writeFileSync(prebuildPath, "prebuild");
  assert.equal(resolveBetterSqliteBinding({ packageRoot, platform: "win32", arch: "x64" }), prebuildPath);
});
