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
  return sandbox.OC.Settings;
}

let settings = loadSettings('ja-JP');
assert.equal(settings.getRaw('lang'), 'auto');
assert.equal(settings.get('lang'), 'ja');
assert.equal(settings.get('mapLayers').survey, false);

settings.set('lang', 'zh');
assert.equal(settings.getRaw('lang'), 'zh');
assert.equal(settings.get('lang'), 'zh');

settings = loadSettings('zh-Hans-CN');
assert.equal(settings.get('lang'), 'zh');
settings = loadSettings('fr-FR');
assert.equal(settings.get('lang'), 'en');

settings = loadSettings('en-US', {
  _v: 2,
  lang: 'zh',
  mapLayers: { bronze: true },
});
assert.equal(settings.getRaw('lang'), 'auto', 'pre-selector installs must migrate to system language');
assert.equal(settings.get('lang'), 'en');
assert.equal(settings.get('mapLayers').bronze, true, 'v2 layer choices must survive the language migration');
assert.equal(settings.get('mapLayers').survey, false);

console.log('settings tests passed');
