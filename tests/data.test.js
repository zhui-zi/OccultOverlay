'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = { console };
sandbox.window = sandbox;
sandbox.global = sandbox;

for (const file of ['../js/data.js', '../data/mapPoints.js']) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: file });
}

const OC = sandbox.OC;
assert.equal(OC.TERRITORIES[1346].mapId, 1135);
assert.equal(OC.TERRITORIES[1346].fateIds.length, 11);
assert.equal(OC.TERRITORIES[1346].potIds.length, 2);
assert.equal(OC.TERRITORIES[1346].ceIds.length, 17);

assert.equal(OC.FATES[2074].name.en, 'Raging Thrall');
assert.equal(OC.POTS[2072].name.en, 'Daylight Pottery (North)');
assert.equal(OC.CES[65].name.en, 'The Forked Tower: Magic (Extreme)');

assert.equal(OC.selectMap(1346), true);
assert.equal(OC.MAP.background, 'assets/map-north.png');
assert.deepEqual(Array.from(OC.MAP.encounters[2084]), [140, -708]);
assert.equal(OC.selectMap(1252), true);
assert.equal(OC.MAP.background, 'assets/map.png');

console.log('data tests passed');
