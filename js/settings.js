(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};
  var KEY = 'occultOverlay.settings';
  var SCHEMA_V = 10;
  var hostLanguage = null;

  function normalizeLanguage(value) {
    var code = String(value || '').trim().toLowerCase();
    if (code.indexOf('zh') === 0 || code === 'cn' || code === 'chinese') return 'zh';
    if (code.indexOf('ja') === 0 || code === 'jp' || code === 'japanese') return 'ja';
    if (code.indexOf('en') === 0 || code === 'english') return 'en';
    return null;
  }

  function systemLanguage() {
    var nav = global.navigator || {};
    return hostLanguage || normalizeLanguage((nav.languages && nav.languages[0]) || nav.language) || 'en';
  }

  function effectiveLanguage(mode) {
    return mode === 'auto' ? systemLanguage() : (['zh', 'en', 'ja'].indexOf(mode) >= 0 ? mode : systemLanguage());
  }

  var defaults = {
    _v: SCHEMA_V,
    lang: 'auto',
    dataRegion: systemLanguage() === 'zh' ? 'cn' : 'global',
    trackerId: '',
    trackerPassword: '',
    datacenter: 0,
    wsUrl: '',
    occultTerritoryId: '',
    ceCooldownSec: '',
    notifySound: true,
    notifyOnlyInZone: true,
    opacity: 0.9,
    uiScale: 1,                 // UI scale for chips, buttons, and panels.
    showActiveChips: true,      // Top active FATE/CE chips; right-click to hide.
    treasureGuide: true,
    radarCoffers: true,
    radarCarrots: true,
    radarPinned: false,
    radarVoice: true,
    collapsed: false,
    useTts: true,               // Voice alerts; fall back to a tone when unavailable.
    alertAllEncounters: false,  // Announce all CEs, FATEs, and Magic Pots.
    alertTower: false,          // Announce Forked Tower spawns and show its chip.
    alertPot: false,            // Alert when a Magic Pot spawns.
    alertColors: {},            // Demiatma color alerts: { itemId: true }.
    _alertScope: 'dc',          // Alert scope: dc limits alerts to the current region.
    mapLayers: { bronze: false, silver: false, potN: false, potS: false, reroll: false, bunny: false, survey: false }
  };

  var data = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var obj = raw ? JSON.parse(raw) : {};
      var oldVersion = Number(obj._v) || 0;
      // v2 introduced per-layer defaults; only older settings need that reset.
      if (oldVersion < 2) obj.mapLayers = clone(defaults.mapLayers);
      // Language selection did not exist before v3, so existing installs start in system mode.
      if (oldVersion < 3) obj.lang = 'auto';
      // Data region is initialized once from the effective language, then stored independently.
      if (oldVersion < 4) obj.dataRegion = effectiveLanguage(obj.lang) === 'zh' ? 'cn' : 'global';
      // v10 splits the radar master switch without changing the existing enabled state.
      if (oldVersion < 10) {
        obj.radarCoffers = obj.radarEnabled !== false;
        obj.radarCarrots = obj.radarEnabled !== false;
      }
      var out = {};
      for (var k in defaults) out[k] = (k in obj) ? obj[k] : clone(defaults[k]);
      out._v = SCHEMA_V;
      // Keep only valid layer keys.
      var ml = {};
      for (var m in defaults.mapLayers) ml[m] = (m in out.mapLayers) ? !!out.mapLayers[m] : defaults.mapLayers[m];
      out.mapLayers = ml;
      if (['auto', 'zh', 'en', 'ja'].indexOf(out.lang) < 0) out.lang = 'auto';
      if (['cn', 'global'].indexOf(out.dataRegion) < 0) {
        out.dataRegion = effectiveLanguage(out.lang) === 'zh' ? 'cn' : 'global';
      }
      return out;
    } catch (e) { return clone(defaults); }
  }

  function clone(v) { return typeof v === 'object' && v ? JSON.parse(JSON.stringify(v)) : v; }

  // Persist schema migrations immediately so the initial language-based region does not drift later.
  save();

  var Settings = OC.Settings = {
    get: function (k) { return k === 'lang' ? effectiveLanguage(data.lang) : data[k]; },
    getRaw: function (k) { return data[k]; },
    getAll: function () { return data; },
    set: function (k, v) { data[k] = v; save(); return v; },
    setMany: function (obj) { for (var k in obj) data[k] = obj[k]; save(); },
    toggleLayer: function (name) { data.mapLayers[name] = !data.mapLayers[name]; save(); return data.mapLayers[name]; },
    systemLanguage: systemLanguage,
    setSystemLanguage: function (value) {
      var next = normalizeLanguage(value);
      if (!next || next === hostLanguage) return false;
      var before = effectiveLanguage(data.lang);
      hostLanguage = next;
      return effectiveLanguage(data.lang) !== before;
    }
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : this);
