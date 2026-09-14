const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('browser login sessions survive a server process restart', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-browser-session-'));
  const dbHandlerPath = path.join(__dirname, 'dbHandler.js');
  const token = 'persistent-browser-session-token';
  const createScript = `
    const db = require(${JSON.stringify(dbHandlerPath)});
    const now = Date.now();
    db.saveBrowserSession(${JSON.stringify(token)}, {
      kind: 'user',
      userId: 17,
      name: 'Restart user',
      source: 'password',
      createdAt: now,
      expiresAt: now + 60_000,
    });
  `;
  const restoreScript = `
    const assert = require('node:assert/strict');
    const db = require(${JSON.stringify(dbHandlerPath)});
    const session = db.getBrowserSessionByToken(${JSON.stringify(token)});
    assert.equal(session.kind, 'user');
    assert.equal(session.userId, 17);
    assert.equal(session.name, 'Restart user');
    assert.equal(db.deleteBrowserSession(${JSON.stringify(token)}), true);
    assert.equal(db.getBrowserSessionByToken(${JSON.stringify(token)}), null);
  `;

  try {
    for (const script of [createScript, restoreScript]) {
      execFileSync(process.execPath, ['-e', script], {
        cwd: __dirname,
        env: { ...process.env, TALKTOME_DATA_DIR: dataDir },
        stdio: 'pipe',
      });
    }

    const sqliteBytes = fs.readFileSync(path.join(dataDir, 'app.db'));
    assert.equal(sqliteBytes.includes(Buffer.from(token)), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
