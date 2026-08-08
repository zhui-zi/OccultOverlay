'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = require('../js/history.js');
global.window = root;
require('../js/pots.js');
delete global.window;

root.OC.POTS = {
  1976: { side: 'north' },
  1977: { side: 'south' },
  2072: { side: 'north' },
  2073: { side: 'south' }
};

const Pots = root.OC.Pots;

function drFingerprint(dc, fateId, epoch) {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32LE(dc, 0);
  bytes.writeUInt32LE(fateId, 4);
  bytes.writeUInt32LE(epoch, 8);
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function pot(id, spawn, death, seen) {
  return {
    fate_id: id,
    spawn_time: spawn,
    death_time: death,
    last_seen: seen == null ? spawn : seen
  };
}

assert.equal(Pots.status([], 1000), null);

assert.deepEqual(
  Pots.status([pot(1976, 1000, -1, 1100)], 1200),
  {
    alive: true,
    nextEpoch: 2800,
    etaSec: 1600,
    side: 'north',
    anchorEpoch: 1000,
    anchorId: 1976,
    cycles: 0
  }
);

let next = Pots.status([pot(1976, 1000, 1100)], 1200);
assert.equal(next.alive, false);
assert.equal(next.nextEpoch, 2800);
assert.equal(next.etaSec, 1600);
assert.equal(next.side, 'south');
assert.equal(Pots.status([pot(1976, 1000, 1100)], 2799).etaSec, 1);
assert.equal(Pots.status([pot(1976, 1000, 1100)], 2800), null);

next = Pots.status([pot(1976, 1000, 1100)], 4700);
assert.equal(next, null, 'an expired observation must not create later 30-minute predictions');

next = Pots.status([pot(1977, 2000, 2100)], 1900);
assert.equal(next, null, 'a future observation cannot anchor a precise prediction');

const merged = Pots.merge(
  [pot(1976, 1000, -1, 1050), pot(1977, 900, 950, 950)],
  [pot(1976, 1000, 1100, 1100)]
);
assert.equal(merged.filter((entry) => entry.fate_id === 1976)[0].death_time, 1100);

const rows = [
  {
    id: 1,
    tracker_id: 'old',
    datacenter: 101,
    last_fate: 'same-island',
    last_update: 4000,
    pot_history: JSON.stringify([pot(1976, 1000, 1100)]),
    encounter_history: '[]',
    fate_history: '[]'
  },
  {
    id: 2,
    tracker_id: 'new',
    datacenter: 101,
    last_fate: 'same-island',
    last_update: 4100,
    pot_history: JSON.stringify([pot(1976, 1000, 1100)]),
    encounter_history: '[]',
    fate_history: '[]'
  }
];
const overview = Pots.dcOverview(rows, 1200);
assert.equal(overview.length, 1);
assert.equal(overview[0].id, 'new');
assert.equal(overview[0].sources, 2);
assert.ok(overview[0].etaSec > 0);
assert.equal(Pots.dcOverview(rows, 4700).length, 0, 'stale pot rows must disappear from the overview');

const islands = Pots.islandList(rows, 4700);
assert.equal(islands.length, 1);
assert.equal(islands[0].id, 'new');

const expectedFingerprint = drFingerprint(101, 1962, 1720000000);
assert.equal(Pots.contextFingerprint(101, 1962, 1720000000), expectedFingerprint);
assert.ok(Pots.contextFingerprints(101, 1962, 1720000001, 1).includes(expectedFingerprint));

// Field replay: ACT Add at 2026-07-28 07:31:29 +08:00 on CN DC 103.
const observedFingerprint = '2DE19B44DAC2C6E0FBE683AD311F9ACEF44A326B6B37D7AB27DF4CDD937CCC8D';
assert.equal(Pots.contextFingerprint(103, 1962, 1785195089), observedFingerprint);
assert.equal(Pots.contextFingerprints(103, 2074, 1785195089, 0).length, 1);
assert.equal(Pots.contextFingerprints(103, 2072, 1785195089, 0).length, 0);

assert.equal(Pots.status([pot(2072, 3000, 3100)], 3200).side, 'south');

const fingerprintIslands = [
  { id: 'mine', rowId: 10, dc: 101, fingerprint: expectedFingerprint, activeEvents: [] },
  { id: 'other', rowId: 11, dc: 101, fingerprint: drFingerprint(101, 1963, 1720000000), activeEvents: [] }
];
assert.equal(
  Pots.matchIsland(fingerprintIslands, { fingerprints: [expectedFingerprint], events: [] }, 101, 15).id,
  'mine'
);
assert.equal(
  Pots.matchIsland(fingerprintIslands, { fingerprints: [expectedFingerprint], events: [] }, 102, 15),
  null
);
assert.equal(
  Pots.matchIsland(
    fingerprintIslands,
    {
      fingerprint: expectedFingerprint,
      fingerprints: [expectedFingerprint, fingerprintIslands[1].fingerprint],
      events: []
    },
    101,
    15
  ).id,
  'mine',
  'the exact AutoPopper fingerprint must win over tolerance candidates'
);

const territoryIslands = [
  { id: 'south', rowId: 30, territory: 1252, dc: 101, fingerprint: expectedFingerprint, activeEvents: [] },
  { id: 'north', rowId: 31, territory: 1346, dc: 101, fingerprint: expectedFingerprint, activeEvents: [] }
];
assert.equal(
  Pots.matchIsland(territoryIslands, { territory: 1346, fingerprints: [expectedFingerprint], events: [] }, 101, 15).id,
  'north'
);

const ceDeadline = 1785643097;
const ceRows = [
  {
    id: 32,
    tracker_id: 'ce-mine',
    territory: 1346,
    datacenter: 101,
    last_fate: '',
    last_update: ceDeadline - 10,
    encounter_history: JSON.stringify([
      {
        fate_id: 49, state: 2, pop_time: ceDeadline,
        spawn_time: -1, death_time: -1, last_seen: ceDeadline - 10,
      },
    ]),
    fate_history: '[]',
    pot_history: '[]',
  },
  {
    id: 33,
    tracker_id: 'ce-other',
    territory: 1346,
    datacenter: 101,
    last_fate: '',
    last_update: ceDeadline - 10,
    encounter_history: JSON.stringify([
      {
        fate_id: 49, state: 2, pop_time: ceDeadline + 60,
        spawn_time: -1, death_time: -1, last_seen: ceDeadline - 10,
      },
    ]),
    fate_history: '[]',
    pot_history: '[]',
  },
];
const ceIslands = Pots.islandList(ceRows, ceDeadline - 10);
assert.deepEqual(ceIslands[0].cePhases, [{ fateId: 49, status: 2, popTime: ceDeadline }]);
assert.equal(
  Pots.matchIsland(
    ceIslands,
    { territory: 1346, cePhases: [{ fateId: 49, status: 2, popTime: ceDeadline }] },
    101,
    15,
  ).id,
  'ce-mine',
  'one unique CE phase signature must identify the island without a local spawn observation',
);
ceIslands[1].cePhases[0].popTime = ceDeadline;
assert.equal(
  Pots.matchIsland(
    ceIslands,
    { territory: 1346, cePhases: [{ fateId: 49, status: 2, popTime: ceDeadline }] },
    101,
    15,
  ),
  null,
  'a duplicated CE phase signature must remain ambiguous',
);

const exactFingerprint = 'A'.repeat(64);
assert.equal(
  Pots.matchIsland([
    {
      id: 'wrong-ce', rowId: 32, dc: 101, territory: 1346, fingerprint: 'B'.repeat(64),
      cePhases: [{ fateId: 49, status: 2, popTime: ceDeadline }],
    },
    {
      id: 'exact-fate', rowId: 33, dc: 101, territory: 1346, fingerprint: exactFingerprint,
      cePhases: [],
    },
  ], {
    territory: 1346,
    fingerprint: exactFingerprint,
    fingerprints: [exactFingerprint],
    cePhases: [{ fateId: 49, status: 2, popTime: ceDeadline }],
  }, 101, 15).id,
  'exact-fate',
  'an exact FATE fingerprint must outrank a coincidental CE phase match',
);

const livenessRows = [{
  id: 34,
  tracker_id: 'liveness',
  territory: 1252,
  datacenter: 101,
  last_fate: '',
  last_update: 5000,
  encounter_history: JSON.stringify([
    { fate_id: 1, state: 3, spawn_time: -1, death_time: -1, last_seen: 4800, pop_time: 6000 },
  ]),
  fate_history: JSON.stringify([
    pot(1962, 4900, 4800, 4800),
    pot(1963, 4950, 4800, 4999),
  ]),
  pot_history: '[]',
}];
const livenessIsland = Pots.islandList(livenessRows, 5000)[0];
assert.deepEqual(livenessIsland.aliveIds, [1963]);
assert.deepEqual(livenessIsland.activeDirectorIds, [1963]);
assert.deepEqual(livenessIsland.cePhases, [], 'stale CE state must not become island evidence');

const timedIslands = [
  { id: 'a', rowId: 20, dc: 101, fingerprint: '', activeEvents: [{ fateId: 1964, spawnEpoch: 2000 }] },
  { id: 'b', rowId: 21, dc: 101, fingerprint: '', activeEvents: [{ fateId: 1964, spawnEpoch: 2100 }] }
];
assert.equal(
  Pots.matchIsland(timedIslands, { events: [{ fateId: 1964, spawnEpoch: 2002 }] }, 101, 15).id,
  'a'
);
timedIslands[1].activeEvents[0].spawnEpoch = 2004;
assert.equal(
  Pots.matchIsland(timedIslands, { events: [{ fateId: 1964, spawnEpoch: 2002 }] }, 101, 15),
  null
);
assert.equal(
  Pots.matchIsland(timedIslands, { events: [{ fateId: 1964 }] }, 101, 15),
  null
);

const endedIslands = [
  {
    id: 'ended-mine',
    rowId: 40,
    dc: 101,
    endEvents: [{ fateId: 1964, deathEpoch: 3000 }, { fateId: 1965, deathEpoch: 4000 }],
  },
  { id: 'ended-other', rowId: 41, dc: 101, endEvents: [{ fateId: 1964, deathEpoch: 3200 }] },
];
assert.equal(
  Pots.matchIsland(
    endedIslands,
    {
      ends: [
        { fateId: 1964, deathEpoch: 3004 },
        { fateId: 1965, deathEpoch: 3998 },
      ],
      events: [],
    },
    101,
    15,
  ).id,
  'ended-mine',
  'a unique Remove timestamp must confirm the cloud row',
);

const duplicateEndedIslands = [
  {
    id: 'duplicate-old',
    rowId: 42,
    dc: 101,
    lastUpdate: 4100,
    endEvents: [{ fateId: 1964, deathEpoch: 3000 }, { fateId: 1965, deathEpoch: 4000 }],
  },
  {
    id: 'duplicate-new',
    rowId: 43,
    dc: 101,
    lastUpdate: 4200,
    endEvents: [{ fateId: 1964, deathEpoch: 3002 }, { fateId: 1965, deathEpoch: 3999 }],
  },
];
assert.equal(
  Pots.matchIsland(
    duplicateEndedIslands,
    {
      ends: [
        { fateId: 1964, deathEpoch: 3004 },
        { fateId: 1965, deathEpoch: 3998 },
      ],
      events: [],
    },
    101,
    15,
  ).id,
  'duplicate-new',
  'two matching Remove timestamps must collapse duplicate rows to the freshest reporter',
);
assert.equal(
  Pots.matchIsland(
    duplicateEndedIslands,
    { ends: [{ fateId: 1964, deathEpoch: 3004 }], events: [] },
    101,
    15,
  ),
  null,
  'one matching Remove timestamp must keep duplicate rows ambiguous',
);

const duplicateActiveIslands = [
  {
    id: 'active-old',
    rowId: 44,
    dc: 101,
    lastUpdate: 4300,
    activeEvents: [{ fateId: 1964, spawnEpoch: 3000 }, { fateId: 1965, spawnEpoch: 4000 }],
  },
  {
    id: 'active-new',
    rowId: 45,
    dc: 101,
    lastUpdate: 4400,
    activeEvents: [{ fateId: 1964, spawnEpoch: 3001 }, { fateId: 1965, spawnEpoch: 4002 }],
  },
];
assert.equal(
  Pots.matchIsland(
    duplicateActiveIslands,
    {
      events: [
        { fateId: 1964, spawnEpoch: 3000 },
        { fateId: 1965, spawnEpoch: 4000 },
      ],
    },
    101,
    15,
  ).id,
  'active-new',
  'two matching Add timestamps must collapse duplicate rows to the freshest reporter',
);

const duplicateFingerprint = 'D'.repeat(64);
assert.equal(
  Pots.matchIsland([
    { id: 'fingerprint-old', rowId: 46, dc: 101, lastUpdate: 4500, fingerprint: duplicateFingerprint },
    { id: 'fingerprint-new', rowId: 47, dc: 101, lastUpdate: 4600, fingerprint: duplicateFingerprint },
  ], {
    fingerprint: duplicateFingerprint,
    fingerprints: [duplicateFingerprint],
  }, 101, 15).id,
  'fingerprint-new',
  'an exact fingerprint must collapse duplicate rows to the freshest reporter',
);

const consistentRows = [{
  id: 50,
  tracker_id: 'snapshot-mine',
  territory: 1252,
  datacenter: 101,
  last_fate: expectedFingerprint,
  last_update: 1720000100,
  encounter_history: '[]',
  fate_history: JSON.stringify([pot(1962, 1720000000, -1)]),
  pot_history: JSON.stringify([pot(1976, 1720000010, -1)]),
}];
const consistentIsland = Pots.islandList(consistentRows, 1720000100)[0];
assert.equal(consistentIsland.fingerprintValid, true);
assert.deepEqual(consistentIsland.activeDirectorIds, [1962, 1976]);
assert.equal(
  Pots.matchSnapshotIsland([consistentIsland], [1976, 1962], 101, 1252).id,
  'snapshot-mine',
);
assert.equal(
  Pots.matchSnapshotIsland(
    [consistentIsland, { ...consistentIsland, id: 'ambiguous', rowId: 51 }],
    [1962, 1976],
    101,
    1252,
  ),
  null,
  'an ambiguous initial snapshot must remain unconfirmed',
);
assert.equal(
  Pots.matchSnapshotIsland(
    [{ ...consistentIsland, fingerprint: 'C'.repeat(64), fingerprintValid: false }],
    [1962, 1976],
    101,
    1252,
    1720000100,
  ),
  null,
  'a malformed tracker fingerprint must not drive fast preview',
);
const recoveredIsland = {
  ...consistentIsland,
  fingerprintValid: false,
  fingerprintFateId: undefined,
  fingerprintSpawnEpoch: undefined,
};
assert.equal(
  Pots.matchSnapshotIsland([recoveredIsland], [1962, 1976], 101, 1252, 1720000100).id,
  'snapshot-mine',
  'a unique active-state candidate may validate its fingerprint in a bounded local window',
);
assert.equal(recoveredIsland.fingerprintFateId, 1962);
assert.equal(recoveredIsland.fingerprintSpawnEpoch, 1720000000);

console.log('pots tests passed');
