const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.innerHTML = '';
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  querySelectorAll(selector) {
    if (selector !== '[data-encounter-id]') return [];
    return this.children.filter(node => node.getAttribute('data-encounter-id') !== null);
  }

  insertBefore(node, reference) {
    const current = this.children.indexOf(node);
    if (current >= 0) this.children.splice(current, 1);
    const index = reference ? this.children.indexOf(reference) : -1;
    this.children.splice(index >= 0 ? index : this.children.length, 0, node);
    node.parentNode = this;
    return node;
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
    return node;
  }
}

const activeBox = new Element();
const sandbox = {
  console,
  document: {
    readyState: 'loading',
    addEventListener() {},
    createElement() { return new Element(); },
    getElementById(id) { return id === 'chips-active' ? activeBox : null; },
  },
  OC: {
    CES: { 49: { name: { en: 'Stable CE' }, drops: [] } },
    FATES: { 2074: { name: { en: 'Changing FATE' }, drops: [] } },
    POTS: {},
    State: { highlights: [] },
    Settings: {
      get(key) {
        if (key === 'showActiveChips') return true;
        if (key === 'alertTower') return false;
        if (key === 'lang') return 'en';
        return null;
      },
    },
    UI: {
      esc(value) { return String(value); },
      weaknessIcons() { return ''; },
      rewardSuffix() { return ''; },
    },
    localName(value) { return value.en; },
    i18n: { t(key) { return key; } },
    Overlay: { connected: true, inOccult: true },
    Map: { updateHighlights() {} },
  },
};
sandbox.window = sandbox;

const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
vm.runInNewContext(source, sandbox, { filename: '../js/main.js' });

sandbox.OC.State.highlights = [49, 2074];
sandbox.OC.App.updateActive();
assert.equal(activeBox.children.length, 2);
const stableCeNode = activeBox.children[0];
const firstFateNode = activeBox.children[1];

// Reproduce the unresolved-island refresh observed on 2026-08-16: local
// 258/259 state remains authoritative before a strict tracker row is bound.
sandbox.OC.Overlay.memActive = { 49: true, 2074: true };
sandbox.OC.App.myIslandId = null;
sandbox.OC.App._island = { ce: [], fate: [], pot: [] };
for (let refresh = 0; refresh < 4; refresh++) {
  sandbox.OC.App.pollMyIsland();
  sandbox.OC.App.updateActive();
}
assert.equal(sandbox.OC.App._island, null);
assert.equal(sandbox.OC.App._lastIslandFetch || 0, 0, 'unbound polls must not throttle a later bound fetch');
assert.deepEqual(Array.from(sandbox.OC.State.highlights), [49, 2074]);
assert.equal(activeBox.children[0], stableCeNode, 'an unbound cloud refresh must preserve the local CE node');
assert.equal(activeBox.children[1], firstFateNode, 'an unbound cloud refresh must preserve the local FATE node');

sandbox.OC.State.highlights = [49];
sandbox.OC.App.updateActive();
assert.equal(activeBox.children.length, 1);
assert.equal(activeBox.children[0], stableCeNode, 'ending a FATE must preserve the active CE node');
assert.equal(firstFateNode.parentNode, null);

sandbox.OC.State.highlights = [49, 2074];
sandbox.OC.App.updateActive();
assert.equal(activeBox.children.length, 2);
assert.equal(activeBox.children[0], stableCeNode, 'starting a FATE must preserve the active CE node');
assert.notEqual(activeBox.children[1], firstFateNode, 'a new FATE lifetime must receive a new node');

sandbox.OC.App.updateActive();
assert.equal(activeBox.children[0], stableCeNode, 'an unchanged refresh must preserve node identity');
