/* Resolves Magic Pot treasure candidates from ACT messages and player position. */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};
  var DIRECTIONS = ['正北', '东北', '正东', '东南', '正南', '西南', '正西', '西北'];
  var DIRECTION_KEYS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  var POT_KILL_WINDOW_SEC = 30;
  var NORTH_DANGER_RADIUS = 20;
  var NORTH_DANGER_POINTS = [
    [440.298, -926.5872],
    [-834, -587.4],
    [-975.4507, -526.2878],
    [-960, -425.8],
    [-586.3, -715.2],
    [-88.43135, 4.891054],
    [-259.6, 56.9],
    [-172.6, 103.2]
  ];
  var SOUTH_DANGER_SECTORS = {
    'S正北': true, 'S正南': true, 'S正西': true, 'S西北': true, 'S西南': true,
    'R正南': true, 'R正西': true, 'R西北': true, 'R西南': true
  };

  var overlay = null;
  var started = false;
  var listeners = [];
  var lastPotKill = null;
  var buffActive = false;
  var buffSeenAt = 0;

  function isEnabled() {
    return !OC.Settings || OC.Settings.get('treasureGuide') !== false;
  }

  function emptyState(reason) {
    return {
      active: false,
      mode: '',
      territory: 0,
      fateId: 0,
      side: '',
      ownerName: '',
      dismissed: false,
      status: 'idle',
      lastDirection: '',
      pendingDirection: '',
      candidates: [],
      target: null,
      mismatch: false,
      startedAt: 0,
      updatedAt: 0,
      lastReason: reason || ''
    };
  }

  var state = emptyState('');

  function notify() {
    var view = Treasure.view();
    listeners.slice().forEach(function (cb) {
      try { cb(view); } catch (e) { console.error('[treasure] listener', e); }
    });
  }

  function point(value, index) {
    if (Array.isArray(value)) return { x: Number(value[0]), z: Number(value[1]), index: index };
    return { x: Number(value.x), z: Number(value.z), index: value.index != null ? value.index : index };
  }

  function copyPoints(values) {
    return (values || []).map(function (value, index) { return point(value, index); });
  }

  function currentEpoch() {
    return Math.floor(Date.now() / 1000);
  }

  function lineEpoch(line) {
    var value = line && line[1];
    var parsed = value ? Date.parse(value) / 1000 : NaN;
    return isFinite(parsed) ? Math.floor(parsed) : currentEpoch();
  }

  function lineMessage(line, raw) {
    if (line && line[4] != null) return String(line[4]);
    if (!raw) return '';
    var fields = String(raw).split('|');
    return fields[4] || '';
  }

  function lineSubtype(line, raw) {
    if (line && line[2] != null) return String(line[2]).toUpperCase();
    if (!raw) return '';
    var fields = String(raw).split('|');
    return String(fields[2] || '').toUpperCase();
  }

  function playerOwnsMessage(message) {
    var name = overlay && String(overlay.playerName || '');
    // ACT uses 08AE/08B0 for the local player and 222E for nearby players. Match names
    // when available, but trust the personal subtype while player context loads.
    return !name || message.indexOf(name) === 0;
  }

  function actorId(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return value >>> 0;
    var text = String(value).trim();
    var parsed = /^(?:0x)?[0-9a-f]+$/i.test(text)
      ? parseInt(text.replace(/^0x/i, ''), 16)
      : Number(text);
    return isFinite(parsed) ? parsed >>> 0 : 0;
  }

  function playerOwnsStatusLine(line) {
    var targetId = actorId(line && line[7]);
    var playerId = actorId(overlay && overlay.playerId);
    if (targetId && playerId) return targetId === playerId;
    var targetName = String(line && line[8] || '');
    var playerName = state.ownerName || String(overlay && overlay.playerName || '');
    return !!playerName && targetName === playerName;
  }

  function directionIndex(direction) {
    return DIRECTIONS.indexOf(direction);
  }

  function directionForDelta(dx, dz) {
    if (dx * dx + dz * dz < 1) return -1;
    var sectorSize = Math.PI / 4;
    var angle = Math.atan2(dx, -dz);
    var sector = Math.floor((angle + sectorSize / 2) / sectorSize);
    return (sector + 8) % 8;
  }

  function bearingForDelta(dx, dz) {
    if (dx * dx + dz * dz < 0.000001) return null;
    var degrees = Math.atan2(dx, -dz) * 180 / Math.PI;
    return (degrees + 360) % 360;
  }

  function parseDirection(message) {
    message = String(message || '');
    for (var i = 0; i < DIRECTIONS.length; i++) {
      if (message.indexOf(DIRECTIONS[i] + '方向') >= 0) return DIRECTIONS[i];
    }
    return '';
  }

  function refineCandidates(candidates, from, direction) {
    var wanted = directionIndex(direction);
    if (wanted < 0 || !from) return copyPoints(candidates);
    return copyPoints(candidates).filter(function (candidate) {
      return directionForDelta(candidate.x - Number(from.x), candidate.z - Number(from.z)) === wanted;
    });
  }

  function isNorthDanger(candidate) {
    var radiusSquared = NORTH_DANGER_RADIUS * NORTH_DANGER_RADIUS;
    for (var i = 0; i < NORTH_DANGER_POINTS.length; i++) {
      var dx = candidate.x - NORTH_DANGER_POINTS[i][0];
      var dz = candidate.z - NORTH_DANGER_POINTS[i][1];
      if (dx * dx + dz * dz <= radiusSquared) return true;
    }
    return false;
  }

  function isDanger(candidate, context) {
    context = context || {};
    if (Number(context.territory) === 1346) {
      if (context.mode === 'reroll') return true;
      return isNorthDanger(candidate);
    }
    if (Number(context.territory) === 1252) {
      var region = context.mode === 'reroll' ? 'R' : context.side === 'south' ? 'S' : 'N';
      return !!SOUTH_DANGER_SECTORS[region + String(context.direction || '')];
    }
    return false;
  }

  function distanceSquared(candidate, from) {
    var dx = candidate.x - Number(from.x);
    var dz = candidate.z - Number(from.z);
    return dx * dx + dz * dz;
  }

  function selectTarget(candidates, from, context) {
    if (!from || !candidates || !candidates.length) {
      return { target: null, safeCount: 0, dangerCount: 0 };
    }
    var safe = [];
    var dangerous = [];
    copyPoints(candidates).forEach(function (candidate) {
      (isDanger(candidate, context) ? dangerous : safe).push(candidate);
    });
    var pool = safe.length ? safe : dangerous;
    pool.sort(function (a, b) { return distanceSquared(a, from) - distanceSquared(b, from); });
    var target = pool.length ? pool[0] : null;
    if (target) target.danger = !safe.length;
    return { target: target, safeCount: safe.length, dangerCount: dangerous.length };
  }

  function candidatePool(territory, mode, side) {
    var map = OC.MAPS && OC.MAPS[Number(territory)];
    var points = map && map.points;
    if (!points) return [];
    var key = mode === 'reroll' ? 'reroll' : side === 'south' ? 'potSouth' : 'potNorth';
    return copyPoints(points[key]);
  }

  function sessionContext() {
    return {
      territory: state.territory,
      mode: state.mode,
      side: state.side,
      direction: state.lastDirection
    };
  }

  function chooseCurrentTarget() {
    var position = overlay && overlay.playerPos;
    var selected = selectTarget(state.candidates, position, sessionContext());
    state.target = selected.target;
    state.status = state.target ? 'guiding' : 'mismatch';
    state.mismatch = !state.target;
    state.updatedAt = currentEpoch();
  }

  function beginSession(mode, kill) {
    if (!isEnabled()) return false;
    var territory = Number(kill.territory);
    var side = kill.side || '';
    var candidates = candidatePool(territory, mode, side);
    if (!candidates.length) return false;
    state = {
      active: true,
      mode: mode,
      territory: territory,
      fateId: Number(kill.id) || 0,
      side: side,
      ownerName: overlay && String(overlay.playerName || ''),
      dismissed: false,
      status: 'waiting-direction',
      lastDirection: '',
      pendingDirection: '',
      candidates: candidates,
      target: null,
      mismatch: false,
      startedAt: currentEpoch(),
      updatedAt: currentEpoch(),
      lastReason: ''
    };
    notify();
    return true;
  }

  function tryBeginInitial() {
    if (!isEnabled() || state.active || !buffActive || !lastPotKill || !buffSeenAt) return false;
    if (Math.abs(buffSeenAt - Number(lastPotKill.at)) > POT_KILL_WINDOW_SEC) return false;
    if (!overlay || !overlay.inOccult || Number(overlay.territoryId) !== Number(lastPotKill.territory)) return false;
    return beginSession('initial', lastPotKill);
  }

  function beginContinuation() {
    if (!state.active || !buffActive) return false;
    var kill = {
      id: state.fateId,
      territory: state.territory,
      side: state.side
    };
    return beginSession('reroll', kill);
  }

  function applyDirection(direction) {
    if (!state.active || directionIndex(direction) < 0) return false;
    state.lastDirection = direction;
    state.mismatch = false;
    var position = overlay && overlay.playerPos;
    if (!position) {
      state.pendingDirection = direction;
      state.target = null;
      state.status = 'waiting-position';
      state.updatedAt = currentEpoch();
      notify();
      return true;
    }

    state.pendingDirection = '';
    var matches = refineCandidates(state.candidates, position, direction);
    if (!matches.length) {
      // Retain the previous set for recovery, but never select outside the reported sector.
      state.target = null;
      state.status = 'mismatch';
      state.mismatch = true;
      state.updatedAt = currentEpoch();
      notify();
      return true;
    }
    state.candidates = matches;
    chooseCurrentTarget();
    notify();
    return true;
  }

  function handlePotTransition(id, active, detail) {
    if (!isEnabled()) return;
    var definition = OC.POTS && OC.POTS[Number(id)];
    if (active || !definition || !overlay || !overlay.inOccult) return;
    var territory = Number(definition.territory);
    if (Number(overlay.territoryId) !== territory) return;
    lastPotKill = {
      id: Number(id),
      territory: territory,
      side: definition.side,
      at: Number(detail && detail.observedAt) || currentEpoch()
    };
    tryBeginInitial();
  }

  function handleLog(type, line, raw) {
    if (!isEnabled()) return;
    if (Number(type) === 30 && parseInt(line && line[2], 16) === 0x5FB && playerOwnsStatusLine(line)) {
      buffActive = false;
      buffSeenAt = 0;
      lastPotKill = null;
      Treasure.reset('buff-lost');
      return;
    }
    if (Number(type) === 258) {
      if (String(line && line[2] || '').toLowerCase() === 'remove') {
        handlePotTransition(parseInt(line[4], 16), false, {
          eventType: 'remove',
          observedAt: lineEpoch(line)
        });
      }
      return;
    }
    if (Number(type) !== 0) return;
    var subtype = lineSubtype(line, raw);
    var message = lineMessage(line, raw);
    var at = lineEpoch(line);

    if (subtype === '08AE' && message.indexOf('指引财宝') >= 0 && message.indexOf('附加了') >= 0 && playerOwnsMessage(message)) {
      buffActive = true;
      buffSeenAt = at;
      tryBeginInitial();
      return;
    }

    if (subtype === '08B0' && message.indexOf('指引财宝') >= 0 && message.indexOf('状态效果消失') >= 0 && playerOwnsMessage(message)) {
      buffActive = false;
      buffSeenAt = 0;
      lastPotKill = null;
      Treasure.reset('buff-lost');
      return;
    }

    if (subtype === '0039' && message.indexOf('更多的圣灵药') >= 0 && message.indexOf('再帮你找一次财宝') >= 0) {
      beginContinuation();
      return;
    }

    if (subtype === '0839') {
      var direction = parseDirection(message);
      if (direction) applyDirection(direction);
    }
  }

  function handleZone(territoryId, zoneName, inOccult) {
    territoryId = Number(territoryId) || 0;
    if (!inOccult || (state.active && territoryId !== state.territory) ||
        (lastPotKill && territoryId !== Number(lastPotKill.territory))) {
      buffActive = false;
      buffSeenAt = 0;
      lastPotKill = null;
      Treasure.reset('zone-left');
    }
  }

  function handlePosition() {
    if (!state.active) return;
    if (state.pendingDirection) {
      applyDirection(state.pendingDirection);
      return;
    }
    if (state.target) notify();
  }

  var Treasure = OC.Treasure = {
    directions: DIRECTIONS.slice(),

    start: function (source) {
      if (started) return;
      overlay = source || OC.Overlay;
      if (!overlay || !overlay.on) return;
      started = true;
      overlay.on('memActive', handlePotTransition);
      overlay.on('log', handleLog);
      overlay.on('zone', handleZone);
      overlay.on('position', handlePosition);
      overlay.on('disconnected', function () {
        buffActive = false;
        buffSeenAt = 0;
        lastPotKill = null;
        Treasure.reset('disconnected');
      });
    },

    onChange: function (cb) {
      if (typeof cb === 'function') listeners.push(cb);
      return this;
    },

    reset: function (reason) {
      var wasActive = state.active;
      state = emptyState(reason);
      if (wasActive) notify();
    },

    setEnabled: function (enabled) {
      if (enabled !== false) return;
      buffActive = false;
      buffSeenAt = 0;
      lastPotKill = null;
      Treasure.reset('disabled');
    },

    dismiss: function () {
      if (!state.active || state.dismissed) return false;
      state.dismissed = true;
      notify();
      return true;
    },

    view: function () {
      var view = {
        active: state.active,
        dismissed: state.dismissed,
        mode: state.mode,
        territory: state.territory,
        fateId: state.fateId,
        side: state.side,
        status: state.status,
        lastDirection: state.lastDirection,
        mismatch: state.mismatch,
        candidateCount: state.candidates.length,
        candidates: [],
        safeCount: 0,
        dangerCount: 0,
        target: null,
        lastReason: state.lastReason
      };
      if (!state.active) return view;
      var context = sessionContext();
      view.candidates = state.candidates.map(function (candidate) {
        return {
          x: candidate.x,
          z: candidate.z,
          dangerous: isDanger(candidate, context)
        };
      });
      var position = overlay && overlay.playerPos;
      var selected = selectTarget(state.candidates, position, context);
      view.safeCount = selected.safeCount;
      view.dangerCount = selected.dangerCount;
      if (!state.target || !position) return view;
      var dx = state.target.x - Number(position.x);
      var dz = state.target.z - Number(position.z);
      var travelSector = directionForDelta(dx, dz);
      view.target = {
        x: state.target.x,
        z: state.target.z,
        distance: Math.sqrt(dx * dx + dz * dz),
        dangerous: !!state.target.danger,
        direction: travelSector >= 0 ? DIRECTIONS[travelSector] : '',
        directionKey: travelSector >= 0 ? DIRECTION_KEYS[travelSector] : '',
        bearing: bearingForDelta(dx, dz)
      };
      return view;
    },

    isActive: function () {
      return !!state.active;
    },

    parseDirection: parseDirection,
    directionIndex: directionIndex,
    directionForDelta: directionForDelta,
    bearingForDelta: bearingForDelta,
    refineCandidates: refineCandidates,
    isDanger: isDanger,
    selectTarget: selectTarget,
    applyDirection: applyDirection
  };
})(typeof window !== 'undefined' ? window : this);
