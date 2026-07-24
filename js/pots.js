/* =========================================================================
 * pots.js — 撒娇罐（マジックポット）状态：完全基于云端数据，无本地估算
 *
 * 规则（对齐 EurekaTrackerAutoPopper 的 PotDtrBar）：
 *   下一只出现时间 = 该罐上次出现时间 spawn_time + 1800 秒(30分钟)。
 *   1976 = 北(North)，1977 = 南(South)。
 * 只读取共享云端的 pot_history，不做人工上报、不做本地推算。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var RESPAWN = 1800;

  var Pots = OC.Pots = {
    respawnSec: RESPAWN,

    /**
     * 从云端 pot_history 计算展示信息。
     * @returns {
     *   active: {fateId, side} | null,      // 正在进行中的罐
     *   next:   {fateId, side, epoch, etaSec} | null // 下一只（或 null）
     * }
     */
    fromHistory: function (potArr, now) {
      now = now || Math.floor(Date.now() / 1000);
      var active = null, next = null;
      (potArr || []).forEach(function (e) {
        var def = OC.POTS[e.fate_id];
        if (!def) return;
        var alive = e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time);
        if (alive) {
          active = { fateId: e.fate_id, side: def.side };
        }
        if (e.spawn_time > 0) {
          var epoch = e.spawn_time + RESPAWN;
          if (!next || epoch < next.epoch) {
            next = { fateId: e.fate_id, side: def.side, epoch: epoch, etaSec: epoch - now };
          }
        }
      });
      // 若存在正在进行的罐，下一只以另一只为准（可选）；这里保留最近的 next
      return { active: active, next: next };
    }
  };
})(typeof window !== 'undefined' ? window : this);
