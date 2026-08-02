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
// EN/JA game-name assertions mirror EurekaTrackerAutoPopper@cd0dcf5.
assert.equal(OC.TERRITORIES[1346].mapId, 1135);
assert.deepEqual(Array.from(OC.TERRITORIES[1346].mapIds), [1135, 1244]);
assert.equal(OC.TERRITORIES[1346].fateIds.length, 11);
assert.equal(OC.TERRITORIES[1346].potIds.length, 2);
assert.equal(OC.TERRITORIES[1346].ceIds.length, 16);
assert.equal(OC.TERRITORIES[1252].towerId, 48);
assert.equal(OC.TERRITORIES[1346].towerId, 64);
assert.equal(OC.TERRITORIES[1252].towerSpawnTimer, 3600);
assert.equal(OC.TERRITORIES[1346].towerSpawnTimer, 3600);
assert.equal(OC.TERRITORIES[1346].name.zh, '蜃景幻界新月岛 北征之章');
assert.equal(OC.TERRITORIES[1252].name.en, 'South Horn');
assert.equal(OC.TERRITORIES[1252].name.ja, '南征編');
assert.equal(OC.TERRITORIES[1346].name.en, 'North Horn');
assert.equal(OC.TERRITORIES[1346].name.ja, '北征編');

assert.equal(OC.FATES[2074].name.en, 'Raging Thrall');
assert.equal(OC.FATES[2074].name.zh, '暴力牛魔—好战弥诺陶洛斯');
assert.equal(OC.FATES[2074].name.ja, '暴力の牛魔「ミノタウロス・マキア」');
assert.equal(OC.POTS[1976].name.en, 'Pleading Pots (North)');
assert.equal(OC.POTS[1976].name.ja, 'しあわせのマジックポット (北)');
assert.equal(OC.POTS[1977].name.en, 'Persistent Pots (South)');
assert.equal(OC.POTS[1977].name.ja, 'カチカチのマジックポット (南)');
assert.equal(OC.POTS[2072].name.en, 'Daylight Pottery (North)');
assert.equal(OC.POTS[2072].name.ja, '隠されのマジックポット (北)');
assert.equal(OC.POTS[2073].name.zh, '被吹飞的魔法罐(南)');
assert.equal(OC.POTS[2073].name.ja, '飛ばされのマジックポット (南)');
assert.equal(OC.CES[65], undefined);
const southTriggerNames = {
  33: '新月鬼鱼',
  37: '新月墨渍',
  39: '新月比布鲁斯',
  41: '新月小瓣齿鲨',
  42: '新月风扇',
  44: '新月加鲁拉',
};
for (const [id, name] of Object.entries(southTriggerNames)) {
  assert.equal(OC.CES[id].spawn_type, true);
  assert.equal(OC.CES[id].monster.zh, name);
  assert.equal(OC.CES[id].monster_image, `assets/trigger-monsters/${id}.png`);
  const image = fs.readFileSync(require.resolve(`../${OC.CES[id].monster_image}`));
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
}
assert.equal(OC.CES[49].spawn_type, true);
assert.equal(OC.CES[49].monster.en, 'Crescent Wamoura');
assert.equal(OC.CES[49].monster.zh, '新月瓦魔蛾');
assert.equal(OC.CES[49].monster.ja, 'クレセント・ワモーラ');
assert.equal(OC.CES[50].monster.en, 'Crescent Blackguard');
assert.equal(OC.CES[53].monster.en, 'Crescent Big Horn');
assert.equal(OC.CES[55].monster.en, 'Crescent Hellhound');
assert.equal(OC.CES[59].spawn_type, false);
assert.equal(OC.CES[59].monster, undefined);
assert.equal(OC.CES[61].spawn_type, false);
assert.equal(OC.CES[61].monster, undefined);
for (const id of [49, 50, 53, 55]) {
  assert.equal(OC.CES[id].monster_image, `assets/trigger-monsters/${id}.png`);
  const image = fs.readFileSync(require.resolve(`../${OC.CES[id].monster_image}`));
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
}
assert.equal(OC.ITEMS[49831].name.en, 'Occult Earrings of Magic');
assert.equal(OC.ITEMS[49832].name.en, 'Occult Necklace of Magic');
assert.equal(OC.ITEMS[50974].name.zh, '消幻晶α');
assert.equal(OC.ITEMS[50975].name.en, 'Phantom Dispeller β');
assert.equal(OC.ITEMS[50976].img, 'ui/icon/026000/026230.tex');
assert.equal(OC.ITEMS[51972].name.en, "Blue Mage's Soul Shard");
assert.equal(OC.ITEMS[51974].name.zh, '灵魂碎晶：死灵法师');
assert.equal(OC.ITEMS[51979].name.ja, '探査記録:アルバテル');
assert.equal(OC.ITEMS[51988].cat, 'notes');
assert.equal(OC.WEAKNESS.fire.name.zh, '火');
assert.equal(OC.WEAKNESS.ice.img, 'ui/icon/229000/229984_hr1.tex');
for (const item of Object.values(OC.ITEMS)) {
  if (item.cat === 'notes') assert.match(item.name.zh, /^调查记录：/);
}
assert.deepEqual(Array.from(OC.FATES[2074].drops), [50974]);
assert.deepEqual(Array.from(OC.FATES[2074].weakness), ['fire']);
assert.deepEqual(Array.from(OC.FATES[2081].weakness), ['wind', 'lightning']);
assert.deepEqual(Array.from(OC.POTS[2072].drops), [50976]);
assert.deepEqual(Array.from(OC.POTS[2072].weakness), ['fire']);
assert.deepEqual(Array.from(OC.POTS[2073].drops), [50975]);
assert.deepEqual(Array.from(OC.CES[49].drops), [50974]);
assert.deepEqual(Array.from(OC.CES[50].drops), [49832, 49827, 51988, 50976]);
assert.deepEqual(Array.from(OC.CES[57].drops), [49832, 49827, 51974, 51984, 50975]);
assert.deepEqual(Array.from(OC.CES[59].drops), [49831, 49826, 51972, 51983, 50974]);
assert.deepEqual(Array.from(OC.CES[63].drops), [49831, 49826, 51982, 50976]);
assert.deepEqual(Array.from(OC.CES[49].weakness), ['ice']);
assert.deepEqual(Array.from(OC.CES[58].weakness), ['lightning']);
assert.deepEqual(Array.from(OC.CES[64].drops), []);

const north = OC.TERRITORIES[1346];
for (const id of north.fateIds) assert.ok(OC.FATES[id].name.zh, `FATE ${id} is missing zh-CN`);
for (const id of north.potIds) assert.ok(OC.POTS[id].name.zh, `Pot FATE ${id} is missing zh-CN`);
for (const id of north.ceIds) {
  assert.ok(OC.CES[id].name.zh, `CE ${id} is missing zh-CN`);
  if (OC.CES[id].monster) assert.ok(OC.CES[id].monster.zh, `CE ${id} trigger monster is missing zh-CN`);
}

let i18nLanguage = 'zh';
const i18nSandbox = {
  OC: { Settings: { get() { return i18nLanguage; } } },
};
i18nSandbox.window = i18nSandbox;
vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'), 'utf8'), i18nSandbox, { filename: '../js/i18n.js' });
assert.equal(i18nSandbox.OC.i18n.t('alert_dispeller'), '出现掉落以下消幻晶的 CE/FATE 时提示：');
assert.equal(i18nSandbox.OC.i18n.t('island_unknown'), '未知');
assert.equal(i18nSandbox.OC.i18n.t('tower_predicted'), '预计');
assert.equal(i18nSandbox.OC.i18n.t('tower_reduced'), '已缩短');
i18nLanguage = 'en';
assert.equal(i18nSandbox.OC.i18n.t('set_lang'), 'Language');
assert.equal(i18nSandbox.OC.i18n.t('set_data_region'), 'Data region');
assert.equal(i18nSandbox.OC.i18n.t('layer_survey'), 'Survey Point');
i18nLanguage = 'ja';
assert.equal(i18nSandbox.OC.i18n.t('set_lang'), '言語');
assert.equal(i18nSandbox.OC.i18n.t('data_region_global'), 'グローバル版');
assert.equal(i18nSandbox.OC.i18n.t('layer_survey'), '調査地点');

assert.equal(OC.selectMap(1346), true);
assert.equal(OC.MAP.background, 'https://pic.imgdd.cc/i/033yZEk5hNqakHejLVO4sm.png');
assert.equal(OC.MAP.fallbackBackground, 'https://tu.keita.cc/i/2026/07/31/22o45s.png');
assert.equal(OC.MAP.finalFallbackBackground, 'assets/map-north.png');
assert.equal(OC.MAP.points.bronze.length, 55);
assert.equal(OC.MAP.points.silver.length, 7);
assert.equal(OC.MAP.points.potNorth.length, 30);
assert.equal(OC.MAP.points.potSouth.length, 30);
assert.equal(OC.MAP.points.potNorth.some(([x, z]) => x === 889.2178 && z === 155.9825), true);
assert.equal(OC.MAP.points.potNorth.some(([x, z]) => x === -269.6122 && z === 875.6997), false);
assert.equal(OC.MAP.points.potSouth.some(([x, z]) => x === -269.6122 && z === 875.6997), true);
assert.equal(OC.MAP.points.potSouth.some(([x, z]) => x === 889.2178 && z === 155.9825), false);
assert.equal(OC.MAP.points.reroll.length, 20);
assert.equal(OC.MAP.points.bunny.length, 25);
assert.equal(OC.MAP.points.survey.length, 13);
assert.deepEqual(Array.from(OC.MAP.encounters[64]), [-320.06552, 422.0136]);
assert.deepEqual(Array.from(OC.MAP.encounters[2084]), [140, -708]);
assert.equal(OC.MAP.encounters[65], undefined);

assert.equal(OC.selectMap(1346, { y: -100 }), true);
assert.equal(OC.MAP.mapId, 1244);
assert.equal(OC.MAP.variant, 'subterrane');
assert.equal(OC.MAP.background, 'https://pic.imgdd.cc/i/033yZEhkYMPHrMX1Bgz9HC.png');
assert.equal(OC.MAP.fallbackBackground, 'https://tu.keita.cc/i/2026/07/31/22obp7.png');
assert.equal(OC.MAP.finalFallbackBackground, 'assets/map-north-subterrane.png');
assert.equal(OC.MAP.points.bronze.length, 5);
assert.equal(OC.MAP.points.silver.length, 1);
assert.equal(OC.MAP.points.potNorth.length, 0);
assert.equal(OC.MAP.points.potSouth.length, 0);
assert.equal(OC.MAP.points.reroll.length, 0);
assert.equal(OC.MAP.points.bunny.length, 0);
assert.deepEqual(Array.from(OC.MAP.points.survey[0]), [62, 124]);
assert.deepEqual(Array.from(OC.MAP.points.silver[0]), [223.6532, -30.64362]);
assert.equal(OC.selectMap(1346, { y: -40 }), true);
assert.equal(OC.MAP.mapId, 1135);

const subterraneMap = fs.readFileSync(require.resolve('../assets/map-north-subterrane.png'));
assert.equal(subterraneMap.toString('ascii', 1, 4), 'PNG');
assert.equal(subterraneMap.readUInt32BE(16), 2048);
assert.equal(subterraneMap.readUInt32BE(20), 2048);

OC.Settings = {
  get(key) {
    if (key === 'mapLayers') return { potN: true, potS: true, reroll: true, survey: true };
    if (key === 'lang') return 'en';
    return null;
  },
};
OC.Overlay = { playerPos: null, bossPos: {} };
OC.State = { highlights: [] };
vm.runInNewContext(fs.readFileSync(require.resolve('../js/map.js'), 'utf8'), sandbox, { filename: '../js/map.js' });
const mapTarget = { innerHTML: '' };
OC.Map.render(mapTarget);
assert.match(mapTarget.innerHTML, /href="https:\/\/pic\.imgdd\.cc\/i\/033yZEk5hNqakHejLVO4sm\.png"/);
assert.match(mapTarget.innerHTML, /data-fallback="https:\/\/tu\.keita\.cc\/i\/2026\/07\/31\/22o45s\.png"/);
assert.match(mapTarget.innerHTML, /data-final-fallback="assets\/map-north\.png"/);
assert.match(mapTarget.innerHTML, /onerror="OC\.Map\.handleBackgroundError\(this\)"/);
const backgroundImage = {
  attrs: {
    href: OC.MAP.background,
    'data-fallback': OC.MAP.fallbackBackground,
    'data-final-fallback': OC.MAP.finalFallbackBackground,
  },
  removed: false,
  getAttribute(name) { return this.attrs[name] || ''; },
  setAttribute(name, value) { this.attrs[name] = value; },
  remove() { this.removed = true; },
};
OC.Map.handleBackgroundError(backgroundImage);
assert.equal(backgroundImage.attrs.href, 'https://tu.keita.cc/i/2026/07/31/22o45s.png');
OC.Map.handleBackgroundError(backgroundImage);
assert.equal(backgroundImage.attrs.href, 'assets/map-north.png');
OC.Map.handleBackgroundError(backgroundImage);
assert.equal(backgroundImage.removed, true);
assert.equal((mapTarget.innerHTML.match(/fill="#4a90ff"/g) || []).length, 30);
assert.equal((mapTarget.innerHTML.match(/fill="#ff8a3c"/g) || []).length, 30);
assert.equal((mapTarget.innerHTML.match(/fill="#c56bff"/g) || []).length, 20);
assert.equal((mapTarget.innerHTML.match(/fill="#55e6d4"/g) || []).length, 13);

assert.equal(OC.selectMap(1252), true);
assert.equal(OC.MAP.background, 'https://pic.imgdd.cc/i/033yZEhvlCl64oDk6DXtrl.jpg');
assert.equal(OC.MAP.fallbackBackground, 'https://tu.keita.cc/i/2026/07/31/22n0ew.png');
assert.equal(OC.MAP.finalFallbackBackground, 'assets/map.png');
assert.equal(OC.MAP.points.survey.length, 12);

console.log('data tests passed');
