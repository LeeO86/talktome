const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, 'public', 'admin.js'), 'utf8');

test('mobile admin forms and navigation fit the viewport', () => {
  assert.match(html, /\.admin-bar__nav\s*\{[^}]*justify-content:\s*space-between;[^}]*overflow-x:\s*hidden;/s);
  assert.match(html, /\.entity-sidebar \.entity-create-form \.password-input-wrap,[\s\S]*?inline-size:\s*100%;/);
  assert.match(html, /\.entity-sidebar \.entity-create-form button\[type='submit'\][\s\S]*?width:\s*100%;/);
  assert.match(html, /\.entity-sidebar \.entity-create-form\s*\{[^}]*display:\s*grid;[^}]*gap:\s*0\.55rem;/s);
  assert.match(html, /\.entity-sidebar \.entity-create-form \.field-group\s*\{[^}]*display:\s*grid;[^}]*gap:\s*0\.25rem;/s);
  assert.match(script, /matchMedia\?\.\('\(hover: none\) and \(pointer: coarse\)'\)[\s\S]*?link\.blur\(\)/);
});

test('matrix controls suppress double-tap zoom', () => {
  assert.match(html, /\.target-matrix-toggle\s*\{[^}]*touch-action:\s*manipulation;/s);
  assert.match(script, /container\.addEventListener\('dblclick',[\s\S]*?event\.preventDefault\(\);/);
});

test('target button ordering supports touch pointers', () => {
  assert.match(html, /\.drag-handle\s*\{[^}]*touch-action:\s*none;/s);
  assert.match(script, /function initTouchTargetOrdering\(/);
  assert.match(script, /list\.addEventListener\('pointerdown'/);
  assert.match(script, /list\.addEventListener\('pointermove'/);
  assert.match(script, /initTouchTargetOrdering\(list, \(\) => saveProductionTargetOrder/);
  assert.match(script, /initTouchTargetOrdering\(ul, \(\) => saveTargetOrder/);
});
