'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let currentLang = 'en';
const sandbox = {
  console,
  Date,
  Math,
  OC: {
    Settings: { get(key) { return key === 'lang' ? currentLang : null; } },
    Overlay: { territoryId: 1346 },
    MAP: { territory: 1346 },
    Pots: { status() { return null; } },
    i18n: { t(key) { return key; } },
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
assert.doesNotMatch(host.innerHTML, /The Forked Tower: Magic \(Extreme\)/);
assert.match(host.innerHTML, /Thunderregnum/);
assert.match(host.innerHTML, /In a Pot of Bother \(South\)/);
assert.match(host.innerHTML, /data-monster-image="assets\/trigger-monsters\/49\.png"/);
assert.match(host.innerHTML, />▸ Crescent Wamoura<\/button>/);
assert.doesNotMatch(host.innerHTML, /src="assets\/trigger-monsters\/49\.png"/, 'monster location images must load on demand');

currentLang = 'zh';
const southHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(southHost, {
  territory: 1252,
  ce: [{ fate_id: 33, spawn_time: 100, death_time: -1, last_seen: 100 }],
  fate: [],
  pot: [],
}, 'south-test');
assert.match(southHost.innerHTML, /data-monster-image="assets\/trigger-monsters\/33\.png"/);
assert.match(southHost.innerHTML, />▸ 新月鬼鱼<\/button>/);
assert.doesNotMatch(southHost.innerHTML, /src="assets\/trigger-monsters\/33\.png"/, 'south monster location images must load on demand');

const locatingHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(locatingHost, null, null, true);
assert.match(locatingHost.innerHTML, />locating</);
assert.doesNotMatch(locatingHost.innerHTML, />loading</);

const current = Math.floor(Date.now() / 1000);
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
