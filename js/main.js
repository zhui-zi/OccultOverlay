/* =========================================================================
 * main.js — 主控（自动模式）
 * 地图为主体；顶部胶囊；右侧圆形按钮；撒娇罐总览为主要数据来源。
 * 数据全部来自云端，无需手动填 Tracker：自动展示国服四大区所有活跃岛屿。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function nm(o) { return OC.localName(o, OC.Settings.get('lang')); }
  function now() { return Math.floor(Date.now() / 1000); }
  var CN_DCS = [101, 102, 103, 104];

  var State = OC.State = { highlights: [], detail: null, detailId: null };

  var App = OC.App = {
    openPanel: null,
    collapsed: false,
    _dc: [],        // 撒娇罐总览数据（去重排序后）
    _dcTick: 0,

    init: function () {
      this.collapsed = !!OC.Settings.get('collapsed');
      document.documentElement.style.setProperty('--app-opacity', OC.Settings.get('opacity'));
      this.renderShell();
      this.wireOverlay();
      OC.Overlay.start();
      this.fetchDc();
      this.startLoops();
    },

    renderShell: function () {
      var app = document.getElementById('app');
      var h = '';
      h += '<div id="mapLayer" class="map-layer"></div>';
      h += '<div class="chips">';
      h += '<div id="chip-conn" class="chip chip-conn clickable" title="' + t('collapse') + '"></div>';
      h += '<div id="chip-pot" class="chip chip-pot clickable" data-open="dcpots"></div>';
      h += '</div>';
      h += '<div class="rail">' + railHtml() + '</div>';
      h += '<div id="popover" class="popover hidden"></div>';
      app.innerHTML = h;

      OC.Map.render(document.getElementById('mapLayer'));
      this.bindRail();
      this.updateChips();
      this.updateMapVisible();

      // 胶囊点击：连接胶囊(新月岛)=折叠开关；撒娇罐胶囊=打开总览
      document.getElementById('chip-conn').addEventListener('click', function () { App.toggleCollapse(); });
      app.querySelectorAll('.chips [data-open]').forEach(function (el) {
        el.addEventListener('click', function (e) { e.stopPropagation(); App.togglePanel(el.getAttribute('data-open')); });
      });
      // 面板关闭按钮：事件委托（避免每秒重绘后失效）
      var pop = document.getElementById('popover');
      pop.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) App.closePanel();
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

    toggleCollapse: function () {
      this.collapsed = !this.collapsed;
      OC.Settings.set('collapsed', this.collapsed);
      var conn = document.getElementById('chip-conn');
      if (conn) conn.title = t(this.collapsed ? 'expand' : 'collapse');
      this.updateMapVisible();
    },

    // 地图仅在新月岛内且未折叠时显示；折叠/离岛时隐藏地图与右侧按钮，仅留胶囊
    updateMapVisible: function () {
      var app = document.getElementById('app'); if (!app) return;
      var noMap = this.collapsed || (OC.Overlay.connected && !OC.Overlay.inOccult);
      app.classList.toggle('no-map', noMap);
    },

    togglePanel: function (which) {
      if (this.openPanel === which) return this.closePanel();
      this.openPanel = which;
      document.getElementById('popover').classList.remove('hidden');
      if (which === 'dcpots') this.fetchDc();
      this.renderPanel();
    },
    closePanel: function () {
      this.openPanel = null; this.detailId = null; this.detail = null;
      document.getElementById('popover').classList.add('hidden');
    },

    renderPanel: function () {
      var pop = document.getElementById('popover');
      if (this.openPanel === 'dcpots') OC.UI.renderDcPots(pop, this._dc, !this._dcLoaded);
      else if (this.openPanel === 'battle') OC.UI.renderBattlePanel(pop, State.detail, State.detailId);
      else if (this.openPanel === 'settings') this.renderSettings(pop);
    },

    // 点击某岛 -> 拉取详情并显示战斗面板
    showIsland: function (id) {
      State.detailId = id;
      this.openPanel = 'battle';
      document.getElementById('popover').classList.remove('hidden');
      OC.UI.renderBattlePanel(document.getElementById('popover'), null, id); // loading
      OC.Api.fetchTracker(id).then(function (rec) {
        if (!rec) return;
        State.detail = { ce: pj(rec.encounter_history), fate: pj(rec.fate_history), pot: pj(rec.pot_history) };
        if (App.openPanel === 'battle') App.renderPanel();
      }).catch(function () {});
    },

    updateVisibility: function () {
      var app = document.getElementById('app'); if (!app) return;
      var show = OC.Overlay.inOccult || !OC.Overlay.connected;
      app.style.visibility = show ? '' : 'hidden';
      var toasts = document.getElementById('toasts');
      if (toasts) toasts.style.visibility = show ? '' : 'hidden';
    },

    updateChips: function () {
      var conn = document.getElementById('chip-conn');
      if (conn) {
        var c = OC.Overlay.connected;
        var zone = c ? (OC.Overlay.inOccult ? t('in_occult') : (OC.Overlay.zoneName || t('not_in_occult'))) : t('disconnected');
        conn.innerHTML = '<span class="dot ' + (c ? 'ok' : 'off') + '"></span>' + OC.UI.esc(zone);
      }
      var pot = document.getElementById('chip-pot');
      if (pot) {
        var list = this._dc || [];
        var pdc = OC.Overlay.playerDc;
        // 优先玩家所在大区；否则国服范围
        var scoped = pdc ? list.filter(function (x) { return x.dc === pdc; }) : list;
        var pick = scoped.filter(function (x) { return x.alive; })[0] ||
          scoped.filter(function (x) { return !x.alive && x.etaSec > 0; }).sort(function (a, b) { return a.etaSec - b.etaSec; })[0] ||
          scoped[0];
        var body = '<span class="chip-k">' + t('pot') + '</span>';
        if (pick) {
          var dc = (OC.DATACENTERS[pick.dc] || {}).name || '';
          if (pick.alive) body += '<span class="s a">' + t('alive') + '</span>';
          else body += '<b>' + OC.UI.fmtDur(Math.max(0, pick.etaSec)) + '</b>';
          body += ' <span class="s">' + OC.UI.esc(dc) + '</span>';
          pot.classList.toggle('ready', pick.alive || pick.etaSec <= 60);
        } else { body += '<span class="s">' + (this._dcLoaded ? t('no_active_island') : t('loading')) + '</span>'; }
        pot.innerHTML = body;
      }
    },

    wireOverlay: function () {
      OC.Overlay.on('connected', function () { App.updateChips(); App.updateMapVisible(); });
      OC.Overlay.on('disconnected', function () { App.updateChips(); App.updateMapVisible(); });
      OC.Overlay.on('zone', function () { App.updateChips(); App.updateMapVisible(); });
      OC.Overlay.on('position', function () { OC.Map.updatePlayer(document.getElementById('mapLayer')); });
    },

    // 拉取国服四大区活跃岛屿（撒娇罐总览 + 顶部胶囊数据源）
    fetchDc: function () {
      OC.Api.fetchDcPots(CN_DCS, 900).then(function (rows) {
        App._dc = OC.Pots.dcOverview(rows);
        App._dcLoaded = true;
        App.checkAlerts();
        App.updateChips();
        if (App.openPanel === 'dcpots') App.renderPanel();
      }).catch(function () { App._dcLoaded = true; });
    },

    // 提示：撒娇罐出现 / 掉落所选颜色半魂晶的 CE·FATE 出现（仅本大区，避免刷屏）
    checkAlerts: function () {
      var pdc = OC.Overlay.playerDc;
      var list = (this._dc || []).filter(function (x) { return !pdc || x.dc === pdc; });
      var st = this._alertState = this._alertState || {};
      var ready = this._alertReady;
      var colors = OC.Settings.get('alertColors') || {};
      var wantPot = OC.Settings.get('alertPot');
      list.forEach(function (it) {
        var prev = st[it.id] || {};
        if (ready) {
          if (wantPot && it.alive && !prev.alive) App.fireAlert('pot', t('alert_pot'));
          [['ce', it.ceId, OC.CES], ['fate', it.fateId, OC.FATES]].forEach(function (p) {
            var def = p[2][p[1]];
            if (def && p[1] && p[1] !== prev[p[0]]) {
              var hitColor = (def.drops || []).filter(function (d) { return colors[d]; })[0];
              if (hitColor) {
                var cname = OC.localName(OC.ITEMS[hitColor].name, OC.Settings.get('lang'));
                App.fireAlert(p[0], nm(def.name) + ' · ' + cname);
              }
            }
          });
        }
        st[it.id] = { alive: it.alive, ce: it.ceId, fate: it.fateId };
      });
      this._alertReady = true;
    },

    fireAlert: function (kind, msg) {
      OC.UI.toast(kind, msg, '');
      if (!OC.UI.speak(msg)) OC.UI.beep(kind);
    },

    startLoops: function () {
      // 每 5 秒刷新国服总览（顶部胶囊 + 面板）
      setInterval(function () { App.fetchDc(); }, 5000);
      // 每秒刷新倒计时
      setInterval(function () {
        App.updateChips();
        if (App.openPanel === 'dcpots') App.renderPanel();
        else if (App.openPanel === 'battle' && State.detail) {
          App._dcTick++;
          if (State.detailId && App._dcTick % 5 === 0) App.showIsland(State.detailId);
          else App.renderPanel();
        }
      }, 1000);
    },

    renderSettings: function (pop) {
      var g = OC.Settings.get.bind(OC.Settings);
      var colors = g('alertColors') || {};
      var swatch = { 47744: '#4aa3ff', 47745: '#2ec4b6', 47746: '#3ddb63', 47747: '#ff8a3c', 47748: '#b061ff', 47749: '#ffce4d' };
      var h = '<div class="panel-head">' + t('panel_settings') + '<button class="pclose" data-close>' + t('close') + '</button></div>';
      h += '<div class="panel-body settings">';
      h += '<div class="s-grp">' + t('alert_title') + '</div>';
      h += rowChk('a-pot', t('alert_pot_opt'), g('alertPot'));
      h += '<div class="s-sub">' + t('alert_demiatma') + '</div><div class="color-grid">';
      [47744, 47745, 47746, 47747, 47748, 47749].forEach(function (id) {
        var it = OC.ITEMS[id], on = !!colors[id];
        h += '<label class="color-chk' + (on ? ' on' : '') + '" data-cid="' + id + '" style="--sc:' + swatch[id] + '">' +
          '<input type="checkbox" data-color="' + id + '"' + (on ? ' checked' : '') + '>' +
          '<span class="sw"></span>' + esc(OC.localName(it.name, g('lang'))) + '</label>';
      });
      h += '</div>';
      h += rowChk('a-tts', t('alert_tts'), g('useTts'));
      h += rowChk('s-sound', t('set_sound'), g('notifySound'));
      h += '<div class="s-grp">' + t('panel_settings') + '</div>';
      h += row(t('set_opacity'), '<input id="s-op" type="range" min="0.3" max="1" step="0.05" value="' + g('opacity') + '">');
      h += '<div class="cloud-hint">' + t('auto_hint') + '</div>';
      h += '</div>';
      pop.innerHTML = h;

      var op = pop.querySelector('#s-op');
      op.addEventListener('input', function () {
        OC.Settings.set('opacity', Number(op.value));
        document.documentElement.style.setProperty('--app-opacity', op.value);
      });
      bindChk(pop, 'a-pot', 'alertPot');
      bindChk(pop, 'a-tts', 'useTts');
      bindChk(pop, 's-sound', 'notifySound');
      pop.querySelectorAll('input[data-color]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var c = OC.Settings.get('alertColors') || {};
          c[cb.getAttribute('data-color')] = cb.checked;
          OC.Settings.set('alertColors', c);
          cb.closest('.color-chk').classList.toggle('on', cb.checked);
          if (cb.checked) OC.UI.speak(OC.localName(OC.ITEMS[cb.getAttribute('data-color')].name, g('lang'))); // 试听
        });
      });
    }
  };

  function pj(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
  function row(l, c) { return '<div class="s-row"><label>' + l + '</label>' + c + '</div>'; }
  function rowChk(id, l, on) { return '<div class="s-row s-check"><label><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + l + '</label></div>'; }
  function bindChk(pop, id, key) {
    var el = pop.querySelector('#' + id);
    if (el) el.addEventListener('change', function () { OC.Settings.set(key, el.checked); });
  }
  function esc(s) { return OC.UI.esc(s); }

  function railHtml() {
    var L = OC.MAP_LAYERS, layers = OC.Settings.get('mapLayers');
    var labels = { bronze: '铜', silver: '银', potN: '北', potS: '南', reroll: '续', bunny: '萝' };
    var h = '';
    L.forEach(function (l) {
      h += '<button class="rbtn' + (layers[l.key] ? ' on' : '') + '" data-layer="' + l.key + '" title="' + OC.i18n.t('layer_' + l.key) + '" style="--rc:' + l.color + '">' + labels[l.key] + '</button>';
    });
    h += '<div class="rail-div"></div>';
    h += '<button class="rbtn panel dc" data-panel="dcpots" title="' + OC.i18n.t('panel_dcpots') + '">罐</button>';
    h += '<button class="rbtn panel" data-panel="settings" title="' + OC.i18n.t('panel_settings') + '">⚙</button>';
    return h;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { App.init(); });
  else App.init();
})(typeof window !== 'undefined' ? window : this);
