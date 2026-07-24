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
    },

    /**
     * 大区总览：把多个岛屿算出“下一只撒娇罐剩余时间”，去重后按剩余升序。
     * 去重：同一大区 + 相同（四舍五入到分钟）的罐出现时间视为同一个岛，
     * 只保留 last_update 最新的一条，并记录来源数量。
     * @returns [{ id, dc, side, etaSec, nextEpoch, ago, sources }]
     */
    dcOverview: function (rows, now) {
      now = now || Math.floor(Date.now() / 1000);
      var items = (rows || []).map(function (t) {
        var pots = [];
        try { pots = JSON.parse(t.pot_history); } catch (e) { pots = []; }
        var best = null, spawns = [];
        pots.forEach(function (p) {
          var def = OC.POTS[p.fate_id];
          if (!def || p.spawn_time <= 0) return;
          spawns.push(p.spawn_time);
          var next = p.spawn_time + RESPAWN;
          if (!best || next < best.next) best = { side: def.side, next: next };
        });
        if (!best) return null;
        spawns.sort(function (a, b) { return a - b; });
        return {
          id: t.tracker_id, dc: t.datacenter, lastUpdate: t.last_update, ago: now - t.last_update,
          side: best.side, nextEpoch: best.next, etaSec: best.next - now, spawns: spawns
        };
      }).filter(Boolean);

      // 去重
      var groups = {}, counts = {};
      items.forEach(function (it) {
        var sig = it.dc + ':' + it.spawns.map(function (s) { return Math.round(s / 60); }).join(',');
        it._sig = sig;
        counts[sig] = (counts[sig] || 0) + 1;
        if (!groups[sig] || it.lastUpdate > groups[sig].lastUpdate) groups[sig] = it;
      });
      var list = Object.keys(groups).map(function (k) { var it = groups[k]; it.sources = counts[k]; return it; });
      list.sort(function (a, b) { return Math.max(0, a.etaSec) - Math.max(0, b.etaSec); });
      return list;
    }
  };
})(typeof window !== 'undefined' ? window : this);
