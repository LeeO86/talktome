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
