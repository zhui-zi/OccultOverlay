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
assert.equal(OC.FATES[2074].name.ja, '暴力の牛魔「ミノタウロス・マキア」');
assert.equal(OC.POTS[2072].name.en, 'Daylight Pottery (North)');
assert.equal(OC.CES[65].name.en, 'The Forked Tower: Magic (Extreme)');
assert.equal(OC.CES[65].type, 'tower-extreme');
assert.equal(OC.CES[49].spawn_type, true);
assert.equal(OC.CES[49].monster.en, 'Pelekys');
assert.equal(OC.CES[50].monster.en, 'Crescent Blackguard');
assert.equal(OC.CES[53].monster.en, 'Crescent Big Horn');
assert.equal(OC.CES[61].monster.en, 'Crescent Wraith');
assert.equal(OC.ITEMS[50974].name.zh, '消幻晶α');
assert.equal(OC.ITEMS[50975].name.en, 'Phantom Dispeller β');
assert.equal(OC.ITEMS[50976].img, 'ui/icon/026000/026230.tex');
assert.deepEqual(Array.from(OC.FATES[2074].drops), []);
assert.deepEqual(Array.from(OC.POTS[2072].drops), []);
assert.deepEqual(Array.from(OC.CES[49].drops), []);
assert.deepEqual(Array.from(OC.CES[64].drops), []);

assert.equal(OC.selectMap(1346), true);
assert.equal(OC.MAP.background, 'assets/map-north.png');
assert.equal(OC.MAP.points.bronze.length, 55);
assert.equal(OC.MAP.points.silver.length, 7);
assert.equal(OC.MAP.points.potAny.length, 80);
assert.equal(OC.MAP.points.bunny.length, 25);
assert.deepEqual(Array.from(OC.MAP.encounters[2084]), [140, -708]);

OC.Settings = {
  get(key) {
    if (key === 'mapLayers') return { potAny: true };
    if (key === 'lang') return 'en';
    return null;
  },
};
OC.Overlay = { playerPos: null, bossPos: {} };
OC.State = { highlights: [] };
vm.runInNewContext(fs.readFileSync(require.resolve('../js/map.js'), 'utf8'), sandbox, { filename: '../js/map.js' });
const mapTarget = { innerHTML: '' };
OC.Map.render(mapTarget);
assert.equal((mapTarget.innerHTML.match(/fill="#79c8ff"/g) || []).length, 80);

assert.equal(OC.selectMap(1252), true);
assert.equal(OC.MAP.background, 'assets/map.png');

console.log('data tests passed');
