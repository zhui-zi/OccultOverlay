/* =========================================================================
 * ce.js — 危命任务（CE）触发 / 冷却 判定
 *
 * 新月岛的 CE 同一时刻通常只有一个在进行。CE 结束后需要冷却一段时间
 * 才会再出现下一个。这里基于共享 tracker 的 spawn_time/death_time：
 *   - 某 CE 正在进行：spawn_time > death_time
 *   - 冷却剩余：max(0, lastDeath + cooldown - now)
 *   - “现在可触发”：当前无进行中的 CE 且冷却已过
 * 冷却值 CE_COOLDOWN 为近似值，可在设置里调整。
 * ========================================================================= */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  function cooldown() {
    var v = OC.Settings && OC.Settings.get('ceCooldownSec');
    return v ? Number(v) : OC.TIMERS.CE_COOLDOWN;
  }

  var CE = OC.CE = {
    /** 单个 CE 条目状态 */
    entryStatus: function (entry, now) {
      now = now || Math.floor(Date.now() / 1000);
      var alive = entry && entry.spawn_time > 0 && entry.spawn_time >= entry.death_time && entry.death_time <= 0;
      // 更稳妥：spawn 之后没有 death，或 death 早于 spawn
      alive = !!(entry && entry.spawn_time > 0 && (entry.death_time <= 0 || entry.death_time < entry.spawn_time));
      var nextAvail = null, cdRemain = 0;
      if (entry && entry.death_time > 0) {
        nextAvail = entry.death_time + cooldown();
        cdRemain = Math.max(0, nextAvail - now);
      }
      return { alive: alive, cooldownRemainSec: cdRemain, nextAvailEpoch: nextAvail };
    },

    /**
     * 全局 CE 状态。
     * @param entries CE history 数组
     * @returns { activeId, activeEntry, canTriggerNow, nextAvailSec, lastDeathEpoch }
     */
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
