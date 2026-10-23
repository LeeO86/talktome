const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const projectRoot = require('./helpers/projectRoot');

test('HTTP login, admin, Companion and SSO share case-insensitive identities and return name conflicts as 409', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-login-http-'));
  let child;
  let exited;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (exited) await exited;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    tlsMode: 'proxy', httpsPort: port, httpPort: 'off', mdnsHost: 'off',
    mediaNetworkMode: 'manual', mediaAnnouncedAddress: '127.0.0.1',
  }));
  const env = {
    ...process.env, TALKTOME_DATA_DIR: directory, TALKTOME_NO_WIZARD: '1',
    TALKTOME_CONFIG_PATH: configPath, TALKTOME_TLS_MODE: 'proxy',
    HTTPS_PORT: String(port), PORT: String(port), HTTP_PORT: 'off', MDNS_HOST: 'off',
    PUBLIC_IP: '127.0.0.1', TALKTOME_SSO_ENABLED: 'true', TALKTOME_SSO_TRUSTED_PROXIES: 'loopback',
  };
  execFileSync(process.execPath, ['-e', `
    const db = require('./src/server/dbHandler');
    const sql = require('./src/server/db');
    db.createUser('David', 'CaseSensitive-123');
    db.createFeed('Programme', 'FeedSecret-123');
    db.updateUserPassword(db.getUserByName('admin').id, 'AdminSecret-123');
    sql.prepare('UPDATE users SET admin_must_change = 0').run();
  `], { cwd: projectRoot, env, stdio: 'pipe' });

  child = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { output = (output + chunk).slice(-16_000); });
  }
  exited = new Promise(resolve => child.once('exit', resolve));
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt++) {
    try {
      const response = await fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(500) });
      if ((await response.json()).ok) { ready = true; break; }
    } catch {}
    await delay(100);
  }
  assert.equal(ready, true, output);
  const request = (endpoint, body, headers = {}, method = 'POST') => fetch(`${origin}${endpoint}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });

  let identity;
  for (const name of ['David', 'david', 'DAVID']) {
    const response = await request('/login', { name, password: 'CaseSensitive-123' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.name, 'David');
    assert.equal(result.kind, 'user');
    if (identity) assert.equal(result.id, identity.id);
    identity = result;
  }
  assert.equal((await request('/login', { name: 'DAVID', password: 'casesensitive-123' })).status, 401);
  const feed = await request('/login', { name: 'PROGRAMME', password: 'FeedSecret-123' });
  assert.equal(feed.status, 200);
  const feedIdentity = await feed.json();
  assert.equal(feedIdentity.kind, 'feed');
  assert.equal(feedIdentity.name, 'Programme');
  assert.equal((await request('/login', { name: 'PROGRAMME', password: 'feedsecret-123' })).status, 401);

  const companion = await request('/api/v1/companion/auth/login', { name: 'DAVID', password: 'CaseSensitive-123' });
  assert.equal(companion.status, 200);
  assert.equal((await companion.json()).user.id, identity.id);
  const sso = await request('/login/sso', {}, { 'X-Forwarded-User': 'dAvId' });
  assert.equal(sso.status, 200);
  assert.equal((await sso.json()).id, identity.id);

  const admin = await request('/admin/login', { name: 'ADMIN', password: 'AdminSecret-123' });
  assert.equal(admin.status, 200);
  const cookie = admin.headers.get('set-cookie').split(';')[0];
  for (const endpoint of ['/users', '/feeds']) {
    assert.equal((await request(endpoint, { name: 'dAvId', password: 'test' }, { Cookie: cookie })).status, 409);
    assert.equal((await request(endpoint, { name: 'PROGRAMME', password: 'test' }, { Cookie: cookie })).status, 409);
  }
  assert.equal((await request(`/users/${identity.id}`, { name: 'programme' }, { Cookie: cookie }, 'PUT')).status, 409);
  assert.equal((await request(`/feeds/${feedIdentity.id}`, { name: 'DAVID' }, { Cookie: cookie }, 'PUT')).status, 409);
});
