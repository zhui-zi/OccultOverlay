/* =========================================================================
 * pots.js — 撒娇罐（マジックポット）状态机
 *
 * 与 OccultPotNotifier 保持一致：
 * - 当前有罐时显示实际存活方位。
 * - 无罐时，以最近一次可靠 spawn_time 为锚点，每 30 分钟推进一轮。
 * - 南北罐按轮次交替；错过若干轮后仍会得到下一次未来时间。
 * - 本地与云端记录按 last_seen 合并，避免较旧上报覆盖新观测。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var RESPAWN = 1800;
  var POT_IDS = [1976, 1977];

  function parse(s) {
    if (Array.isArray(s)) return s;
    try { return JSON.parse(s || '[]'); } catch (e) { return []; }
  }

  function number(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function sideOf(id) {
    return (OC.POTS[number(id, 0)] || {}).side || null;
  }

  function otherSide(side) {
    return side === 'north' ? 'south' : side === 'south' ? 'north' : null;
  }

  function seenAt(entry) {
    return Math.max(number(entry && entry.last_seen, -1), number(entry && entry.spawn_time, -1));
  }

  function spawnedEntries(arr) {
    return parse(arr).filter(function (entry) {
      return POT_IDS.indexOf(number(entry && entry.fate_id, 0)) >= 0 &&
        number(entry && entry.spawn_time, -1) > 0;
    });
  }

  function latestSpawn(arr) {
    var latest = null;
    spawnedEntries(arr).forEach(function (entry) {
      if (!latest ||
          number(entry.spawn_time, -1) > number(latest.spawn_time, -1) ||
          (number(entry.spawn_time, -1) === number(latest.spawn_time, -1) &&
            seenAt(entry) > seenAt(latest))) {
        latest = entry;
      }
    });
    return latest;
  }

  function isOpen(entry, now) {
    var spawn = number(entry && entry.spawn_time, -1);
    var death = number(entry && entry.death_time, -1);
    if (spawn <= 0 || (death > 0 && death >= spawn)) return false;

    // 云端结束包可能丢失。一个仍标记存活、但已超过完整刷新周期的记录
    // 不能继续压住后续预测。
    return now - spawn < RESPAWN;
  }

  function latestAlive(arr, now) {
    var alive = null;
    spawnedEntries(arr).forEach(function (entry) {
      if (!isOpen(entry, now)) return;
      if (!alive || seenAt(entry) > seenAt(alive)) alive = entry;
    });
    return alive;
  }

  function prediction(anchor, now) {
    if (!anchor) return null;
    var spawn = number(anchor.spawn_time, -1);
    if (spawn <= 0) return null;

    // 与 OccultPotNotifier.UpdatePrediction 相同。当前轮存活由调用方先处理；
    // 这里只找严格位于“现在”之后的下一轮。
    var cycles = now < spawn ? 0 : Math.floor((now - spawn) / RESPAWN) + 1;
    var nextEpoch = spawn + cycles * RESPAWN;
    var anchorSide = sideOf(anchor.fate_id);
    var side = cycles % 2 === 0 ? anchorSide : otherSide(anchorSide);
    return {
      alive: false,
      nextEpoch: nextEpoch,
      etaSec: nextEpoch - now,
      side: side,
      anchorEpoch: spawn,
      anchorId: number(anchor.fate_id, 0),
      cycles: cycles
    };
  }

  function copyEntry(entry) {
    var out = {};
    for (var key in entry) out[key] = entry[key];
    return out;
  }

  var Pots = OC.Pots = {
    respawnSec: RESPAWN,

    /**
     * 计算一组 pot_history 的当前状态。
     * 返回 { alive, etaSec, nextEpoch, side, anchorEpoch, anchorId, cycles } 或 null。
     */
    status: function (potArr, now) {
      now = number(now, Math.floor(Date.now() / 1000));
      var arr = spawnedEntries(potArr);
      if (!arr.length) return null;

      var alive = latestAlive(arr, now);
      if (alive) {
        var spawn = number(alive.spawn_time, -1);
        return {
          alive: true,
          nextEpoch: spawn + RESPAWN,
          etaSec: spawn + RESPAWN - now,
          side: sideOf(alive.fate_id),
          anchorEpoch: spawn,
          anchorId: number(alive.fate_id, 0),
          cycles: 0
        };
      }

      return prediction(latestSpawn(arr), now);
    },

    /**
     * 按参考模块的规则合并云端与本地 pot_history。
     * 同一 fate_id 保留 last_seen 更新的记录；相同时优先补全 death_time。
     */
    merge: function (shared, local) {
      var byId = {};
      parse(shared).concat(parse(local)).forEach(function (entry) {
        var id = number(entry && entry.fate_id, 0);
        if (POT_IDS.indexOf(id) < 0) return;
        var current = byId[id];
        var incomingSeen = seenAt(entry);
        var currentSeen = seenAt(current);
        var incomingDeath = number(entry.death_time, -1);
        var currentDeath = number(current && current.death_time, -1);
        if (!current || incomingSeen > currentSeen ||
            (incomingSeen === currentSeen && incomingDeath > currentDeath)) {
          byId[id] = copyEntry(entry);
        }
      });
      return POT_IDS.map(function (id) { return byId[id]; }).filter(Boolean);
    },

    // 取“当前/最近”的目标 id：按 last_seen / spawn_time 最大者
    currentId: function (arr) {
      var best = 0, id = null;
      (arr || []).forEach(function (entry) {
        var seen = seenAt(entry);
        if (seen > best) { best = seen; id = entry.fate_id; }
      });
      return id;
    },

    /**
     * 全部活跃岛列表（不依赖撒娇罐数据），用于识别玩家所在岛。
     * 返回 [{ id, dc, lastUpdate, aliveIds:[], ceId, fateId }]
     */
    islandList: function (rows, now) {
      now = number(now, Math.floor(Date.now() / 1000));
      function alive(entry) {
        return entry && entry.spawn_time > 0 &&
          (entry.death_time <= 0 || entry.death_time < entry.spawn_time);
      }
      var groups = {};
      (rows || []).forEach(function (tracker) {
        var ces = parse(tracker.encounter_history), fates = parse(tracker.fate_history);
        var ids = [];
        ces.concat(fates).forEach(function (entry) {
          if (alive(entry)) ids.push(entry.fate_id);
        });
        var item = {
          id: tracker.tracker_id,
          rowId: number(tracker.id, 0),
          fingerprint: tracker.last_fate || '',
          dc: tracker.datacenter,
          lastUpdate: tracker.last_update,
          ago: now - tracker.last_update,
          aliveIds: ids,
          ceId: Pots.currentId(ces),
          fateId: Pots.currentId(fates)
        };
        var identity = item.fingerprint ? 'f:' + item.fingerprint : 't:' + item.id;
        var key = item.dc + ':' + identity;
        var current = groups[key];
        if (!current || item.lastUpdate > current.lastUpdate ||
            (item.lastUpdate === current.lastUpdate && item.rowId > current.rowId)) {
          groups[key] = item;
        }
      });
      return Object.keys(groups).map(function (key) { return groups[key]; });
    },

    /**
     * 大区总览。重复记录优先按参考模块的 last_fate 指纹归并，
     * 旧记录没有指纹时才退回罐刷新序列签名。
     */
    dcOverview: function (rows, now) {
      now = number(now, Math.floor(Date.now() / 1000));
      var items = (rows || []).map(function (tracker) {
        var potHistory = parse(tracker.pot_history);
        var status = Pots.status(potHistory, now);
        if (!status) return null;
        var ces = parse(tracker.encounter_history), fates = parse(tracker.fate_history);
        var spawns = spawnedEntries(potHistory).map(function (entry) {
          return number(entry.spawn_time, -1);
        }).sort(function (a, b) { return a - b; });
        return {
          id: tracker.tracker_id,
          rowId: number(tracker.id, 0),
          fingerprint: tracker.last_fate || '',
          dc: tracker.datacenter,
          lastUpdate: tracker.last_update,
          ago: now - tracker.last_update,
          alive: status.alive,
          etaSec: status.etaSec,
          nextEpoch: status.nextEpoch,
          side: status.side,
          anchorEpoch: status.anchorEpoch,
          spawns: spawns,
          potHistory: potHistory,
          ceId: Pots.currentId(ces),
          fateId: Pots.currentId(fates)
        };
      }).filter(Boolean);

      var groups = {}, counts = {};
      items.forEach(function (item) {
        var fallback = item.spawns.map(function (spawn) {
          return Math.round(spawn / 60);
        }).join(',');
        var signature = item.fingerprint ? 'f:' + item.fingerprint : 'p:' + fallback;
        var key = item.dc + ':' + signature;
        counts[key] = (counts[key] || 0) + 1;
        var current = groups[key];
        if (!current || item.lastUpdate > current.lastUpdate ||
            (item.lastUpdate === current.lastUpdate && item.rowId > current.rowId)) {
          groups[key] = item;
        }
      });

      var list = Object.keys(groups).map(function (key) {
        var item = groups[key];
        item.sources = counts[key];
        return item;
      });
      list.sort(function (a, b) {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (a.etaSec !== b.etaSec) return a.etaSec - b.etaSec;
        return b.lastUpdate - a.lastUpdate;
      });
      return list;
    }
  };
})(typeof window !== 'undefined' ? window : this);
