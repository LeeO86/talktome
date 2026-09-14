const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const server = fs.readFileSync(path.join(__dirname, 'serverCore.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, 'public', 'admin.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8');

test('admin status resolves active talk targets to display names', () => {
  assert.match(server, /function buildAdminStatusTalkTargets\(targets, usersById, conferencesById\)/);
  assert.match(server, /name: usersById\.get\(String\(target\.id\)\)\?\.name \|\| `User \$\{target\.id\}`/);
  assert.match(server, /name: conferencesById\.get\(String\(target\.id\)\)\?\.name \|\| `Conference \$\{target\.id\}`/);
  assert.match(server, /talkTargets,/);
});

test('talking users show an arrow and their active target names', () => {
  assert.match(admin, /return `→ \$\{names\.length > 0 \? names\.join\(', '\) : 'Target'\}`/);
  assert.match(admin, /talkingLabel: formatStatusTalkTargetLabel\(user\)/);
  assert.match(adminHtml, /@keyframes statusTalkingLedPulse/);
  assert.match(adminHtml, /\.status-indicator__dot\.is-talking \{\s*background: #8b5cf6;\s*animation: statusTalkingLedPulse/);
  assert.doesNotMatch(adminHtml, /statusTalkingLedBlink/);
});

test('admin status exposes and conditionally renders the active production', () => {
  assert.match(server, /const multipleProductionsEnabled = areMultipleProductionsEnabled\(\)/);
  assert.match(server, /activeProduction: activeProduction/);
  assert.match(server, /multipleProductionsEnabled,/);
  assert.match(admin, /const showProductionColumn = payload\.multipleProductionsEnabled === true/);
  assert.match(admin, /user\.activeProduction\?\.name/);
  assert.match(adminHtml, /data-status-production-column hidden>Production<\/th>/);
});

test('status tables reserve less space for short names than detailed client data', () => {
  assert.match(adminHtml, /<col style="width: 8rem;">\s*<col data-status-production-column/);
  assert.match(adminHtml, /status-table--users\.status-table--with-production/);
});
