const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('creates the initial admin with the documented temporary password', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-default-admin-'));
  const script = `
    const assert = require('node:assert/strict');
    const db = require(${JSON.stringify(path.join(__dirname, 'dbHandler.js'))});

    const admin = db.verifyUser('admin', 'talktom3');
    assert.ok(admin);
    assert.equal(admin.is_admin, 1);
    assert.equal(admin.is_superadmin, 1);
    assert.equal(admin.admin_must_change, 1);
    assert.equal(db.verifyUser('admin', 'admin'), null);
  `;

  try {
    execFileSync(process.execPath, ['-e', script], {
      cwd: __dirname,
      env: { ...process.env, TALKTOME_DATA_DIR: dataDir },
      stdio: 'pipe',
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
