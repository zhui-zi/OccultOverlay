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
      49: { name: { en: 'Test CE' }, drops: [47744] },
    },
    FATES: {
      2074: { name: { en: 'Test FATE' }, drops: [47744] },
    },
    POTS: {
      2072: { name: { en: 'Test Pot' }, drops: [] },
    },
    ITEMS: {
      47744: { name: { en: 'Test Demiatma' } },
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
      demiatmaSuffix() {
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

alertAllEncounters = false;
alertPot = true;
alertColors = { 47744: true };
sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(49);
sandbox.OC.App.alertEncounter(2074);
sandbox.OC.App.alertEncounter(2072);
assert.deepEqual(alerts.slice(3).map((entry) => entry.message), [
  'Test CE · Test Demiatma',
  'Test FATE · Test Demiatma',
  'Test Pot',
]);

console.log('main tests passed');
