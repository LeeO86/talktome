const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('public/admin.html', 'utf8');
const source = fs.readFileSync('public/admin.js', 'utf8');

function fixture(hash = '#config/network') {
  const categories = [...html.matchAll(/data-config-tab="([^"]+)"/g)].map(match => match[1]);
  const panels = new Map();
  const tabs = categories.map(category => {
    const panelId = `config-${category}-panel`;
    panels.set(panelId, { hidden: true, draftValue: `unsaved-${category}` });
    return {
      dataset: { configTab: category }, attributes: { 'aria-controls': panelId }, listeners: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      addEventListener(name, listener) { this.listeners[name] = listener; },
      focus() { this.focused = true; },
    };
  });
  const context = vm.createContext({
    configTabs: tabs, activeConfigCategory: 'network',
    window: { location: { hash } },
    document: { getElementById: id => panels.get(id) },
    history: { pushState(_state, _title, next) { context.window.location.hash = next; } },
    requestAnimationFrame: callback => callback(), syncMediaNetworkQrPreviewSize() {},
    getKnownAdminViews: () => ['status', 'config'],
  });
  const start = source.indexOf('function activateConfigCategory(');
  const end = source.indexOf('function setupAdminNavigation(', start);
  vm.runInContext(source.slice(start, end), context);
  const hashStart = source.indexOf('function getAdminViewFromHash(');
  const hashEnd = source.indexOf('function activateAdminView(', hashStart);
  vm.runInContext(source.slice(hashStart, hashEnd), context);
  context.setupConfigNavigation();
  return { context, tabs, panels };
}

test('configuration tabs show one category and preserve unsaved fields', () => {
  const { context, tabs, panels } = fixture();
  context.activateConfigCategory('backups', { updateHash: true });
  assert.equal(context.window.location.hash, '#config/backups');
  assert.equal(context.getAdminViewFromHash(), 'config');
  assert.deepEqual([...panels.entries()].filter(([, panel]) => !panel.hidden).map(([id]) => id), ['config-backups-panel']);
  assert.equal(tabs.filter(tab => tab.tabIndex === 0).length, 1);
  context.activateConfigCategory('network');
  assert.equal(panels.get('config-backups-panel').draftValue, 'unsaved-backups');
  context.activateConfigCategory('invalid');
  assert.equal(context.activeConfigCategory, 'network');
});

test('configuration tabs support arrow keys, Home, End and focus', () => {
  const { context, tabs } = fixture();
  const press = (index, key) => {
    let prevented = false;
    tabs[index].listeners.keydown({ key, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  };
  press(0, 'ArrowLeft');
  assert.equal(context.activeConfigCategory, 'clients');
  assert.equal(tabs.at(-1).focused, true);
  press(3, 'ArrowRight');
  assert.equal(context.activeConfigCategory, 'network');
  press(0, 'End');
  assert.equal(context.activeConfigCategory, 'clients');
  press(3, 'Home');
  assert.equal(context.activeConfigCategory, 'network');
});

test('admin stylesheet parses without malformed blocks', () => {
  const { transformSync } = require('esbuild');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const result = transformSync(css, { loader: 'css' });
  assert.deepEqual(result.warnings, []);
});
