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
      document.documentElement.style.setProperty('--ui-scale', OC.Settings.get('uiScale') || 1);
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
      h += '<div id="chip-pot" class="chip chip-pot clickable" title="' + t('my_island_hint') + '"></div>';
      h += '<div id="chips-active" class="chips-active"></div>';
      h += '</div>';
      h += '<div class="rail">' + railHtml() + '</div>';
      h += '<div id="popover" class="popover hidden"></div>';
      app.innerHTML = h;

      OC.Map.render(document.getElementById('mapLayer'));
      this.bindRail();
      this.updateChips();
      this.updateMapVisible();

      // 胶囊点击：连接胶囊(新月岛)=折叠开关；撒娇罐胶囊=打开“我所在岛”的详情
      document.getElementById('chip-conn').addEventListener('click', function () { App.toggleCollapse(); });
      document.getElementById('chip-pot').addEventListener('click', function (e) {
        e.stopPropagation();
        if (App.myIslandId) App.showIsland(App.myIslandId);
        else App.togglePanel('dcpots');
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

    // 确认玩家所在的岛：boss 命中最强；一旦锁定就保持（sticky），
    // 不因为它暂时掉出撒娇罐总览列表而丢失（否则 CE 没打完就消失）。
    resolveMyIsland: function () {
      var pdc = OC.Overlay.playerDc;
      var inDc = (this._dc || []).filter(function (x) { return pdc ? x.dc === pdc : true; });
      var active = OC.Overlay.activeIds || [];
      if (active.length) {
        var hit = inDc.filter(function (x) { return active.indexOf(x.ceId) >= 0 || active.indexOf(x.fateId) >= 0; })[0];
        if (hit) { this.myIslandId = hit.id; return hit.id; }
      }
      if (this.myIslandId) return this.myIslandId;               // 已锁定则保持
      if (inDc.length === 1) { this.myIslandId = inDc[0].id; return this.myIslandId; } // 该大区仅一个岛
      return null;
    },

    // 离开新月岛时清空锁定，重进本会重新识别
    resetIsland: function () {
      this.myIslandId = null; this._island = null; this._potAlertedFor = null;
      OC.State.highlights = [];
      OC.Map.updateHighlights(document.getElementById('mapLayer'));
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
      // 保持滚动位置（面板每秒重绘，避免被顶回最上）
      var oldBody = pop.querySelector('.panel-body');
      var scroll = oldBody ? oldBody.scrollTop : 0;
      if (this.openPanel === 'dcpots') OC.UI.renderDcPots(pop, this._dc, !this._dcLoaded);
      else if (this.openPanel === 'battle') OC.UI.renderBattlePanel(pop, State.detail, State.detailId);
      else if (this.openPanel === 'settings') this.renderSettings(pop);
      var newBody = pop.querySelector('.panel-body');
      if (newBody && scroll) newBody.scrollTop = scroll;
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
        this.resolveMyIsland();
        var mine = this.myIslandId ? (this._dc || []).filter(function (x) { return x.id === App.myIslandId; })[0] : null;
        var body = '<span class="chip-k">' + t('pot') + '</span>';
        var ready = false;
        if (!this._dcLoaded) {
          body += '<span class="s">' + t('loading') + '</span>';
        } else if (mine) {
          var side = mine.side ? '<span class="side-' + mine.side + '">' + (mine.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>' : '';
          if (mine.alive) { body += '<span class="s a">' + t('alive') + '</span> ' + side; ready = true; }
          else { body += '<b>' + OC.UI.fmtDur(Math.max(0, mine.etaSec)) + '</b> ' + side; ready = mine.etaSec <= 60; }
        } else {
          // 未能确认所在岛：不显示可能错误的倒计时
          body += '<span class="s">' + t('locating') + '</span>';
        }
        pot.classList.toggle('ready', ready);
        pot.innerHTML = body;
      }
      this.updateActive();
    },

    // 当前岛正在进行的 FATE/CE 胶囊（随界面缩放；带掉落颜色后缀）
    updateActive: function () {
      var box = document.getElementById('chips-active');
      if (!box) return;
      var isl = this._island;
      if (!isl) { box.innerHTML = ''; return; }
      var alive = isl.ce.concat(isl.fate).filter(isAlive);
      box.innerHTML = alive.map(function (e) {
        var isCe = !!OC.CES[e.fate_id];
        var def = isCe ? OC.CES[e.fate_id] : OC.FATES[e.fate_id];
        if (!def) return '';
        return '<div class="chip chip-act ' + (isCe ? 'ce' : 'fate') + '">' + OC.UI.esc(nm(def.name)) + demiatmaSuffix(def.drops) + '</div>';
      }).join('');
    },

    wireOverlay: function () {
      OC.Overlay.on('connected', function () { App.updateChips(); App.updateMapVisible(); });
      OC.Overlay.on('disconnected', function () { App.updateChips(); App.updateMapVisible(); });
      OC.Overlay.on('zone', function () {
        if (!OC.Overlay.inOccult) App.resetIsland(); // 离岛清空锁定
        App.updateChips(); App.updateMapVisible();
      });
      OC.Overlay.on('position', function () {
        OC.Map.updatePlayer(document.getElementById('mapLayer'));
      });
    },

    // 拉取国服四大区活跃岛屿（撒娇罐总览 + 顶部胶囊数据源）
    fetchDc: function () {
      OC.Api.fetchDcPots(CN_DCS, 900).then(function (rows) {
        App._dc = OC.Pots.dcOverview(rows);
        App._dcLoaded = true;
        App.resolveMyIsland();
        App.pollMyIsland();
        App.updateChips();
        if (App.openPanel === 'dcpots') App.renderPanel();
      }).catch(function () { App._dcLoaded = true; });
    },

    // 拉取“我所在岛”的完整数据，驱动地图高亮 + 提示（云端，玩家在起始点也有效）
    pollMyIsland: function () {
      var id = this.myIslandId;
      if (!id) { this._island = null; OC.State.highlights = []; OC.Map.updateHighlights(document.getElementById('mapLayer')); return; }
      OC.Api.fetchTracker(id).then(function (rec) {
        if (!rec) return;
        var h = { ce: pj(rec.encounter_history), fate: pj(rec.fate_history), pot: pj(rec.pot_history) };
        App.checkIslandAlerts(h);
        App._island = h;
        // 地图高亮 = 进行中的 CE/FATE
        var hl = [];
        h.ce.concat(h.fate).forEach(function (e) { if (isAlive(e)) hl.push(e.fate_id); });
        OC.State.highlights = hl;
        OC.Map.updateHighlights(document.getElementById('mapLayer'));
        if (App.openPanel === 'battle' && State.detailId === id) { State.detail = h; App.renderPanel(); }
      }).catch(function () {});
    },

    // 岛上 FATE/CE/罐 刷新（云端 spawn_time 由无到有 / 变新）就提示
    checkIslandAlerts: function (h) {
      var prev = this._island;
      if (!prev) return; // 首次仅建立基线
      var colors = OC.Settings.get('alertColors') || {};
      function newlyAlive(e, arr) {
        var pe = (arr || []).filter(function (x) { return x.fate_id === e.fate_id; })[0];
        return e.spawn_time > 0 && isAlive(e) && (!pe || e.spawn_time > pe.spawn_time);
      }
      ['ce', 'fate'].forEach(function (tp) {
        h[tp].forEach(function (e) {
          if (!newlyAlive(e, prev[tp])) return;
          var def = tp === 'ce' ? OC.CES[e.fate_id] : OC.FATES[e.fate_id]; if (!def) return;
          var hit = (def.drops || []).filter(function (d) { return colors[d]; })[0];
          if (hit) App.fireAlert(tp, nm(def.name) + ' · ' + OC.localName(OC.ITEMS[hit].name, OC.Settings.get('lang')));
        });
      });
    },

    // 撒娇罐：预计出现前 3 分钟提示（而非出现时）
    checkPotPreAlert: function () {
      if (!OC.Settings.get('alertPot')) return;
      var mine = this.myIslandId ? (this._dc || []).filter(function (x) { return x.id === App.myIslandId; })[0] : null;
      if (!mine || mine.alive || !mine.nextEpoch) return;
      var eta = mine.nextEpoch - Math.floor(Date.now() / 1000);
      if (eta > 0 && eta <= 180 && this._potAlertedFor !== mine.nextEpoch) {
        this._potAlertedFor = mine.nextEpoch;
        var side = mine.side === 'north' ? t('pot_north') : mine.side === 'south' ? t('pot_south') : '';
        App.fireAlert('pot', t('pot_pre_alert') + (side ? ' · ' + side : ''));
      }
    },

    fireAlert: function (kind, msg) {
      // 去抖：同一提示 60 秒内只触发一次（避免 boss 进出视野反复提示）
      var now = Date.now();
      this._alertLast = this._alertLast || {};
      if (this._alertLast[msg] && now - this._alertLast[msg] < 60000) return;
      this._alertLast[msg] = now;
      OC.UI.toast(kind, msg, '');
      if (!OC.UI.speak(msg)) OC.UI.beep(kind);
    },

    startLoops: function () {
      // 每 5 秒刷新国服总览（顶部胶囊 + 面板）
      setInterval(function () { App.fetchDc(); }, 5000);
      // 每秒：更新胶囊 + 面板计时文本（不重绘，避免滚动被顶回/闪烁）+ 撒娇罐提前提示
      setInterval(function () {
        App.updateChips();
        App.checkPotPreAlert();
        if (App.openPanel === 'dcpots' || App.openPanel === 'battle') OC.UI.tickPanel();
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
      h += '<div class="s-grp">' + t('panel_settings') + '</div>';
      h += row(t('set_opacity'), '<input id="s-op" type="range" min="0.3" max="1" step="0.05" value="' + g('opacity') + '">');
      h += row(t('set_scale'), '<input id="s-scale" type="range" min="0.8" max="2" step="0.1" value="' + (g('uiScale') || 1) + '">');
      var names = ['可畏', '三角初华', '柳墨琉', '茫lan', '皇帝驾到', '羽山凌', '魂魄妖妖梦', '正在烧烤中', '沧璃'];
      h += '<div class="made-with">made with 💗 for ' + esc(names[Math.floor(Math.random() * names.length)]) + '</div>';
      h += '</div>';
      pop.innerHTML = h;

      var op = pop.querySelector('#s-op');
      op.addEventListener('input', function () {
        OC.Settings.set('opacity', Number(op.value));
        document.documentElement.style.setProperty('--app-opacity', op.value);
      });
      var sc = pop.querySelector('#s-scale');
      sc.addEventListener('input', function () {
        OC.Settings.set('uiScale', Number(sc.value));
        document.documentElement.style.setProperty('--ui-scale', sc.value);
      });
      bindChk(pop, 'a-pot', 'alertPot');
      bindChk(pop, 'a-tts', 'useTts');
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
  function isAlive(e) { return e && e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time); }

  // 半魂晶颜色后缀：如“（黄）”并用对应颜色字体
  var DEMIATMA = { 47744: ['青', '#4aa3ff'], 47745: ['碧', '#2ec4b6'], 47746: ['绿', '#3ddb63'], 47747: ['橙', '#ff8a3c'], 47748: ['紫', '#b061ff'], 47749: ['黄', '#ffce4d'] };
  function demiatmaSuffix(drops) {
    var out = '';
    (drops || []).forEach(function (id) {
      if (DEMIATMA[id]) out += '<span class="dm-c" style="color:' + DEMIATMA[id][1] + '">（' + DEMIATMA[id][0] + '）</span>';
    });
    return out;
  }
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
