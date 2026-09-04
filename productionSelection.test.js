const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveActiveProductionSelection } = require('./productionSelection');

test('missing production selection prefers an assigned primary production', () => {
  assert.deepEqual(resolveActiveProductionSelection({
    multipleProductionsEnabled: true,
    primaryProductionId: 1,
    memberships: [{ id: 2 }, { id: 1 }],
  }), {
    productionId: 1,
    hasRequestedProduction: false,
  });
});

test('missing production selection falls back to the first real membership', () => {
  assert.deepEqual(resolveActiveProductionSelection({
    multipleProductionsEnabled: true,
    primaryProductionId: 1,
    memberships: [{ id: 7 }, { id: 9 }],
  }), {
    productionId: 7,
    hasRequestedProduction: false,
  });
});

test('explicit production selection remains authoritative', () => {
  assert.deepEqual(resolveActiveProductionSelection({
    requestedValue: '9',
    multipleProductionsEnabled: true,
    primaryProductionId: 1,
    memberships: [{ id: 7 }, { id: 9 }],
  }), {
    productionId: 9,
    hasRequestedProduction: true,
  });
});

test('users without a production receive a clear assignment error', () => {
  assert.throws(
    () => resolveActiveProductionSelection({
      multipleProductionsEnabled: true,
      primaryProductionId: 1,
      memberships: [],
    }),
    /not assigned to a production/,
  );
});
