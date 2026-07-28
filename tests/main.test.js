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
      2072: { name: { en: 'Test Pot' }, drops: [50974] },
    },
    ITEMS: {
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
sandbox.OC.App.renderSettings(settingsPop);
assert.match(settingsPop.innerHTML, /alert_dispeller/);
assert.match(settingsPop.innerHTML, /Test Dispeller/);
assert.match(settingsPop.innerHTML, /Test Dispeller Beta/);
assert.match(settingsPop.innerHTML, /Test Dispeller Gamma/);
assert.doesNotMatch(settingsPop.innerHTML, /Test Demiatma/);

console.log('main tests passed');
