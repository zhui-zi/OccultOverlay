/* Tracks live coffers and carrots from OverlayPlugin game objects. */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};
  var OCCULT_TERRITORIES = { 1252: true, 1346: true };
  var ABSOLUTE_KEYS = [
    'direction_north', 'direction_northeast', 'direction_east', 'direction_southeast',
    'direction_south', 'direction_southwest', 'direction_west', 'direction_northwest'
  ];

  var source = null;
  var started = false;
  var enabled = true;
  var targets = {};
  var mapTargets = {};
  var pending = {};
  var suppressed = {};
  var sequence = 0;
  var changeHandlers = [];
  var alertHandlers = [];

  function kindEnabled(kind) {
    if (!OC.Settings) return true;
    return OC.Settings.get(kind === 'carrot' ? 'radarCarrots' : 'radarCoffers') !== false;
  }

  function settingEnabled() {
    return kindEnabled('bronze') || kindEnabled('carrot');
  }

  function inOccult() {
    if (!source) return true;
    if (source.inOccult) return true;
    return !!OCCULT_TERRITORIES[Number(source.territoryId)];
  }

  function number(value) {
    var out = Number(value);
    return isFinite(out) ? out : null;
  }

  function npcId(value, encodedHex) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Math.floor(value);
    var text = String(value).trim();
    if (!text) return 0;
    if (encodedHex || /^0x/i.test(text) || /[a-f]/i.test(text)) {
      return parseInt(text.replace(/^0x/i, ''), 16) || 0;
    }
    return Number(text) || 0;
  }

  function actorKey(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'number') return Math.floor(value).toString(16).toUpperCase();
    var text = String(value).trim().replace(/^0x/i, '');
    if (!text) return '';
    if (/[a-f]/i.test(text) || (/^[14][0-9]{7}$/.test(text))) {
      return (parseInt(text, 16) || 0).toString(16).toUpperCase();
    }
    var decimal = Number(text);
    return isFinite(decimal) ? Math.floor(decimal).toString(16).toUpperCase() : text.toUpperCase();
  }

  function classify(value, encodedHex) {
    var id = npcId(value, encodedHex);
    if (id === 2010139) return 'carrot';
    if ((id >= 1789 && id <= 1796) || (id >= 2006 && id <= 2013)) return 'silver';
    if ((id >= 1797 && id <= 1856) || (id >= 2014 && id <= 2073)) return 'bronze';
    return '';
  }

  function horizontalPosition(combatant) {
    if (!combatant) return null;
    var x = number(combatant.PosX != null ? combatant.PosX : combatant.X);
    var z = number(combatant.PosY != null ? combatant.PosY : combatant.Y);
    var y = number(combatant.PosZ != null ? combatant.PosZ : combatant.Z);
    if (x == null || z == null) return null;
    return { x: x, y: y, z: z };
  }

  function normalizeAngle(value) {
    var turn = Math.PI * 2;
    value %= turn;
    return value < 0 ? value + turn : value;
  }

  function directionIndex(angle) {
    return Math.round(normalizeAngle(angle) / (Math.PI / 4)) % 8;
  }

  function bearingForDelta(dx, dz) {
    if (dx * dx + dz * dz < 0.000001) return null;
    var degrees = Math.atan2(dx, -dz) * 180 / Math.PI;
    return (degrees + 360) % 360;
  }

  function updateMetrics(target, player) {
    if (!target || !player) return;
    var dx = target.x - Number(player.x);
    var dz = target.z - Number(player.z);
    if (!isFinite(dx) || !isFinite(dz)) return;
    var absoluteAngle = Math.atan2(dx, -dz);
    target.distance = Math.sqrt(dx * dx + dz * dz);
    target.distanceRounded = Math.round(target.distance / 10) * 10;
    target.bearing = bearingForDelta(dx, dz);
    target.absoluteKey = target.bearing == null ? 'unknown' : ABSOLUTE_KEYS[directionIndex(absoluteAngle)];
  }

  function emitChange() {
    var view = Radar.targets();
    changeHandlers.forEach(function (handler) {
      try { handler(view); } catch (error) { console.error('[radar] change handler', error); }
    });
  }

  function emitAlert(target) {
    if (!kindEnabled(target && target.kind)) return;
    var view = publicTarget(target);
    alertHandlers.forEach(function (handler) {
      try { handler(view); } catch (error) { console.error('[radar] alert handler', error); }
    });
  }

  function nextCofferSlot() {
    var used = {};
    Object.keys(mapTargets).forEach(function (key) {
      var target = mapTargets[key];
      if (target.kind !== 'carrot') used[target.slot] = true;
    });
    var slot = 1;
    while (used[slot]) slot++;
    return slot;
  }

  function publicTarget(target) {
    return {
      id: target.id,
      bnpcId: target.bnpcId,
      kind: target.kind,
      labelKey: 'radar_' + target.kind,
      slot: target.slot,
      x: target.x,
      y: target.y,
      z: target.z,
      distance: target.distance,
      distanceRounded: target.distanceRounded,
      bearing: target.bearing,
      absoluteKey: target.absoluteKey || 'unknown',
    };
  }

  function addOrUpdate(combatant, fallback) {
    var id = actorKey(combatant && combatant.ID != null ? combatant.ID : fallback && fallback.actorId);
    if (!id) return null;
    if (Number(suppressed[id] || 0) > Date.now()) {
      delete pending[id];
      return null;
    }
    delete suppressed[id];
    var rawNpc = combatant && (
      combatant.BNpcID != null ? combatant.BNpcID :
      combatant.BNpcId != null ? combatant.BNpcId :
      combatant.BNpcNameID != null ? combatant.BNpcNameID : combatant.BNpcNameId
    );
    var kind = classify(rawNpc, false) || (fallback && fallback.kind) || '';
    var bnpc = npcId(rawNpc, false) || (fallback && fallback.bnpcId) || 0;
    var pos = horizontalPosition(combatant);
    if (!kind || !pos) return null;

    var target = targets[id] || mapTargets[id];
    var fresh = !target;
    if (fresh) {
      target = targets[id] = {
        id: id,
        kind: kind,
        bnpcId: bnpc,
        slot: kind === 'carrot' ? 0 : nextCofferSlot(),
        sequence: ++sequence
      };
    }
    targets[id] = target;
    mapTargets[id] = target;
    target.kind = kind;
    target.bnpcId = bnpc;
    target.x = pos.x;
    target.y = pos.y;
    target.z = pos.z;
    target.lastSeen = Date.now();
    target.missingScans = 0;
    if (source && source.playerPos) updateMetrics(target, source.playerPos);
    delete pending[id];
    return { target: target, fresh: fresh };
  }

  function findField(line, name) {
    name = String(name).toLowerCase();
    for (var i = 0; i < line.length - 1; i++) {
      if (String(line[i]).toLowerCase() === name) return line[i + 1];
    }
    return null;
  }

  function requestEntity(actorId, kind, bnpc) {
    if (!source || !source.callHandler) return;
    var key = actorKey(actorId);
    var numericId = parseInt(String(actorId).replace(/^0x/i, ''), 16);
    if (!key || !numericId) return;
    pending[key] = { actorId: actorId, kind: kind, bnpcId: bnpc };

    function query(attempt) {
      if (!pending[key] || !enabled || !inOccult()) return;
      source.callHandler({ call: 'getCombatants', ids: [numericId] }).then(function (data) {
        var rows = data && data.combatants;
        if (rows && rows.length) Radar.scan(rows);
        if (pending[key] && attempt < 2) setTimeout(function () { query(attempt + 1); }, 250);
      }).catch(function () {});
    }
    query(0);
  }

  function handleEntityEvent(line) {
    var event = String(line[2] || '').toLowerCase();
    var actorId = line[3];
    var key = actorKey(actorId);
    if (event === 'remove') {
      if (!key || (!targets[key] && !pending[key])) return false;
      var changed = !!targets[key];
      delete targets[key];
      delete pending[key];
      suppressed[key] = Date.now() + 15000;
      if (changed) emitChange();
      return true;
    }
    if (event !== 'add') return false;
    var rawNpc = findField(line, 'BNpcID');
    var kind = classify(rawNpc, true);
    if (!kind) return false;
    requestEntity(actorId, kind, npcId(rawNpc, true));
    return true;
  }

  function samePlayer(line) {
    if (!source) return false;
    var idMatches = source.playerId != null && actorKey(line[2]) === actorKey(source.playerId);
    var nameMatches = source.playerName && line[3] === source.playerName;
    return !!(idMatches || nameMatches);
  }

  function isCarrotUse(line, rawLine) {
    var action = String(line[4] || '').replace(/^0x/i, '').toUpperCase();
    var raw = String(rawLine || '');
    return (action === '200BBE0' || raw.toUpperCase().indexOf(':200BBE0:') >= 0) && samePlayer(line);
  }

  function isSelfAcquisition(line, rawLine) {
    var text = String(rawLine || line.join(':')).replace(/\|/g, ':');
    if (!/083E::.*获得了/.test(text)) return false;
    var match = /083E::([^:]*?)获得了/.exec(text);
    var name = match ? String(match[1] || '').trim() : '';
    return !name || !source || !source.playerName || name === source.playerName;
  }

  var Radar = OC.Radar = {
    classifyNpc: classify,

    onChange: function (handler) {
      if (typeof handler === 'function') changeHandlers.push(handler);
      return this;
    },

    onAlert: function (handler) {
      if (typeof handler === 'function') alertHandlers.push(handler);
      return this;
    },

    start: function (overlay) {
      if (started) return this;
      started = true;
      source = overlay;
      enabled = settingEnabled();
      if (!source || !source.on) return this;
      source.on('combatants', function (combatants) { Radar.scan(combatants, true); });
      source.on('position', function (player) { Radar.updatePlayer(player); });
      source.on('log', function (type, line, rawLine) { Radar.handleLog(type, line, rawLine); });
      source.on('zone', function () { Radar.reset(); });
      source.on('disconnected', function () { Radar.reset(); });
      return this;
    },

    setEnabled: function (value) {
      enabled = value !== false;
      if (!enabled) this.reset();
      else emitChange();
      return enabled;
    },

    isActive: function () {
      return enabled && this.targets().length > 0;
    },

    scan: function (combatants, completeSnapshot) {
      enabled = settingEnabled();
      if (!enabled || !inOccult()) return false;
      var found = [];
      var seen = {};
      var changed = false;
      (combatants || []).forEach(function (combatant) {
        var fallback = pending[actorKey(combatant && combatant.ID)];
        var result = addOrUpdate(combatant, fallback);
        if (!result) return;
        seen[result.target.id] = true;
        if (result.fresh) found.push(result.target);
      });
      if (completeSnapshot) {
        Object.keys(targets).forEach(function (key) {
          if (seen[key]) return;
          targets[key].missingScans = Number(targets[key].missingScans || 0) + 1;
          if (targets[key].missingScans < 2) return;
          delete targets[key];
          changed = true;
        });
      }
      if (found.length || Object.keys(targets).length || changed) emitChange();
      found.forEach(emitAlert);
      return found.length > 0;
    },

    updatePlayer: function (player) {
      if (!enabled || !inOccult()) return;
      var list = Object.keys(targets);
      if (!list.length) return;
      list.forEach(function (key) { updateMetrics(targets[key], player); });
      emitChange();
    },

    handleLog: function (type, line, rawLine) {
      if (!enabled || !inOccult()) return false;
      line = line || [];
      if (Number(type) === 105) return handleEntityEvent(line);
      if (Number(type) === 15 && isCarrotUse(line, rawLine)) return this.removeNearest('carrot', 30);
      if (Number(type) === 0 && isSelfAcquisition(line, rawLine)) return this.removeNearest('coffer', 30);
      return false;
    },

    removeNearest: function (group, maxDistance) {
      var player = source && source.playerPos;
      if (!player) return false;
      var best = null;
      Object.keys(mapTargets).forEach(function (key) {
        var target = mapTargets[key];
        var isCoffer = target.kind !== 'carrot';
        if ((group === 'carrot' && isCoffer) || (group === 'coffer' && !isCoffer)) return;
        updateMetrics(target, player);
        if (target.distance <= maxDistance && (!best || target.distance < best.distance)) best = target;
      });
      if (!best) return false;
      delete targets[best.id];
      delete mapTargets[best.id];
      suppressed[best.id] = Date.now() + 15000;
      emitChange();
      return true;
    },

    targets: function () {
      return Object.keys(targets).map(function (key) { return publicTarget(targets[key]); })
        .filter(function (target) { return kindEnabled(target.kind); })
        .sort(function (a, b) {
          if (a.kind === 'carrot' && b.kind !== 'carrot') return 1;
          if (a.kind !== 'carrot' && b.kind === 'carrot') return -1;
          return a.slot - b.slot;
        });
    },

    mapTargets: function () {
      return Object.keys(mapTargets).map(function (key) { return publicTarget(mapTargets[key]); })
        .filter(function (target) { return kindEnabled(target.kind); })
        .sort(function (a, b) {
          if (a.kind === 'carrot' && b.kind !== 'carrot') return 1;
          if (a.kind !== 'carrot' && b.kind === 'carrot') return -1;
          return a.slot - b.slot;
        });
    },

    reset: function () {
      var hadState = Object.keys(targets).length || Object.keys(mapTargets).length || Object.keys(pending).length;
      targets = {};
      mapTargets = {};
      pending = {};
      suppressed = {};
      sequence = 0;
      if (hadState) emitChange();
    },

    bearingForDelta: bearingForDelta
  };
})(typeof window !== 'undefined' ? window : this);
