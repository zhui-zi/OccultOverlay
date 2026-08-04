(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};
  var FRESHNESS_SEC = 120;

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  /**
   * Shared tracker entries can contain a previous death timestamp that is
   * earlier than the current server spawn timestamp. Treat that as active only
   * while the entry was observed alongside the tracker's latest upload.
   */
  OC.historyAlive = function (entry, recordLastUpdate, observedNow) {
    if (!entry) return false;

    var state = number(entry.state, 0);
    var spawn = number(entry.spawn_time, -1);
    var death = number(entry.death_time, -1);
    var candidate = state > 0 || (spawn > 0 && (death <= 0 || death < spawn));
    if (!candidate) return false;

    var lastSeen = number(entry.last_seen, -1);
    var reference = number(recordLastUpdate, 0);
    if (reference <= 0) reference = number(observedNow, Math.floor(Date.now() / 1000));

    return lastSeen > 0 && Math.abs(reference - lastSeen) <= FRESHNESS_SEC;
  };

  OC.HISTORY_FRESHNESS_SEC = FRESHNESS_SEC;
})(typeof window !== 'undefined' ? window : this);
