(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function nm(o) { return OC.localName(o, OC.Settings.get('lang')); }
  function now() { return Math.floor(Date.now() / 1000); }

  var UI = OC.UI = {};

  UI.fmtDur = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
  };
  UI.fmtClock = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
  };
  function ago(sec) { sec = Math.max(0, Math.round(sec)); return sec < 60 ? sec + 's' : Math.floor(sec / 60) + 'm'; }

  UI.dropIcons = function (ids) {
    if (!ids || !ids.length) return '';
    var h = '<span class="drops">';
    ids.forEach(function (id) {
      var it = OC.ITEMS[id]; if (!it) return;
      var cat = OC.DROP_CAT[it.cat] || {};
      h += '<img class="drop-ic" src="' + OC.iconUrl(it.img) + '" title="' + esc(nm(it.name)) + '" onerror="this.classList.add(\'noimg\')" style="--c:' + (cat.color || '#888') + '">';
    });
    return h + '</span>';
  };
  // 关键奖励后缀：南征显示半魂晶颜色，北征显示消幻晶型号。
  var REWARD_BADGES = {
    47744: ['青', '#4aa3ff'], 47745: ['碧', '#2ec4b6'], 47746: ['绿', '#3ddb63'],
    47747: ['橙', '#ff8a3c'], 47748: ['紫', '#b061ff'], 47749: ['黄', '#ffce4d'],
    50974: ['α', '#79c8ff'], 50975: ['β', '#bb9cff'], 50976: ['γ', '#ffb86b']
  };
  UI.rewardSuffix = function (drops) {
    var out = '';
    (drops || []).forEach(function (id) {
      if (REWARD_BADGES[id]) out += '<span class="dm-c" style="color:' + REWARD_BADGES[id][1] + '">（' + REWARD_BADGES[id][0] + '）</span>';
    });
    return out;
  };
  // 仅显示玩家已开启播报的关键奖励后缀。
  UI.rewardSuffixIfWanted = function (drops) {
    var want = OC.Settings.get('alertColors') || {};
    return UI.rewardSuffix((drops || []).filter(function (id) { return want[id]; }));
  };
  UI.demiatmaSuffix = UI.rewardSuffix;
  UI.demiatmaSuffixIfWanted = UI.rewardSuffixIfWanted;

  UI.dropTags = function (ids) {
    var cats = {};
    (ids || []).forEach(function (id) { var it = OC.ITEMS[id]; if (it) cats[it.cat] = true; });
    return ['demiatma', 'dispeller', 'notes', 'soulshard', 'accessory', 'misc'].filter(function (c) { return cats[c]; })
      .map(function (c) { return '<span class="cat-tag" style="--c:' + OC.DROP_CAT[c].color + '">' + t(c) + '</span>'; }).join('');
  };

  // ---- 撒娇罐总览（国服四大区）----
  UI.renderDcPots = function (host, list, loading) {
    var current = now();
    var visible = (list || []).filter(function (item) {
      if (item.alive) {
        return !item.anchorEpoch || current < item.anchorEpoch + OC.Pots.respawnSec;
      }
      return item.nextEpoch > current;
    });
    var h = '<div class="panel-head">' + t('dc_pots_title') + '<button class="pclose" data-close>' + t('close') + '</button></div>';
    h += '<div class="panel-body">';
    if (loading && !visible.length) h += '<div class="dc-empty">' + t('loading') + '</div>';
    else if (!visible.length) h += '<div class="dc-empty">' + t('no_active_island') + '</div>';
    else {
      h += '<div class="dc-list">';
      visible.forEach(function (it) {
        var dc = (OC.DATACENTERS[it.dc] || { name: it.dc }).name;
        var sd = it.side ? '<span class="dc-side side-' + it.side + '">' + (it.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>' : '';
        var status = (it.alive ? '<span class="dc-alive">' + t('alive') + '</span>' : '<span class="dc-eta" data-tk="eta" data-tv="' + it.nextEpoch + '">' + UI.fmtDur(Math.max(0, it.etaSec)) + '</span>') + sd;
        h += '<div class="dc-row' + (it.alive ? ' alive' : '') + '" data-tid="' + esc(it.id) + '">';
        h += '<span class="dc-name">' + esc(dc) + '</span>' + status +
          '<span class="dc-ago">' + ago(it.ago) + '</span>';
        h += '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
    host.innerHTML = h;
    host.querySelectorAll('.dc-row').forEach(function (r) {
      r.addEventListener('click', function () { OC.App.showIsland(r.getAttribute('data-tid')); });
    });
  };

  // ---- 岛屿详情：CE / FATE / 罐 ----
  UI.renderBattlePanel = function (host, hist, id, locating) {
    var n = now();
    var h = '<div class="panel-head">' + t('panel_battle') + (id ? ' · ' + esc(id) : '') +
      '<button class="pclose" data-close>' + t('close') + '</button></div>';
    h += '<div class="panel-body">';
    if (!hist) h += '<div class="dc-empty">' + t(locating ? 'locating' : 'loading') + '</div>';
    else {
      var territory = Number(hist.territory) ||
        Number(OC.Overlay && OC.Overlay.territoryId) ||
        Number(OC.MAP && OC.MAP.territory) || 0;
      h += section(t('ce'), hist.ce, 'ce', n, null, territory);
      h += section(t('fate'), hist.fate, 'fate', n, null, territory);
      h += section(t('pot'), hist.pot, 'pot', n, OC.Pots.status(hist.pot, n), territory);
    }
    h += '</div>';
    host.innerHTML = h;
  };

  function completeHistory(arr, type, territory) {
    var zone = OC.TERRITORIES && OC.TERRITORIES[territory];
    var key = type === 'ce' ? 'ceIds' : type === 'pot' ? 'potIds' : 'fateIds';
    if (!zone || !zone[key]) return arr || [];
    var byId = {};
    (arr || []).forEach(function (entry) {
      if (entry && entry.fate_id != null) byId[Number(entry.fate_id)] = entry;
    });
    return zone[key].map(function (id) {
      return byId[id] || {
        fate_id: id,
        spawn_time: -1,
        death_time: -1,
        last_seen: -1,
        respawn_times: []
      };
    });
  }

  function section(title, arr, type, n, potStatus, territory) {
    var h = '<div class="p-sec"><div class="p-sec-h">' + title + '</div>';
    completeHistory(arr, type, territory).forEach(function (e) {
      var def = type === 'ce' ? OC.CES[e.fate_id] : type === 'pot' ? OC.POTS[e.fate_id] : OC.FATES[e.fate_id];
      if (def) h += rowHtml(e, def, type, n, potStatus);
    });
    return h + '</div>';
  }
  function rowHtml(e, def, type, n, potStatus) {
    var alive = type === 'pot'
      ? !!(potStatus && potStatus.alive && potStatus.side === def.side)
      : e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
    var cls = 'p-row ' + type + (alive ? ' alive' : '') + (def.type === 'tower' ? ' tower' : '');
    var h = '<div class="' + cls + '"><div class="p-row-top"><span class="p-name">' + esc(nm(def.name)) + '</span>' + badge(e, def, n, alive, type, potStatus) + '</div>';
    var tags = '';
    if (def.type === 'tower') tags += '<span class="tag tw">' + t('tower') + '</span>';
    if (def.spawn_type && def.monster) tags += '<span class="tag mob">▸ ' + esc(nm(def.monster)) + '</span>';
    if (def.side) tags += '<span class="tag side-' + def.side + '">' + (def.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>';
    tags += UI.dropTags(def.drops);
    h += '<div class="p-row-mid">' + tags + '</div><div class="p-row-bot">' + UI.dropIcons(def.drops) + '</div></div>';
    return h;
  }
  function avgInterval(e) {
    var r = e.respawn_times;
    if (r && r.length) { var s = 0; r.forEach(function (x) { s += x; }); return Math.round(s / r.length); }
    return 1800; // 缺省 30 分钟
  }
  function span(cls, kind, val) {
    return '<span class="' + cls + '" data-tk="' + kind + '" data-tv="' + val + '">' + UI.timerText(kind, val) + '</span>';
  }
  function badge(e, def, n, alive, type, potStatus) {
    if (alive) return span('bdg alive', 'alive', e.spawn_time);
    if (type === 'ce') {
      var base = e.last_seen > 0 ? e.last_seen : (e.death_time > 0 ? e.death_time : 0);
      if (base > 0) { var na = base + avgInterval(e); return span('bdg ' + (n >= na ? 'canpop' : 'gone'), 'cd', na); }
      return span('bdg canpop', 'canpop', 0); // 从未出现视为可触发
    }
    if (type === 'pot') {
      if (potStatus && !potStatus.alive && potStatus.side === def.side)
        return span('bdg gone', 'eta', potStatus.nextEpoch);
      var last = e.last_seen > 0 ? e.last_seen : (e.death_time > 0 ? e.death_time : 0);
      if (last > 0) return span('bdg gone', 'last', last);
      return '<span class="bdg unk">' + t('unknown') + '</span>';
    }
    var seen = e.last_seen > 0 ? e.last_seen : (e.death_time > 0 ? e.death_time : 0);
    if (seen > 0) return span('bdg gone', 'last', seen);
    return '<span class="bdg unk">' + t('unknown') + '</span>';
  }

  // 计时文本（render 与每秒 tick 复用）
  UI.timerText = function (kind, val, now) {
    now = now || Math.floor(Date.now() / 1000);
    switch (kind) {
      case 'alive': return '● ' + t('alive') + ' ' + UI.fmtClock(now - val);
      case 'last': return t('last_seen') + ' ' + UI.fmtClock(now - val);
      case 'cd': return now >= val ? t('ce_can_trigger') : t('ce_cooldown') + ' ' + UI.fmtClock(val - now);
      case 'canpop': return t('ce_can_trigger');
      case 'eta': return now >= val ? t('pot_soon') : UI.fmtDur(val - now);
    }
    return '';
  };
  // 每秒只更新计时文本，不重绘整个面板（避免滚动被顶回 / 闪烁）
  UI.tickPanel = function () {
    var now = Math.floor(Date.now() / 1000);
    var expiredPot = false;
    document.querySelectorAll('#popover [data-tk]').forEach(function (el) {
      var kind = el.getAttribute('data-tk');
      var target = Number(el.getAttribute('data-tv')) || 0;
      el.textContent = UI.timerText(kind, target, now);
      if (kind === 'cd') el.className = 'bdg ' + (now >= target ? 'canpop' : 'gone');
      if (kind === 'eta' && now >= target) expiredPot = true;
    });
    return expiredPot;
  };

  // ---- 通知 ----
  var last = {};
  UI.notify = function (kind, title, body, key) {
    var k = key || (kind + ':' + title), tn = Date.now();
    if (last[k] && tn - last[k] < 30000) return; last[k] = tn;
    if (OC.Settings.get('notifyOnlyInZone') && OC.Overlay && OC.Overlay.connected && !OC.Overlay.inOccult) return;
    UI.toast(kind, title, body);
    if (OC.Settings.get('notifySound')) beep(kind);
  };
  UI.toast = function (kind, title, body) {
    var w = document.getElementById('toasts'); if (!w) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.innerHTML = '<div class="toast-title">' + esc(title) + '</div>' + (body ? '<div class="toast-body">' + esc(body) + '</div>' : '');
    w.appendChild(el);
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
  UI.beep = beep;
  // 使用 ACT 自带 TTS（OverlayPlugin），不调用系统 TTS；未连接则返回 false 退回提示音
  UI.speak = function (text) {
    if (!OC.Settings.get('useTts')) return false;
    if (OC.Overlay && OC.Overlay.connected && OC.Overlay.say(text)) return true;
    return false;
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  UI.esc = esc;
})(typeof window !== 'undefined' ? window : this);
