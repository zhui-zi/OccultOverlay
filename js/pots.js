/* =========================================================================
 * pots.js — 撒娇罐（マジックポット）状态：完全基于云端数据
 *
 * 下一只出现时间 = 最近一次出现 max(spawn_time) + 1800 秒(30分钟)。
 * 若当前有罐存活则视为“存活”。只读云端 pot_history，不做人工上报/本地推算。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var RESPAWN = 1800;

  function parse(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }

  var Pots = OC.Pots = {
    respawnSec: RESPAWN,

    // 单个 tracker 的撒娇罐状态：{ alive, etaSec, nextEpoch, side } 或 null
    // side：存活时=当前存活的罐方位；否则=下一只（与上一只交替）的方位
    status: function (potArr, now) {
      now = now || Math.floor(Date.now() / 1000);
      var spawned = (potArr || []).filter(function (p) { return p.spawn_time > 0; });
      if (!spawned.length) return null;
      var maxEntry = spawned.reduce(function (m, p) { return p.spawn_time > m.spawn_time ? p : m; });
      var lastSide = (OC.POTS[maxEntry.fate_id] || {}).side;
      var alive = spawned.some(function (p) {
        return (p.death_time <= 0 || p.death_time < p.spawn_time) && (now - p.spawn_time) < RESPAWN;
      });
      var next = maxEntry.spawn_time + RESPAWN;
      var side = alive ? lastSide : (lastSide === 'north' ? 'south' : lastSide === 'south' ? 'north' : null);
      return { alive: alive, nextEpoch: next, etaSec: next - now, side: side };
    },

    // 取“当前/最近”的目标 id：按 last_seen / spawn_time 最大者
    currentId: function (arr) {
      var best = 0, id = null;
      (arr || []).forEach(function (e) {
        var seen = Math.max(e.last_seen || 0, e.spawn_time || 0);
        if (seen > best) { best = seen; id = e.fate_id; }
      });
      return id;
    },

    /**
     * 全部活跃岛列表（不依赖撒娇罐数据），用于识别玩家所在岛。
     * 返回 [{ id, dc, lastUpdate, aliveIds:[], ceId, fateId }]
     */
    islandList: function (rows, now) {
      now = now || Math.floor(Date.now() / 1000);
      function alive(e) { return e && e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time); }
      return (rows || []).map(function (t) {
        var ces = parse(t.encounter_history), fates = parse(t.fate_history);
        var ids = [];
        ces.concat(fates).forEach(function (e) { if (alive(e)) ids.push(e.fate_id); });
        return {
          id: t.tracker_id, dc: t.datacenter, lastUpdate: t.last_update, ago: now - t.last_update,
          aliveIds: ids, ceId: Pots.currentId(ces), fateId: Pots.currentId(fates)
        };
      });
    },

    /**
     * 大区总览：每个岛算“下一只撒娇罐”，去重后按剩余升序（存活置顶）。
     * 去重：同一大区 + 相同(取整到分钟)的罐出现时间视为同一岛，保留最新的。
     */
    dcOverview: function (rows, now) {
      now = now || Math.floor(Date.now() / 1000);
      var items = (rows || []).map(function (t) {
        var st = Pots.status(parse(t.pot_history), now);
        if (!st) return null;
        // 过滤明显失效的岛：非存活且下一只已过期很久（>10 分钟）视为该本已结束
        if (!st.alive && st.etaSec < -600) return null;
        var ces = parse(t.encounter_history), fates = parse(t.fate_history);
        var spawns = parse(t.pot_history).filter(function (p) { return p.spawn_time > 0; })
          .map(function (p) { return p.spawn_time; }).sort(function (a, b) { return a - b; });
        return {
          id: t.tracker_id, dc: t.datacenter, lastUpdate: t.last_update, ago: now - t.last_update,
          alive: st.alive, etaSec: st.etaSec, nextEpoch: st.nextEpoch, side: st.side, spawns: spawns,
          ceId: Pots.currentId(ces), fateId: Pots.currentId(fates)
        };
      }).filter(Boolean);

      var groups = {}, counts = {};
      items.forEach(function (it) {
        var sig = it.dc + ':' + it.spawns.map(function (s) { return Math.round(s / 60); }).join(',');
        it._sig = sig; counts[sig] = (counts[sig] || 0) + 1;
        if (!groups[sig] || it.lastUpdate > groups[sig].lastUpdate) groups[sig] = it;
      });
      var list = Object.keys(groups).map(function (k) { var it = groups[k]; it.sources = counts[k]; return it; });
      list.sort(function (a, b) {
        var ea = a.alive ? -1 : Math.max(0, a.etaSec);
        var eb = b.alive ? -1 : Math.max(0, b.etaSec);
        return ea - eb;
      });
      return list;
    }
  };
})(typeof window !== 'undefined' ? window : this);
