const crypto = require("crypto");

function createBrowserSessionStore({
  ttlMs = 1000 * 60 * 60 * 12,
  now = () => Date.now(),
  createToken = () => crypto.randomBytes(32).toString("hex"),
  persistence = null,
} = {}) {
  const sessions = new Map();

  const storage = persistence
    ? {
        read: (token) => persistence.read(token),
        write: (token, session) => persistence.write(token, session),
        remove: (token) => persistence.remove(token),
        purgeExpired: (currentTime) => persistence.purgeExpired(currentTime),
      }
    : {
        read: (token) => sessions.get(token) || null,
        write: (token, session) => sessions.set(token, session),
        remove: (token) => sessions.delete(token),
        purgeExpired(currentTime) {
          for (const [token, session] of sessions) {
            if (session.expiresAt <= currentTime) sessions.delete(token);
          }
        },
      };

  function purgeExpired() {
    storage.purgeExpired(now());
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
    storage.write(token, session);
    return { token, session };
  }

  function get(token) {
    const normalized = typeof token === "string" ? token.trim() : "";
    if (!normalized) return null;
    const session = storage.read(normalized);
    if (!session) return null;
    if (session.expiresAt <= now()) {
      storage.remove(normalized);
      return null;
    }
    return { token: normalized, session };
  }

  function revoke(token) {
    return typeof token === "string" && token ? storage.remove(token) : false;
  }

  return { create, get, revoke };
}

module.exports = { createBrowserSessionStore };
