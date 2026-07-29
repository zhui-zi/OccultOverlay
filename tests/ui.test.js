'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {
  console,
  Date,
  Math,
  OC: {
    Settings: { get(key) { return key === 'lang' ? 'en' : null; } },
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

assert.equal((host.innerHTML.match(/class="p-row ce/g) || []).length, 17);
assert.equal((host.innerHTML.match(/class="p-row fate/g) || []).length, 11);
assert.equal((host.innerHTML.match(/class="p-row pot/g) || []).length, 2);
assert.match(host.innerHTML, /The Forked Tower: Magic \(Extreme\)/);
assert.match(host.innerHTML, /Thunderregnum/);
assert.match(host.innerHTML, /In a Pot of Bother \(South\)/);

const locatingHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(locatingHost, null, null, true);
assert.match(locatingHost.innerHTML, />locating</);
assert.doesNotMatch(locatingHost.innerHTML, />loading</);

console.log('ui tests passed');
