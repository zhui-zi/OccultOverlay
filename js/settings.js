/* =========================================================================
 * settings.js — 本地设置（localStorage 持久化）
 * ========================================================================= */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};
  var KEY = 'occultOverlay.settings';

  var defaults = {
    lang: 'zh',
    trackerId: '',
    trackerPassword: '',
    datacenter: 0,
    wsUrl: '',
    occultTerritoryId: '',
    ceCooldownSec: '',
    notifySound: true,
    notifyOnlyInZone: true,
    autoReport: false,          // 侦测到 CE/FATE 时自动上报到共享 tracker
    opacity: 0.92,
    activeTab: 'board',
    mapLayers: { bronze: true, silver: true, potN: true, potS: true, potC: true, carrot: true }
  };

  var data = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var obj = raw ? JSON.parse(raw) : {};
      var out = {};
      for (var k in defaults) out[k] = (k in obj) ? obj[k] : clone(defaults[k]);
      // 合并 mapLayers 缺省项
      for (var m in defaults.mapLayers) if (!(m in out.mapLayers)) out.mapLayers[m] = defaults.mapLayers[m];
      return out;
    } catch (e) { return clone(defaults); }
  }

  function clone(v) { return typeof v === 'object' && v ? JSON.parse(JSON.stringify(v)) : v; }

  var Settings = OC.Settings = {
    get: function (k) { return data[k]; },
    getAll: function () { return data; },
    set: function (k, v) { data[k] = v; save(); return v; },
    setMany: function (obj) { for (var k in obj) data[k] = obj[k]; save(); },
    toggleLayer: function (name) { data.mapLayers[name] = !data.mapLayers[name]; save(); return data.mapLayers[name]; }
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : this);
