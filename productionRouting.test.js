const assert = require('node:assert/strict');
const test = require('node:test');
const {
  arePeersInSameActiveProduction,
  canRouteTargetBetweenPeers,
} = require('./productionRouting');

const productionA = { productionId: 1 };
const productionB = { productionId: 2 };

test('conference audio crosses active production boundaries', () => {
  assert.equal(
    canRouteTargetBetweenPeers({ type: 'conference', id: 4 }, productionA, productionB, true),
    true,
  );
});

test('direct user audio remains scoped to the active production', () => {
  assert.equal(
    canRouteTargetBetweenPeers({ type: 'user', id: 4 }, productionA, productionB, true),
    false,
  );
  assert.equal(
    canRouteTargetBetweenPeers({ type: 'user', id: 4 }, productionA, productionA, true),
    true,
  );
});

test('global peers without a production remain routable', () => {
  assert.equal(arePeersInSameActiveProduction({ productionId: null }, productionB, true), true);
});
