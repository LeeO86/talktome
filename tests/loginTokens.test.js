const PROJECT_ROOT = require('./helpers/projectRoot');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('user and feed login tokens resolve and are revoked when replaced or reset', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-login-tokens-'));
  const script = `
    const assert = require('node:assert/strict');
    const db = require(${JSON.stringify(path.join(PROJECT_ROOT, 'src/server/dbHandler.js'))});

    const userId = db.createUser('QR user', 'secret');
    const firstUserToken = db.createUserLoginToken(userId);
    assert.equal(db.getUserByLoginToken(firstUserToken)?.name, 'QR user');
    const secondUserToken = db.createUserLoginToken(userId);
    assert.equal(db.getUserByLoginToken(firstUserToken), null);
    assert.equal(db.getUserByLoginToken(secondUserToken)?.name, 'QR user');

    const feedId = db.createFeed('QR feed', 'secret');
    const firstFeedToken = db.createFeedLoginToken(feedId);
    assert.equal(db.getFeedByLoginToken(firstFeedToken)?.name, 'QR feed');
    const secondFeedToken = db.createFeedLoginToken(feedId);
    assert.equal(db.getFeedByLoginToken(firstFeedToken), null);
    assert.equal(db.getFeedByLoginToken(secondFeedToken)?.name, 'QR feed');

    db.updateFeedPassword(feedId, 'changed');
    assert.equal(db.getFeedByLoginToken(secondFeedToken), null);
  `;

  try {
    execFileSync(process.execPath, ['-e', script], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TALKTOME_DATA_DIR: dataDir },
      stdio: 'pipe',
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('admin exposes shared user, feed and guest login QR controls', () => {
  const server = fs.readFileSync(path.join(PROJECT_ROOT, 'src/server/serverCore.js'), 'utf8');
  const admin = fs.readFileSync(path.join(PROJECT_ROOT, 'public/admin.js'), 'utf8');
  const client = fs.readFileSync(path.join(PROJECT_ROOT, 'public/client.js'), 'utf8');
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'public/admin.html'), 'utf8');

  assert.match(server, /app\.post\("\/admin\/users\/:id\/login-link"/);
  assert.match(server, /app\.post\("\/admin\/feeds\/:id\/login-link"/);
  assert.match(server, /req\.query\?\.qr === "1"/);
  assert.match(server, /QRCode\.toDataURL\(loginUrl/);
  assert.match(server, /loginUrl = buildGuestLoginUrl\(connectUrl\)/);
  assert.match(admin, /openEntityLoginQr\("\$\{isGuestProfile \? 'guest' : 'user'\}"/);
  assert.match(admin, /openEntityLoginQr\("feed"/);
  assert.match(admin, /isGuestProfile \? 'guest' : 'user'/);
  assert.match(admin, /function holdButtonWidth\(button\)/);
  assert.match(admin, /title: `Login QR Code · \$\{entityName\}`/);
  assert.match(client, /window\.location\.hash !== '#guest'/);
  assert.match(client, /guestLoginRequested && guestLoginEnabled/);
  assert.match(html, /id="admin-image-lightbox-download"[\s\S]+<span>Download<\/span>/);
  assert.match(html, /\.badge\.guest-profile\s*\{[^}]*white-space:\s*nowrap;/s);
});
