/* ACT connection layer for WebSocket and injected OverlayPluginApi transports. */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  // 新月岛（South Horn / North Horn）区域判定。
  // 官方 territoryId 若与默认不符，可在设置里覆盖；同时用区域名兜底匹配。
  var OCCULT_TERRITORY_IDS = [1252, 1346];
  var OCCULT_NAME_RE = /occult|crescent|south horn|north horn|新月|南征|北征|隠世|クレセント|południ|kreszent/i;
  var DUPLICATE_ZONE_SIGNAL_MS = 10000;

  function EventBus() { this._h = {}; }
  EventBus.prototype.on = function (name, cb) {
    (this._h[name] = this._h[name] || []).push(cb);
    return this;
  };
  EventBus.prototype.emit = function (name) {
    var args = Array.prototype.slice.call(arguments, 1);
    (this._h[name] || []).forEach(function (cb) {
      try { cb.apply(null, args); } catch (e) { console.error('[overlay] handler', name, e); }
    });
  };

  // Public WorldID -> shared tracker datacenter ID.
  // Global IDs follow the client World sheet; CN IDs follow the current CN world list.
  var WORLD2DC = {
    // Elemental
    45: 1, 49: 1, 50: 1, 58: 1, 68: 1, 72: 1, 90: 1, 94: 1,
    // Gaia
    43: 2, 46: 2, 51: 2, 59: 2, 69: 2, 76: 2, 92: 2, 98: 2,
    // Mana
    23: 3, 28: 3, 44: 3, 47: 3, 48: 3, 61: 3, 70: 3, 96: 3,
    // Aether
    40: 4, 54: 4, 57: 4, 63: 4, 65: 4, 73: 4, 79: 4, 99: 4,
    // Primal
    35: 5, 53: 5, 55: 5, 64: 5, 77: 5, 78: 5, 93: 5, 95: 5,
    // Chaos
    39: 6, 71: 6, 80: 6, 83: 6, 85: 6, 97: 6, 400: 6, 401: 6,
    // Light
    33: 7, 36: 7, 42: 7, 56: 7, 66: 7, 67: 7, 402: 7, 403: 7,
    // Crystal
    34: 8, 37: 8, 41: 8, 62: 8, 74: 8, 75: 8, 81: 8, 91: 8,
    // Materia
    21: 9, 22: 9, 86: 9, 87: 9, 88: 9,
    // Meteor
    24: 10, 29: 10, 30: 10, 31: 10, 32: 10, 52: 10, 60: 10, 82: 10,
    // Dynamis
    404: 11, 405: 11, 406: 11, 407: 11, 408: 11, 409: 11, 410: 11, 411: 11,
    // China
    160: 101, 161: 101, 165: 101, 166: 101, 168: 102, 170: 101, 171: 101,
    186: 102, 187: 102, 190: 102, 1042: 101, 1043: 103, 1044: 101, 1045: 103,
    1060: 101, 1076: 102, 1081: 101, 1106: 103, 1113: 102, 1121: 102,
    1166: 102, 1167: 101, 1169: 103, 1170: 102, 1171: 102, 1172: 102,
    1173: 101, 1174: 101, 1175: 101, 1176: 102, 1177: 103, 1178: 103,
    1179: 103, 1180: 104, 1183: 104, 1186: 104, 1192: 104, 1200: 104, 1201: 104
  };
  OC.WORLD2DC = WORLD2DC;

  // OverlayPlugin getCombatants normally returns decimal world IDs, while
  // ACT LogLine 03 encodes the same value as an unprefixed hexadecimal string.
  function normalizeWorldId(value, unprefixedHex) {
    if (value == null || value === '') return 0;
    var text = String(value).trim();
    if (unprefixedHex) {
      var logWorld = parseInt(text.replace(/^0x/i, ''), 16);
      if (isFinite(logWorld) && WORLD2DC[logWorld]) return logWorld;
    }
    var decimal = Number(text);
    if (isFinite(decimal) && WORLD2DC[decimal]) return decimal;
    var hexadecimal = parseInt(text.replace(/^0x/i, ''), 16);
    if (isFinite(hexadecimal) && WORLD2DC[hexadecimal]) return hexadecimal;
    return isFinite(decimal) ? decimal : 0;
  }

  function setPlayerWorld(value, unprefixedHex) {
    var worldId = normalizeWorldId(value, unprefixedHex);
    var dc = WORLD2DC[worldId] || 0;
    if (!worldId || !dc) return false;
    var changed = Overlay.playerWorld !== worldId || Overlay.playerDc !== dc;
    Overlay.playerWorld = worldId;
    Overlay.playerDc = dc;
    if (changed) Overlay.emit('playerContext', { worldId: worldId, dc: dc });
    return true;
  }

  function actorId(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return value;
    return parseInt(String(value).replace(/^0x/i, ''), 16) || 0;
  }

  var Overlay = OC.Overlay = new EventBus();
  Overlay.connected = false;
  Overlay.territoryId = null;
  Overlay.zoneName = '';
  Overlay.inOccult = false;
  Overlay.playerName = '';
  Overlay.playerPos = null; // {x, y, z, h}; y is altitude, x/z are horizontal
  Overlay.fateSnapshotUntil = 0;

  // OverlayPlugin replays existing FATEs as Add events after a zone change or
  // reconnect. Those timestamps are observation times, not StartTimeEpoch.
  var INITIAL_FATE_SYNC_SEC = 12;
  function beginFateSnapshot() {
    Overlay.fateSnapshotUntil = Math.floor(Date.now() / 1000) + INITIAL_FATE_SYNC_SEC;
  }

  // onFateEvent 由网络包解析产生（cactbot/IINACT FateWatcher），全岛可见、即时，
  // 与玩家距离无关；Add 可提供实例识别证据，Update 只证明当前仍存活。
  var SUBSCRIBE = ['ChangeZone', 'ChangePrimaryPlayer', 'LogLine', 'onFateEvent'];

  var ws = null;
  var wsUrl = null;
  var reconnectTimer = null;
  var transportMode = null;

  function setConnected(connected) {
    connected = !!connected;
    if (Overlay.connected === connected) return;
    Overlay.connected = connected;
    if (connected) beginFateSnapshot();
    Overlay.emit(connected ? 'connected' : 'disconnected');
  }

  function getWsUrl() {
    // OverlayPlugin 会以 OVERLAY_WS 或 HOST_PORT 传入 ws 地址（HOST_PORT 常为 faker 地址，
    // 必须原样连接以便注入的 WebSocket faker 桥接到游戏内存）。
    var m = /[?&]OVERLAY_WS=([^&]+)/.exec(location.search);
    if (m) return decodeURIComponent(m[1]);
    var hp = /[?&]HOST_PORT=([^&]+)/.exec(location.search);
    if (hp) return decodeURIComponent(hp[1]);
    if (OC.Settings && OC.Settings.get('wsUrl')) return OC.Settings.get('wsUrl');
    return null;
  }

  function connectWs() {
    if (transportMode !== 'ws' || !wsUrl) return;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws.addEventListener('open', function () {
      SUBSCRIBE.forEach(function (ev) {
        ws.send(JSON.stringify({ call: 'subscribe', events: [ev] }));
      });
      setConnected(true);
    });
    ws.addEventListener('message', function (msg) {
      var d;
      try { d = JSON.parse(msg.data); } catch (e) { return; }
      handleMessage(d);
    });
    ws.addEventListener('close', function () {
      if (transportMode !== 'ws') return;
      setConnected(false);
      scheduleReconnect();
    });
    ws.addEventListener('error', function () { try { ws.close(); } catch (e) {} });
  }

  function scheduleReconnect() {
    if (transportMode !== 'ws' || reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connectWs();
    }, 5000);
  }

  var legacyTimer = null;
  function connectLegacy() {
    global.__OverlayCallback = handleMessage;
    if (legacyTimer) return;
    legacyTimer = setInterval(function () {
      var api = global.OverlayPluginApi;
      if (api && api.ready) {
        clearInterval(legacyTimer); legacyTimer = null;
        beginFateSnapshot();
        SUBSCRIBE.forEach(function (ev) {
          try { api.callHandler(JSON.stringify({ call: 'subscribe', events: [ev] }), function () {}); } catch (e) {}
        });
        setConnected(true);
      }
    }, 500);
  }

  global.dispatchOverlayEvent = function (msg) { handleMessage(msg); };
  document.addEventListener('onOverlayDataUpdate', function (e) {
    if (e && e.detail) handleMessage(e.detail);
  });

  var _rseq = 0;
  var _pending = {};
  Overlay.callHandler = function (obj) {
    if (transportMode === 'legacy' && global.OverlayPluginApi && global.OverlayPluginApi.ready) {
      return new Promise(function (resolve) {
        global.OverlayPluginApi.callHandler(JSON.stringify(obj), function (data) {
          if (typeof data !== 'string') { resolve(data || null); return; }
          try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
      });
    }
    if (ws && ws.readyState === 1) {
      var id = ++_rseq;
      obj.rseq = id;
      return new Promise(function (resolve) {
        _pending[id] = resolve;
        try { ws.send(JSON.stringify(obj)); } catch (e) { delete _pending[id]; resolve(null); }
        setTimeout(function () { if (_pending[id]) { delete _pending[id]; resolve(null); } }, 4000);
      });
    }
    return Promise.resolve(null);
  };

  var posTimer = null;
  function startPositionPolling() {
    if (posTimer) return;
    posTimer = setInterval(function () {
      if (!Overlay.connected) return;

      Overlay.callHandler({ call: 'getCombatants' }).then(function (data) {
        if (!data || !data.combatants) return;
        var arr = data.combatants;
        var me = null, i, c;
        if (Overlay.playerId != null) {
          for (i = 0; i < arr.length; i++) { c = arr[i]; if (c.ID == Overlay.playerId) { me = c; break; } }
        }
        if (!me && Overlay.playerName) {
          for (i = 0; i < arr.length; i++) { c = arr[i]; if (c.Name === Overlay.playerName) { me = c; break; } }
        }
        if (!me) for (i = 0; i < arr.length; i++) { c = arr[i]; if ((c.type === 1 || c.Type === 1) && c.Name) { me = c; break; } }
        if (!me) return;
        if (!Overlay.playerName && me.Name) Overlay.playerName = me.Name;
        if (Overlay.playerId == null && me.ID != null) Overlay.playerId = me.ID;
        // 跨区旅行时以“当前世界”为准（CurrentWorldID），而非home世界(WorldID)
        var wid = me.CurrentWorldID || me.CurrentWorld || me.WorldID;
        if (wid) setPlayerWorld(wid);
        if (me.PosX == null) return;
        // Dalamud(x,z) horizontal == OverlayPlugin(PosX, PosY); PosZ is altitude.
        Overlay.playerPos = {
          x: Number(me.PosX),
          y: me.PosZ != null ? Number(me.PosZ) : null,
          z: Number(me.PosY),
          h: Number(me.Heading)
        };
        // FATE/CE 状态一律以 258/259 内存数据为准；
        // 战斗单位名字是模糊匹配，会把普通怪误判成 FATE/CE，故不再使用。
        Overlay.emit('position', Overlay.playerPos);
      });

    }, 2000);
  }

  function handleMessage(d) {
    if (!d) return;
    if (d.rseq != null && _pending[d.rseq]) { var f = _pending[d.rseq]; delete _pending[d.rseq]; f(d); return; }
    if (!d.type) return;
    switch (d.type) {
      case 'ChangeZone':
        setZone(d.zoneID != null ? d.zoneID : d.zoneId, d.zoneName);
        break;
      case 'ChangePrimaryPlayer':
        Overlay.playerName = d.charName || d.name || '';
        if (d.charID != null) Overlay.playerId = d.charID;
        break;
      case 'LogLine':
        handleLogLine(d);
        break;
      case 'onFateEvent':
        handleFateEvent(d);
        break;
    }
  }

  // onFateEvent: { type, eventType:'add'|'remove'|'update', fateID:Number, progress:Number }
  // 由网络包解析（FateWatcher）产生，全岛可见且即时，与玩家距离无关。
  // Some hosts expose a real start epoch. Otherwise Add is trusted only after
  // the initial snapshot window has elapsed.
  function handleFateEvent(d) {
    var id = d.fateID != null ? Number(d.fateID) : (d.fateId != null ? Number(d.fateId) : 0);
    if (!id) return;
    var eventType = String(d.eventType || '').toLowerCase();
    var rawStart =
      d.startTimeEpoch != null ? d.startTimeEpoch :
      d.startEpoch != null ? d.startEpoch :
      d.startTime != null ? d.startTime : 0;
    var explicitStart = Number(rawStart);
    if (!isFinite(explicitStart) && rawStart) explicitStart = Date.parse(rawStart) / 1000;
    if (explicitStart > 1000000000000) explicitStart = Math.floor(explicitStart / 1000);
    if (explicitStart < 1000000000) explicitStart = 0;
    memChanged(id, eventType !== 'remove', {
      eventType: eventType,
      observedAt: Math.floor(Date.now() / 1000),
      startEpoch: explicitStart > 0 ? Math.floor(explicitStart) : 0,
      startQuality: explicitStart > 0 ? 'exact' : 'observed',
      endQuality: eventType === 'remove' ? 'direct' : 'observed',
      source: 'onFateEvent'
    }); // add / update = 存在；remove = 结束
  }

  var lastZoneSignal = null;
  function setZone(id, name) {
    var territoryId = id != null ? Number(id) : null;
    var zoneName = name || '';
    var signalAt = Date.now();
    // ChangeZone and LogLine 01 can describe the same transition, but legacy
    // OverlayPlugin may deliver the second copy several seconds later. Do not
    // let that delayed duplicate erase a freshly matched island. Real exits and
    // re-entries pass through another territory and therefore still reset.
    if (lastZoneSignal && lastZoneSignal.territoryId === territoryId &&
        signalAt - lastZoneSignal.at < DUPLICATE_ZONE_SIGNAL_MS) {
      if (!Overlay.zoneName && zoneName) Overlay.zoneName = zoneName;
      return;
    }
    lastZoneSignal = { territoryId: territoryId, at: signalAt };
    beginFateSnapshot();
    Overlay.territoryId = territoryId;
    Overlay.zoneName = zoneName;
    var byId = OC.Settings && OC.Settings.get('occultTerritoryId')
      ? Overlay.territoryId === Number(OC.Settings.get('occultTerritoryId'))
      : OCCULT_TERRITORY_IDS.indexOf(Overlay.territoryId) >= 0;
    var byName = OCCULT_NAME_RE.test(Overlay.zoneName);
    Overlay.inOccult = !!(byId || byName);
    Overlay.emit('zone', Overlay.territoryId, Overlay.zoneName, Overlay.inOccult);
  }

  function handleLogLine(d) {
    var line = d.line || [];
    var type = parseInt(line[0], 10);
    Overlay.emit('log', type, line, d.rawLine || '');

    // 01 = ChangeZone（部分环境只发 LogLine 不发 ChangeZone 事件）
    if (type === 1) {
      setZone(parseInt(line[2], 16), line[3]);
      return;
    }

    // 03 = AddCombatant. This is the most direct ACT memory path for the
    // current player's world and survives getCombatants schema differences.
    if (type === 3) {
      var sameId = Overlay.playerId != null && actorId(line[2]) === actorId(Overlay.playerId);
      var sameName = Overlay.playerName && line[3] === Overlay.playerName;
      if (sameId || sameName) setPlayerWorld(line[7], true);
      return;
    }

    if (Overlay.debugRaw) { try { Overlay.debugRaw(line); } catch (e) {} }

    // 258 FateDirector / 259 CEDirector：由 ACT 读取内存产生，
    // 与距离无关且即时，是获取全岛 FATE/CE 状态的最佳来源。
    if (type === 258) { handleFateDirector(line); return; }
    if (type === 259) { handleCeDirector(line); return; }

    // 系统消息 / 战斗日志：尝试从文本匹配 CE/FATE 名称触发通知。
    // ACT 环境无法稳定拿到内存态 FATE 列表，这里做“文本兜底”，
    // 主上报仍以数据面板按钮 + 共享 tracker 数据为准。
    if (type === 0 || type === 257 /* 0x101 */ || type === 561) {
      var text = line[line.length - 1] || '';
      detectFromText(text);
    }
  }

  var _matchIndex = null;
  function buildMatchIndex() {
    _matchIndex = [];
    function add(kind, id, nameObj) {
      ['zh', 'en', 'ja'].forEach(function (lang) {
        var n = nameObj[lang];
        if (!n) return;
        // 取「」内怪名或整名
        var core = (/[「『](.+?)[」』]/.exec(n) || [null, n])[1];
        if (core && core.length >= 2) _matchIndex.push({ kind: kind, id: id, needle: core });
      });
    }
    Object.keys(OC.CES).forEach(function (k) { add('ce', Number(k), OC.CES[k].name); });
    Object.keys(OC.FATES).forEach(function (k) { add('fate', Number(k), OC.FATES[k].name); });
    Object.keys(OC.POTS).forEach(function (k) { add('pot', Number(k), OC.POTS[k].name); });
  }

  function detectFromText(text) {
    if (!text) return;
    if (!_matchIndex) buildMatchIndex();
    for (var i = 0; i < _matchIndex.length; i++) {
      var m = _matchIndex[i];
      if (text.indexOf(m.needle) >= 0) {
        Overlay.emit(m.kind === 'ce' ? 'ce' : 'fate', {
          encounterId: m.id, fateId: m.id, status: 'spawned',
          name: m.kind === 'ce' ? OC.CES[m.id].name : (OC.POTS[m.id] || OC.FATES[m.id]).name
        });
        return; // 每行只匹配一次
      }
    }
  }

  // ---- 内存态 FATE/CE（258/259 director 行）-----------------------------
  // Overlay.memActive: { id: true } 当前岛上正在进行的 FATE/CE（与距离无关）
  Overlay.memActive = {};
  // Overlay.memMeta preserves trusted live start evidence. Initial snapshot
  // packets only prove that the event is alive; a new zero-progress pot Update
  // can also be the first director packet when ACT drops its Add packet.
  Overlay.memMeta = {};

  function memChanged(id, active, detail) {
    id = Number(id);
    if (!id) return;
    // 只接受新月岛已知的 CE/FATE/魔法罐，过滤其它区域或无关的 director 数据
    if (!OC.CES[id] && !OC.FATES[id] && !OC.POTS[id]) return;
    detail = detail || {};
    var was = !!Overlay.memActive[id];
    var observedAt = Number(detail.observedAt) || Math.floor(Date.now() / 1000);
    var meta = Overlay.memMeta[id] = Overlay.memMeta[id] || {};
    var gainedExactStart = false;
    var cePhaseChanged = false;
    meta.active = !!active;
    meta.lastSeen = observedAt;
    meta.source = detail.source || meta.source || '';
    if (detail.ceStatus != null) {
      var nextCeStatus = Math.max(0, Number(detail.ceStatus) || 0);
      var nextCePopTime = Number(detail.cePopTime) || 0;
      if (nextCePopTime < 1000000000) nextCePopTime = 0;
      cePhaseChanged = Number(meta.ceStatus || 0) !== nextCeStatus ||
        Number(meta.cePopTime || 0) !== nextCePopTime;
      meta.ceStatus = nextCeStatus;
      meta.cePopTime = nextCePopTime;
    }
    if (active && detail.eventType === 'add') {
      var explicitStart = Number(detail.startEpoch) || 0;
      var trustedStart = explicitStart > 0 || observedAt > Number(Overlay.fateSnapshotUntil || 0);
      var startQuality = explicitStart > 0 ? 'exact' : String(detail.startQuality || 'observed');
      var qualityRank = { observed: 1, direct: 2, exact: 3 };
      if (!qualityRank[startQuality]) startQuality = 'observed';
      detail.startTrusted = trustedStart;
      detail.startEpoch = trustedStart ? (explicitStart || observedAt) : 0;
      detail.startQuality = trustedStart ? startQuality : '';
      meta.snapshot = !trustedStart;
      var qualityImproved = qualityRank[startQuality] > qualityRank[meta.spawnQuality || 'observed'];
      if (trustedStart && (!was || !meta.spawnEpoch || !meta.spawnTrusted || qualityImproved)) {
        gainedExactStart = Number(meta.spawnEpoch) !== detail.startEpoch ||
          !meta.spawnTrusted || qualityImproved;
        meta.spawnEpoch = detail.startEpoch;
        meta.spawnTrusted = true;
        meta.spawnQuality = startQuality;
      } else if (!trustedStart && !was) {
        meta.spawnEpoch = null;
        meta.spawnTrusted = false;
        meta.spawnQuality = '';
      }
      meta.deathEpoch = null;
    }
    if (!active) {
      meta.deathEpoch = observedAt;
      meta.deathQuality = String(detail.endQuality || 'observed');
    }
    if (active) Overlay.memActive[id] = true; else delete Overlay.memActive[id];
    if (was !== !!active || gainedExactStart || cePhaseChanged) {
      Overlay.emit('memActive', id, !!active, detail);
    }
  }

  Overlay.resetMemory = function () {
    Overlay.memActive = {};
    Overlay.memMeta = {};
  };

  // 258|ts|category(Add/Update/Remove)|padding|fateId(hex)|progress(hex)|...
  function handleFateDirector(line) {
    var cat = String(line[2] || '');
    var fateId = parseInt(line[4], 16);
    if (!fateId) return;
    var eventType = cat.toLowerCase();
    var observedAt = Date.parse(line[1] || '') / 1000;
    if (!isFinite(observedAt)) observedAt = Math.floor(Date.now() / 1000);
    var progress = parseInt(line[5], 16);
    // ACT occasionally starts a Magic Pot with Update(progress=0) and never
    // emits Add. Outside the reconnect snapshot, that first zero-progress
    // packet is the live start transition; keep its epoch so the countdown
    // can continue after Remove. Do not generalize this to ordinary FATEs,
    // whose start time is also used as instance identity evidence.
    if (eventType === 'update' && OC.POTS[fateId] && !Overlay.memActive[fateId] &&
        progress === 0 && observedAt > Number(Overlay.fateSnapshotUntil || 0)) {
      eventType = 'add';
    }
    var detail = {
      eventType: eventType,
      observedAt: Math.floor(observedAt),
      startQuality: cat === 'Add' ? 'direct' : 'observed',
      endQuality: cat === 'Remove' ? 'direct' : 'observed',
      source: 'FateDirector'
    };
    if (cat === 'Remove') memChanged(fateId, false, detail);
    else memChanged(fateId, true, detail); // Add / Update
  }

  // CEDirector uses a territory-local sequence instead of the DynamicEvent row.
  // South: 0=tower 48, 1-15 => 33-47.
  // North: 0=tower 64, 1-15 => 49-63. Key 16 is not shared by the tracker.
  function ceKeyToId(k, territoryId) {
    if (Number(territoryId) === 1346) {
      if (k === 0) return 64;
      if (k >= 1 && k <= 15) return 48 + k;
      return 0;
    }
    return k === 0 ? 48 : (k >= 1 && k <= 15) ? 32 + k : 0;
  }
  OC.ceKeyToId = ceKeyToId;

  // 259|ts|popTime|timeRemaining|unk|ceKey(hex)|numPlayers|status|unk|progress|...
  function handleCeDirector(line) {
    var ceKey = parseInt(line[5], 16);
    if (isNaN(ceKey)) return;
    var id = ceKeyToId(ceKey, Overlay.territoryId);
    if (!id) return;
    var status = parseInt(line[7], 16) || 0;   // 0=未激活 1=招募人手 2=准备开始 3=战斗中
    var popTime = parseInt(line[2], 16) || 0;
    if (popTime < 1000000000) popTime = 0;
    var was = !!Overlay.memActive[id];
    // CEDirector status 0 is a removal. Remaining time and player count can
    // retain values in that line and must never reactivate the encounter.
    var active = status !== 0;
    var observedAt = Date.parse(line[1] || '') / 1000;
    if (!isFinite(observedAt)) observedAt = Math.floor(Date.now() / 1000);
    memChanged(id, active, {
      eventType: active && !was ? 'add' : active ? 'update' : 'remove',
      observedAt: Math.floor(observedAt),
      ceStatus: status,
      cePopTime: popTime,
      source: 'CEDirector'
    });
  }

  var _bossIndex = null;
  function bossTokens(nameObj) {
    if (!nameObj) return [];
    var tk = [];
    if (nameObj.zh) { var z = nameObj.zh, i = z.lastIndexOf('—'); tk.push(i >= 0 ? z.slice(i + 1) : z); }
    if (nameObj.ja) { var m = /[「『](.+?)[」』]/.exec(nameObj.ja); tk.push(m ? m[1] : nameObj.ja); }
    if (nameObj.en) tk.push(nameObj.en);
    return tk.filter(function (x) { return x && x.length >= 2; });
  }
  function buildBossIndex() {
    _bossIndex = [];
    function add(id, nameObj) { bossTokens(nameObj).forEach(function (t) { _bossIndex.push({ id: id, t: t }); }); }
    Object.keys(OC.CES).forEach(function (k) { add(Number(k), OC.CES[k].name); });
    Object.keys(OC.FATES).forEach(function (k) { add(Number(k), OC.FATES[k].name); });
  }
  function scanBosses(combatants) {
    if (!_bossIndex) buildBossIndex();
    var found = {};
    Overlay.bossPos = Overlay.bossPos || {};
    (combatants || []).forEach(function (c) {
      var name = c && c.Name; if (!name || name.length < 2) return;
      if (c.type != null && c.type !== 2) return;
      for (var i = 0; i < _bossIndex.length; i++) {
        var b = _bossIndex[i];
        if (name === b.t || name.indexOf(b.t) >= 0) {
          found[b.id] = 1;
          if (c.PosX != null) Overlay.bossPos[b.id] = [c.PosX, c.PosY];
          break;
        }
      }
    });
    return Object.keys(found).map(Number);
  }

  Overlay.openUrl = function (url) {
    var obj = { call: 'openWebsiteWithWS', url: url };
    if (transportMode === 'legacy' && global.OverlayPluginApi && global.OverlayPluginApi.ready) {
      try { global.OverlayPluginApi.callHandler(JSON.stringify(obj), function () {}); return true; } catch (e) {}
    }
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch (e) {} }
    return false; // 未连接 ACT：由调用方回退到 window.open
  };

  Overlay.say = function (text) {
    var obj = { call: 'say', text: text };
    if (transportMode === 'legacy' && global.OverlayPluginApi && global.OverlayPluginApi.ready) {
      try { global.OverlayPluginApi.callHandler(JSON.stringify(obj), function () {}); return true; } catch (e) {}
    }
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch (e) {} }
    return false;
  };

  Overlay.start = function () {
    // 与 cactbot 官方接入方式一致：显式 WS 参数存在时只走 WS，
    // 否则只等待内置浏览器注入 API，避免失败的 WS 重试覆盖已连接状态。
    wsUrl = getWsUrl();
    transportMode = wsUrl ? 'ws' : 'legacy';
    if (transportMode === 'ws') connectWs();
    else connectLegacy();
    startPositionPolling();
  };

  Overlay.setZoneManual = setZone;

  Overlay.isConnected = function () { return Overlay.connected; };
})(typeof window !== 'undefined' ? window : this);
