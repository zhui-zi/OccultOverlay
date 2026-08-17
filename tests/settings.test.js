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
assert.equal(settings.get('alertTower'), false);
assert.deepEqual(Array.from(settings.get('potAlertSeconds')), [180]);
assert.equal(settings.get('treasureGuide'), true);
assert.equal(settings.get('radarCoffers'), true);
assert.equal(settings.get('radarCarrots'), true);
assert.equal(settings.get('radarPinned'), false);
assert.equal(settings.get('radarVoice'), true);
assert.equal(settings.get('mapLayers').survey, false);
assert.equal(loaded.stored().dataRegion, 'global', 'the initial region must be persisted immediately');

loaded = loadSettings('en-US');
settings = loaded.settings;
assert.equal(settings.get('lang'), 'en');
assert.equal(settings.setSystemLanguage('Japanese'), true, 'ACT game language must override the CEF fallback in auto mode');
assert.equal(settings.systemLanguage(), 'ja');
assert.equal(settings.getRaw('lang'), 'auto');
assert.equal(settings.get('lang'), 'ja');
assert.equal(settings.get('dataRegion'), 'global', 'host language detection must not change the stored data region');
assert.equal(settings.setSystemLanguage('Japanese'), false, 'repeated host language results must not trigger another render');

settings.set('lang', 'zh');
assert.equal(settings.getRaw('lang'), 'zh');
assert.equal(settings.get('lang'), 'zh');
assert.equal(settings.get('dataRegion'), 'global', 'changing language must not change the stored data region');
assert.equal(settings.setSystemLanguage('English'), false, 'host language changes must not override an explicit language');
assert.equal(settings.get('lang'), 'zh');

settings.set('dataRegion', 'cn');
assert.equal(settings.get('dataRegion'), 'cn');
loaded = loadSettings('en-US', loaded.stored());
assert.equal(loaded.settings.get('dataRegion'), 'cn', 'an explicit region choice must survive reload and language changes');

loaded.settings.set('treasureGuide', false);
loaded = loadSettings('en-US', loaded.stored());
assert.equal(loaded.settings.get('treasureGuide'), false, 'the treasure guide switch must survive reload');
loaded.settings.set('radarCoffers', false);
loaded = loadSettings('en-US', loaded.stored());
assert.equal(loaded.settings.get('radarCoffers'), false, 'the coffer radar switch must survive reload');
assert.equal(loaded.settings.get('radarCarrots'), true, 'the carrot radar switch must remain independent');
loaded.settings.set('radarCarrots', false);
loaded = loadSettings('en-US', loaded.stored());
assert.equal(loaded.settings.get('radarCarrots'), false, 'the carrot radar switch must survive reload');
loaded.settings.set('radarPinned', true);
loaded = loadSettings('en-US', loaded.stored());
assert.equal(loaded.settings.get('radarPinned'), true, 'the pinned radar switch must survive reload independently');
loaded.settings.set('radarVoice', false);
loaded = loadSettings('en-US', loaded.stored());
assert.equal(loaded.settings.get('radarVoice'), false, 'the radar voice switch must survive reload independently');
loaded.settings.set('potAlertSeconds', '10m，5m，3m，30s，10sec，30秒，1s，0s，11m，2.5m');
assert.deepEqual(Array.from(loaded.settings.get('potAlertSeconds')), [600, 300, 180, 30, 10, 1], 'pot reminders must accept compact Chinese commas and reject values over ten minutes');
loaded.settings.set('potAlertSeconds', '10m,5m,3m,30s,10s,1s');
assert.deepEqual(Array.from(loaded.settings.get('potAlertSeconds')), [600, 300, 180, 30, 10, 1], 'pot reminders must accept English commas without spaces');
loaded = loadSettings('en-US', loaded.stored());
assert.deepEqual(Array.from(loaded.settings.get('potAlertSeconds')), [600, 300, 180, 30, 10, 1], 'custom pot reminders must survive reload');
loaded.settings.set('potAlertSeconds', '');
assert.deepEqual(Array.from(loaded.settings.get('potAlertSeconds')), [180], 'an empty reminder list must retain the safe default');

settings = loadSettings('zh-Hans-CN').settings;
assert.equal(settings.get('lang'), 'zh');
assert.equal(settings.get('dataRegion'), 'cn');
settings = loadSettings('fr-FR').settings;
assert.equal(settings.get('lang'), 'en');
assert.equal(settings.get('dataRegion'), 'global');

settings = loadSettings('en-US', {
  _v: 9,
  radarEnabled: false,
}).settings;
assert.equal(settings.get('radarCoffers'), false, 'a disabled legacy radar must keep both new scopes disabled');
assert.equal(settings.get('radarCarrots'), false, 'a disabled legacy radar must keep both new scopes disabled');

settings = loadSettings('en-US', {
  _v: 11,
  potAlertMinutes: [10, 3, 1],
}).settings;
assert.deepEqual(Array.from(settings.get('potAlertSeconds')), [600, 180, 60], 'v11 minute reminders must migrate to seconds');

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
