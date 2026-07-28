/* =========================================================================
 * main.js — 主控（自动模式）
 * 地图为主体；顶部胶囊；右侧圆形按钮；撒娇罐总览为主要数据来源。
 * ACT director 事件负责本地状态，云端仅补足经实例指纹确认的共享数据。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function nm(o) { return OC.localName(o, OC.Settings.get('lang')); }
  function now() { return Math.floor(Date.now() / 1000); }
  function potForSide(side, territory) {
    var found = null;
    Object.keys(OC.POTS).some(function (key) {
      var def = OC.POTS[key];
      if (def.side !== side || Number(def.territory) !== Number(territory)) return false;
      found = def;
      return true;
    });
    return found;
  }
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
        if (App.myIslandId) App.showIsland(App.myIslandId, App.myIslandRowId);
        else App.togglePanel('dcpots');
      });
      // 右键“当前 FATE/CE”胶囊即可隐藏（可在设置里重新打开）
      document.getElementById('chips-active').addEventListener('contextmenu', function (e) {
        e.preventDefault();
        OC.Settings.set('showActiveChips', false);
        App.updateActive();
        OC.UI.toast('fate', t('chips_hidden'), '');
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

    // 构造与 DR 相同的实例证据：大区 + 最新存活普通 FATE + Add 时间。
    // 只有 Add 才有出生时间；悬浮窗重载后首先收到的 Update 不参与指纹。
    instanceEvidence: function () {
      var meta = OC.Overlay.memMeta || {};
      var events = [];
      Object.keys(meta).forEach(function (key) {
        var id = Number(key), item = meta[key] || {};
        if (!item.active || !item.spawnEpoch || id === 48) return;
        events.push({ fateId: id, spawnEpoch: Number(item.spawnEpoch) });
      });
      var fateEvents = events.filter(function (item) {
        return !!OC.FATES[item.fateId];
      }).sort(function (a, b) { return b.spawnEpoch - a.spawnEpoch; });
      var latest = fateEvents[0];
      var dc = Number(OC.Overlay.playerDc) || 0;
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      var key = latest && dc ? dc + ':' + latest.fateId + ':' + latest.spawnEpoch : '';
      if (this._evidenceKey !== key) {
        this._evidenceKey = key;
        this._contextFingerprints = latest && dc
          ? OC.Pots.contextFingerprints(dc, latest.fateId, latest.spawnEpoch, 15)
          : [];
      }
      return { fingerprints: this._contextFingerprints || [], events: events, territory: territory };
    },

    // 仅接受 DR 指纹或唯一的本地 Add 时间匹配。普通“同 FATE 正在进行”
    // 在多岛环境没有区分度，不能用于显示魔法罐倒计时。
    resolveMyIsland: function () {
      var all = this._islands || [];
      var pdc = OC.Overlay.playerDc;
      var matched = OC.Pots.matchIsland(all, this.instanceEvidence(), pdc, 15);
      if (matched) {
        var changed = this.myIslandRowId !== matched.rowId;
        this.myIslandRowId = matched.rowId;
        this.myIslandFingerprint = matched.fingerprint || '';
        this.myIslandId = matched.id || ('row:' + matched.rowId);
        if (changed) {
          this._island = null;
          this._potAlertedFor = null;
          this._alerted = {};
        }
        return this.myIslandId;
      }
      // 强证据绑定后保持到换区/断线；云端列表短暂掉线不能让正确实例丢失。
      if (this.myIslandRowId) return this.myIslandId;
      return null;
    },

    // 每次区域/实例切换或断线都清空；即便 territoryId 相同也重新识别。
    resetIsland: function () {
      this.myIslandId = null; this.myIslandRowId = null; this.myIslandFingerprint = '';
      this._evidenceKey = ''; this._contextFingerprints = [];
      this._island = null; this._potAlertedFor = null; this._alerted = {};
      this._lastIslandFetch = 0;
      this._localPot = null;                 // 换本后本机观测的罐状态作废
      if (OC.Overlay.resetMemory) OC.Overlay.resetMemory();
      else OC.Overlay.memActive = {};
      OC.State.highlights = [];
      OC.Map.updateHighlights(document.getElementById('mapLayer'));
    },

    // 不在新月岛时完全隐藏悬浮窗；在岛内则按折叠状态决定是否显示地图
    updateMapVisible: function () {
      var app = document.getElementById('app'); if (!app) return;
      // 未连接游戏=独立/调试模式，保持显示
      var outside = OC.Overlay.connected && !OC.Overlay.inOccult;
      app.style.display = outside ? 'none' : '';
      var toasts = document.getElementById('toasts');
      if (toasts) toasts.style.display = outside ? 'none' : '';
      app.classList.toggle('no-map', this.collapsed);
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
      pop.classList.toggle('compact', this.openPanel === 'dcpots'); // 魔法罐总览用紧凑样式
      var newBody = pop.querySelector('.panel-body');
      if (newBody && scroll) newBody.scrollTop = scroll;
    },

    // 点击某岛 -> 拉取详情并显示战斗面板
    showIsland: function (id, rowId) {
      State.detailId = id;
      this.openPanel = 'battle';
      document.getElementById('popover').classList.remove('hidden');
      OC.UI.renderBattlePanel(document.getElementById('popover'), null, id); // loading
      var request = rowId ? OC.Api.fetchTrackerRow(rowId) : OC.Api.fetchTracker(id);
      request.then(function (rec) {
        if (!rec) return;
        State.detail = {
          territory: Number(rec.territory) || Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0,
          ce: pj(rec.encounter_history),
          fate: pj(rec.fate_history),
          pot: pj(rec.pot_history)
        };
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
      // 网络数据每 5 秒刷新一次；两次请求之间仍需按当前时间推进 30 分钟轮次，
      // 否则倒计时到 0 后会停在“即将出现”。
      if (this._dcRows) this._dc = OC.Pots.dcOverview(this._dcRows, now());
      var conn = document.getElementById('chip-conn');
      if (conn) {
        var c = OC.Overlay.connected;
        var zone = c ? (OC.Overlay.inOccult ? t('in_occult') : (OC.Overlay.zoneName || t('not_in_occult'))) : t('disconnected');
        conn.innerHTML = '<span class="dot ' + (c ? 'ok' : 'off') + '"></span>' + OC.UI.esc(zone);
      }
      var pot = document.getElementById('chip-pot');
      if (pot) {
        this.resolveMyIsland();
        var mine = this.localPotInfo();
        var body = '<span class="chip-k">' + t('pot') + '</span>';
        var ready = false;
        if (!mine && !this._dcLoaded) {
          body += '<span class="s">' + t('loading') + '</span>';
        } else if (mine) {
          var side = mine.side ? '<span class="side-' + mine.side + '">' + (mine.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>' : '';
          // 仅显示玩家已开启播报的当前区域关键奖励。
          var pdef = potForSide(mine.side, OC.Overlay.territoryId || (OC.MAP && OC.MAP.territory));
          if (pdef) side += OC.UI.rewardSuffixIfWanted(pdef.drops);
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

    // 本机 Add/Remove 优先；云端只允许来自已用强证据绑定的数据库行。
    localPotInfo: function () {
      var cloud = this._island && this._island.pot;
      if ((!cloud || !cloud.length) && this.myIslandRowId) {
        var overview = (this._dc || []).filter(function (item) {
          return item.rowId === App.myIslandRowId;
        })[0];
        if (overview) cloud = overview.potHistory;
      }

      var local = this._localPot || {};
      var localHistory = [];
      var activeId = 0, activeSeen = -1;
      var cloudById = {};
      (cloud || []).forEach(function (entry) {
        cloudById[Number(entry.fate_id)] = entry;
      });
      Object.keys(local).forEach(function (key) {
        var id = Number(key), observation = local[key];
        if (observation.active && observation.lastSeen > activeSeen) {
          activeId = id;
          activeSeen = observation.lastSeen;
        }
        var shared = cloudById[id];
        var spawnEpoch = observation.spawnEpoch ||
          (shared && Number(shared.spawn_time) > 0 ? Number(shared.spawn_time) : 0);
        if (!spawnEpoch) return;
        var lastSeen = observation.active ? now() :
          (observation.deathEpoch || observation.lastSeen || spawnEpoch);
        localHistory.push({
          fate_id: id,
          spawn_time: spawnEpoch,
          death_time: observation.active ? -1 : (observation.deathEpoch || lastSeen),
          last_seen: lastSeen
        });
      });

      var merged = OC.Pots.merge(cloud || [], localHistory);
      var status = OC.Pots.status(merged, now());

      // update 事件可能是悬浮窗重载后才收到的首个信号，没有可靠 spawn_time。
      // 此时只确认“正在进行”和方位，不伪造下一轮的精确时间。
      if (activeId) {
        var side = (OC.POTS[activeId] || {}).side || null;
        if (!status) return {
          alive: true, nextEpoch: null, etaSec: null, side: side, local: true
        };
        status.alive = true;
        status.side = side;
        status.local = true;
      }
      return status;
    },

    // 当前岛正在进行的 FATE/CE 胶囊（随界面缩放；带掉落颜色后缀）
    updateActive: function () {
      var box = document.getElementById('chips-active');
      if (!box) return;
      var html = '';
      if (OC.Settings.get('showActiveChips')) {
        var ids = OC.State.highlights || [];
        html = ids.map(function (id) {
          var isCe = !!OC.CES[id], isPot = !!OC.POTS[id];
          var def = isCe ? OC.CES[id] : isPot ? OC.POTS[id] : OC.FATES[id];
          if (!def) return '';
          var cls = isCe ? 'ce' : isPot ? 'pot' : 'fate';
          return '<div class="chip chip-act ' + cls + '">' + OC.UI.esc(nm(def.name)) + rewardSuffix(def.drops) + '</div>';
        }).join('');
      }
      // Position polling and the one-second timer both call this method.
      // Preserve the existing glass-effect nodes unless their content changed;
      // rebuilding identical nodes makes ACT's Chromium surface flash.
      if (box._ocActiveHtml === html) return;
      box._ocActiveHtml = html;
      box.innerHTML = html;
    },

    wireOverlay: function () {
      OC.Overlay.on('connected', function () { App.updateChips(); App.updateMapVisible(); });
      OC.Overlay.on('disconnected', function () {
        App.resetIsland();
        App.updateChips();
        App.updateMapVisible();
      });
      OC.Overlay.on('zone', function (territoryId) {
        if (OC.selectMap && OC.selectMap(territoryId)) {
          OC.Map.render(document.getElementById('mapLayer'));
        }
        App.resetIsland();
        App.updateChips(); App.updateMapVisible();
      });
      OC.Overlay.on('position', function () {
        OC.Map.updatePlayer(document.getElementById('mapLayer'));
        App.refreshHighlights();   // 视野内的 boss 也纳入高亮
        if (App.resolveMyIsland()) App.pollMyIsland(true);
      });
      OC.Overlay.on('playerContext', function () {
        // World/DC can arrive through raw ACT memory before position polling.
        // Re-evaluate immediately so a valid FateDirector Add is not stranded.
        if (App.resolveMyIsland()) App.pollMyIsland(true);
        else App.fetchDc(true);
      });
      // 内存态 FATE/CE 变化：即时提示（不受距离与云端上报延迟影响）
      OC.Overlay.on('memActive', function (id, active, detail) {
        if (OC.POTS[id]) {
          detail = detail || {};
          var observedAt = Number(detail.observedAt) || now();
          App._localPot = App._localPot || {};
          var observation = App._localPot[id] = App._localPot[id] || {};
          observation.active = active;
          observation.lastSeen = observedAt;
          if (active) {
            observation.deathEpoch = null;
            // FateWatcher 的 add 是实际刷新包；update 只证明当前仍存在。
            if (detail.eventType === 'add') observation.spawnEpoch = observedAt;
          } else {
            observation.deathEpoch = observedAt;
          }
        }
        App.refreshHighlights();
        if (active) App.alertEncounter(id);
        // 有了新信号立刻重新识别所在岛；尚未识别时再拉云端（有节流，避免频繁请求）
        if (!App.resolveMyIsland()) App.fetchDc(true);
        else App.pollMyIsland(true);
      });
    },

    // 拉取国服四大区活跃岛屿（撒娇罐总览 + 顶部胶囊数据源）
    fetchDc: function (throttled) {
      // 节流：事件驱动的请求最快 3 秒一次，避免频繁拉取导致卡顿
      var tn = Date.now();
      if (throttled && this._lastDcFetch && tn - this._lastDcFetch < 3000) return;
      this._lastDcFetch = tn;
      // 30 分钟窗口：岛屿上报间隔可能较长，窗口太窄会导致识别不到所在岛
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 1252;
      OC.Api.fetchDcPots(CN_DCS, 1800, territory).then(function (rows) {
        App._dcRows = rows;
        App._dc = OC.Pots.dcOverview(rows);       // 撒娇罐总览（会过滤掉无罐数据的岛）
        App._islands = OC.Pots.islandList(rows);  // 全部活跃岛（用于识别所在岛，不依赖罐数据）
        App._dcLoaded = true;
        App.resolveMyIsland();
        App.pollMyIsland();
        App.updateChips();
        if (App.openPanel === 'dcpots') App.renderPanel();
      }).catch(function () { App._dcLoaded = true; });
    },

    // 拉取“我所在岛”的完整数据，驱动地图高亮 + 提示（云端，玩家在起始点也有效）
    pollMyIsland: function (throttled) {
      // 不在新月岛时不拉取本岛数据（避免残留数据触发提示）
      if (OC.Overlay.connected && !OC.Overlay.inOccult) { this._island = null; return; }
      var tn = Date.now();
      if (throttled && this._lastIslandFetch && tn - this._lastIslandFetch < 3000) return;
      this._lastIslandFetch = tn;
      var id = this.myIslandId;
      if (!id) { this._island = null; OC.State.highlights = []; OC.Map.updateHighlights(document.getElementById('mapLayer')); return; }
      var rowId = this.myIslandRowId;
      var request = rowId ? OC.Api.fetchTrackerRow(rowId) : OC.Api.fetchTracker(id);
      request.then(function (rec) {
        if (!rec) return;
        if ((rowId && App.myIslandRowId !== rowId) || (!rowId && App.myIslandId !== id)) return;
        var h = {
          territory: Number(rec.territory) || Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0,
          ce: pj(rec.encounter_history),
          fate: pj(rec.fate_history),
          pot: pj(rec.pot_history)
        };
        App.checkIslandAlerts(h);
        App._island = h;
        App.refreshHighlights();
        if (App.openPanel === 'battle' && State.detailId === id) { State.detail = h; App.renderPanel(); }
      }).catch(function () {});
    },

    // 地图高亮 = 本机内存态 ∪ 已严格定位到本岛的云端状态。
    refreshHighlights: function () {
      // 258 FateDirector 是本机全岛状态，优先用于 FATE/魔法罐。
      // 部分 ACT/游戏版本在北征完全不产出 259 CEDirector，因此 CE 必须合并
      // 已通过 territory + world/DC + 玩家实例证据严格绑定的本岛 tracker。
      var ids = [];
      Object.keys(OC.Overlay.memActive || {}).forEach(function (k) {
        var id = Number(k); if (ids.indexOf(id) < 0) ids.push(id);
      });
      var trustLocalOnly = OC.Overlay.connected && OC.Overlay.inOccult;
      var isl = this._island;
      if (isl) {
        var shared = trustLocalOnly ? isl.ce : isl.ce.concat(isl.fate).concat(isl.pot);
        shared.forEach(function (e) {
          var id = Number(e.fate_id);
          if (isAlive(e) && id && ids.indexOf(id) < 0) ids.push(id);
        });
      }
      OC.State.highlights = ids;
      OC.Map.updateHighlights(document.getElementById('mapLayer'));
      this.updateActive();
    },

    // 按 id 提示（内存态与云端共用；存活期间只提示一次）
    alertEncounter: function (id) {
      var isCe = !!OC.CES[id], isPot = !!OC.POTS[id];
      var def = isCe ? OC.CES[id] : isPot ? OC.POTS[id] : OC.FATES[id];
      if (!def) return;
      var kind = isCe ? 'ce' : isPot ? 'pot' : 'fate';
      var key = kind + ':' + id;
      this._alerted = this._alerted || {};
      if (this._alerted[key]) return;
      this._alerted[key] = 1;
      this.notifyEncounter(kind, id, def);
    },

    // 播报筛选：总开关优先；关闭时使用魔法罐和当前区域关键奖励筛选。
    notifyEncounter: function (kind, id, def) {
      if (OC.Settings.get('alertAllEncounters')) {
        this.fireAlert(kind, t('notify_' + kind) + ' · ' + nm(def.name), 'spawn:' + id);
        return;
      }
      if (kind === 'pot') {
        if (OC.Settings.get('alertPot')) this.fireAlert('pot', nm(def.name), 'spawn:' + id);
        return;
      }
      var colors = OC.Settings.get('alertColors') || {};
      var hit = (def.drops || []).filter(function (d) { return colors[d]; })[0];
      if (hit) this.fireAlert(kind, nm(def.name) + ' · ' + OC.localName(OC.ITEMS[hit].name, OC.Settings.get('lang')), 'spawn:' + id);
    },

    // 岛上 FATE/CE 刷新时提示：同一目标在“存活期间”只提示一次
    // （云端 spawn_time 会被不同上报者反复更新，不能用它判断“新出现”）
    checkIslandAlerts: function (h) {
      // 岛内 FATE/魔法罐以本机 258 为准；北征 CE 在部分 ACT 版本没有 259，
      // 因此允许已严格绑定到本岛的 tracker 补足 CE 播报。
      var ceFallbackOnly = OC.Overlay.connected && OC.Overlay.inOccult;
      var first = !this._island;                 // 首次拉取该岛：只建立基线，不提示
      var alerted = this._alerted = this._alerted || {};
      ['ce', 'fate', 'pot'].forEach(function (tp) {
        if (ceFallbackOnly && tp !== 'ce') return;
        h[tp].forEach(function (e) {
          var key = tp + ':' + e.fate_id;
          if (!isAlive(e)) {
            // 云端可能滞后/抖动：内存仍显示进行中时不要解除提示锁，否则会重复播报
            if (!(OC.Overlay.memActive || {})[e.fate_id]) delete alerted[key];
            return;
          }
          if (alerted[key]) return;                            // 存活期间已提示过
          alerted[key] = 1;
          if (first) return;                                   // 基线不提示
          var def = tp === 'ce' ? OC.CES[e.fate_id] : tp === 'pot' ? OC.POTS[e.fate_id] : OC.FATES[e.fate_id];
          if (!def) return;
          App.notifyEncounter(tp, e.fate_id, def);
        });
      });
    },

    // 撒娇罐：预计出现前 3 分钟提示（而非出现时）
    checkPotPreAlert: function () {
      if (!OC.Settings.get('alertPot')) return;
      var mine = this.localPotInfo();
      if (!mine || mine.alive || !mine.nextEpoch) return;
      var eta = mine.nextEpoch - Math.floor(Date.now() / 1000);
      // 用“取整到 5 分钟”的窗口做标记，避免各上报者时间戳抖动导致重复提示
      var slot = Math.round(mine.nextEpoch / 300);
      if (eta > 0 && eta <= 180 && this._potAlertedFor !== slot) {
        this._potAlertedFor = slot;
        var side = mine.side === 'north' ? t('pot_north') : mine.side === 'south' ? t('pot_south') : '';
        App.fireAlert('pot', t('pot_pre_alert') + (side ? ' · ' + side : ''), 'potpre');
      }
    },

    fireAlert: function (kind, msg, dedupKey) {
      // 不在新月岛时不提示（避免播报其它岛/无关数据）
      if (OC.Overlay.connected && !OC.Overlay.inOccult) return;
      var now = Date.now();
      var key = dedupKey || msg;
      // 出现类提示用长窗口（10 分钟）：同一次出现持续数分钟，短窗口会重复播报
      var ttl = /^spawn:/.test(key) ? 600000 : 60000;
      this._alertLast = this._alertLast || {};
      if (this._alertLast[key] && now - this._alertLast[key] < ttl) return;
      // 跨实例去重：同一浏览器/悬浮窗开了多个实例时，只让第一个播报
      if (!claimAlert(key, ttl, now)) { this._alertLast[key] = now; return; }
      this._alertLast[key] = now;
      // 排队播报：同一时刻多个提示时依次播放，避免 TTS 叠在一起
      this._alertQueue = this._alertQueue || [];
      this._alertQueue.push({ kind: kind, msg: msg });
      this._drainAlerts();
    },

    _drainAlerts: function () {
      if (this._alertPlaying || !this._alertQueue || !this._alertQueue.length) return;
      var item = this._alertQueue.shift();
      this._alertPlaying = true;
      OC.UI.toast(item.kind, item.msg, '');
      if (!OC.UI.speak(item.msg)) OC.UI.beep(item.kind);
      // 每条提示之间留出间隔，让 TTS 有时间念完
      setTimeout(function () {
        App._alertPlaying = false;
        App._drainAlerts();
      }, 3500);
    },

    startLoops: function () {
      // 每 5 秒刷新国服总览（顶部胶囊 + 面板）
      setInterval(function () { App.fetchDc(); }, 5000);
      // 每秒：更新胶囊 + 面板计时文本（不重绘，避免滚动被顶回/闪烁）+ 撒娇罐提前提示
      setInterval(function () {
        App.updateChips();
        App.checkPotPreAlert();
        if (App.openPanel === 'dcpots' || App.openPanel === 'battle') {
          var expiredPot = OC.UI.tickPanel();
          if (expiredPot) App.renderPanel();
        }
      }, 1000);
    },

    renderSettings: function (pop) {
      var g = OC.Settings.get.bind(OC.Settings);
      var colors = g('alertColors') || {};
      var swatch = {
        47744: '#4aa3ff', 47745: '#2ec4b6', 47746: '#3ddb63',
        47747: '#ff8a3c', 47748: '#b061ff', 47749: '#ffce4d',
        50974: '#79c8ff', 50975: '#bb9cff', 50976: '#ffb86b'
      };
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 1252;
      var rewardIds = territory === 1346
        ? [50974, 50975, 50976]
        : [47744, 47745, 47746, 47747, 47748, 47749];
      var rewardPrompt = territory === 1346 ? t('alert_dispeller') : t('alert_demiatma');
      var h = '<div class="panel-head">' + t('panel_settings') + '<button class="pclose" data-close>' + t('close') + '</button></div>';
      h += '<div class="panel-body settings">';
      h += '<div class="s-grp">' + t('alert_title') + '</div>';
      h += rowChk('a-all', t('alert_all'), g('alertAllEncounters'));
      h += rowChk('a-pot', t('alert_pot_opt'), g('alertPot'));
      h += '<div class="s-sub">' + rewardPrompt + '</div><div class="color-grid">';
      rewardIds.forEach(function (id) {
        var it = OC.ITEMS[id], on = !!colors[id];
        h += '<label class="color-chk' + (on ? ' on' : '') + '" data-cid="' + id + '" style="--sc:' + swatch[id] + '">' +
          '<input type="checkbox" data-color="' + id + '"' + (on ? ' checked' : '') + '>' +
          '<span class="sw"></span>' + esc(OC.localName(it.name, g('lang'))) + '</label>';
      });
      h += '</div>';
      h += rowChk('a-tts', t('alert_tts'), g('useTts'));
      h += '<div class="s-grp">' + t('panel_settings') + '</div>';
      h += rowChk('s-chips', t('set_show_chips'), g('showActiveChips'));
      h += row(t('set_opacity'), '<input id="s-op" type="range" min="0.3" max="1" step="0.05" value="' + g('opacity') + '">');
      h += row(t('set_scale'), '<input id="s-scale" type="range" min="0.8" max="2" step="0.1" value="' + (g('uiScale') || 1) + '">');
      h += '<div class="repo-link"><a id="s-repo" href="#">github.com/zhui-zi/OccultOverlay</a></div>';
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
      bindChk(pop, 'a-all', 'alertAllEncounters');
      bindChk(pop, 'a-tts', 'useTts');
      var chipsChk = pop.querySelector('#s-chips');
      if (chipsChk) chipsChk.addEventListener('change', function () {
        OC.Settings.set('showActiveChips', chipsChk.checked);
        App.updateActive();
      });
      var repo = pop.querySelector('#s-repo');
      if (repo) repo.addEventListener('click', function (e) {
        e.preventDefault();
        var url = 'https://github.com/zhui-zi/OccultOverlay';
        // 优先让 ACT 用系统浏览器打开；未连接时回退到普通打开
        if (!OC.Overlay.openUrl(url)) window.open(url, '_blank');
      });
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

  // 跨实例提示去重：用 localStorage 记录已播报的 key（同源共享）。
  // 多个悬浮窗实例/标签页同时运行时，避免同一条提示被读好几遍。
  var ALERT_LS = 'occultOverlay.alerts';
  function claimAlert(key, ttl, now) {
    try {
      var map = JSON.parse(localStorage.getItem(ALERT_LS) || '{}');
      if (map[key] && now - map[key] < ttl) return false; // 已有实例播报过
      map[key] = now;
      // 清理过期项，避免无限增长
      Object.keys(map).forEach(function (k) { if (now - map[k] > 1800000) delete map[k]; });
      localStorage.setItem(ALERT_LS, JSON.stringify(map));
      return true;
    } catch (e) { return true; } // localStorage 不可用时不阻断提示
  }

  function pj(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
  function isAlive(e) { return e && e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time); }

  function rewardSuffix(drops) { return OC.UI.rewardSuffix(drops); }
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
