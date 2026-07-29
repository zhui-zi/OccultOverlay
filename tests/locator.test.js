const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fingerprint = 'A'.repeat(64);
let requested = null;
let applied = null;
const sandbox = {
  console,
  Promise,
  Date,
  setTimeout,
  setInterval() {},
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
  },
  OC: {
    CES: {},
    FATES: { 2074: { name: { en: 'Test FATE' } } },
    POTS: {},
    MAP: { territory: 1346 },
    Overlay: {
      playerDc: 103,
      territoryId: 1346,
      memMeta: {
        2074: { active: false, spawnEpoch: 123456, deathEpoch: 123500 },
      },
    },
    Pots: {
      contextFingerprints(dc, fateId, epoch) {
        assert.deepEqual([dc, fateId, epoch], [103, 2074, 123456]);
        return [fingerprint];
      },
      islandList(rows) {
        return rows.map(row => ({
          id: row.tracker_id,
          rowId: row.id,
          fingerprint: row.last_fate,
          territory: row.territory,
          dc: row.datacenter,
        }));
      },
      matchIsland(islands, evidence, dc) {
        return islands.find(item =>
          item.dc === dc &&
          item.territory === evidence.territory &&
          evidence.fingerprints.includes(item.fingerprint)
        ) || null;
      },
    },
    Api: {
      fetchIslandByFingerprints(fingerprints, territory, dc) {
        requested = { fingerprints: Array.from(fingerprints), territory, dc };
        return Promise.resolve([{
          id: 42,
          tracker_id: 'mine',
          territory: 1346,
          datacenter: 103,
          last_fate: fingerprint,
          last_update: 123500,
          encounter_history: '[]',
          fate_history: '[]',
          pot_history: '[]',
        }]);
      },
    },
    Settings: { get() { return null; } },
    i18n: { t(key) { return key; } },
    localName(value) { return value.en; },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/main.js', 'utf8'), sandbox);

(async function () {
  sandbox.OC.App.applyIslandRecord = function (record, id) {
    applied = { record, id };
  };
  sandbox.OC.App.updateChips = function () {};

  const evidence = sandbox.OC.App.instanceEvidence();
  assert.deepEqual(Array.from(evidence.events, event => event.fateId), [2074],
    'completed Add evidence must survive until an instance reset');

  const found = await sandbox.OC.App.locateMyIslandFast(true);
  assert.equal(found, true);
  assert.deepEqual(requested, {
    fingerprints: [fingerprint],
    territory: 1346,
    dc: 103,
  });
  assert.equal(sandbox.OC.App.myIslandRowId, 42);
  assert.equal(sandbox.OC.App.myIslandId, 'mine');
  assert.equal(applied.id, 'mine');
  assert.equal(applied.record.id, 42);
  console.log('locator tests passed');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
