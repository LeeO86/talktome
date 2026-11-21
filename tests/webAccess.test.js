const PROJECT_ROOT = require('./helpers/projectRoot');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const selfsigned = require('selfsigned');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { Server } = require('socket.io');
const { normalizeWebAccess, resolveWebAccess, createWebServer, requestConnectOrigin } = require('../src/server/webAccess');

test('container fallback stays editable and saved ports take precedence', () => {
  const env = { TALKTOME_RUNNING_IN_CONTAINER: '1' };
  const defaults = resolveWebAccess({}, env);
  assert.equal(defaults.httpsPort, 8443);
  assert.deepEqual(defaults.environmentOverrides, []);
  assert.equal(normalizeWebAccess({}, env).httpsPort, 8443, 'Admin must show the same fallback');

  const saved = { httpsPort: 55443 };
  assert.equal(resolveWebAccess(saved, env).httpsPort, 55443);
  assert.deepEqual(resolveWebAccess(saved, env).environmentOverrides, []);
  const explicit = resolveWebAccess(saved, { ...env, HTTPS_PORT: '9443' });
  assert.equal(explicit.httpsPort, 9443);
  assert.deepEqual(explicit.environmentOverrides, ['httpsPort']);
  assert.equal(resolveWebAccess(saved, { ...env, HTTPS_PORT: '9443', PORT: '10443' }).httpsPort, 10443);
});

test('native fallback remains 443 without locking the Admin field', t => {
  const fs = require('node:fs');
  t.mock.method(fs, 'existsSync', () => false);
  t.mock.method(fs, 'readFileSync', () => { throw new Error('No container cgroup'); });
  const access = resolveWebAccess({}, {});
  assert.equal(access.httpsPort, 443);
  assert.deepEqual(access.environmentOverrides, []);
});

test('web access defaults, environment precedence and validation', () => {
  assert.equal(resolveWebAccess({}, {}).tlsMode, 'internal');
  const active = resolveWebAccess({ tlsMode: 'internal', httpsPort: 8443 }, { TALKTOME_TLS_MODE: 'proxy', PORT: '8080' });
  assert.equal(active.tlsMode, 'proxy');
  assert.equal(active.httpsPort, 8080);
  assert.deepEqual(active.environmentOverrides, ['tlsMode', 'httpsPort']);
  for (const config of [{ tlsMode: 'off' }, { httpsPort: 0 }, { httpsPort: 1.5 }, { publicUrl: 'http://example.com' }, { publicUrl: 'https://user:pass@example.com' }, { publicUrl: 'https://example.com/path' }, { trustedProxies: 'invalid' }]) {
    assert.throws(() => normalizeWebAccess(config));
  }
});

test('forwarded origins are accepted only from allowlisted peers', () => {
  const access = resolveWebAccess({ trustedProxies: '10.0.0.2' }, {});
  const req = { socket: { remoteAddress: '10.0.0.3' }, headers: { host: 'backend:8443', 'x-forwarded-host': 'talktome.example.com', 'x-forwarded-proto': 'https' } };
  assert.equal(requestConnectOrigin(req, access), 'http://backend:8443');
  req.socket.remoteAddress = '10.0.0.2';
  assert.equal(requestConnectOrigin(req, access), 'https://talktome.example.com');
  req.headers['x-forwarded-proto'] = 'javascript';
  assert.equal(requestConnectOrigin(req, access), '');
});

test('IPv6 trust subnets cannot accidentally trust arbitrary IPv4 clients', () => {
  for (const trustedProxies of ['::ffff:10.0.0.0/8', '::/1']) {
    const access = resolveWebAccess({ trustedProxies }, {});
    assert.equal(access.isTrustedProxy('203.0.113.10'), false);
  }
  const access = resolveWebAccess({ trustedProxies: '::ffff:10.0.0.0/104' }, {});
  assert.equal(access.isTrustedProxy('10.0.0.2'), true);
  assert.equal(access.isTrustedProxy('203.0.113.10'), false);
});

function request(client, port, path = '/') {
  return new Promise((resolve, reject) => {
    client.get({ hostname: '127.0.0.1', port, path, rejectUnauthorized: false, agent: false }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

for (const mode of ['internal', 'proxy']) {
  test(`${mode} serves app and Socket.IO with the selected transport`, async () => {
    const certs = mode === 'internal' ? await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { keySize: 2048 }) : null;
    const access = resolveWebAccess({ tlsMode: mode }, {});
    const server = createWebServer((req, res) => {
      res.end(req.url === '/login/options' ? JSON.stringify({ guestLogin: { enabled: false } }) : 'app');
    }, access, () => {
      assert.equal(mode, 'internal', 'HTTP mode must not read certificates');
      return { key: certs.private, cert: certs.cert };
    }, 'localhost');
    const sockets = new Server(server);
    sockets.on('connection', socket => socket.emit('ready', 'connected'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    let client;
    const dir = mkdtempSync(join(tmpdir(), 'talktome-healthcheck-'));
    try {
      const response = await request(mode === 'proxy' ? http : https, port, '/admin');
      assert.equal(response.status, 200);
      assert.equal(response.body, 'app');

      client = io(`${mode === 'proxy' ? 'http' : 'https'}://127.0.0.1:${port}`, { rejectUnauthorized: false, transports: ['websocket'], reconnection: false });
      assert.equal(await new Promise((resolve, reject) => {
        client.on('ready', resolve);
        client.on('connect_error', reject);
        setTimeout(() => reject(new Error('Socket.IO timeout')), 3000).unref();
      }), 'connected');
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ tlsMode: mode, httpsPort: port }));
      const env = { ...process.env, TALKTOME_DATA_DIR: dir };
      for (const key of ['PORT', 'HTTPS_PORT', 'TALKTOME_TLS_MODE']) delete env[key];
      const healthcheck = spawn(process.execPath, [join(PROJECT_ROOT, 'scripts/container-healthcheck.js')], { env });
      assert.equal(await new Promise((resolve, reject) => {
        healthcheck.on('error', reject);
        healthcheck.on('exit', resolve);
      }), 0, 'healthcheck must use the saved mode and port');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      client?.close();
      await new Promise(resolve => sockets.close(resolve));
    }
  });
}
