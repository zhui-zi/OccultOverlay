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
assert.deepEqual(Array.from(OC.TERRITORIES[1346].mapIds), [1135, 1244]);
assert.equal(OC.TERRITORIES[1346].fateIds.length, 11);
assert.equal(OC.TERRITORIES[1346].potIds.length, 2);
assert.equal(OC.TERRITORIES[1346].ceIds.length, 17);
assert.equal(OC.TERRITORIES[1346].name.zh, '蜃景幻界新月岛 北征之章');

assert.equal(OC.FATES[2074].name.en, 'Raging Thrall');
assert.equal(OC.FATES[2074].name.zh, '暴力牛魔—好战弥诺陶洛斯');
assert.equal(OC.FATES[2074].name.ja, '暴力の牛魔「ミノタウロス・マキア」');
assert.equal(OC.POTS[2072].name.en, 'Daylight Pottery (North)');
assert.equal(OC.POTS[2073].name.zh, '被吹飞的魔法罐(南)');
assert.equal(OC.CES[65].name.en, 'The Forked Tower: Magic (Extreme)');
assert.equal(OC.CES[65].name.zh, '两歧塔 超魔之塔');
assert.equal(OC.CES[65].type, 'tower-extreme');
assert.equal(OC.CES[49].spawn_type, true);
assert.equal(OC.CES[49].monster.en, 'Pelekys');
assert.equal(OC.CES[50].monster.en, 'Crescent Blackguard');
assert.equal(OC.CES[53].monster.en, 'Crescent Big Horn');
assert.equal(OC.CES[55].monster.en, 'Crescent Hellhound');
assert.equal(OC.CES[61].monster.en, 'Crescent Wraith');
assert.equal(OC.ITEMS[50974].name.zh, '消幻晶α');
assert.equal(OC.ITEMS[50975].name.en, 'Phantom Dispeller β');
assert.equal(OC.ITEMS[50976].img, 'ui/icon/026000/026230.tex');
assert.equal(OC.ITEMS[51972].name.en, "Blue Mage's Soul Shard");
assert.equal(OC.ITEMS[51974].name.zh, '灵魂碎晶：死灵法师');
assert.equal(OC.ITEMS[51979].name.ja, '探査記録:アルバテル');
assert.equal(OC.ITEMS[51988].cat, 'notes');
for (const item of Object.values(OC.ITEMS)) {
  if (item.cat === 'notes') assert.match(item.name.zh, /^调查记录：/);
}
assert.deepEqual(Array.from(OC.FATES[2074].drops), []);
assert.deepEqual(Array.from(OC.POTS[2072].drops), []);
assert.deepEqual(Array.from(OC.CES[49].drops), []);
assert.deepEqual(Array.from(OC.CES[50].drops), [51988]);
assert.deepEqual(Array.from(OC.CES[57].drops), [51974, 51984]);
assert.deepEqual(Array.from(OC.CES[59].drops), [51972, 51983]);
assert.deepEqual(Array.from(OC.CES[63].drops), [51982]);
assert.deepEqual(Array.from(OC.CES[64].drops), []);

const north = OC.TERRITORIES[1346];
for (const id of north.fateIds) assert.ok(OC.FATES[id].name.zh, `FATE ${id} is missing zh-CN`);
for (const id of north.potIds) assert.ok(OC.POTS[id].name.zh, `Pot FATE ${id} is missing zh-CN`);
for (const id of north.ceIds) {
  assert.ok(OC.CES[id].name.zh, `CE ${id} is missing zh-CN`);
  if (OC.CES[id].monster) assert.ok(OC.CES[id].monster.zh, `CE ${id} trigger monster is missing zh-CN`);
}

const i18nSandbox = {
  OC: { Settings: { get() { return 'zh'; } } },
};
i18nSandbox.window = i18nSandbox;
vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'), 'utf8'), i18nSandbox, { filename: '../js/i18n.js' });
assert.equal(i18nSandbox.OC.i18n.t('alert_dispeller_pending'), '各 FATE/CE 的消幻晶掉落对应关系尚无数据。');
assert.equal(i18nSandbox.OC.i18n.t('island_unknown'), '未知');

assert.equal(OC.selectMap(1346), true);
assert.equal(OC.MAP.background, 'assets/map-north.png');
assert.equal(OC.MAP.points.bronze.length, 55);
assert.equal(OC.MAP.points.silver.length, 7);
assert.equal(OC.MAP.points.potNorth.length, 30);
assert.equal(OC.MAP.points.potSouth.length, 30);
assert.equal(OC.MAP.points.reroll.length, 20);
assert.equal(OC.MAP.points.bunny.length, 25);
assert.deepEqual(Array.from(OC.MAP.encounters[2084]), [140, -708]);

assert.equal(OC.selectMap(1346, { y: -100 }), true);
assert.equal(OC.MAP.mapId, 1244);
assert.equal(OC.MAP.variant, 'subterrane');
assert.equal(OC.MAP.background, 'assets/map-north-subterrane.png');
assert.equal(OC.MAP.points.bronze.length, 5);
assert.equal(OC.MAP.points.silver.length, 1);
assert.equal(OC.MAP.points.potNorth.length, 0);
assert.equal(OC.MAP.points.potSouth.length, 0);
assert.equal(OC.MAP.points.reroll.length, 0);
assert.equal(OC.MAP.points.bunny.length, 0);
assert.deepEqual(Array.from(OC.MAP.points.silver[0]), [223.6532, -30.64362]);
assert.equal(OC.selectMap(1346, { y: -40 }), true);
assert.equal(OC.MAP.mapId, 1135);

const subterraneMap = fs.readFileSync(require.resolve('../assets/map-north-subterrane.png'));
assert.equal(subterraneMap.toString('ascii', 1, 4), 'PNG');
assert.equal(subterraneMap.readUInt32BE(16), 2048);
assert.equal(subterraneMap.readUInt32BE(20), 2048);

OC.Settings = {
  get(key) {
    if (key === 'mapLayers') return { potN: true, potS: true, reroll: true };
    if (key === 'lang') return 'en';
    return null;
  },
};
OC.Overlay = { playerPos: null, bossPos: {} };
OC.State = { highlights: [] };
vm.runInNewContext(fs.readFileSync(require.resolve('../js/map.js'), 'utf8'), sandbox, { filename: '../js/map.js' });
const mapTarget = { innerHTML: '' };
OC.Map.render(mapTarget);
assert.equal((mapTarget.innerHTML.match(/fill="#4a90ff"/g) || []).length, 30);
assert.equal((mapTarget.innerHTML.match(/fill="#ff8a3c"/g) || []).length, 30);
assert.equal((mapTarget.innerHTML.match(/fill="#c56bff"/g) || []).length, 20);

assert.equal(OC.selectMap(1252), true);
assert.equal(OC.MAP.background, 'assets/map.png');

console.log('data tests passed');
