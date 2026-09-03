const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const selfsigned = require('selfsigned');
const {
  formatRedirectHost,
  installHttpRedirectOnHttpsPort,
  isPlainHttpTlsError,
} = require('./httpsRedirect');

function request(client, options) {
  return new Promise((resolve, reject) => {
    const req = client.get({ ...options, agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(2_000, () => req.destroy(new Error('request timed out')));
  });
}

test('recognizes plaintext HTTP rejected by TLS', () => {
  assert.equal(isPlainHttpTlsError({ code: 'ERR_SSL_HTTP_REQUEST' }), true);
  assert.equal(isPlainHttpTlsError({ reason: 'http request' }), true);
  assert.equal(isPlainHttpTlsError({ code: 'ERR_SSL_WRONG_VERSION_NUMBER' }), false);
  assert.equal(formatRedirectHost('::ffff:192.168.1.20'), '192.168.1.20');
  assert.equal(formatRedirectHost('fe80::1'), '[fe80::1]');
});

test('redirects HTTP while continuing to serve HTTPS on the same port', async () => {
  const certificates = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 1,
    keySize: 2048,
  });
  const server = https.createServer({ key: certificates.private, cert: certificates.cert }, (req, res) => {
    res.setHeader('Connection', 'close');
    res.end('secure');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  installHttpRedirectOnHttpsPort(server, { httpsPort: port });

  try {
    const redirected = await request(http, { host: '127.0.0.1', port });
    assert.equal(redirected.statusCode, 301);
    assert.equal(redirected.headers.location, `https://127.0.0.1:${port}/`);

    const secure = await request(https, {
      host: '127.0.0.1',
      port,
      rejectUnauthorized: false,
    });
    assert.equal(secure.statusCode, 200);
    assert.equal(secure.body, 'secure');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
