/* =========================================================================
 * ui.js — 信息胶囊(chips)、战斗面板(CE/FATE/罐 只读展示)、掉落图标、通知
 * 无人工上报按钮；数据均来自云端。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function lang() { return OC.Settings.get('lang'); }
  function nm(o) { return OC.localName(o, lang()); }
  function now() { return Math.floor(Date.now() / 1000); }

  var UI = OC.UI = {};

  UI.fmtDur = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---- 掉落图标 ----
  UI.dropIcons = function (dropIds) {
    if (!dropIds || !dropIds.length) return '';
    var h = '<span class="drops">';
    dropIds.forEach(function (id) {
      var it = OC.ITEMS[id]; if (!it) return;
      var cat = OC.DROP_CAT[it.cat] || {};
      h += '<img class="drop-ic" src="' + OC.iconUrl(it.img) + '" title="' + esc(nm(it.name)) + '" ' +
        'onerror="this.classList.add(\'noimg\')" style="--c:' + (cat.color || '#888') + '">';
    });
    return h + '</span>';
  };

  UI.dropTags = function (dropIds) {
    var cats = {};
    (dropIds || []).forEach(function (id) { var it = OC.ITEMS[id]; if (it) cats[it.cat] = true; });
    return ['demiatma', 'notes', 'soulshard', 'accessory', 'misc'].filter(function (c) { return cats[c]; })
      .map(function (c) {
        return '<span class="cat-tag" style="--c:' + (OC.DROP_CAT[c].color) + '">' + t(c) + '</span>';
      }).join('');
  };

  // ---- 信息胶囊（顶部常驻）----
  UI.ceChipHtml = function () {
    var st = OC.State, n = now();
    var g = OC.CE.globalState(st.history.ce, n);
    var body, cls = 'chip chip-ce';
    if (g.activeId) {
      body = '<b>' + esc(nm(OC.CES[g.activeId].name)) + '</b> <span class="s a">' + t('ce_active') + '</span>';
      cls += ' on';
    } else if (g.canTriggerNow) {
      body = '<span class="s r">' + t('ce_can_trigger') + '</span>';
      cls += ' ready';
    } else if (g.nextAvailSec != null) {
      body = '<span class="s c">' + t('ce_cooldown') + ' ' + UI.fmtDur(g.nextAvailSec) + '</span>';
    } else {
      body = '<span class="s">' + t('no_ce') + '</span>';
    }
    return { cls: cls, html: '<span class="chip-k">' + t('ce') + '</span>' + body };
  };

  UI.potChipHtml = function () {
    var st = OC.State, n = now();
    var p = OC.Pots.fromHistory(st.history.pot, n);
    var body, cls = 'chip chip-pot';
    if (p.active) {
      body = '<span class="s a">' + t('pot_active') + '</span> <b>' + sideLabel(p.active.side) + '</b>';
      cls += ' on';
    } else if (p.next) {
      var eta = p.next.etaSec;
      body = (eta <= 0 ? '<span class="s r">' + t('pot_soon') + '</span>' : '<b>' + UI.fmtDur(eta) + '</b>') +
        ' <span class="side-' + p.next.side + '">' + sideLabel(p.next.side) + '</span>';
      if (eta <= 0) cls += ' ready';
    } else {
      body = '<span class="s">' + t('unknown') + '</span>';
    }
    return { cls: cls, html: '<span class="chip-k">' + t('pot') + '</span>' + body };
  };

  function sideLabel(side) { return side === 'north' ? t('pot_north') : t('pot_south'); }

  // ---- 战斗面板（CE / FATE / 罐 只读）----
  UI.renderBattlePanel = function (host) {
    var st = OC.State, n = now();
    var h = '<div class="panel-head">' + t('panel_battle') +
      '<button class="pclose" data-close>' + t('close') + '</button></div>';
    h += '<div class="panel-body">';
    if (!OC.Settings.get('trackerId')) h += '<div class="warn">' + t('no_tracker') + '</div>';

    h += section(t('ce'), st.history.ce, 'ce', n);
    h += section(t('fate'), st.history.fate, 'fate', n);
    h += section(t('pot'), st.history.pot, 'pot', n);
    h += '</div>';
    host.innerHTML = h;
  };

  function section(title, arr, type, n) {
    var h = '<div class="p-sec"><div class="p-sec-h">' + title + '</div>';
    (arr || []).forEach(function (e) {
      var def = type === 'ce' ? OC.CES[e.fate_id] : type === 'pot' ? OC.POTS[e.fate_id] : OC.FATES[e.fate_id];
      if (!def) return;
      h += row(e, def, type, n);
    });
    return h + '</div>';
  }

  function row(e, def, type, n) {
    var alive = e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
    var cls = 'p-row ' + type + (alive ? ' alive' : '') + (def.type === 'tower' ? ' tower' : '');
    var h = '<div class="' + cls + '">';
    h += '<div class="p-row-top"><span class="p-name">' + esc(nm(def.name)) + '</span>' + badge(e, n, alive) + '</div>';
    var tags = '';
    if (def.type === 'tower') tags += '<span class="tag tw">' + t('tower') + '</span>';
    if (def.spawn_type && def.monster) tags += '<span class="tag mob">▸ ' + esc(nm(def.monster)) + '</span>';
    if (def.side) tags += '<span class="tag side-' + def.side + '">' + (def.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>';
    tags += UI.dropTags(def.drops);
    h += '<div class="p-row-mid">' + tags + '</div>';
    h += '<div class="p-row-bot">' + UI.dropIcons(def.drops) + '</div>';
    return h + '</div>';
  }

  function badge(e, n, alive) {
    if (alive) return '<span class="bdg alive">● ' + t('alive') + ' ' + UI.fmtDur(n - e.spawn_time) + '</span>';
    if (e.death_time > 0) return '<span class="bdg gone">○ ' + t('gone') + '</span>';
    return '<span class="bdg unk">' + t('unknown') + '</span>';
  }

  // ---- 通知 ----
  var lastNotify = {};
  UI.notify = function (kind, title, body, key) {
    var k = key || (kind + ':' + title), tn = Date.now();
    if (lastNotify[k] && tn - lastNotify[k] < 30000) return;
    lastNotify[k] = tn;
    if (OC.Settings.get('notifyOnlyInZone') && OC.Overlay && OC.Overlay.connected && !OC.Overlay.inOccult) return;
    UI.toast(kind, title, body);
    if (OC.Settings.get('notifySound')) beep(kind);
  };

  UI.toast = function (kind, title, body) {
    var wrap = document.getElementById('toasts'); if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.innerHTML = '<div class="toast-title">' + esc(title) + '</div>' + (body ? '<div class="toast-body">' + esc(body) + '</div>' : '');
    wrap.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 20);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 400); }, 8000);
  };

  var actx = null;
  function beep(kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination); o.type = 'sine';
      o.frequency.value = kind === 'ce' ? 880 : kind === 'pot' ? 660 : 520;
      var tt = actx.currentTime; g.gain.value = 0.001;
      g.gain.exponentialRampToValueAtTime(0.25, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, tt + 0.5);
      o.start(tt); o.stop(tt + 0.5);
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  UI.esc = esc;
})(typeof window !== 'undefined' ? window : this);
