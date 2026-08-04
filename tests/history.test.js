'use strict';

const assert = require('node:assert/strict');
const root = require('../js/history.js');

const alive = root.OC.historyAlive;
const lastUpdate = 2000;

assert.equal(alive({ state: 0, spawn_time: 1900, death_time: -1, last_seen: 1999 }, lastUpdate), true);
assert.equal(
  alive({ state: 0, spawn_time: 1950, death_time: 1800, last_seen: 1999 }, lastUpdate),
  true,
  'a fresh observation can prove a new cycle even when the prior death timestamp is earlier',
);
assert.equal(
  alive({ state: 0, spawn_time: 1900, death_time: 1800, last_seen: 1800 }, lastUpdate),
  false,
  'an inverted timestamp must not keep a stale FATE alive forever',
);
assert.equal(
  alive({ state: 3, spawn_time: -1, death_time: -1, last_seen: 1800 }, lastUpdate),
  false,
  'a stale CE state must not survive a newer tracker upload',
);
assert.equal(alive({ state: 3, spawn_time: -1, death_time: -1, last_seen: 1999 }, lastUpdate), true);
assert.equal(alive({ state: 0, spawn_time: 1900, death_time: 1950, last_seen: 1999 }, lastUpdate), false);
assert.equal(alive({ state: 0, spawn_time: -1, death_time: -1, last_seen: 1999 }, lastUpdate), false);
assert.equal(
  alive({ state: 0, spawn_time: 900, death_time: -1, last_seen: 999 }, 1000, 999999),
  true,
  'freshness must use the uploader clock instead of the viewer clock',
);
