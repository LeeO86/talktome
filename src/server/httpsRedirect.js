function isPlainHttpTlsError(error) {
  return error?.code === 'ERR_SSL_HTTP_REQUEST'
    || String(error?.reason || '').toLowerCase() === 'http request';
}

function formatRedirectHost(address, fallbackHost = 'localhost') {
  const normalized = String(address || '').replace(/^::ffff:/i, '').trim();
  if (!normalized) return fallbackHost || 'localhost';
  if (normalized.includes(':')) return `[${normalized.replace(/%/g, '%25')}]`;
  return normalized;
}

function installHttpRedirectOnHttpsPort(server, { httpsPort, fallbackHost = 'localhost' }) {
  const port = Number(httpsPort);
  if (!server || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('A valid HTTPS server and port are required');
  }

  server.on('tlsClientError', (error, tlsSocket) => {
    if (!isPlainHttpTlsError(error)) return;

    // OpenSSL has already rejected the plaintext request, so the TLSSocket is
    // no longer writable. Its underlying TCP socket can still return a normal
    // HTTP redirect before the connection is closed.
    const socket = tlsSocket?._parent;
    if (!socket?.writable) return;

    const host = formatRedirectHost(socket.localAddress, fallbackHost);
    const location = `https://${host}:${port}/`;
    socket.end([
      'HTTP/1.1 301 Moved Permanently',
      `Location: ${location}`,
      'Connection: close',
      'Content-Length: 0',
      '',
      '',
    ].join('\r\n'));
  });
}

module.exports = {
  formatRedirectHost,
  installHttpRedirectOnHttpsPort,
  isPlainHttpTlsError,
};
