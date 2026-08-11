const crypto = require("crypto");

function createBrowserSessionStore({
  ttlMs = 1000 * 60 * 60 * 12,
  now = () => Date.now(),
  createToken = () => crypto.randomBytes(32).toString("hex"),
} = {}) {
  const sessions = new Map();

  function purgeExpired() {
    const currentTime = now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(token);
    }
  }

  function create(identity) {
    purgeExpired();
    const token = createToken();
    const createdAt = now();
    const session = {
      ...identity,
      createdAt,
      expiresAt: createdAt + ttlMs,
    };
    sessions.set(token, session);
    return { token, session };
  }

  function get(token) {
    const normalized = typeof token === "string" ? token.trim() : "";
    if (!normalized) return null;
    const session = sessions.get(normalized);
    if (!session) return null;
    if (session.expiresAt <= now()) {
      sessions.delete(normalized);
      return null;
    }
    return { token: normalized, session };
  }

  function revoke(token) {
    return typeof token === "string" && token ? sessions.delete(token) : false;
  }

  return { create, get, revoke };
}

module.exports = { createBrowserSessionStore };
