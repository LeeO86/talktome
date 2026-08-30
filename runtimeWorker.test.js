const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  fileSha256,
  syncRuntimeExecutable,
  syncRuntimeFile,
} = require("./runtimeWorker");

test("syncRuntimeExecutable replaces an outdated runtime worker", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "talktome-runtime-worker-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const source = path.join(directory, "bundled-worker");
  const destination = path.join(directory, "runtime", "mediasoup-worker");
  fs.writeFileSync(source, "new worker");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, "old worker");

  const result = syncRuntimeExecutable(source, destination);

  assert.equal(result.updated, true);
  assert.equal(fileSha256(destination), fileSha256(source));
  assert.equal(fs.statSync(destination).mode & 0o111, 0o111);
});

test("syncRuntimeExecutable leaves an identical runtime worker in place", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "talktome-runtime-worker-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const source = path.join(directory, "bundled-worker");
  const destination = path.join(directory, "runtime", "mediasoup-worker");
  fs.writeFileSync(source, "same worker");

  const firstResult = syncRuntimeExecutable(source, destination);
  const secondResult = syncRuntimeExecutable(source, destination);

  assert.equal(firstResult.updated, true);
  assert.equal(secondResult.updated, false);
});

test("syncRuntimeFile replaces an outdated native module without making it executable", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "talktome-runtime-file-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const source = path.join(directory, "bundled", "better_sqlite3.node");
  const destination = path.join(directory, "runtime", "better_sqlite3.node");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(source, "node 24 binding");
  fs.writeFileSync(destination, "node 18 binding");
  fs.chmodSync(source, 0o644);

  const result = syncRuntimeFile(source, destination);

  assert.equal(result.updated, true);
  assert.equal(fileSha256(destination), fileSha256(source));
  assert.equal(fs.statSync(destination).mode & 0o111, 0);
});
