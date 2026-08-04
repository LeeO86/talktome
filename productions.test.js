const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('keeps production layouts separate from the global target matrix', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-productions-'));
  const projectDir = __dirname;
  const script = `
    const assert = require('node:assert/strict');
    const db = require(${JSON.stringify(path.join(projectDir, 'dbHandler.js'))});

    const anna = Number(db.createUser('Anna', 'test-password'));
    const daniel = Number(db.createUser('Daniel', 'test-password'));
    const regie = Number(db.createConference('Regie'));
    const program = Number(db.createFeed('Program', 'test-password'));

    db.addUserTargetToUser(anna, daniel);
    const production = db.createProduction('Morning show');
    db.setProductionUser(production, anna);
    db.setProductionUser(production, daniel, { isAdmin: true });
    db.addProductionTarget(production, anna, 'conference', regie);
    db.addProductionTarget(production, anna, 'feed', program);

    assert.deepEqual(db.getUserTargets(anna).map((target) => target.targetType), ['user']);
    assert.deepEqual(
      db.getProductionTargets(anna, production).map((target) => target.targetType),
      ['conference', 'feed']
    );
    assert.equal(db.isUserInProduction(anna, production), true);
    assert.equal(db.isUserProductionAdmin(daniel, production), true);

    db.updateProductionTargetOrder(production, anna, [
      { targetType: 'feed', targetId: program },
      { targetType: 'conference', targetId: regie },
    ]);
    assert.deepEqual(
      db.getProductionTargets(anna, production).map((target) => target.targetType),
      ['feed', 'conference']
    );

    const snapshot = db.exportDatabaseSnapshot();
    assert.equal(snapshot.productions.length, 1);
    assert.equal(snapshot.productionUsers.length, 2);
    assert.equal(snapshot.productionUserTargets.length, 2);

    db.importDatabaseSnapshot(snapshot);
    assert.equal(db.getProductionById(production).name, 'Morning show');
    assert.equal(db.getProductionTargets(anna, production).length, 2);

    const legacySnapshot = { ...snapshot };
    delete legacySnapshot.productions;
    delete legacySnapshot.productionUsers;
    delete legacySnapshot.productionUserTargets;
    delete legacySnapshot.productionTargetOrder;
    db.importDatabaseSnapshot(legacySnapshot);
    assert.equal(db.getAllProductions().length, 0);
    assert.deepEqual(db.getUserTargets(anna).map((target) => target.targetType), ['user']);
  `;

  try {
    execFileSync(process.execPath, ['-e', script], {
      cwd: projectDir,
      env: { ...process.env, TALKTOME_DATA_DIR: dataDir },
      stdio: 'pipe',
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
