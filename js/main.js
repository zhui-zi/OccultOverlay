/* =========================================================================
 * main.js — 应用主控：外壳渲染、状态同步、轮询、上报、设置、通知
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function nm(o) { return OC.localName(o, OC.Settings.get('lang')); }
  function now() { return Math.floor(Date.now() / 1000); }

  // ---- 全局状态 ---------------------------------------------------------
  var State = OC.State = {
    record: null,
    history: { ce: [], fate: [], pot: [] },
    lastUpdate: null,
    prevSpawns: {} // id -> spawn_time，用于侦测新出现
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

  // ---- App --------------------------------------------------------------
  var App = OC.App = {
    tab: 'board',

    init: function () {
      this.tab = OC.Settings.get('activeTab') || 'board';
      State.history = blankHistories();
      this.renderShell();
      this.wireOverlay();
      OC.Overlay.start();
      this.loadTracker();
      this.startLoops();
    },

    // -------- 外壳 --------
    renderShell: function () {
      var app = document.getElementById('app');
      var tabs = [['board', 'tab_board'], ['pots', 'tab_pots'], ['map', 'tab_map'], ['settings', 'tab_settings']];
      var html = '';
      html += '<header class="hdr">';
      html += '<div class="hdr-title">🌙 ' + t('title') + '</div>';
      html += '<div id="conn" class="conn"></div>';
      html += '</header>';
      html += '<nav class="tabs">';
      tabs.forEach(function (tb) {
        html += '<button class="tab' + (App.tab === tb[0] ? ' active' : '') + '" data-tab="' + tb[0] + '">' + t(tb[1]) + '</button>';
      });
      html += '</nav>';
      html += '<main id="content" class="content"></main>';
      app.innerHTML = html;

      app.querySelectorAll('.tab').forEach(function (b) {
        b.addEventListener('click', function () { App.switchTab(b.getAttribute('data-tab')); });
      });
      this.updateConn();
      this.renderActive();
    },

    switchTab: function (tab) {
      this.tab = tab;
      OC.Settings.set('activeTab', tab);
      var app = document.getElementById('app');
      app.querySelectorAll('.tab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
      });
      this.renderActive();
    },

    renderActive: function () {
      var c = document.getElementById('content');
      if (!c) return;
      if (this.tab === 'board') OC.UI.renderBoard(c);
      else if (this.tab === 'pots') OC.UI.renderPots(c);
      else if (this.tab === 'map') OC.Map.render(c);
      else if (this.tab === 'settings') this.renderSettings(c);
    },

    updateConn: function () {
      var el = document.getElementById('conn');
      if (!el) return;
      var connected = OC.Overlay.connected;
      var zone = connected
        ? (OC.Overlay.inOccult ? t('in_occult') : (OC.Overlay.zoneName || t('not_in_occult')))
        : t('status_disconnected');
      el.innerHTML =
        '<span class="dot ' + (connected ? 'ok' : 'off') + '"></span>' +
        '<span class="conn-zone">' + OC.UI.esc(zone) + '</span>';
    },

    // -------- Overlay 事件 --------
    wireOverlay: function () {
      OC.Overlay.on('connected', function () { App.updateConn(); });
      OC.Overlay.on('disconnected', function () { App.updateConn(); });
      OC.Overlay.on('zone', function () { App.updateConn(); });
      OC.Overlay.on('ce', function (d) { App.onDetected('ce', d.encounterId, d.name); });
      OC.Overlay.on('fate', function (d) {
        var type = OC.POTS[d.fateId] ? 'pot' : 'fate';
        App.onDetected(type, d.fateId, d.name);
      });
    },

    onDetected: function (type, id, nameObj) {
      var label = nameObj ? nm(nameObj) : ('#' + id);
      var kind = type === 'ce' ? 'ce' : type === 'pot' ? 'pot' : 'fate';
      var title = (kind === 'ce' ? t('notify_ce') : kind === 'pot' ? t('notify_pot') : t('notify_fate'));
      OC.UI.notify(kind, title + '：' + label, locHint(id), kind + ':' + id);
      if (OC.Settings.get('autoReport') && OC.Settings.get('trackerId')) {
        App.report(type, id, 'spawned', true);
      }
    },

    // -------- 加载 / 轮询 --------
    loadTracker: function () {
      var id = OC.Settings.get('trackerId');
      if (!id) { State.record = null; State.history = blankHistories(); this.captureSpawns(); this.renderActive(); return; }
      OC.Api.fetchTracker(id).then(function (rec) {
        if (!rec) { OC.UI.toast('fate', 'Tracker ' + id + ' not found', ''); return; }
        App.applyRecord(rec, true);
      }).catch(function (e) { OC.UI.toast('fate', 'Load error', String(e)); });
    },

    applyRecord: function (rec, silent) {
      State.record = rec;
      State.lastUpdate = rec.last_update;
      var h = parseRecord(rec);
      // 侦测新出现（对比上次 spawn_time）
      if (!silent) App.detectChanges(h);
      State.history = h;
      // 撒娇罐自动校准
      App.calibratePotsFromHistory(h.pot);
      App.captureSpawns();
      if (App.tab === 'board' || App.tab === 'pots' || App.tab === 'map') App.renderActive();
    },

    captureSpawns: function () {
      var map = {};
      ['ce', 'fate', 'pot'].forEach(function (tp) {
        State.history[tp].forEach(function (e) { map[tp + ':' + e.fate_id] = e.spawn_time; });
      });
      State.prevSpawns = map;
    },

    detectChanges: function (h) {
      ['ce', 'fate', 'pot'].forEach(function (tp) {
        h[tp].forEach(function (e) {
          var key = tp + ':' + e.fate_id;
          var prev = State.prevSpawns[key];
          var alive = e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
          if (alive && prev != null && e.spawn_time > prev) {
            var def = tp === 'ce' ? OC.CES[e.fate_id] : tp === 'pot' ? OC.POTS[e.fate_id] : OC.FATES[e.fate_id];
            if (def) {
              var kind = tp === 'ce' ? 'ce' : tp === 'pot' ? 'pot' : 'fate';
              var title = kind === 'ce' ? t('notify_ce') : kind === 'pot' ? t('notify_pot') : t('notify_fate');
              OC.UI.notify(kind, title + '：' + nm(def.name), locHint(e.fate_id), key + ':' + e.spawn_time);
            }
          }
        });
      });
    },

    calibratePotsFromHistory: function (potArr) {
      potArr.forEach(function (e) {
        var def = OC.POTS[e.fate_id];
        if (!def || e.spawn_time <= 0) return;
        var key = 'potcal:' + e.fate_id + ':' + e.spawn_time;
        if (App._potCalDone && App._potCalDone[key]) return;
        App._potCalDone = App._potCalDone || {};
        App._potCalDone[key] = true;
        OC.Pots.calibrate(def.side, e.spawn_time);
      });
    },

    startLoops: function () {
      // 轮询 last_update（每秒）
      setInterval(function () {
        var id = OC.Settings.get('trackerId');
        if (!id) return;
        OC.Api.fetchLastUpdate(id).then(function (lu) {
          if (lu != null && lu !== State.lastUpdate) {
            OC.Api.fetchTracker(id).then(function (rec) { if (rec) App.applyRecord(rec, false); });
          }
        }).catch(function () {});
      }, 1000);

      // UI 计时刷新（每秒），仅刷新与时间相关的标签页
      setInterval(function () {
        App.updateConn();
        if (App.tab !== 'board' && App.tab !== 'pots') return;
        // 撒娇罐页在尚未建立时刻表前无需每秒重绘（避免按钮闪烁/误触）
        if (App.tab === 'pots' && OC.Pots.startEpoch == null) return;
        var c = document.getElementById('content');
        if (!c) return;
        // 若正在输入（如设置副本时间），跳过整页重绘避免打断
        var ae = document.activeElement;
        if (ae && c.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
        var scroll = c.scrollTop;
        App.renderActive();
        c.scrollTop = scroll; // 保持滚动位置
      }, 1000);
    },

    // -------- 上报 --------
    report: function (type, id, status, silent) {
      var tid = OC.Settings.get('trackerId');
      if (!tid) { if (!silent) OC.UI.toast('fate', t('no_tracker'), ''); return; }
      if (!State.record) { OC.UI.toast('fate', 'No record loaded', ''); return; }
      OC.Api.report(tid, State.record, type, id, status).then(function (arr) {
        // 本地即时更新
        var field = type === 'ce' ? 'encounter_history' : type === 'fate' ? 'fate_history' : 'pot_history';
        State.record[field] = JSON.stringify(arr);
        State.record.last_update = now();
        State.lastUpdate = State.record.last_update;
        State.history[type] = arr;
        if (type === 'pot' && status === 'spawned') {
          var def = OC.POTS[id]; if (def) OC.Pots.calibrate(def.side, now());
        }
        App.captureSpawns();
        App.renderActive();
        if (!silent) OC.UI.toast(type === 'ce' ? 'ce' : type === 'pot' ? 'pot' : 'fate', t('report') + ' ✓', '');
      }).catch(function (e) { OC.UI.toast('fate', String(e), ''); });
    },

    // -------- 设置面板 --------
    renderSettings: function (c) {
      var g = OC.Settings.get.bind(OC.Settings);
      var dcOpts = '<option value="0">—</option>';
      Object.keys(OC.DATACENTERS).forEach(function (k) {
        dcOpts += '<option value="' + k + '"' + (Number(g('datacenter')) === Number(k) ? ' selected' : '') + '>' +
          OC.DATACENTERS[k].name + ' (' + OC.DATACENTERS[k].region + ')</option>';
      });
      var langOpts = ['zh', 'en', 'ja'].map(function (l) {
        return '<option value="' + l + '"' + (g('lang') === l ? ' selected' : '') + '>' + l.toUpperCase() + '</option>';
      }).join('');

      var html = '<div class="settings">';
      html += row(t('set_lang'), '<select id="s-lang">' + langOpts + '</select>');
      html += '<div class="s-group">' + t('set_tracker') + '</div>';
      html += row(t('set_tracker_id'), '<input id="s-tid" value="' + OC.UI.esc(g('trackerId')) + '" placeholder="e.g. GUtJVkB4">');
      html += row(t('set_password'), '<input id="s-pw" value="' + OC.UI.esc(g('trackerPassword')) + '">');
      html += row(t('set_dc'), '<select id="s-dc">' + dcOpts + '</select>');
      html += '<div class="s-row s-btns">' +
        '<button id="s-create" class="mini-btn">' + t('set_create') + '</button>' +
        '<button id="s-open" class="mini-btn">' + t('set_open_site') + '</button></div>';

      html += '<div class="s-group">' + t('set_notify') + '</div>';
      html += rowCheck('s-sound', t('set_sound'), g('notifySound'));
      html += rowCheck('s-onlyzone', t('set_only_zone'), g('notifyOnlyInZone'));
      html += rowCheck('s-auto', t('set_auto_report'), g('autoReport'));

      html += '<div class="s-group">OverlayPlugin / 高级</div>';
      html += row(t('set_ws'), '<input id="s-ws" value="' + OC.UI.esc(g('wsUrl')) + '" placeholder="ws://127.0.0.1:10501/ws">');
      html += row(t('set_territory'), '<input id="s-terr" value="' + OC.UI.esc(g('occultTerritoryId')) + '" placeholder="1252">');
      html += row(t('set_ce_cd'), '<input id="s-cecd" value="' + OC.UI.esc(g('ceCooldownSec')) + '" placeholder="' + OC.TIMERS.CE_COOLDOWN + '">');

      html += '<div class="s-row s-btns"><button id="s-save" class="save-btn">' + t('set_saved') + '</button></div>';
      html += '</div>';
      c.innerHTML = html;

      c.querySelector('#s-save').addEventListener('click', function () {
        OC.Settings.setMany({
          lang: c.querySelector('#s-lang').value,
          trackerId: c.querySelector('#s-tid').value.trim(),
          trackerPassword: c.querySelector('#s-pw').value,
          datacenter: Number(c.querySelector('#s-dc').value) || 0,
          notifySound: c.querySelector('#s-sound').checked,
          notifyOnlyInZone: c.querySelector('#s-onlyzone').checked,
          autoReport: c.querySelector('#s-auto').checked,
          wsUrl: c.querySelector('#s-ws').value.trim(),
          occultTerritoryId: c.querySelector('#s-terr').value.trim(),
          ceCooldownSec: c.querySelector('#s-cecd').value.trim()
        });
        App.renderShell();
        App.loadTracker();
        OC.UI.toast('pot', t('set_saved') + ' ✓', '');
      });
      c.querySelector('#s-open').addEventListener('click', function () {
        var id = c.querySelector('#s-tid').value.trim();
        var url = 'https://tracker.xivstats.com/' + (id || 'new');
        window.open(url, '_blank');
      });
      c.querySelector('#s-create').addEventListener('click', function () {
        var pw = c.querySelector('#s-pw').value || Math.random().toString(36).slice(2, 8);
        var dc = Number(c.querySelector('#s-dc').value) || 0;
        OC.UI.toast('pot', t('connecting'), '');
        OC.Api.create(pw, dc).then(function (id) {
          if (!id) throw new Error('no id');
          OC.Settings.setMany({ trackerId: id, trackerPassword: pw, datacenter: dc });
          App.renderShell();
          App.loadTracker();
          OC.UI.toast('pot', 'Tracker ✓ ' + id, '');
        }).catch(function (e) { OC.UI.toast('fate', String(e), ''); });
      });
    }
  };

  function row(label, control) {
    return '<div class="s-row"><label>' + label + '</label>' + control + '</div>';
  }
  function rowCheck(id, label, checked) {
    return '<div class="s-row s-check"><label><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '> ' + label + '</label></div>';
  }

  function locHint(id) {
    var loc = OC.MAP_POINTS.encounters[id];
    return loc ? (t('loc') + ' ' + loc.x + ', ' + loc.y) : '';
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.init(); });
  } else {
    App.init();
  }
})(typeof window !== 'undefined' ? window : this);
