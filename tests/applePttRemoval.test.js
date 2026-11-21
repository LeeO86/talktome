const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const projectRoot = require('./helpers/projectRoot');

test('retires Apple PTT storage on upgrade and restores legacy backups without losing active configuration', t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-retire-apple-ptt-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const setup = `
    const fs = require('node:fs');
    const path = require('node:path');
    const assert = require('node:assert/strict');
    const db = require('./src/server/dbHandler');
    const sql = require('./src/server/db');
    const backupPath = path.join(process.env.TALKTOME_DATA_DIR, 'legacy-backup.json');
    assert.deepEqual(sql.prepare("SELECT name FROM sqlite_master WHERE name IN ('apple_ptt_channels', 'apple_ptt_registrations')").all(), []);
  `;
  const seed = `
    const speaker = Number(db.createUser('Speaker', 'speaker-password'));
    const listener = Number(db.createUser('Listener', 'listener-password'));
    const conference = Number(db.createConference('Studio'));
    const feed = Number(db.createFeed('Programme', 'feed-password'));
    const production = db.getPrimaryProduction().id;
    db.setProductionUser(production, speaker);
    db.setProductionUser(production, listener);
    db.setProductionConference(production, conference);
    db.setProductionFeed(production, feed);
    db.setProductionConferenceMembership(production, listener, conference);
    db.addProductionTarget(production, speaker, 'user', listener);
    db.addProductionTarget(production, listener, 'feed', feed);

    const snapshot = db.exportDatabaseSnapshot();
    assert.equal('applePttChannels' in snapshot, false);
    assert.equal('applePttRegistrations' in snapshot, false);
    snapshot.applePttChannels = [{
      user_id: listener, channel_uuid: 'legacy-channel', channel_name: 'Talktome', updated_at: '2026-01-01',
    }];
    snapshot.applePttRegistrations = [{
      user_id: listener, channel_uuid: 'legacy-channel', push_token: 'legacy-token',
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }];
    fs.writeFileSync(backupPath, JSON.stringify(snapshot));

    // Recreate the previous release's populated tables before the next startup.
    sql.exec(\`
      CREATE TABLE apple_ptt_channels (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        channel_uuid TEXT NOT NULL UNIQUE, channel_name TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE apple_ptt_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_uuid TEXT NOT NULL, push_token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    \`);
    sql.prepare('INSERT INTO apple_ptt_channels VALUES (?, ?, ?, ?)')
      .run(listener, 'legacy-channel', 'Talktome', '2026-01-01');
    sql.prepare('INSERT INTO apple_ptt_registrations (user_id, channel_uuid, push_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(listener, 'legacy-channel', 'legacy-token', '2026-01-01', '2026-01-01');
  `;
  const restore = `
    const legacySnapshot = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const { applePttChannels, applePttRegistrations, ...expected } = legacySnapshot;
    assert.deepEqual(db.exportDatabaseSnapshot(), expected);
    db.importDatabaseSnapshot(legacySnapshot);
    assert.deepEqual(db.exportDatabaseSnapshot(), expected);
    assert.equal(db.verifyUser('Listener', 'listener-password').name, 'Listener');
    assert.equal(db.verifyFeed('Programme', 'feed-password').name, 'Programme');
  `;
  // Also restart after restoring to check that cleanup is idempotent.
  for (const script of [seed, restore, restore]) {
    execFileSync(process.execPath, ['-e', setup + script], {
      cwd: projectRoot,
      env: { ...process.env, TALKTOME_DATA_DIR: dataDir },
      stdio: 'pipe',
      timeout: 20_000,
    });
  }
});
