/* CE state and cooldown calculations from shared tracker history. */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  function cooldown() {
    var v = OC.Settings && OC.Settings.get('ceCooldownSec');
    return v ? Number(v) : OC.TIMERS.CE_COOLDOWN;
  }

  var CE = OC.CE = {
    entryStatus: function (entry, now) {
      now = now || Math.floor(Date.now() / 1000);
      var alive = entry && entry.spawn_time > 0 && entry.spawn_time >= entry.death_time && entry.death_time <= 0;
      alive = !!(entry && entry.spawn_time > 0 && (entry.death_time <= 0 || entry.death_time < entry.spawn_time));
      var nextAvail = null, cdRemain = 0;
      if (entry && entry.death_time > 0) {
        nextAvail = entry.death_time + cooldown();
        cdRemain = Math.max(0, nextAvail - now);
      }
      return { alive: alive, cooldownRemainSec: cdRemain, nextAvailEpoch: nextAvail };
    },

    globalState: function (entries, now) {
      now = now || Math.floor(Date.now() / 1000);
      var activeId = null, activeEntry = null, lastDeath = 0;
      (entries || []).forEach(function (e) {
        var st = CE.entryStatus(e, now);
        if (st.alive) { activeId = e.fate_id; activeEntry = e; }
        if (e.death_time > lastDeath) lastDeath = e.death_time;
      });
      var canTrigger = !activeId && (lastDeath === 0 || now >= lastDeath + cooldown());
      var nextAvailSec = activeId ? null
        : (lastDeath === 0 ? 0 : Math.max(0, lastDeath + cooldown() - now));
      return {
        activeId: activeId,
        activeEntry: activeEntry,
        canTriggerNow: canTrigger,
        nextAvailSec: nextAvailSec,
        lastDeathEpoch: lastDeath || null
      };
    },

    cooldownSec: cooldown
  };
})(typeof window !== 'undefined' ? window : this);
