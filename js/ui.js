/* =========================================================================
 * ui.js — 面板渲染（CE / FATE / 撒娇罐）、掉落图标、通知
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function lang() { return OC.Settings.get('lang'); }
  function nm(o) { return OC.localName(o, lang()); }

  var UI = OC.UI = {};

  // ---- 时间格式 ---------------------------------------------------------
  UI.fmtDur = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() { return Math.floor(Date.now() / 1000); }

  // ---- 掉落图标 ---------------------------------------------------------
  UI.dropIcons = function (dropIds) {
    if (!dropIds || !dropIds.length) return '';
    var html = '<span class="drops">';
    dropIds.forEach(function (id) {
      var it = OC.ITEMS[id];
      if (!it) return;
      var cat = OC.DROP_CAT[it.cat] || {};
      html += '<span class="drop drop-' + it.cat + '" title="' + esc(nm(it.name)) + '">' +
        '<img class="drop-ic" src="' + OC.iconUrl(it.img) + '" alt="" ' +
        'onerror="this.classList.add(\'noimg\')" style="--c:' + (cat.color || '#888') + '">' +
        '</span>';
    });
    html += '</span>';
    return html;
  };

  // 掉落分类小结（本 FATE/CE 掉了哪些类）
  UI.dropSummary = function (dropIds) {
    var cats = {};
    (dropIds || []).forEach(function (id) {
      var it = OC.ITEMS[id]; if (!it) return;
      cats[it.cat] = true;
    });
    var order = ['demiatma', 'notes', 'soulshard', 'accessory', 'misc'];
    return order.filter(function (c) { return cats[c]; }).map(function (c) {
      var d = OC.DROP_CAT[c];
      return '<span class="cat-tag" style="--c:' + d.color + '">' + (lang() === 'en' ? d.en : d.zh) + '</span>';
    }).join('');
  };

  // ---- 面板 -------------------------------------------------------------
  UI.renderBoard = function (container) {
    var st = OC.State;
    var n = now();
    var html = '';

    if (!OC.Settings.get('trackerId')) {
      html += '<div class="warn-banner">' + t('no_tracker') + '</div>';
    }

    // CE 区
    var ceState = OC.CE.globalState(st.history.ce, n);
    html += '<div class="section"><div class="sec-head">' + t('section_ce');
    if (ceState.activeId) {
      html += '<span class="pill pill-active">' + t('ce_active') + '：' + esc(nm(OC.CES[ceState.activeId].name)) + '</span>';
    } else if (ceState.canTriggerNow) {
      html += '<span class="pill pill-ready">' + t('ce_can_trigger') + '</span>';
    } else if (ceState.nextAvailSec != null) {
      html += '<span class="pill pill-cd">' + t('ce_next_in') + ' ' + UI.fmtDur(ceState.nextAvailSec) + '</span>';
    }
    html += '</div>';
    html += '<div class="cards">';
    st.history.ce.forEach(function (e) {
      var def = OC.CES[e.fate_id]; if (!def) return;
      html += ceCard(e, def, n);
    });
    html += '</div></div>';

    // FATE 区
    html += '<div class="section"><div class="sec-head">' + t('section_fate') + '</div><div class="cards">';
    st.history.fate.forEach(function (e) {
      var def = OC.FATES[e.fate_id]; if (!def) return;
      html += fateCard(e, def, n, 'fate');
    });
    html += '</div></div>';

    // 撒娇罐 区（面板里的上报入口）
    html += '<div class="section"><div class="sec-head">' + t('section_pot') + '</div><div class="cards">';
    st.history.pot.forEach(function (e) {
      var def = OC.POTS[e.fate_id]; if (!def) return;
      html += fateCard(e, def, n, 'pot');
    });
    html += '</div></div>';

    container.innerHTML = html;
    bindReportButtons(container);
  };

  function statusBadge(e, n) {
    var alive = e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
    if (alive) {
      var since = n - e.spawn_time;
      return '<span class="badge alive">● ' + t('alive') + ' ' + UI.fmtDur(since) + '</span>';
    }
    if (e.death_time > 0) {
      return '<span class="badge dead">○ ' + t('dead_state') + '</span>';
    }
    return '<span class="badge unknown">—</span>';
  }

  function ceCard(e, def, n) {
    var loc = OC.MAP_POINTS.encounters[e.fate_id];
    var cls = 'card ce' + (def.type === 'tower' ? ' tower' : '');
    var alive = e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
    if (alive) cls += ' is-alive';
    var html = '<div class="' + cls + '" data-id="' + e.fate_id + '" data-type="ce">';
    html += '<div class="card-top"><span class="cname">' + esc(nm(def.name)) + '</span>' + statusBadge(e, n) + '</div>';
    html += '<div class="card-mid">';
    if (def.type === 'tower') html += '<span class="tag tower-tag">' + t('tower') + '</span>';
    if (def.spawn_type && def.monster) html += '<span class="tag mob-tag" title="' + t('trigger_monster') + '">▸ ' + esc(nm(def.monster)) + '</span>';
    if (loc) html += '<span class="tag loc-tag">' + t('loc') + ' ' + loc.x + ',' + loc.y + '</span>';
    html += UI.dropSummary(def.drops);
    html += '</div>';
    html += '<div class="card-bot">' + UI.dropIcons(def.drops) + reportBtns() + '</div>';
    html += '</div>';
    return html;
  }

  function fateCard(e, def, n, type) {
    var loc = OC.MAP_POINTS.encounters[e.fate_id];
    var alive = e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
    var html = '<div class="card ' + type + (alive ? ' is-alive' : '') + '" data-id="' + e.fate_id + '" data-type="' + type + '">';
    html += '<div class="card-top"><span class="cname">' + esc(nm(def.name)) + '</span>' + statusBadge(e, n) + '</div>';
    html += '<div class="card-mid">';
    if (def.side) html += '<span class="tag side-' + def.side + '">' + (def.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>';
    if (loc) html += '<span class="tag loc-tag">' + t('loc') + ' ' + loc.x + ',' + loc.y + '</span>';
    html += UI.dropSummary(def.drops);
    html += '</div>';
    html += '<div class="card-bot">' + UI.dropIcons(def.drops) + reportBtns() + '</div>';
    html += '</div>';
    return html;
  }

  function reportBtns() {
    return '<span class="report-btns">' +
      '<button class="rbtn spawn" data-act="spawned">' + t('spawned') + '</button>' +
      '<button class="rbtn kill" data-act="dead">' + t('dead') + '</button></span>';
  }

  function bindReportButtons(container) {
    container.querySelectorAll('.rbtn').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var card = btn.closest('.card');
        var id = Number(card.getAttribute('data-id'));
        var type = card.getAttribute('data-type');
        var act = btn.getAttribute('data-act');
        OC.App.report(type, id, act);
      });
    });
  }

  // ---- 撒娇罐面板 -------------------------------------------------------
  UI.renderPots = function (container) {
    var P = OC.Pots;
    var n = now();
    var html = '<div class="pots-panel">';

    // 设置副本时间
    html += '<div class="pot-setup">';
    html += '<div class="ps-title">' + t('pot_setup') + '</div>';
    html += '<div class="ps-row">';
    html += '<button id="pot-fresh" class="mini-btn">' + t('pot_start_fresh') + '</button>';
    html += '<label class="ps-old">' + t('pot_oldest') + ' <input id="pot-oldest" type="number" min="0" max="180" value="0" style="width:56px"></label>';
    html += '<button id="pot-setold" class="mini-btn">OK</button>';
    html += '</div>';
    html += '<div class="ps-hint">' + t('pot_calibrate_hint') + '</div>';
    html += '</div>';

    // 状态行
    var rem = P.instanceRemainingSec(n);
    html += '<div class="pot-status">';
    html += '<span>' + t('calibrations') + '：' + P.calibrations + '</span>';
    if (rem != null) html += '<span>' + t('instance_left') + '：' + UI.fmtDur(rem) + '</span>';
    html += '</div>';

    // 时刻表
    var up = P.getUpcoming(n, 6);
    if (!up.length) {
      html += '<div class="map-hint">' + t('pot_calibrate_hint') + '</div>';
    } else {
      html += '<div class="pot-list">';
      up.forEach(function (p, i) {
        var soon = p.etaSec <= 60 && p.etaSec > -90;
        var cls = 'pot-item side-' + p.side + (soon ? ' soon' : '') + (i === 0 ? ' next' : '');
        html += '<div class="' + cls + '">';
        html += '<span class="pi-side">' + (p.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>';
        html += '<span class="pi-eta">' + (p.etaSec <= 0 ? t('pot_now') : UI.fmtDur(p.etaSec)) + '</span>';
        html += '<span class="pi-clock">' + clockOf(p.epoch) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    var fresh = container.querySelector('#pot-fresh');
    if (fresh) fresh.addEventListener('click', function () { P.estimateFromOldestPlayer(0); OC.App.renderActive(); });
    var setold = container.querySelector('#pot-setold');
    if (setold) setold.addEventListener('click', function () {
      var v = Number(container.querySelector('#pot-oldest').value) || 0;
      P.estimateFromOldestPlayer(v); OC.App.renderActive();
    });
  };

  function clockOf(epoch) {
    var d = new Date(epoch * 1000);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ---- 通知 -------------------------------------------------------------
  var lastNotify = {};
  UI.notify = function (kind, title, body, key) {
    // 去抖：同一 key 30 秒内只提醒一次
    var k = key || (kind + ':' + title);
    var n = Date.now();
    if (lastNotify[k] && n - lastNotify[k] < 30000) return;
    lastNotify[k] = n;

    if (OC.Settings.get('notifyOnlyInZone') && OC.Overlay && !OC.Overlay.inOccult && OC.Overlay.connected) return;

    UI.toast(kind, title, body);
    if (OC.Settings.get('notifySound')) beep(kind);
  };

  UI.toast = function (kind, title, body) {
    var wrap = document.getElementById('toasts');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.innerHTML = '<div class="toast-title">' + esc(title) + '</div>' +
      (body ? '<div class="toast-body">' + esc(body) + '</div>' : '');
    wrap.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 20);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }, 8000);
  };

  var actx = null;
  function beep(kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination);
      o.type = 'sine';
      o.frequency.value = kind === 'ce' ? 880 : kind === 'pot' ? 660 : 520;
      g.gain.value = 0.001;
      var tn = actx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.25, tn + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, tn + 0.5);
      o.start(tn); o.stop(tn + 0.5);
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  UI.esc = esc;
})(typeof window !== 'undefined' ? window : this);
