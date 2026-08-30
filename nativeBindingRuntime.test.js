const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { fileSha256 } = require("./runtimeWorker");
const { resolveBetterSqliteBinding } = require("./betterSqliteBinding");

test("unpackaged and Docker server replace a stale persisted SQLite binding", (t) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "talktome-native-binding-"));
  t.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));

  const runtimeDirectory = path.join(dataDirectory, "runtime");
  const runtimeBinding = path.join(runtimeDirectory, "better_sqlite3.node");
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  fs.writeFileSync(runtimeBinding, "binding compiled for an older Node ABI");

  const result = spawnSync(process.execPath, ["-e", "require('./db').close()"], {
    cwd: __dirname,
    env: {
      ...process.env,
      TALKTOME_DATA_DIR: dataDirectory,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const installedBinding = resolveBetterSqliteBinding();
  assert.equal(fileSha256(runtimeBinding), fileSha256(installedBinding));
});
