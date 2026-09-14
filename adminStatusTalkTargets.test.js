const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const server = fs.readFileSync(path.join(__dirname, 'serverCore.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, 'public', 'admin.js'), 'utf8');

test('admin status resolves active talk targets to display names', () => {
  assert.match(server, /function buildAdminStatusTalkTargets\(targets, usersById, conferencesById\)/);
  assert.match(server, /name: usersById\.get\(String\(target\.id\)\)\?\.name \|\| `User \$\{target\.id\}`/);
  assert.match(server, /name: conferencesById\.get\(String\(target\.id\)\)\?\.name \|\| `Conference \$\{target\.id\}`/);
  assert.match(server, /talkTargets,/);
});

test('talking users show an arrow and their active target names', () => {
  assert.match(admin, /return `→ \$\{names\.length > 0 \? names\.join\(', '\) : 'Target'\}`/);
  assert.match(admin, /talkingLabel: formatStatusTalkTargetLabel\(user\)/);
});
