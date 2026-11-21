const http = require('node:http');
const https = require('node:https');
const proxyaddr = require('proxy-addr');
const { isIP } = require('node:net');
const { installHttpRedirectOnHttpsPort } = require('./httpsRedirect');
const { isRunningInContainer } = require('./runtimeEnvironment');

function normalizeWebAccess(config = {}, env = process.env) {
  const tlsMode = config.tlsMode ?? 'internal';
  if (!['internal', 'proxy'].includes(tlsMode)) throw new Error('TLS mode must be internal or proxy');
  const port = Number(config.httpsPort ?? (isRunningInContainer(env) ? 8443 : 443));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Web port must be between 1 and 65535');
  const publicUrl = String(config.publicUrl || '').trim().replace(/\/$/, '');
  if (publicUrl) {
    let url;
    try { url = new URL(publicUrl); } catch { throw new Error('Public URL must be an HTTPS origin'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Public URL must be an HTTPS origin');
    }
  }
  const trustedProxies = String(config.trustedProxies || '').split(',').map(value => value.trim()).filter(Boolean).join(',');
  if (trustedProxies) proxyaddr.compile(trustedProxies.split(','));
  return { tlsMode, httpsPort: port, publicUrl, trustedProxies };
}

function resolveWebAccess(config = {}, env = process.env) {
  const saved = normalizeWebAccess(config, env);
  const overrides = {
    tlsMode: env.TALKTOME_TLS_MODE,
    httpsPort: env.PORT || env.HTTPS_PORT,
    publicUrl: env.TALKTOME_PUBLIC_URL || env.PUBLIC_URL,
    trustedProxies: env.TALKTOME_TRUSTED_PROXIES ?? env.TALKTOME_SSO_TRUSTED_PROXIES,
  };
  const effective = { ...saved };
  const environmentOverrides = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) { effective[key] = value; environmentOverrides.push(key); }
  }
  const active = normalizeWebAccess(effective, env);
  const trust = active.trustedProxies ? proxyaddr.compile(active.trustedProxies.split(',')) : () => false;
  return { ...active, environmentOverrides, isTrustedProxy(address) {
    try { return Boolean(address && trust(address)); } catch { return false; }
  } };
}

function createWebServer(app, access, getTlsOptions, fallbackHost) {
  if (access.tlsMode === 'proxy') return http.createServer(app);
  const server = https.createServer(getTlsOptions(), app);
  installHttpRedirectOnHttpsPort(server, { httpsPort: access.httpsPort, fallbackHost });
  return server;
}

function requestClientAddress(req, access) {
  const remoteAddress = req?.socket?.remoteAddress;
  if (typeof remoteAddress !== 'string' || !isIP(remoteAddress)) return null;
  let address = remoteAddress;
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    try {
      // Walk from the immediate peer towards the client, stopping at the
      // first untrusted address rather than accepting an arbitrary leftmost IP.
      const candidate = proxyaddr({ socket: { remoteAddress }, headers: { 'x-forwarded-for': forwarded } },
        address => Boolean(access?.isTrustedProxy(address)));
      if (isIP(candidate)) address = candidate;
    } catch {
      // Malformed forwarding data must not replace the actual peer address.
    }
  }
  return address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
}

function requestConnectOrigin(req, access) {
  const trusted = access.isTrustedProxy(req?.socket?.remoteAddress);
  const first = value => typeof value === 'string' ? value.split(',')[0].trim() : '';
  const host = (trusted && first(req?.headers?.['x-forwarded-host'])) || first(req?.headers?.host);
  const proto = (trusted && first(req?.headers?.['x-forwarded-proto'])) || (req?.socket?.encrypted ? 'https' : 'http');
  if (!host || !['http', 'https'].includes(proto)) return '';
  try {
    const url = new URL(`${proto}://${host}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch { return ''; }
}

module.exports = { normalizeWebAccess, resolveWebAccess, createWebServer, requestConnectOrigin, requestClientAddress };
