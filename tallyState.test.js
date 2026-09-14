const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createTallyStateStore, normalizeTallyBus } = require("./tallyState");

test("tally defaults to PGM and accepts readable aliases", () => {
  assert.equal(normalizeTallyBus(), "pgm");
  assert.equal(normalizeTallyBus("program"), "pgm");
  assert.equal(normalizeTallyBus("preview"), "prv");
  assert.throws(() => normalizeTallyBus("aux"), /pgm or prv/);
});

test("PGM and PRV are independent within a production", () => {
  const store = createTallyStateStore();
  store.set(1, "pgm", "Anna");
  store.set(1, "prv", "Christian");
  assert.deepEqual(store.get(1), { pgmUser: "Anna", prvUser: "Christian" });
  store.set(1, "prv", "");
  assert.deepEqual(store.get(1), { pgmUser: "Anna", prvUser: null });
});

test("tally state is isolated per production", () => {
  const store = createTallyStateStore();
  store.set(1, "pgm", "Anna");
  store.set(2, "pgm", "Daniel");
  store.set(2, "prv", "Luis");
  assert.deepEqual(store.get(1), { pgmUser: "Anna", prvUser: null });
  assert.deepEqual(store.get(2), { pgmUser: "Daniel", prvUser: "Luis" });
  store.remove(2);
  assert.deepEqual(store.get(2), { pgmUser: null, prvUser: null });
});

test("server and browser expose production-aware PGM and PRV tally", () => {
  const server = fs.readFileSync(path.join(__dirname, "serverCore.js"), "utf8");
  const client = fs.readFileSync(path.join(__dirname, "public/client.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "public/index.html"), "utf8");

  assert.match(server, /resolveCompanionProduction\([^\n]+req\.body\?\.productionId\)/);
  assert.match(server, /emitProductionTallyState\(productionId\)/);
  assert.match(server, /previewCameraUser:/);
  assert.match(client, /classList\.toggle\("preview-camera", prv\)/);
  assert.match(client, /classList\.toggle\("cut-camera", pgm\)/);
  assert.match(html, /body\.preview-camera[\s\S]+#00b140/);
  assert.match(html, /body\.cut-camera[\s\S]+#e00000/);
});
