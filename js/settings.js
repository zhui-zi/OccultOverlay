/* =========================================================================
 * settings.js — 本地设置（localStorage 持久化）
 * ========================================================================= */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};
  var KEY = 'occultOverlay.settings';
  var SCHEMA_V = 2; // 递增此值会重置地图图层等易变默认项

  var defaults = {
    _v: SCHEMA_V,
    lang: 'zh',
    trackerId: '',
    trackerPassword: '',
    datacenter: 0,
    wsUrl: '',
    occultTerritoryId: '',
    ceCooldownSec: '',
    notifySound: true,
    notifyOnlyInZone: true,
    autoReport: true,           // 侦测到 CE/FATE/罐 时自动提交到云端（无人工上报）
    opacity: 0.9,
    collapsed: false,
    useTts: true,               // 语音提示（不可用时退回提示音）
    alertPot: false,            // 撒娇罐出现时提示
    alertColors: {},            // 半魂晶颜色提示：{ itemId: true }
    _alertScope: 'dc',          // 提示范围：dc=仅本大区
    mapLayers: { bronze: false, silver: false, potN: false, potS: false, reroll: false, bunny: false }
  };

  var data = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var obj = raw ? JSON.parse(raw) : {};
      // 版本升级：重置地图图层为默认（全部关闭），避免旧的“全部显示”遗留
      if (obj._v !== SCHEMA_V) obj.mapLayers = clone(defaults.mapLayers);
      var out = {};
      for (var k in defaults) out[k] = (k in obj) ? obj[k] : clone(defaults[k]);
      out._v = SCHEMA_V;
      // 只保留合法图层键
      var ml = {};
      for (var m in defaults.mapLayers) ml[m] = (m in out.mapLayers) ? !!out.mapLayers[m] : defaults.mapLayers[m];
      out.mapLayers = ml;
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
