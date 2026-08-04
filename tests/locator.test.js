const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fingerprint = 'A'.repeat(64);
let requested = null;
let applied = null;
let fingerprintFetchCalls = 0;
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
    TERRITORIES: {
      1346: { fateIds: [2074, 2075, 2076], potIds: [2072], ceIds: [49] },
    },
    CES: {},
    FATES: {
      2074: { name: { en: 'Test FATE' } },
      2075: { name: { en: 'Earlier Test FATE' } },
      2076: { name: { en: 'Oldest Test FATE' } },
    },
    POTS: {},
    MAP: { territory: 1346 },
    Overlay: {
      playerDc: 103,
      territoryId: 1346,
      connected: true,
      inOccult: true,
      memMeta: {
        2074: { active: false, spawnEpoch: 123456, spawnTrusted: true, deathEpoch: 123500 },
        2075: { active: false, spawnEpoch: 123000, spawnTrusted: true, deathEpoch: 123100 },
        2076: { active: false, spawnEpoch: 122500, spawnTrusted: true, deathEpoch: 122600 },
      },
      memActive: {},
    },
    Pots: {
      contextFingerprint(dc, fateId, epoch) {
        assert.deepEqual([fateId, epoch], [2074, 123456]);
        return dc === 103 ? fingerprint : 'D'.repeat(64);
      },
      contextFingerprints(dc, fateId, epoch) {
        assert.deepEqual([fateId, epoch], [2074, 123456]);
        return [dc === 103 ? fingerprint : 'D'.repeat(64)];
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
      matchSnapshotIsland() {
        return sandbox._previewMatch || null;
      },
    },
    Api: {
      blankEntry(id) {
        return {
          fate_id: id,
          spawn_time: -1,
          death_time: -1,
          last_seen: -1,
          respawn_times: [],
          killed_fates: 0,
          killed_ces: 0,
        };
      },
      fetchIslandByFingerprints(fingerprints, territory, dc) {
        fingerprintFetchCalls += 1;
        requested = { fingerprints: Array.from(fingerprints), territory, dc };
        return Promise.resolve([{
          id: 42,
          tracker_id: 'mine',
          territory: 1346,
          datacenter: 103,
          last_fate: fingerprint,
          last_update: 123500,
          encounter_history: '[]',
          fate_history: JSON.stringify([
            { fate_id: 2074, spawn_time: 123456, death_time: 123500, last_seen: 123500 },
            { fate_id: 2075, spawn_time: 123000, death_time: 123100, last_seen: 123100 },
            { fate_id: 2076, spawn_time: 122500, death_time: 122600, last_seen: 122600 },
          ]),
          pot_history: '[]',
        }]);
      },
      updateIslandTracker() {
        return Promise.resolve(null);
      },
    },
    Settings: {
      get(key) {
        if (key === 'lang') return 'zh';
        if (key === 'dataRegion') return 'cn';
        return key === 'autoReport' ? false : null;
      },
    },
    i18n: { t(key) { return key; } },
    localName(value) { return value.en; },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['js/history.js', 'js/main.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

(async function () {
  sandbox.OC.App.applyIslandRecord = function (record, id) {
    applied = { record, id };
  };
  sandbox.OC.App.updateChips = function () {};

  const corroboratingMeta = sandbox.OC.Overlay.memMeta[2075];
  const thirdMeta = sandbox.OC.Overlay.memMeta[2076];
  delete sandbox.OC.Overlay.memMeta[2075];
  delete sandbox.OC.Overlay.memMeta[2076];
  const oneSignalEvidence = sandbox.OC.App.instanceEvidence();
  assert.equal(
    sandbox.OC.App.bindIslandRows([{
      id: 41,
      tracker_id: 'single-signal-collision',
      territory: 1346,
      datacenter: 103,
      last_fate: fingerprint,
      last_update: 123500,
      encounter_history: '[]',
      fate_history: JSON.stringify([
        { fate_id: 2074, spawn_time: 123456, death_time: 123500, last_seen: 123500 },
      ]),
      pot_history: '[{"fate_id":2072,"spawn_time":122000,"death_time":122100}]',
    }], oneSignalEvidence, 103),
    null,
    'one matching FATE must remain a candidate and must not bind a writable island row',
  );
  sandbox.OC.Overlay.memMeta[2075] = corroboratingMeta;

  const twoSignalEvidence = sandbox.OC.App.instanceEvidence();
  assert.equal(
    sandbox.OC.App.bindIslandRows([{
      id: 41,
      tracker_id: 'two-signal-collision',
      territory: 1346,
      datacenter: 103,
      last_fate: fingerprint,
      last_update: 123500,
      encounter_history: '[]',
      fate_history: JSON.stringify([
        { fate_id: 2074, spawn_time: 123456, death_time: 123500, last_seen: 123500 },
        { fate_id: 2075, spawn_time: 123000, death_time: 123100, last_seen: 123100 },
      ]),
      pot_history: '[]',
    }], twoSignalEvidence, 103),
    null,
    'two coincidental signals must not bind a writable island row',
  );
  sandbox.OC.Overlay.memMeta[2076] = thirdMeta;

  const evidence = sandbox.OC.App.instanceEvidence();
  assert.deepEqual(Array.from(evidence.events, event => event.fateId), [2074, 2075, 2076],
    'completed Add evidence must survive until an instance reset');
  assert.deepEqual(
    Array.from(evidence.ends, event => [event.fateId, event.deathEpoch]),
    [[2074, 123500], [2075, 123100], [2076, 122600]],
  );

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
  assert.equal(sandbox.OC.App.myIslandDatacenter, 103);
  assert.equal(sandbox.OC.App.myIslandTerritory, 1346);
  assert.equal(fingerprintFetchCalls, 1, 'fast matching must use the fingerprint response without another fetch');
  clearTimeout(sandbox.OC.App._uploadTimer);
  sandbox.OC.App._uploadTimer = null;
  sandbox.OC.App._pendingUploadFingerprint = '';

  const secondFingerprint = 'B'.repeat(64);
  const appliedBeforeMismatch = applied;
  const mismatched = sandbox.OC.App.bindIslandRows([{
    id: 99,
    tracker_id: 'other-island',
    territory: 1346,
    datacenter: 103,
    last_fate: secondFingerprint,
    last_update: 123501,
    encounter_history: '[]',
    fate_history: '[]',
    pot_history: '[]',
  }], {
    fingerprint: secondFingerprint,
    fingerprints: [secondFingerprint],
    events: [],
    territory: 1346,
  }, 103);
  assert.equal(mismatched, null, 'a bound instance must reject a different row');
  assert.equal(applied, appliedBeforeMismatch);
  assert.equal(sandbox.OC.App.myIslandRowId, 42);

  sandbox.OC.Overlay.playerDc = 101;
  assert.equal(sandbox.OC.App.resolveMyIsland(), null, 'a datacenter change must release the old binding');
  assert.equal(sandbox.OC.App.myIslandRowId, null);
  sandbox.OC.Overlay.playerDc = 103;

  sandbox.OC.App.myIslandId = null;
  sandbox.OC.App.myIslandRowId = null;
  sandbox.OC.App.myIslandFingerprint = '';
  sandbox.OC.Overlay.memActive = { 2074: true };
  sandbox.OC.App._dcRows = [{
    id: 55,
    tracker_id: 'preview-only',
    pot_history: '[{"fate_id":2072,"spawn_time":100,"death_time":110}]',
  }];
  sandbox._previewMatch = { id: 'preview-only', rowId: 55 };
  const preview = sandbox.OC.App.updatePreviewIsland();
  assert.equal(preview.id, 'preview-only');
  assert.equal(sandbox.OC.App.myIslandRowId, null, 'snapshot preview must never authorize writes');
  applied = null;
  assert.equal(
    sandbox.OC.App.bindMatchedIsland({
      id: 'preview-only',
      rowId: 55,
      fingerprint,
    }),
    'preview-only',
  );
  assert.equal(applied.record.id, 55, 'a later strict match must reuse the prefetched row immediately');
  sandbox._previewMatch = null;
  sandbox.OC.Overlay.memActive = {};

  sandbox.OC.App._island = {
    ce: [],
    fate: [{ fate_id: 2074, spawn_time: 123456, death_time: -1, last_seen: 123500 }],
    pot: [],
  };
  sandbox.OC.Overlay.memMeta[2074] = {
    active: true,
    spawnEpoch: 999999,
    spawnTrusted: false,
    lastSeen: 1000000,
  };
  const snapshotRecord = sandbox.OC.App.buildLocalTrackerRecord(secondFingerprint);
  assert.equal(
    JSON.parse(snapshotRecord.fate_history)[0].spawn_time,
    123456,
    'initial Add replay must not overwrite a shared StartTimeEpoch',
  );
  sandbox.OC.Overlay.memMeta[2074] = {
    active: false,
    spawnEpoch: 123456,
    spawnTrusted: true,
    deathEpoch: 123500,
  };

  let createCalls = 0;
  sandbox.OC.App.myIslandId = null;
  sandbox.OC.App.myIslandRowId = null;
  sandbox.OC.App.myIslandFingerprint = '';
  sandbox.OC.App._island = null;
  sandbox.OC.App._islands = [];
  sandbox.OC.App._missingTrackerChecks = {};
  sandbox.OC.Api.fetchIslandByFingerprints = function () {
    return Promise.resolve([]);
  };
  sandbox.OC.Api.createIslandTracker = function (record) {
    createCalls += 1;
    assert.equal(record.last_fate, secondFingerprint);
    assert.equal(record.territory, 1346);
    assert.equal(record.datacenter, 103);
    assert.equal(record.tracker_type, 1);
    const fates = JSON.parse(record.fate_history);
    assert.equal(fates[0].spawn_time, 123456);
    return Promise.resolve({
      id: 77,
      tracker_id: 'new-island',
      territory: 1346,
      datacenter: 103,
      last_fate: secondFingerprint,
      last_update: 123501,
      encounter_history: record.encounter_history,
      fate_history: record.fate_history,
      pot_history: record.pot_history,
    });
  };
  const unrelatedMissing = {
    fingerprint: 'C'.repeat(64),
    fingerprints: ['C'.repeat(64)],
    events: [],
    territory: 1346,
    dc: 103,
    generation: sandbox.OC.App._locateGeneration || 0,
  };
  const firstMissing = {
    fingerprint: secondFingerprint,
    fingerprints: [secondFingerprint],
    events: [],
    territory: 1346,
    dc: 103,
    generation: sandbox.OC.App._locateGeneration || 0,
  };
  const secondMissing = {
    fingerprint: secondFingerprint,
    fingerprints: [secondFingerprint],
    events: [],
    territory: 1346,
    dc: 103,
    generation: sandbox.OC.App._locateGeneration || 0,
  };
  assert.equal(await sandbox.OC.App.checkOrCreateIsland(unrelatedMissing), false);
  assert.equal(await sandbox.OC.App.checkOrCreateIsland(firstMissing), false);
  assert.equal(createCalls, 0, 'one missing check must not create a duplicate island');
  assert.equal(await sandbox.OC.App.checkOrCreateIsland(secondMissing), true);
  assert.equal(createCalls, 1);
  assert.equal(sandbox.OC.App.myIslandRowId, 77);
  assert.equal(sandbox.OC.App.myIslandId, 'new-island');
  sandbox.OC.App._island = {
    ce: JSON.parse(applied.record.encounter_history),
    fate: JSON.parse(applied.record.fate_history),
    pot: JSON.parse(applied.record.pot_history),
  };

  let updatedRowId = 0;
  sandbox.OC.Api.updateIslandTracker = function (rowId, record) {
    updatedRowId = rowId;
    assert.equal(record.last_fate, secondFingerprint);
    return Promise.resolve({
      id: rowId,
      tracker_id: 'new-island',
      territory: 1346,
      datacenter: 103,
      last_fate: record.last_fate,
      last_update: 123502,
      encounter_history: record.encounter_history,
      fate_history: record.fate_history,
      pot_history: record.pot_history,
    });
  };
  sandbox.OC.App._pendingUploadFingerprint = secondFingerprint;
  assert.equal(await sandbox.OC.App.flushIslandUpload(), true);
  assert.equal(updatedRowId, 77, 'updates must target the bound database row');
  console.log('locator tests passed');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
