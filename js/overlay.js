/* Connects ACT through WebSocket or injected OverlayPluginApi transports. */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  // Detect South and North Horn by territory ID, with zone-name fallback for overrides.
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

  // Public WorldID -> shared tracker data-center ID. Global values follow the client
  // World sheet; CN values follow the current CN world list.
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

  // getCombatants returns decimal world IDs; LogLine 03 encodes them as unprefixed hexadecimal.
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
  Overlay.playerPos = null; // {x, y, z, h}; y is altitude and x/z are horizontal.
  Overlay.fateSnapshotUntil = 0;

  // OverlayPlugin replays existing FATEs as Adds after zone changes and reconnects;
  // those timestamps are observations, not StartTimeEpoch.
  var INITIAL_FATE_SYNC_SEC = 12;
  function beginFateSnapshot() {
    Overlay.fateSnapshotUntil = Math.floor(Date.now() / 1000) + INITIAL_FATE_SYNC_SEC;
  }

  // cactbot/IINACT FateWatcher packets are island-wide and immediate. A live Add may
  // identify an instance; Update proves only liveness.
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
    // OVERLAY_WS or HOST_PORT provides the WebSocket endpoint. HOST_PORT may be a faker
    // bridge address and must remain unchanged.
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

  var POSITION_POLL_MS = 2000;
  var LIVE_POSITION_POLL_MS = 250;
  var posTimer = null;
  var lastPositionPollAt = 0;
  var positionPollPending = false;

  function needsLivePosition() {
    var treasureActive = OC.Treasure && OC.Treasure.isActive && OC.Treasure.isActive();
    var radarActive = OC.Radar && OC.Radar.isActive && OC.Radar.isActive();
    var routeActive = OC.Route && OC.Route.isActive && OC.Route.isActive();
    return !!(treasureActive || radarActive || routeActive);
  }

  function startPositionPolling() {
    if (posTimer) return;
    posTimer = setInterval(function () {
      if (!Overlay.connected || positionPollPending) return;
      var current = Date.now();
      var interval = needsLivePosition() ? LIVE_POSITION_POLL_MS : POSITION_POLL_MS;
      if (lastPositionPollAt && current - lastPositionPollAt < interval) return;
      lastPositionPollAt = current;
      positionPollPending = true;

      Overlay.callHandler({ call: 'getCombatants' }).then(function (data) {
        positionPollPending = false;
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
        // CurrentWorldID, not the home WorldID, identifies cross-world sessions.
        var wid = me.CurrentWorldID || me.CurrentWorld || me.WorldID;
        if (wid) setPlayerWorld(wid);
        if (me.PosX == null) return;
        // Dalamud horizontal (x,z) maps to OverlayPlugin (PosX,PosY); PosZ is altitude.
        Overlay.playerPos = {
          x: Number(me.PosX),
          y: me.PosZ != null ? Number(me.PosZ) : null,
          z: Number(me.PosY),
          h: Number(me.Heading)
        };
        Overlay.emit('combatants', arr);
        // Director 258/259 data owns FATE/CE state; fuzzy combatant-name matching can
        // misclassify ordinary monsters and is intentionally excluded.
        Overlay.emit('position', Overlay.playerPos);
      }, function () {
        positionPollPending = false;
      });

    }, LIVE_POSITION_POLL_MS);
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

  // FateWatcher event: { type, eventType, fateID, progress }. Some hosts include a
  // start epoch; otherwise an Add becomes trustworthy only after the snapshot window.
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
    }); // Add/Update is active; Remove is ended.
  }

  var lastZoneSignal = null;
  function setZone(id, name) {
    var territoryId = id != null ? Number(id) : null;
    var zoneName = name || '';
    var signalAt = Date.now();
    // ChangeZone and LogLine 01 can duplicate one transition, with the legacy copy
    // arriving seconds late. Ignore it so a fresh island match survives; real exits
    // still pass through another territory and reset normally.
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

    // LogLine 01 backs up ChangeZone in hosts that omit the event.
    if (type === 1) {
      setZone(parseInt(line[2], 16), line[3]);
      return;
    }

    // LogLine 03 AddCombatant provides the player's world across getCombatants schemas.
    if (type === 3) {
      var sameId = Overlay.playerId != null && actorId(line[2]) === actorId(Overlay.playerId);
      var sameName = Overlay.playerName && line[3] === Overlay.playerName;
      if (sameId || sameName) setPlayerWorld(line[7], true);
      return;
    }

    if (Overlay.debugRaw) { try { Overlay.debugRaw(line); } catch (e) {} }

    // FateDirector 258 and CEDirector 259 are immediate, island-wide ACT memory reads.
    if (type === 258) { handleFateDirector(line); return; }
    if (type === 259) { handleCeDirector(line); return; }

    // System/combat name matching is notification-only fallback; director state,
    // data-panel controls, and the shared tracker remain authoritative.
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
        // Prefer the bracketed monster name; otherwise use the full match.
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
        return; // One notification candidate per line.
      }
    }
  }

  // In-memory FATE/CE state from director lines 258/259.
  // memActive maps active encounter IDs independently of distance.
  Overlay.memActive = {};
  // memMeta retains trusted start evidence. Snapshot packets prove only liveness,
  // while a new zero-progress Pot Update may replace a dropped Add.
  Overlay.memMeta = {};

  function memChanged(id, active, detail) {
    id = Number(id);
    if (!id) return;
    // Reject director IDs outside the known Occult Crescent encounter set.
    if (!OC.CES[id] && !OC.FATES[id] && !OC.POTS[id]) return;
    detail = detail || {};
    var was = !!Overlay.memActive[id];
    var observedAt = Number(detail.observedAt) || Math.floor(Date.now() / 1000);
    var meta = Overlay.memMeta[id] = Overlay.memMeta[id] || {};
    var source = String(detail.source || '');
    var isDirector = source === 'FateDirector' || source === 'CEDirector';
    var ignoreSecondaryLiveness = !isDirector && source === 'onFateEvent' && meta.directorSeen;
    if (isDirector) {
      meta.directorSeen = true;
      meta.directorActive = !!active;
    } else if (ignoreSecondaryLiveness) {
      // FateWatcher and director packets can reorder. After local director evidence,
      // secondary events may refine start time but never toggle visible lifetime.
      active = !!meta.directorActive;
    }
    var gainedExactStart = false;
    var cePhaseChanged = false;
    meta.active = !!active;
    if (!ignoreSecondaryLiveness) {
      meta.lastSeen = observedAt;
      meta.source = source || meta.source || '';
    }
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
    if (!active && !ignoreSecondaryLiveness) {
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

  // 258 schema: timestamp, category, padding, hex FATE ID, hex progress, ...
  function handleFateDirector(line) {
    var cat = String(line[2] || '');
    var fateId = parseInt(line[4], 16);
    if (!fateId) return;
    var eventType = cat.toLowerCase();
    var observedAt = Date.parse(line[1] || '') / 1000;
    if (!isFinite(observedAt)) observedAt = Math.floor(Date.now() / 1000);
    var progress = parseInt(line[5], 16);
    // ACT may begin a Pot with Update(0) and omit Add. Outside a reconnect snapshot,
    // treat the first such packet as its cycle anchor. Ordinary FATEs cannot use this
    // fallback because their start time also identifies the instance.
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
    else memChanged(fateId, true, detail); // Add or Update.
  }

  // CEDirector uses territory-local keys: South 0 -> tower 48 and 1-15 -> 33-47;
  // North 0 -> tower 64 and 1-15 -> 49-63. Tracker data excludes key 16.
  function ceKeyToId(k, territoryId) {
    if (Number(territoryId) === 1346) {
      if (k === 0) return 64;
      if (k >= 1 && k <= 15) return 48 + k;
      return 0;
    }
    return k === 0 ? 48 : (k >= 1 && k <= 15) ? 32 + k : 0;
  }
  OC.ceKeyToId = ceKeyToId;

  // 259 schema: timestamp, popTime, remaining, unknown, hex CE key, players,
  // status, unknown, progress, ...
  function handleCeDirector(line) {
    var ceKey = parseInt(line[5], 16);
    if (isNaN(ceKey)) return;
    var id = ceKeyToId(ceKey, Overlay.territoryId);
    if (!id) return;
    var status = parseInt(line[7], 16) || 0;   // 0 inactive, 1 recruiting, 2 preparing, 3 combat.
    var popTime = parseInt(line[2], 16) || 0;
    if (popTime < 1000000000) popTime = 0;
    var was = !!Overlay.memActive[id];
    // Status 0 is removal even when remaining time and player count retain stale values.
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
    return false; // Let the caller use window.open when ACT is disconnected.
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
    // Match cactbot: explicit WS parameters select WebSocket; otherwise wait for the
    // embedded API so retry failures cannot replace a live connection.
    wsUrl = getWsUrl();
    transportMode = wsUrl ? 'ws' : 'legacy';
    if (transportMode === 'ws') connectWs();
    else connectLegacy();
    startPositionPolling();
  };

  Overlay.setZoneManual = setZone;

  Overlay.isConnected = function () { return Overlay.connected; };
})(typeof window !== 'undefined' ? window : this);
