'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let currentLang = 'en';
const uiStrings = {
  en: {
    weakness: 'Weakness', tower: 'Forked Tower', last_seen: 'Last', tower_predicted: 'Predicted',
    tower_window: 'Expected window reached', tower_reduced: 'Reduced',
    tower_upcoming: 'More after completion', tower_history: 'Previous intervals',
  },
  zh: {
    weakness: '弱点', tower: '两歧塔', last_seen: '上次', tower_predicted: '预计',
    tower_window: '预计可出现', tower_reduced: '已缩短',
    tower_upcoming: '完成后再缩短', tower_history: '历史间隔',
  },
};
const sandbox = {
  console,
  Date,
  Math,
  OC: {
    Settings: { get(key) { return key === 'lang' ? currentLang : null; } },
    Overlay: { territoryId: 1346 },
    MAP: { territory: 1346 },
    Pots: { status() { return null; } },
    i18n: { t(key) { return (uiStrings[currentLang] && uiStrings[currentLang][key]) || key; } },
  },
};
sandbox.window = sandbox;

for (const file of ['../js/data.js', '../js/ui.js']) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: file });
}

const host = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(host, {
  territory: 1346,
  ce: [{ fate_id: 49, spawn_time: 100, death_time: -1, last_seen: 100 }],
  fate: [{ fate_id: 2074, spawn_time: 100, death_time: -1, last_seen: 100 }],
  pot: [],
}, 'north-test');

assert.equal((host.innerHTML.match(/class="p-row ce/g) || []).length, 16);
assert.equal((host.innerHTML.match(/class="p-row fate/g) || []).length, 11);
assert.equal((host.innerHTML.match(/class="p-row pot/g) || []).length, 2);
assert.match(host.innerHTML, /The Forked Tower: Magic/);
assert.doesNotMatch(host.innerHTML, /The Forked Tower: Magic \(Extreme\)/);
assert.match(host.innerHTML, /Thunderregnum/);
assert.match(host.innerHTML, /In a Pot of Bother \(South\)/);
assert.match(host.innerHTML, /title="Weakness: Ice"/);
assert.match(host.innerHTML, /alt="Ice"/);
assert.match(host.innerHTML, /data-monster-image="assets\/trigger-monsters\/49\.png"/);
assert.match(host.innerHTML, />▸ Crescent Wamoura<\/button>/);
assert.doesNotMatch(host.innerHTML, /src="assets\/trigger-monsters\/49\.png"/, 'monster location images must load on demand');

const current = Math.floor(Date.now() / 1000);
const towerHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(towerHost, {
  territory: 1346,
  ce: [
    { fate_id: 49, spawn_time: current - 60, death_time: -1, last_seen: current },
    {
      fate_id: 64,
      spawn_time: current - 4800,
      death_time: current - 1200,
      last_seen: current - 1200,
      killed_ces: 2,
      killed_fates: 3,
      respawn_times: [3600, 3300],
    },
  ],
  fate: [{ fate_id: 2074, spawn_time: current - 30, death_time: -1, last_seen: current }],
  pot: [],
}, 'tower-test');
assert.match(towerHost.innerHTML, /Predicted/);
assert.match(towerHost.innerHTML, /Reduced 13:00 · CE×2 \/ FATE×3/);
assert.match(towerHost.innerHTML, /More after completion CE -5:00 \/ FATE -1:00/);
assert.match(towerHost.innerHTML, /Previous intervals 1:00:00 \/ 55:00/);

currentLang = 'zh';
assert.match(sandbox.OC.UI.weaknessIcons(['fire']), /title="弱点: 火"/);
assert.match(sandbox.OC.UI.weaknessIcons(['fire']), /alt="火"/);
const southHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(southHost, {
  territory: 1252,
  ce: [{ fate_id: 33, spawn_time: 100, death_time: -1, last_seen: 100 }],
  fate: [],
  pot: [],
}, 'south-test');
assert.match(southHost.innerHTML, /data-monster-image="assets\/trigger-monsters\/33\.png"/);
assert.match(southHost.innerHTML, />▸ 新月鬼鱼<\/button>/);
assert.doesNotMatch(southHost.innerHTML, /class="weaknesses"/, 'South Horn rows must not gain unverified weaknesses');
assert.doesNotMatch(southHost.innerHTML, /src="assets\/trigger-monsters\/33\.png"/, 'south monster location images must load on demand');

const locatingHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(locatingHost, null, null, true);
assert.match(locatingHost.innerHTML, />locating</);
assert.doesNotMatch(locatingHost.innerHTML, />loading</);

const overviewHost = { innerHTML: '', querySelectorAll() { return []; } };
sandbox.OC.Pots.respawnSec = 1800;
sandbox.OC.UI.renderDcPots(overviewHost, [{
  id: 'stale',
  dc: 103,
  alive: false,
  nextEpoch: current,
  etaSec: 0,
  anchorEpoch: current - 1800,
  side: 'north',
}], false);
assert.doesNotMatch(overviewHost.innerHTML, /class="dc-row/, 'an expired ETA must disappear immediately');
assert.doesNotMatch(overviewHost.innerHTML, /pot_soon/, 'an expired ETA must not be shown as soon');

console.log('ui tests passed');
