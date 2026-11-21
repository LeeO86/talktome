// Preserve display names and passwords. Canonical Unicode composition plus
// locale-independent lowercasing makes login lookup consistent across clients.
function loginNameKey(name) {
  return typeof name === 'string' ? name.normalize('NFC').toLowerCase().normalize('NFC') : null;
}

function assertUniqueLoginNames(identities) {
  const names = new Set();
  for (const identity of identities) {
    const key = loginNameKey(identity.name);
    if (!key) throw new Error('Snapshot login names must be non-empty strings');
    if (names.has(key)) {
      throw new Error(`Duplicate login name in snapshot: ${identity.name}`);
    }
    names.add(key);
  }
}

module.exports = { loginNameKey, assertUniqueLoginNames };
