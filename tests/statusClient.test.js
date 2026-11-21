const test = require("node:test");
const assert = require("node:assert/strict");
const { describeStatusClient, normalizeRegisteredClientType } = require("../src/server/statusClient");

test("native app registration identifies iOS and Android clients", () => {
  const socket = { handshake: { headers: { "user-agent": "Android Chrome/120.0" } } };
  assert.equal(describeStatusClient(socket, "ios-app"), "iOS App");
  assert.equal(describeStatusClient(socket, "android-app"), "Android App");
});

test("headless registration identifies the client independently of its user agent", () => {
  const socket = { handshake: { headers: { "user-agent": "talktome-headless/1.0.0" } } };
  assert.equal(normalizeRegisteredClientType("headless"), "headless");
  assert.equal(normalizeRegisteredClientType(" HEADLESS "), "headless");
  assert.equal(describeStatusClient(socket, "headless"), "Headless");
  assert.equal(describeStatusClient({}, "headless"), "Headless");
});

test("browser and unknown registrations keep the user-agent description", () => {
  const socket = { handshake: { headers: { "user-agent": "iPhone Safari/17.0" } } };
  assert.equal(describeStatusClient(socket), "iPhone Safari");
  assert.equal(describeStatusClient(socket, "spoofed-client"), "iPhone Safari");
  assert.equal(normalizeRegisteredClientType(" ANDROID-APP "), "android-app");
  assert.equal(normalizeRegisteredClientType({ value: "ios-app" }), null);
});

const { statusRemoteAddress } = require('../src/server/statusClient');
const { resolveWebAccess } = require('../src/server/webAccess');

test('status uses the forwarded client IP when the connected proxy is trusted', () => {
  const access = resolveWebAccess({ trustedProxies: '10.0.0.2' }, {});
  const socket = { request: { socket: { remoteAddress: '::ffff:10.0.0.2' }, headers: { 'x-forwarded-for': '203.0.113.7' } }, handshake: { address: '::ffff:10.0.0.2' } };
  assert.equal(statusRemoteAddress(socket, access), '203.0.113.7');
  assert.equal(statusRemoteAddress({ handshake: { address: '10.0.0.2', headers: { 'x-forwarded-for': '2001:db8::7' } } }, access), '2001:db8::7');
});

test('status ignores forwarding from untrusted peers and from an unset trust list', () => {
  const socket = { handshake: { address: '::ffff:203.0.113.7', headers: { 'x-forwarded-for': '198.51.100.99' } } };
  assert.equal(statusRemoteAddress(socket, resolveWebAccess({ trustedProxies: '10.0.0.2' }, {})), '203.0.113.7');
  socket.handshake.address = '10.0.0.2';
  assert.equal(statusRemoteAddress(socket, resolveWebAccess({}, {})), '10.0.0.2');
  assert.equal(statusRemoteAddress(socket), '10.0.0.2');
});

test('status stops at the nearest untrusted hop in a proxy chain', () => {
  const socket = { handshake: { address: '10.0.0.2', headers: { 'x-forwarded-for': '192.0.2.99, 203.0.113.7, 10.0.0.3' } } };
  assert.equal(statusRemoteAddress(socket, resolveWebAccess({ trustedProxies: '10.0.0.2,10.0.0.3' }, {})), '203.0.113.7');
  assert.equal(statusRemoteAddress(socket, resolveWebAccess({ trustedProxies: '10.0.0.2' }, {})), '10.0.0.3');
});

test('status handles missing and malformed headers without trusting alternate client-IP headers', () => {
  const access = resolveWebAccess({ trustedProxies: '10.0.0.2' }, {});
  for (const forwarded of [undefined, '', 'not-an-ip', ['203.0.113.7'], '203.0.113.7, invalid-hop']) {
    assert.equal(statusRemoteAddress({ handshake: { address: '10.0.0.2', headers: { 'x-forwarded-for': forwarded, 'x-real-ip': '203.0.113.7' } } }, access), '10.0.0.2');
  }
  assert.equal(statusRemoteAddress({}, access), null);
  assert.equal(statusRemoteAddress({ handshake: { address: '2001:db8::2' } }, access), '2001:db8::2');
  assert.equal(statusRemoteAddress({ handshake: { address: '::ffff:192.0.2.7' } }, access), '192.0.2.7');
});

for (const transport of ['polling', 'websocket']) {
  test(`real Socket.IO ${transport} status resolves trusted client headers`, async t => {
    const http = require('node:http');
    const { Server } = require('socket.io');
    const { io } = require('socket.io-client');
    const server = http.createServer();
    const sockets = new Server(server);
    const access = resolveWebAccess({ tlsMode: 'proxy', trustedProxies: 'loopback' }, {});
    sockets.on('connection', socket => socket.emit('status-address', statusRemoteAddress(socket, access)));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const client = io(`http://127.0.0.1:${server.address().port}`, { transports: [transport], upgrade: false, reconnection: false, extraHeaders: { 'X-Forwarded-For': '203.0.113.7' } });
    t.after(async () => { client.disconnect(); await new Promise(resolve => sockets.close(resolve)); });
    const address = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket.IO status timeout')), 3000);
      client.on('status-address', value => { clearTimeout(timer); resolve(value); });
      client.on('connect_error', error => { clearTimeout(timer); reject(error); });
    });
    assert.equal(address, '203.0.113.7');
  });
}
