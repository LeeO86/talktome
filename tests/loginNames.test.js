const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const PROJECT_ROOT = require('./helpers/projectRoot');

function withDatabase(body) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-login-names-'));
  try {
    execFileSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const db = require('./src/server/dbHandler');
      const sql = require('./src/server/db');
      const bcrypt = require('bcryptjs');
      (${body.toString()})();
    `], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TALKTOME_DATA_DIR: dataDir },
      stdio: 'pipe',
      timeout: 20_000,
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('user, feed and admin login ignore name casing but preserve password casing and display names', () => {
  withDatabase(() => {
    const userId = Number(db.createUser('David', 'Secret-123'));
    const feedId = Number(db.createFeed('Programme', 'Feed-Secret'));
    for (const name of ['David', 'david', 'DAVID', 'DaViD']) {
      assert.equal(db.verifyUser(name, 'Secret-123')?.id, userId);
      assert.equal(db.verifyUser(name, 'Secret-123')?.name, 'David');
      assert.equal(db.getUserByName(name)?.id, userId);
      assert.equal(db.verifyUser(name, 'secret-123'), null);
    }
    for (const name of ['Programme', 'programme', 'PROGRAMME']) {
      assert.deepEqual(db.verifyFeed(name, 'Feed-Secret'), { id: feedId, name: 'Programme' });
      assert.equal(db.verifyFeed(name, 'feed-secret'), null);
    }
    assert.equal(db.verifyUser('ADMIN', 'talktom3')?.is_superadmin, 1);
    assert.equal(db.verifyUser('nobody', 'Secret-123'), null);
    assert.equal(db.verifyFeed('missing', 'Feed-Secret'), null);
    assert.equal(db.verifyUser(null, 'Secret-123'), null);
    assert.equal(db.verifyUser(['David'], 'Secret-123'), null);
    assert.equal(db.verifyUser('David', null), null);
  });
});

test('Unicode login names use the same casing and composition rules for lookup and uniqueness', () => {
  withDatabase(() => {
    const userId = Number(db.createUser('Änne', 'MixedCase'));
    assert.equal(db.verifyUser('ÄNNE', 'MixedCase')?.id, userId);
    assert.equal(db.verifyUser('änne', 'MixedCase')?.id, userId);
    assert.equal(db.verifyUser('A\u0308NNE', 'MixedCase')?.id, userId);
    assert.throws(() => db.createUser('a\u0308nne', 'other'), /already exists/);
    assert.equal(db.verifyUser('Anne', 'MixedCase'), null);
    const feedId = Number(db.createFeed('Émission', 'OtherCase'));
    assert.equal(db.verifyFeed('e\u0301MISSION', 'OtherCase')?.id, feedId);
    assert.throws(() => db.createFeed('ÉMISSION', 'other'), /already exists/);
  });
});

test('creation and renames enforce a shared case-insensitive login namespace', () => {
  withDatabase(() => {
    const first = Number(db.createUser('David', 'secret'));
    const second = Number(db.createUser('Camera', 'secret'));
    const feed = Number(db.createFeed('Programme', 'secret'));
    assert.throws(() => db.createUser(123, 'secret'), /non-empty string/);
    assert.throws(() => db.createFeed('', 'secret'), /non-empty string/);
    for (const create of [db.createUser, db.createFeed]) {
      assert.throws(() => create('dAvId', 'secret'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
      assert.throws(() => create('PROGRAMME', 'secret'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    }
    assert.throws(() => db.updateUserName(second, 'david'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    assert.throws(() => db.updateUserName(second, 'PROGRAMME'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    assert.throws(() => db.updateFeedName(feed, 'DAVID'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    assert.equal(db.getUserById(second).name, 'Camera');
    assert.equal(db.getFeedById(feed).name, 'Programme');
    assert.equal(db.updateUserName(first, 'DAVID'), true);
    assert.equal(db.updateFeedName(feed, 'programme'), true);
    assert.equal(db.verifyUser('david', 'secret')?.name, 'DAVID');
    assert.equal(db.verifyFeed('PROGRAMME', 'secret')?.name, 'programme');
    assert.equal(db.updateUserName(99999, 'david'), false);
    assert.equal(db.updateFeedName(99999, 'david'), false);
  });
});

test('legacy case-only user collisions fail closed without modifying either account', () => {
  withDatabase(() => {
    const first = Number(db.createUser('David', 'first-secret'));
    const token = db.createUserLoginToken(first);
    const second = Number(sql.prepare('INSERT INTO users (name, password) VALUES (?, ?)')
      .run('david', bcrypt.hashSync('second-secret', 4)).lastInsertRowid);
    for (const name of ['David', 'david', 'DAVID']) {
      assert.equal(db.verifyUser(name, 'first-secret'), null);
      assert.equal(db.verifyUser(name, 'second-secret'), null);
      assert.equal(db.getUserByName(name), null);
    }
    assert.equal(db.getUserById(first).name, 'David');
    assert.equal(db.getUserById(second).name, 'david');
    assert.equal(db.getUserByLoginToken(token)?.id, first);
    db.updateUserName(second, 'Other David');
    assert.equal(db.verifyUser('DAVID', 'first-secret')?.id, first);
    assert.equal(db.verifyUser('other david', 'second-secret')?.id, second);
  });
});

test('legacy feed and cross-kind collisions cannot redirect password logins', () => {
  withDatabase(() => {
    const user = Number(db.createUser('David', 'shared-secret'));
    const insert = sql.prepare('INSERT INTO feeds (name, password) VALUES (?, ?)');
    const hash = bcrypt.hashSync('shared-secret', 4);
    const feed = Number(insert.run('david', hash).lastInsertRowid);
    for (const name of ['David', 'david', 'DAVID']) {
      assert.equal(db.verifyUser(name, 'shared-secret'), null);
      assert.equal(db.verifyFeed(name, 'shared-secret'), null);
    }
    db.updateFeedName(feed, 'Programme');
    assert.equal(db.verifyUser('DAVID', 'shared-secret')?.id, user);
    const duplicate = Number(insert.run('PROGRAMME', hash).lastInsertRowid);
    assert.equal(db.verifyFeed('programme', 'shared-secret'), null);
    db.updateFeedName(duplicate, 'Second programme');
    assert.equal(db.verifyFeed('PROGRAMME', 'shared-secret')?.id, feed);
  });
});

test('snapshot imports reject duplicate login names before replacing the current database', () => {
  withDatabase(() => {
    const id = Number(db.createUser('David', 'secret'));
    const feed = Number(db.createFeed('Programme', 'secret'));
    const snapshot = db.exportDatabaseSnapshot();
    snapshot.feeds.find(row => row.id === feed).name = 'dAVID';
    assert.throws(() => db.importDatabaseSnapshot(snapshot), /Duplicate login name/);
    assert.equal(db.verifyUser('DAVID', 'secret')?.id, id);
    assert.equal(db.getFeedById(feed).name, 'Programme');
    snapshot.feeds.find(row => row.id === feed).name = 'Other feed';
    db.importDatabaseSnapshot(snapshot);
    assert.equal(db.verifyUser('DAVID', 'secret')?.id, id);
    assert.equal(db.verifyFeed('OTHER FEED', 'secret')?.id, feed);
  });
});

test('guest profile generation avoids case-insensitive user and feed collisions', () => {
  withDatabase(() => {
    db.createUser('gUeSt', 'secret');
    db.createFeed('GUEST PROFILE', 'secret');
    assert.equal(db.getOrCreateGuestProfile().name, 'Guest Profile 2');
    assert.equal(db.getOrCreateGuestProfile().name, 'Guest Profile 2');
  });
});
