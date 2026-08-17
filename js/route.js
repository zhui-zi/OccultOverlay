/* Plans and advances manual coffer patrols from live player coordinates. */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var ARRIVAL_RADIUS = 12;
  // Confirm arrival twice so one noisy position sample cannot skip a point.
  var ARRIVAL_CONFIRM_SAMPLES = 2;
  var DIRECTION_KEYS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  var listeners = [];
  var state = freshState();

  function freshState() {
    return {
      active: false,
      territory: 0,
      order: [],
      index: 0,
      complete: false,
      transition: null,
      arrivalKey: '',
      arrivalSamples: 0
    };
  }

  function definition(territory) {
    return OC.TREASURE_ROUTES && OC.TREASURE_ROUTES[Number(territory)] || null;
  }

  function point(row, index) {
    return {
      x: Number(row[0]),
      y: Number(row[1]),
      z: Number(row[2]),
      mapId: Number(row[3]) || 0,
      nodeId: Number(row[4]) || 0,
      routeNumber: index + 1
    };
  }

  function validPosition(position) {
    return !!position && isFinite(Number(position.x)) && isFinite(Number(position.z));
  }

  function distanceSquared(from, to) {
    var dx = Number(to.x) - Number(from.x);
    var dz = Number(to.z) - Number(from.z);
    var total = dx * dx + dz * dz;
    if (isFinite(Number(from.y)) && isFinite(Number(to.y))) {
      var dy = Number(to.y) - Number(from.y);
      total += dy * dy;
    }
    return total;
  }

  function nearestIndex(points, from) {
    var bestIndex = 0;
    var bestDistance = Infinity;
    points.forEach(function (candidate, index) {
      var distance = distanceSquared(from, candidate);
      if (distance < bestDistance ||
          (distance === bestDistance && candidate.routeNumber < points[bestIndex].routeNumber)) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    return bestIndex;
  }

  function buildOrder(territory, from) {
    var def = definition(territory);
    if (!def || !validPosition(from)) return [];
    var points = def.points.map(point);
    var startIndex = nearestIndex(points, from);
    if (def.mode === 'loop') {
      // Rotate the authored loop to the nearest point without changing its sequence.
      return points.slice(startIndex).concat(points.slice(0, startIndex));
    }

    // Match BOCCHI's greedy Euclidean fallback when vnavmesh costs are unavailable.
    var remaining = points.slice();
    var ordered = [];
    var current = from;
    while (remaining.length) {
      var nextIndex = nearestIndex(remaining, current);
      var next = remaining.splice(nextIndex, 1)[0];
      ordered.push(next);
      current = next;
    }
    return ordered;
  }

  function transitionBetween(territory, from, to) {
    var def = definition(territory);
    if (!def || !def.transitions || !from || !to) return null;
    var authored = def.transitions[String(from.nodeId) + ':' + String(to.nodeId)];
    if (!authored) return null;
    return {
      type: authored.type || 'return',
      aetheryteKey: authored.aetheryte || '',
      fromNodeId: from.nodeId,
      nextNodeId: to.nodeId,
      nextRouteNumber: to.routeNumber,
      nextMapId: to.mapId,
      nextLayerKey: to.mapId === 1244 ? 'subterrane' : 'surface'
    };
  }

  function currentPoint() {
    return !state.complete && !state.transition && state.order[state.index] || null;
  }

  function pointKey(value) {
    if (!value) return '';
    return [value.routeNumber, value.x, value.y, value.z].join(':');
  }

  function resetArrival() {
    state.arrivalKey = '';
    state.arrivalSamples = 0;
  }

  function notify() {
    var snapshot = Route.view(OC.Overlay && OC.Overlay.playerPos);
    listeners.slice().forEach(function (listener) {
      try { listener(snapshot); } catch (error) { console.error('[route] listener', error); }
    });
  }

  function reset(territory, position) {
    territory = Number(territory) || 0;
    state.territory = territory;
    state.order = buildOrder(territory, position);
    state.index = 0;
    state.complete = false;
    state.transition = null;
    resetArrival();
    notify();
    return state.order.length > 0;
  }

  function advance() {
    if (!state.order.length || state.complete) return false;
    if (state.transition) {
      state.transition = null;
      state.index += 1;
      resetArrival();
      notify();
      return true;
    }
    var from = state.order[state.index];
    var to = state.order[state.index + 1];
    var transition = transitionBetween(state.territory, from, to);
    if (transition) {
      state.transition = transition;
      resetArrival();
      notify();
      return true;
    }
    state.index += 1;
    if (state.index >= state.order.length) {
      state.index = state.order.length;
      state.complete = true;
    }
    resetArrival();
    notify();
    return true;
  }

  function retreat() {
    if (!state.order.length) return false;
    if (state.transition) {
      state.transition = null;
    } else if (state.complete) {
      state.complete = false;
      state.index = state.order.length - 1;
    } else if (state.index > 0) {
      state.index -= 1;
    } else {
      return false;
    }
    resetArrival();
    notify();
    return true;
  }

  function bearingForDelta(dx, dz) {
    if (dx * dx + dz * dz < 0.000001) return null;
    // Game-map north is -Z; the UI arrow rotates clockwise from north.
    var degrees = Math.atan2(dx, -dz) * 180 / Math.PI;
    return (degrees + 360) % 360;
  }

  function directionForDelta(dx, dz) {
    if (dx * dx + dz * dz < 0.000001) return '';
    var angle = Math.atan2(dx, -dz);
    var turn = Math.PI * 2;
    angle %= turn;
    if (angle < 0) angle += turn;
    return DIRECTION_KEYS[Math.round(angle / (Math.PI / 4)) % 8];
  }

  var Route = OC.Route = {
    arrivalRadius: ARRIVAL_RADIUS,

    supported: function (territory) {
      return !!definition(territory);
    },

    isActive: function () {
      return !!state.active;
    },

    open: function (territory, position) {
      territory = Number(territory) || 0;
      // Pausing guidance preserves unfinished progress within the same territory.
      var resume = state.territory === territory && state.order.length > 0 && !state.complete;
      state.active = true;
      if (!resume && validPosition(position)) reset(territory, position);
      else {
        state.territory = territory;
        notify();
      }
      return Route.view(position);
    },

    pause: function () {
      if (!state.active) return false;
      state.active = false;
      resetArrival();
      notify();
      return true;
    },

    restartNearest: function (territory, position) {
      state.active = true;
      return reset(territory, position);
    },

    next: advance,
    previous: retreat,

    updatePosition: function (position, territory) {
      territory = Number(territory) || 0;
      if (!state.active || !Route.supported(territory) || !validPosition(position)) return false;
      if (state.territory !== territory || !state.order.length) {
        reset(territory, position);
        return true;
      }
      if (state.transition) return false;

      var target = currentPoint();
      if (!target) return false;
      var distance = Math.sqrt(distanceSquared(position, target));
      var key = pointKey(target);
      if (distance <= ARRIVAL_RADIUS) {
        if (state.arrivalKey !== key) {
          state.arrivalKey = key;
          state.arrivalSamples = 1;
        } else {
          state.arrivalSamples += 1;
        }
        if (state.arrivalSamples >= ARRIVAL_CONFIRM_SAMPLES) return advance();
      } else {
        resetArrival();
      }
      notify();
      return false;
    },

    handleZone: function (territory) {
      territory = Number(territory) || 0;
      if (state.territory === territory) return false;
      state = freshState();
      state.territory = territory;
      notify();
      return true;
    },

    onChange: function (listener) {
      if (typeof listener === 'function') listeners.push(listener);
    },

    view: function (position) {
      var target = currentPoint();
      var transition = state.transition;
      var def = definition(state.territory);
      var ready = validPosition(position) && !!target;
      var dx = ready ? target.x - Number(position.x) : NaN;
      var dz = ready ? target.z - Number(position.z) : NaN;
      var distance = ready ? Math.sqrt(distanceSquared(position, target)) : null;
      return {
        active: state.active,
        supported: Route.supported(state.territory),
        territory: state.territory,
        status: state.complete ? 'complete' : transition ? 'transition' : state.order.length ? (ready ? 'ready' : 'waiting-position') : 'waiting-position',
        complete: state.complete,
        total: state.order.length || Number(definition(state.territory) && definition(state.territory).points.length) || 0,
        visited: Math.min(state.index + (transition ? 1 : 0), state.order.length),
        progress: state.complete ? state.order.length : state.index + (state.order.length ? 1 : 0),
        transition: transition && {
          type: transition.type,
          aetheryteKey: transition.aetheryteKey,
          nextNodeId: transition.nextNodeId,
          nextRouteNumber: transition.nextRouteNumber,
          nextMapId: transition.nextMapId,
          nextLayerKey: transition.nextLayerKey
        },
        target: target && {
          x: target.x,
          y: target.y,
          z: target.z,
          mapId: target.mapId,
          nodeId: target.nodeId,
          routeNumber: target.routeNumber,
          displayNumber: def && def.mode === 'loop' ? target.routeNumber : state.index + 1,
          distance: distance,
          bearing: ready ? bearingForDelta(dx, dz) : null,
          directionKey: ready ? directionForDelta(dx, dz) : '',
          layerKey: target.mapId === 1244 ? 'subterrane' : 'surface'
        }
      };
    },

    mapView: function () {
      if (!state.active || state.complete || state.transition || !state.order.length) return { active: false, points: [] };
      var def = definition(state.territory);
      return {
        active: true,
        territory: state.territory,
        // Limit the preview to keep dense routes readable on the map.
        points: state.order.slice(state.index, state.index + 6).map(function (target, index) {
          return {
            x: target.x,
            y: target.y,
            z: target.z,
            mapId: target.mapId,
            routeNumber: def && def.mode === 'loop' ? target.routeNumber : state.index + index + 1,
            current: index === 0
          };
        })
      };
    },

    _buildOrder: buildOrder,
    _state: function () { return state; }
  };
})(typeof window !== 'undefined' ? window : this);
