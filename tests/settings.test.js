'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/settings.js'), 'utf8');

function loadSettings(language, saved) {
  let stored = saved == null ? null : JSON.stringify(saved);
  const sandbox = {
    navigator: { language, languages: [language] },
    localStorage: {
      getItem() { return stored; },
      setItem(key, value) { stored = value; },
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: '../js/settings.js' });
  return {
    settings: sandbox.OC.Settings,
    stored() { return stored == null ? null : JSON.parse(stored); },
  };
}

let loaded = loadSettings('ja-JP');
let settings = loaded.settings;
assert.equal(settings.getRaw('lang'), 'auto');
assert.equal(settings.get('lang'), 'ja');
assert.equal(settings.get('dataRegion'), 'global');
assert.equal(settings.get('mapLayers').survey, false);
assert.equal(loaded.stored().dataRegion, 'global', 'the initial region must be persisted immediately');

settings.set('lang', 'zh');
assert.equal(settings.getRaw('lang'), 'zh');
assert.equal(settings.get('lang'), 'zh');
assert.equal(settings.get('dataRegion'), 'global', 'changing language must not change the stored data region');

settings.set('dataRegion', 'cn');
assert.equal(settings.get('dataRegion'), 'cn');
loaded = loadSettings('en-US', loaded.stored());
assert.equal(loaded.settings.get('dataRegion'), 'cn', 'an explicit region choice must survive reload and language changes');

settings = loadSettings('zh-Hans-CN').settings;
assert.equal(settings.get('lang'), 'zh');
assert.equal(settings.get('dataRegion'), 'cn');
settings = loadSettings('fr-FR').settings;
assert.equal(settings.get('lang'), 'en');
assert.equal(settings.get('dataRegion'), 'global');

settings = loadSettings('en-US', {
  _v: 3,
  lang: 'zh',
  mapLayers: { bronze: true },
}).settings;
assert.equal(settings.getRaw('lang'), 'zh');
assert.equal(settings.get('dataRegion'), 'cn', 'existing installs must initialize the region from their effective language');
assert.equal(settings.get('mapLayers').bronze, true, 'v2 layer choices must survive the language migration');
assert.equal(settings.get('mapLayers').survey, false);

settings = loadSettings('en-US', {
  _v: 2,
  lang: 'zh',
  mapLayers: { bronze: true },
}).settings;
assert.equal(settings.getRaw('lang'), 'auto', 'pre-selector installs must migrate to system language');
assert.equal(settings.get('lang'), 'en');
assert.equal(settings.get('dataRegion'), 'global');
assert.equal(settings.get('mapLayers').bronze, true, 'v2 layer choices must survive the language migration');
assert.equal(settings.get('mapLayers').survey, false);

console.log('settings tests passed');
