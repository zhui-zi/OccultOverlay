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
      h += '<div id="chip-conn" class="chip chip-conn"></div>';
      h += '<div id="chip-pot" class="chip chip-pot clickable" data-open="dcpots"></div>';
      h += '</div>';
      h += '<div class="rail">' + railHtml(this.collapsed) + '</div>';
      h += '<div id="popover" class="popover hidden"></div>';
      app.innerHTML = h;
      app.classList.toggle('collapsed', this.collapsed);

      OC.Map.render(document.getElementById('mapLayer'));
      this.bindRail();
      this.updateChips();
      this.updateVisibility();

      // 胶囊点击打开对应面板
      app.querySelectorAll('.chips [data-open]').forEach(function (el) {
        el.addEventListener('click', function () { App.togglePanel(el.getAttribute('data-open')); });
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
      var col = app.querySelector('.rbtn[data-collapse]');
      if (col) col.addEventListener('click', function () { App.toggleCollapse(); });
    },

    toggleCollapse: function () {
      this.collapsed = !this.collapsed;
      OC.Settings.set('collapsed', this.collapsed);
      var app = document.getElementById('app');
      app.classList.toggle('collapsed', this.collapsed);
      var btn = app.querySelector('.rbtn[data-collapse]');
      if (btn) { btn.textContent = this.collapsed ? '▢' : '▣'; btn.title = t(this.collapsed ? 'expand' : 'collapse'); }
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
        var soonest = this._dc && this._dc[0];
        var body = '<span class="chip-k">' + t('pot') + '</span>';
        if (soonest) {
          var dc = (OC.DATACENTERS[soonest.dc] || {}).name || '';
          if (soonest.alive) body += '<span class="s a">' + t('alive') + '</span>';
          else body += '<b>' + OC.UI.fmtDur(Math.max(0, soonest.etaSec)) + '</b>';
          body += ' <span class="s">' + OC.UI.esc(dc) + '</span>';
          pot.classList.toggle('ready', soonest.alive || soonest.etaSec <= 60);
        } else { body += '<span class="s">' + t('loading') + '</span>'; }
        pot.innerHTML = body;
      }
    },

    wireOverlay: function () {
      OC.Overlay.on('connected', function () { App.updateChips(); App.updateVisibility(); });
      OC.Overlay.on('disconnected', function () { App.updateChips(); App.updateVisibility(); });
      OC.Overlay.on('zone', function () { App.updateChips(); App.updateVisibility(); });
      OC.Overlay.on('position', function () { OC.Map.updatePlayer(document.getElementById('mapLayer')); });
    },

    // 拉取国服四大区活跃岛屿（撒娇罐总览 + 顶部胶囊数据源）
    fetchDc: function () {
      OC.Api.fetchDcPots(CN_DCS, 900).then(function (rows) {
        App._dc = OC.Pots.dcOverview(rows);
        App._dcLoaded = true;
        App.updateChips();
        if (App.openPanel === 'dcpots') App.renderPanel();
      }).catch(function () { App._dcLoaded = true; });
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
      var lg = ['zh', 'en', 'ja'].map(function (l) {
        return '<option value="' + l + '"' + (g('lang') === l ? ' selected' : '') + '>' + l.toUpperCase() + '</option>';
      }).join('');
      var h = '<div class="panel-head">' + t('panel_settings') + '<button class="pclose" data-close>' + t('close') + '</button></div>';
      h += '<div class="panel-body settings">';
      h += row(t('set_lang'), '<select id="s-lang">' + lg + '</select>');
      h += rowChk('s-sound', t('set_sound'), g('notifySound'));
      h += row(t('set_opacity'), '<input id="s-op" type="range" min="0.3" max="1" step="0.05" value="' + g('opacity') + '">');
      h += '<div class="s-row s-btns"><button id="s-save" class="save">' + t('saved') + '</button></div>';
      h += '<div class="cloud-hint">' + t('auto_hint') + '</div>';
      h += '</div>';
      pop.innerHTML = h;
      var op = pop.querySelector('#s-op');
      op.addEventListener('input', function () { document.documentElement.style.setProperty('--app-opacity', op.value); });
      pop.querySelector('#s-save').addEventListener('click', function () {
        OC.Settings.setMany({
          lang: pop.querySelector('#s-lang').value,
          notifySound: pop.querySelector('#s-sound').checked,
          opacity: Number(pop.querySelector('#s-op').value)
        });
        App.renderShell();
        OC.UI.toast('pot', t('saved') + ' ✓', '');
      });
    }
  };

  function pj(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
  function row(l, c) { return '<div class="s-row"><label>' + l + '</label>' + c + '</div>'; }
  function rowChk(id, l, on) { return '<div class="s-row s-check"><label><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + l + '</label></div>'; }

  function railHtml(collapsed) {
    var L = OC.MAP_LAYERS, layers = OC.Settings.get('mapLayers');
    var labels = { bronze: '铜', silver: '银', potN: '北', potS: '南', reroll: '续', bunny: '萝' };
    var h = '';
    L.forEach(function (l) {
      h += '<button class="rbtn' + (layers[l.key] ? ' on' : '') + '" data-layer="' + l.key + '" title="' + OC.i18n.t('layer_' + l.key) + '" style="--rc:' + l.color + '">' + labels[l.key] + '</button>';
    });
    h += '<div class="rail-div"></div>';
    h += '<button class="rbtn panel dc" data-panel="dcpots" title="' + OC.i18n.t('panel_dcpots') + '">罐</button>';
    h += '<button class="rbtn" data-collapse title="' + OC.i18n.t(collapsed ? 'expand' : 'collapse') + '">' + (collapsed ? '▢' : '▣') + '</button>';
    h += '<button class="rbtn panel" data-panel="settings" title="' + OC.i18n.t('panel_settings') + '">⚙</button>';
    return h;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { App.init(); });
  else App.init();
})(typeof window !== 'undefined' ? window : this);
