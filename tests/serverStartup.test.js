const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const projectRoot = require('./helpers/projectRoot');

test('server starts without Git from another working directory and serves its bundled assets', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-source-startup-'));
  let child;
  let exited;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    if (exited) await exited;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const appDir = path.join(directory, 'app');
  const dataDir = path.join(directory, 'data');
  fs.mkdirSync(appDir);
  fs.mkdirSync(dataDir);
  for (const entry of ['server.js', 'src', 'public', 'package.json']) {
    fs.cpSync(path.join(projectRoot, entry), path.join(appDir, entry), { recursive: true });
  }
  fs.mkdirSync(path.join(appDir, 'scripts'));
  for (const entry of ['resolve-build-version.js', 'container-healthcheck.js']) {
    fs.copyFileSync(path.join(projectRoot, 'scripts', entry), path.join(appDir, 'scripts', entry));
  }
  fs.symlinkSync(path.join(projectRoot, 'node_modules'), path.join(appDir, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(appDir, 'build-version.json'), JSON.stringify({ version: '1.2.3-layout-test' }));

  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const config = JSON.stringify({
    tlsMode: 'proxy', httpsPort: port, mdnsHost: 'off', httpPort: 'off',
    mediaNetworkMode: 'manual', mediaAnnouncedAddress: '127.0.0.1',
  });
  fs.writeFileSync(path.join(appDir, 'config.json'), config);
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
    ...JSON.parse(config), defaultClientSettings: { allowTargetRearrange: false },
  }));
  const env = {
    ...process.env, TALKTOME_DATA_DIR: dataDir, TALKTOME_NO_WIZARD: '1',
    TALKTOME_CONFIG_PATH: path.join(dataDir, 'config.json'),
    TALKTOME_TLS_MODE: 'proxy', HTTPS_PORT: String(port), PORT: String(port),
    HTTP_PORT: 'off', MDNS_HOST: 'off', PUBLIC_IP: '127.0.0.1',
    TALKTOME_VERSION: '1.5.9', TALKTOME_BUILD_VERSION: '1.5.9',
  };
  child = spawn(process.execPath, [path.join(appDir, 'server.js')], {
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
      const health = await response.json();
      if (health.ok) {
        assert.equal(health.appVersion, '1.2.3-layout-test');
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.equal(ready, true, output);
  const index = await fetch(origin);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /id="intercom-app"/);
  const admin = await fetch(`${origin}/admin.html`);
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /id="status-section"/);
  const defaults = await fetch(`${origin}/default-client-settings.js`);
  assert.match(await defaults.text(), /"allowTargetRearrange":false/);
  const model = await fetch(`${origin}/remotePanelState.js`);
  assert.equal(model.status, 200);
  assert.equal(await model.text(), fs.readFileSync(path.join(projectRoot, 'public/remotePanelState.js'), 'utf8'));
  assert.equal(fs.existsSync(path.join(dataDir, 'app.db')), true);
  execFileSync(process.execPath, [path.join(appDir, 'scripts/container-healthcheck.js')], { cwd: directory, env });
});
