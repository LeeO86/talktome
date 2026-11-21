const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  return {
    children: [], attributes: {}, handlers: {},
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(event, callback) { this.handlers[event] = callback; },
    classList: { toggle(key, value) { this[key] = value; } },
  };
}

test('each media QR opens its own enlarged image and download filename', () => {
  const source = fs.readFileSync('public/admin.js', 'utf8');
  const container = element();
  let opened;
  const context = {
    URL, mediaNetworkQrContainer: container,
    document: { createElement: element },
    buildRenderedQrImageDataUrl: ({ qrCodeDataUrl, qrUrl }) => qrCodeDataUrl && qrUrl ? `image:${qrUrl}` : '',
    buildMediaNetworkQrFilename: url => `qr-${new URL(url).hostname}.png`,
    openAdminImageLightbox: state => opened = state,
    closeAdminImageLightbox() {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function renderMediaNetworkQr('), source.indexOf('async function logoutAdmin')), context);
  const qrCodes = ['192.168.178.166', '192.168.178.88'].map(address => ({ address, qrUrl: `https://${address}:8443`, qrCodeDataUrl: 'data:image/png;base64,test' }));
  context.renderMediaNetworkQr({ qrCodes });
  assert.equal(container.children.length, 2);
  assert.equal(container.children[1].children[1].textContent, '192.168.178.88');
  container.children[1].children[0].handlers.click();
  assert.equal(opened.dataUrl, 'image:https://192.168.178.88:8443');
  assert.equal(opened.filename, 'qr-192.168.178.88.png');
  context.renderMediaNetworkQr({ qrCodes: [] });
  assert.equal(container.children.length, 0);
  assert.equal(container.classList['is-hidden'], true);
});

test('built-in HTTPS media QR payload uses the configured external port', async () => {
  const source = fs.readFileSync('src/server/serverCore.js', 'utf8');
  const generated = [];
  const context = vm.createContext({
    ...require('../src/server/qrConnectUrl'),
    requestConnectOrigin: require('../src/server/webAccess').requestConnectOrigin,
    WEB_ACCESS: { tlsMode: 'internal', publicUrl: 'https://192.168.1.20:55443', isTrustedProxy: () => false },
    WEB_PROTOCOL: 'https', HTTPS_PORT: 8443, mdnsHostname: null,
    getStartupHosts: () => [], getLocalIPv4Addresses: () => [],
    isLikelyIPv4Address: value => /^\d+\.\d+\.\d+\.\d+$/.test(value),
    QRCode: { toDataURL: async url => { generated.push(url); return `data:image/png;${url}`; } },
  });
  vm.runInContext(source.slice(source.indexOf('function buildBackendConnectUrl('), source.indexOf('function webAccessSettings(')), context);
  const payload = await context.buildAdminMediaNetworkQrPayload(['172.17.0.2', '172.18.0.2'], {
    socket: { encrypted: true }, headers: { host: 'localhost:8443' },
  });
  assert.equal(payload.httpsPort, 8443, 'external URL must not change the backend listener');
  assert.equal(payload.qrUrl, 'https://192.168.1.20:55443');
  assert.equal(payload.qrCodes.length, 1);
  assert.equal(payload.qrCodes[0].qrUrl, payload.qrUrl);
  assert.equal(payload.qrCodes[0].qrCodeDataUrl, payload.qrCodeDataUrl);
  assert.deepEqual(generated, ['https://192.168.1.20:55443']);
});
