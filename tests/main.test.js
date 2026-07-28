const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let writes = 0;
let markup = '';
const activeBox = {
  get innerHTML() {
    return markup;
  },
  set innerHTML(value) {
    writes += 1;
    markup = value;
  },
};

let showActiveChips = true;
let alertAllEncounters = false;
let alertPot = false;
let alertColors = {};
const sandbox = {
  console,
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById(id) {
      return id === 'chips-active' ? activeBox : null;
    },
  },
  OC: {
    CES: {
      49: { name: { en: 'Test CE' }, drops: [50974] },
    },
    FATES: {
      2074: { name: { en: 'Test FATE' }, drops: [50974] },
    },
    POTS: {
      2072: { name: { en: 'Test Pot' }, side: 'north', territory: 1346, drops: [50974] },
    },
    ITEMS: {
      47744: { name: { en: 'Test Demiatma 1' } },
      47745: { name: { en: 'Test Demiatma 2' } },
      47746: { name: { en: 'Test Demiatma 3' } },
      47747: { name: { en: 'Test Demiatma 4' } },
      47748: { name: { en: 'Test Demiatma 5' } },
      47749: { name: { en: 'Test Demiatma 6' } },
      50974: { name: { en: 'Test Dispeller' } },
      50975: { name: { en: 'Test Dispeller Beta' } },
      50976: { name: { en: 'Test Dispeller Gamma' } },
    },
    Overlay: {
      territoryId: 1346,
      connected: true,
      inOccult: true,
      memActive: {},
    },
    MAP: {
      territory: 1346,
    },
    Map: {
      updateHighlights() {},
    },
    Pots: {
      merge(shared, local) {
        sandbox._lastPotMerge = {
          shared: Array.from(shared || []),
          local: Array.from(local || []),
        };
        return (shared || []).concat(local || []);
      },
      status(entries) {
        if (!entries || !entries.length) return null;
        const entry = entries[entries.length - 1];
        return {
          alive: entry.death_time <= 0 || entry.death_time < entry.spawn_time,
          nextEpoch: entry.spawn_time + 1800,
          etaSec: 1800,
          side: entry.fate_id === 2072 ? 'north' : 'south',
        };
      },
    },
    Settings: {
      get(key) {
        if (key === 'showActiveChips') return showActiveChips;
        if (key === 'alertAllEncounters') return alertAllEncounters;
        if (key === 'alertPot') return alertPot;
        if (key === 'alertColors') return alertColors;
        if (key === 'lang') return 'en';
        return null;
      },
    },
    UI: {
      esc(value) {
        return String(value);
      },
      rewardSuffix() {
        return '';
      },
    },
    i18n: {
      t(key) {
        return { notify_ce: 'CE', notify_fate: 'FATE', notify_pot: 'Pot' }[key] || key;
      },
    },
    localName(value) {
      return value.en;
    },
  },
};
sandbox.window = sandbox;

const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
vm.runInNewContext(source, sandbox, { filename: 'main.js' });

sandbox.OC.State.highlights = [49, 2074];
sandbox.OC.App.updateActive();
assert.equal(writes, 1);
assert.match(markup, /Test CE/);
assert.match(markup, /Test FATE/);

sandbox.OC.App.updateActive();
assert.equal(writes, 1, 'unchanged capsules must keep their DOM nodes');

sandbox.OC.State.highlights = [49];
sandbox.OC.App.updateActive();
assert.equal(writes, 2, 'a real state change must update the capsules');

showActiveChips = false;
sandbox.OC.App.updateActive();
assert.equal(writes, 3);
assert.equal(markup, '');

sandbox.OC.App.updateActive();
assert.equal(writes, 3, 'the hidden state must not be rewritten every tick');

showActiveChips = true;
sandbox.OC.Overlay.memActive = { 2074: true };
sandbox.OC.App._island = {
  ce: [{ fate_id: 49, spawn_time: 100, death_time: -1 }],
  fate: [{ fate_id: 2074, spawn_time: 100, death_time: -1 }],
  pot: [{ fate_id: 2072, spawn_time: 100, death_time: -1 }],
};
sandbox.OC.App.refreshHighlights();
assert.deepEqual(
  Array.from(sandbox.OC.State.highlights).sort((a, b) => a - b),
  [49, 2074],
  'connected North Horn must merge strict-island cloud CE when CEDirector is unavailable',
);
sandbox.OC.Overlay.connected = false;
sandbox.OC.App.refreshHighlights();
assert.deepEqual(
  Array.from(sandbox.OC.State.highlights).sort((a, b) => a - b),
  [49, 2072, 2074],
  'disconnected mode may use every shared active event',
);

const cloudPot = { fate_id: 2072, spawn_time: 100, death_time: 110, last_seen: 110 };
sandbox.OC.App._island = { ce: [], fate: [], pot: [cloudPot] };
sandbox.OC.App._dc = [{ rowId: 1, potHistory: [cloudPot] }];
sandbox.OC.App.myIslandRowId = 1;
sandbox.OC.App._localPot = null;
sandbox.OC.Overlay.territoryId = 1346;
assert.equal(sandbox.OC.App.usesLocalPotData(), true);
assert.equal(sandbox.OC.App.localPotInfo(), null);
assert.deepEqual(sandbox._lastPotMerge.shared, [], 'North Horn must ignore cloud pot history');

sandbox.OC.App._localPot = { 2072: { active: true, lastSeen: 120 } };
const updateOnlyPot = sandbox.OC.App.localPotInfo();
assert.equal(updateOnlyPot.alive, true);
assert.equal(updateOnlyPot.side, 'north');
assert.equal(updateOnlyPot.nextEpoch, null);
assert.equal(updateOnlyPot.etaSec, null);
assert.equal(updateOnlyPot.local, true, 'an Update without Add must remain a local uncertain state');

sandbox.OC.App._localPot = { 2072: { active: false, spawnEpoch: 100, deathEpoch: 110, lastSeen: 110 } };
assert.equal(sandbox.OC.App.localPotInfo().side, 'north');
assert.equal(sandbox._lastPotMerge.local.length, 1, 'an exact local Add must drive North Horn timing');

sandbox.OC.Overlay.territoryId = 1252;
sandbox.OC.App._localPot = null;
assert.equal(sandbox.OC.App.usesLocalPotData(), false);
assert.notEqual(sandbox.OC.App.localPotInfo(), null);
assert.equal(sandbox._lastPotMerge.shared.length, 1, 'South Horn keeps strict-island cloud fallback');

const alerts = [];
sandbox.OC.App.fireAlert = function (kind, message, key) {
  alerts.push({ kind, message, key });
};

sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(49);
sandbox.OC.App.alertEncounter(2074);
sandbox.OC.App.alertEncounter(2072);
assert.equal(alerts.length, 0, 'default filters must remain unchanged');

alertAllEncounters = true;
sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(49);
sandbox.OC.App.alertEncounter(2074);
sandbox.OC.App.alertEncounter(2072);
assert.deepEqual(alerts.map((entry) => entry.kind), ['ce', 'fate', 'pot']);
assert.deepEqual(alerts.map((entry) => entry.message), [
  'CE · Test CE',
  'FATE · Test FATE',
  'Pot · Test Pot',
]);
sandbox.OC.App.alertEncounter(49);
assert.equal(alerts.length, 3, 'an active encounter must only be announced once');

sandbox.OC.Overlay.connected = true;
sandbox.OC.Overlay.inOccult = true;
sandbox.OC.App._island = { ce: [], fate: [], pot: [] };
sandbox.OC.App._alerted = {};
sandbox.OC.App.checkIslandAlerts({
  ce: [{ fate_id: 49, spawn_time: 200, death_time: -1 }],
  fate: [{ fate_id: 2074, spawn_time: 200, death_time: -1 }],
  pot: [{ fate_id: 2072, spawn_time: 200, death_time: -1 }],
});
assert.deepEqual(
  alerts.slice(3).map((entry) => entry.kind),
  ['ce'],
  'strict-island cloud fallback must announce CE only while connected in-zone',
);

alertAllEncounters = false;
alertPot = true;
alertColors = { 50974: true };
sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(49);
sandbox.OC.App.alertEncounter(2074);
sandbox.OC.App.alertEncounter(2072);
assert.deepEqual(alerts.slice(4).map((entry) => entry.message), [
  'Test CE · Test Dispeller',
  'Test FATE · Test Dispeller',
  'Test Pot',
]);

const settingsControls = {
  '#s-op': { value: '0.9', addEventListener() {} },
  '#s-scale': { value: '1', addEventListener() {} },
  '#s-chips': { checked: true, addEventListener() {} },
  '#s-repo': { addEventListener() {} },
};
const settingsPop = {
  innerHTML: '',
  querySelector(selector) {
    return settingsControls[selector] || null;
  },
  querySelectorAll() {
    return [];
  },
};
sandbox.OC.Overlay.territoryId = 1346;
sandbox.OC.App.renderSettings(settingsPop);
assert.match(settingsPop.innerHTML, /alert_dispeller_pending/);
assert.doesNotMatch(settingsPop.innerHTML, /Test Dispeller/);
assert.doesNotMatch(settingsPop.innerHTML, /Test Demiatma/);

sandbox.OC.Overlay.territoryId = 1252;
sandbox.OC.App.renderSettings(settingsPop);
assert.match(settingsPop.innerHTML, /alert_demiatma/);
assert.match(settingsPop.innerHTML, /Test Demiatma 1/);
assert.doesNotMatch(settingsPop.innerHTML, /alert_dispeller_pending/);

console.log('main tests passed');
