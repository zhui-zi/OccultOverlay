/* =========================================================================
 * main.js — 主控：以地图为主体的外壳、圆形按钮、云端轮询、自动上报
 * 设计要点：数据只从云端获取/提交；无人工上报、无本地推算。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function nm(o) { return OC.localName(o, OC.Settings.get('lang')); }
  function now() { return Math.floor(Date.now() / 1000); }

  var State = OC.State = {
    record: null,
    history: { ce: [], fate: [], pot: [] },
    lastUpdate: null,
    prevSpawns: {},
    highlights: [] // [{id, type}] 供地图高亮
  };

  function blankHistories() {
    return {
      ce: Object.keys(OC.CES).map(function (k) { return OC.Api.blankEntry(Number(k)); }),
      fate: Object.keys(OC.FATES).map(function (k) { return OC.Api.blankEntry(Number(k)); }),
      pot: Object.keys(OC.POTS).map(function (k) { return OC.Api.blankEntry(Number(k)); })
    };
  }
  function parseRecord(rec) {
    function pj(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
    return { ce: pj(rec.encounter_history), fate: pj(rec.fate_history), pot: pj(rec.pot_history) };
  }

  var App = OC.App = {
    openPanel: null,

    init: function () {
      State.history = blankHistories();
      document.documentElement.style.setProperty('--app-opacity', OC.Settings.get('opacity'));
      this.renderShell();
      this.wireOverlay();
      OC.Overlay.start();
      this.loadTracker();
      this.startLoops();
    },

    // -------- 外壳 --------
    renderShell: function () {
      var app = document.getElementById('app');
      var h = '';
      h += '<div id="mapLayer" class="map-layer"></div>';
      // 顶部信息胶囊
      h += '<div class="chips">';
      h += '<div id="chip-conn" class="chip chip-conn"></div>';
      h += '<div id="chip-ce" class="chip chip-ce" data-open="battle"></div>';
      h += '<div id="chip-pot" class="chip chip-pot" data-open="battle"></div>';
      h += '</div>';
      // 右侧圆形按钮
      h += '<div class="rail">' + railHtml() + '</div>';
      // 面板层
      h += '<div id="popover" class="popover hidden"></div>';
      app.innerHTML = h;

      OC.Map.render(document.getElementById('mapLayer'));
      this.bindRail();
      this.updateChips();
      // 胶囊点击打开战斗面板
      app.querySelectorAll('[data-open]').forEach(function (el) {
        el.addEventListener('click', function () { App.togglePanel(el.getAttribute('data-open')); });
      });
    },

    bindRail: function () {
      var app = document.getElementById('app');
      app.querySelectorAll('.rbtn[data-layer]').forEach(function (b) {
        b.addEventListener('click', function () {
          OC.Map.toggle(b.getAttribute('data-layer'), document.getElementById('mapLayer'));
          b.classList.toggle('on', OC.Settings.get('mapLayers')[b.getAttribute('data-layer')]);
        });
      });
      app.querySelectorAll('.rbtn[data-panel]').forEach(function (b) {
        b.addEventListener('click', function () { App.togglePanel(b.getAttribute('data-panel')); });
      });
    },

    togglePanel: function (which) {
      var pop = document.getElementById('popover');
      if (this.openPanel === which) { this.openPanel = null; pop.classList.add('hidden'); return; }
      this.openPanel = which;
      pop.classList.remove('hidden');
      this.renderPanel();
      pop.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { App.openPanel = null; pop.classList.add('hidden'); });
      });
    },

    renderPanel: function () {
      var pop = document.getElementById('popover');
      if (this.openPanel === 'battle') OC.UI.renderBattlePanel(pop);
      else if (this.openPanel === 'settings') this.renderSettings(pop);
    },

    updateChips: function () {
      var conn = document.getElementById('chip-conn');
      if (conn) {
        var c = OC.Overlay.connected;
        var zone = c ? (OC.Overlay.inOccult ? t('in_occult') : (OC.Overlay.zoneName || t('not_in_occult'))) : t('disconnected');
        conn.innerHTML = '<span class="dot ' + (c ? 'ok' : 'off') + '"></span>' + OC.UI.esc(zone);
      }
      var ce = document.getElementById('chip-ce');
      if (ce) { var d = OC.UI.ceChipHtml(); ce.className = d.cls + ' clickable'; ce.setAttribute('data-open', 'battle'); ce.innerHTML = d.html; }
      var pot = document.getElementById('chip-pot');
      if (pot) { var p = OC.UI.potChipHtml(); pot.className = p.cls + ' clickable'; pot.setAttribute('data-open', 'battle'); pot.innerHTML = p.html; }
    },

    // -------- Overlay 事件 --------
    wireOverlay: function () {
      OC.Overlay.on('connected', function () { App.updateChips(); });
      OC.Overlay.on('disconnected', function () { App.updateChips(); });
      OC.Overlay.on('zone', function () { App.updateChips(); });
      OC.Overlay.on('ce', function (d) { App.onDetected('ce', d.encounterId, d.name); });
      OC.Overlay.on('fate', function (d) {
        App.onDetected(OC.POTS[d.fateId] ? 'pot' : 'fate', d.fateId, d.name);
      });
    },

    onDetected: function (type, id, nameObj) {
      var kind = type === 'ce' ? 'ce' : type === 'pot' ? 'pot' : 'fate';
      var title = t('notify_' + kind) + '：' + (nameObj ? nm(nameObj) : ('#' + id));
      OC.UI.notify(kind, title, '', kind + ':' + id);
      // 自动提交云端（无人工上报）
      if (OC.Settings.get('autoReport') && OC.Settings.get('trackerId')) App.autoReport(type, id);
    },

    autoReport: function (type, id) {
      if (!State.record) return;
      OC.Api.report(OC.Settings.get('trackerId'), State.record, type, id, 'spawned')
        .then(function (arr) {
          var f = type === 'ce' ? 'encounter_history' : type === 'fate' ? 'fate_history' : 'pot_history';
          State.record[f] = JSON.stringify(arr); State.history[type] = arr;
          App.afterData(false);
        }).catch(function () {});
    },

    // -------- 云端加载 / 轮询 --------
    loadTracker: function () {
      var id = OC.Settings.get('trackerId');
      if (!id) { State.record = null; State.history = blankHistories(); App.afterData(true); return; }
      OC.Api.fetchTracker(id).then(function (rec) {
        if (rec) App.applyRecord(rec, true);
      }).catch(function () {});
    },

    applyRecord: function (rec, silent) {
      State.record = rec;
      State.lastUpdate = rec.last_update;
      var h = parseRecord(rec);
      if (!silent) App.detectChanges(h);
      State.history = h;
      App.afterData(silent);
    },

    afterData: function (silent) {
      // 更新地图高亮（正在进行的 CE / FATE）
      var hl = [];
      State.history.ce.forEach(function (e) {
        if (e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time)) hl.push({ id: e.fate_id, type: 'ce' });
      });
      State.history.fate.forEach(function (e) {
        if (e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time)) hl.push({ id: e.fate_id, type: 'fate' });
      });
      State.highlights = hl;
      App.captureSpawns();
      OC.Map.render(document.getElementById('mapLayer'));
      App.updateChips();
      if (App.openPanel === 'battle') App.renderPanel();
    },

    captureSpawns: function () {
      var m = {};
      ['ce', 'fate', 'pot'].forEach(function (tp) {
        State.history[tp].forEach(function (e) { m[tp + ':' + e.fate_id] = e.spawn_time; });
      });
      State.prevSpawns = m;
    },

    detectChanges: function (h) {
      ['ce', 'fate', 'pot'].forEach(function (tp) {
        h[tp].forEach(function (e) {
          var key = tp + ':' + e.fate_id, prev = State.prevSpawns[key];
          var alive = e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
          if (alive && prev != null && e.spawn_time > prev) {
            var def = tp === 'ce' ? OC.CES[e.fate_id] : tp === 'pot' ? OC.POTS[e.fate_id] : OC.FATES[e.fate_id];
            if (def) OC.UI.notify(tp, t('notify_' + tp) + '：' + nm(def.name), '', key + ':' + e.spawn_time);
          }
        });
      });
    },

    startLoops: function () {
      setInterval(function () {
        var id = OC.Settings.get('trackerId');
        if (!id) return;
        OC.Api.fetchLastUpdate(id).then(function (lu) {
          if (lu != null && lu !== State.lastUpdate) {
            OC.Api.fetchTracker(id).then(function (rec) { if (rec) App.applyRecord(rec, false); });
          }
        }).catch(function () {});
      }, 1000);

      // 胶囊每秒刷新倒计时（轻量，不重绘地图）
      setInterval(function () {
        App.updateChips();
        if (App.openPanel === 'battle') App.renderPanel();
      }, 1000);
    },

    // -------- 设置面板 --------
    renderSettings: function (pop) {
      var g = OC.Settings.get.bind(OC.Settings);
      var dc = '<option value="0">—</option>';
      Object.keys(OC.DATACENTERS).forEach(function (k) {
        dc += '<option value="' + k + '"' + (Number(g('datacenter')) === Number(k) ? ' selected' : '') + '>' +
          OC.DATACENTERS[k].name + ' (' + OC.DATACENTERS[k].region + ')</option>';
      });
      var lg = ['zh', 'en', 'ja'].map(function (l) {
        return '<option value="' + l + '"' + (g('lang') === l ? ' selected' : '') + '>' + l.toUpperCase() + '</option>';
      }).join('');
      var h = '<div class="panel-head">' + t('panel_settings') + '<button class="pclose" data-close>' + t('close') + '</button></div>';
      h += '<div class="panel-body settings">';
      h += r(t('set_lang'), '<select id="s-lang">' + lg + '</select>');
      h += grp(t('set_tracker'));
      h += r(t('set_tracker_id'), '<input id="s-tid" value="' + OC.UI.esc(g('trackerId')) + '" placeholder="GUtJVkB4">');
      h += r(t('set_password'), '<input id="s-pw" value="' + OC.UI.esc(g('trackerPassword')) + '">');
      h += r(t('set_dc'), '<select id="s-dc">' + dc + '</select>');
      h += '<div class="s-row s-btns"><button id="s-create" class="mini">' + t('set_create') + '</button>' +
        '<button id="s-open" class="mini">' + t('set_open') + '</button></div>';
      h += grp('OverlayPlugin');
      h += r(t('set_ws'), '<input id="s-ws" value="' + OC.UI.esc(g('wsUrl')) + '" placeholder="ws://127.0.0.1:10501/ws">');
      h += r(t('set_territory'), '<input id="s-terr" value="' + OC.UI.esc(g('occultTerritoryId')) + '" placeholder="1252">');
      h += r(t('set_ce_cd'), '<input id="s-cecd" value="' + OC.UI.esc(g('ceCooldownSec')) + '" placeholder="3600">');
      h += grp(t('panel_settings'));
      h += chk('s-sound', t('set_sound'), g('notifySound'));
      h += chk('s-auto', t('set_auto'), g('autoReport'));
      h += r(t('set_opacity'), '<input id="s-op" type="range" min="0.3" max="1" step="0.05" value="' + g('opacity') + '">');
      h += '<div class="s-row s-btns"><button id="s-save" class="save">' + t('saved') + '</button></div>';
      h += '<div class="cloud-hint">' + t('cloud_hint') + '</div>';
      h += '</div>';
      pop.innerHTML = h;

      var op = pop.querySelector('#s-op');
      op.addEventListener('input', function () { document.documentElement.style.setProperty('--app-opacity', op.value); });
      pop.querySelector('#s-save').addEventListener('click', function () {
        OC.Settings.setMany({
          lang: pop.querySelector('#s-lang').value,
          trackerId: pop.querySelector('#s-tid').value.trim(),
          trackerPassword: pop.querySelector('#s-pw').value,
          datacenter: Number(pop.querySelector('#s-dc').value) || 0,
          wsUrl: pop.querySelector('#s-ws').value.trim(),
          occultTerritoryId: pop.querySelector('#s-terr').value.trim(),
          ceCooldownSec: pop.querySelector('#s-cecd').value.trim(),
          notifySound: pop.querySelector('#s-sound').checked,
          autoReport: pop.querySelector('#s-auto').checked,
          opacity: Number(pop.querySelector('#s-op').value)
        });
        App.renderShell();
        App.loadTracker();
        OC.UI.toast('pot', t('saved') + ' ✓', '');
      });
      pop.querySelector('#s-open').addEventListener('click', function () {
        var id = pop.querySelector('#s-tid').value.trim();
        window.open('https://tracker.xivstats.com/' + (id || 'new'), '_blank');
      });
      pop.querySelector('#s-create').addEventListener('click', function () {
        var pw = pop.querySelector('#s-pw').value || Math.random().toString(36).slice(2, 8);
        var d = Number(pop.querySelector('#s-dc').value) || 0;
        OC.Api.create(pw, d).then(function (id) {
          if (!id) throw new Error('no id');
          OC.Settings.setMany({ trackerId: id, trackerPassword: pw, datacenter: d });
          App.renderShell(); App.loadTracker();
          OC.UI.toast('pot', 'Tracker ✓ ' + id, '');
        }).catch(function (e) { OC.UI.toast('ce', String(e), ''); });
      });
      pop.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { App.openPanel = null; document.getElementById('popover').classList.add('hidden'); });
      });
    }
  };

  function r(label, ctrl) { return '<div class="s-row"><label>' + label + '</label>' + ctrl + '</div>'; }
  function grp(x) { return '<div class="s-grp">' + x + '</div>'; }
  function chk(id, label, on) { return '<div class="s-row s-check"><label><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + label + '</label></div>'; }

  function railHtml() {
    var L = OC.MAP_LAYERS, layers = OC.Settings.get('mapLayers');
    var labels = { bronze: '铜', silver: '银', potN: '北', potS: '南', reroll: '续', bunny: '萝' };
    var h = '';
    L.forEach(function (l) {
      var on = layers[l.key];
      h += '<button class="rbtn' + (on ? ' on' : '') + '" data-layer="' + l.key + '" title="' + OC.i18n.t('layer_' + l.key) + '" ' +
        'style="--rc:' + l.color + '">' + labels[l.key] + '</button>';
    });
    h += '<div class="rail-div"></div>';
    h += '<button class="rbtn panel" data-panel="battle" title="' + OC.i18n.t('panel_battle') + '">⚔</button>';
    h += '<button class="rbtn panel" data-panel="settings" title="' + OC.i18n.t('panel_settings') + '">⚙</button>';
    return h;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { App.init(); });
  else App.init();
})(typeof window !== 'undefined' ? window : this);
