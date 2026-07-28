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
      49: { name: { en: 'Test CE' }, drops: [] },
    },
    FATES: {
      2074: { name: { en: 'Test FATE' }, drops: [] },
    },
    POTS: {},
    Settings: {
      get(key) {
        if (key === 'showActiveChips') return showActiveChips;
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
    i18n: { t(key) { return key; } },
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

console.log('main tests passed');
