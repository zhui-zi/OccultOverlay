'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = require('../js/pots.js');

root.OC.POTS = {
  1976: { side: 'north' },
  1977: { side: 'south' }
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

next = Pots.status([pot(1976, 1000, 1100)], 4700);
assert.equal(next.nextEpoch, 6400);
assert.equal(next.etaSec, 1700);
assert.equal(next.side, 'south');
assert.equal(next.cycles, 3);

next = Pots.status([pot(1977, 2000, 2100)], 1900);
assert.equal(next.nextEpoch, 2000);
assert.equal(next.side, 'south');

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
const overview = Pots.dcOverview(rows, 4700);
assert.equal(overview.length, 1);
assert.equal(overview[0].id, 'new');
assert.equal(overview[0].sources, 2);
assert.ok(overview[0].etaSec > 0);

const islands = Pots.islandList(rows, 4700);
assert.equal(islands.length, 1);
assert.equal(islands[0].id, 'new');

const expectedFingerprint = drFingerprint(101, 1962, 1720000000);
assert.equal(Pots.contextFingerprint(101, 1962, 1720000000), expectedFingerprint);
assert.ok(Pots.contextFingerprints(101, 1962, 1720000001, 1).includes(expectedFingerprint));

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

console.log('pots tests passed');
