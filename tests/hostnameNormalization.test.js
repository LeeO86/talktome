const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/server/serverCore'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function normalizeHostname('), source.indexOf('function parseOptionalPort(')), context);

test('normalizes mDNS hostnames while preserving the existing suffix rules', () => {
  for (const [input, expected] of [
    [undefined, null], ['', null], ['...', null],
    [' Talktome... ', 'talktome.local'],
    ['Talktome.LOCAL.', 'talktome.local'],
    ['example.com.', 'example.com.local'],
  ]) {
    assert.equal(context.normalizeHostname(input), expected);
  }
});

test('handles long non-trailing dot runs without a backtracking regex', () => {
  const label = `host${'.'.repeat(100_000)}x`;
  assert.equal(context.normalizeHostname(label), `${label}.local`);
  assert.equal(context.normalizeHostname(`${label}...`), `${label}.local`);
});
