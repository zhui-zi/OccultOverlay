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
  var POT_IDS = [1976, 1977, 2072, 2073];

  function isContextFate(id) {
    return (id >= 1962 && id <= 1972) || (id >= 2074 && id <= 2084);
  }

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

  function rotr(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
  }

  // SHA-256 for the 12-byte DR instance context. Keeping this synchronous avoids
  // depending on WebCrypto availability inside older ACT embedded browsers.
  function sha256Hex(bytes) {
    var k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var padded = bytes.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    var bitLength = bytes.length * 8;
    for (var p = 7; p >= 0; p--) padded.push(p < 4 ? (bitLength >>> (p * 8)) & 0xff : 0);

    for (var offset = 0; offset < padded.length; offset += 64) {
      var w = new Array(64);
      var i;
      for (i = 0; i < 16; i++) {
        var j = offset + i * 4;
        w[i] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) | 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3];
      var e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var big1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + big1 + ch + k[i] + w[i]) | 0;
        var big0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (big0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0;
      h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0;
      h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (value) {
      return ('00000000' + (value >>> 0).toString(16)).slice(-8);
    }).join('').toUpperCase();
  }

  function writeLe32(bytes, offset, value) {
    value = Number(value) >>> 0;
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function contextFingerprint(dc, fateId, epoch) {
    var bytes = new Array(12);
    writeLe32(bytes, 0, dc);
    writeLe32(bytes, 4, fateId);
    writeLe32(bytes, 8, epoch);
    return sha256Hex(bytes);
  }

  var Pots = OC.Pots = {
    respawnSec: RESPAWN,

    // Same SHA-256(dcID, fateID, StartTimeEpoch) fingerprint used by OccultPotNotifier.
    contextFingerprint: contextFingerprint,

    contextFingerprints: function (dc, fateId, observedEpoch, radius) {
      dc = number(dc, 0);
      fateId = number(fateId, 0);
      observedEpoch = number(observedEpoch, 0);
      radius = Math.max(0, number(radius, 0));
      if (!dc || !isContextFate(fateId) || !observedEpoch) return [];
      var hashes = [];
      for (var delta = -radius; delta <= radius; delta++) {
        hashes.push(contextFingerprint(dc, fateId, observedEpoch + delta));
      }
      return hashes;
    },

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
     * 返回 [{ id, rowId, fingerprint, dc, lastUpdate, aliveIds:[], activeEvents:[] }]
     */
    islandList: function (rows, now) {
      now = number(now, Math.floor(Date.now() / 1000));
      function alive(entry) {
        var spawn = number(entry && entry.spawn_time, -1);
        var death = number(entry && entry.death_time, -1);
        return spawn > 0 && (death <= 0 || death < spawn);
      }
      var groups = {};
      (rows || []).forEach(function (tracker) {
        var ces = parse(tracker.encounter_history), fates = parse(tracker.fate_history);
        var ids = [], activeEvents = [];
        ces.concat(fates).forEach(function (entry) {
          if (!alive(entry)) return;
          var fateId = number(entry.fate_id, 0);
          var spawnEpoch = number(entry.spawn_time, 0);
          ids.push(fateId);
          activeEvents.push({
            fateId: fateId,
            spawnEpoch: spawnEpoch,
            lastSeen: seenAt(entry)
          });
        });
        var item = {
          id: tracker.tracker_id,
          rowId: number(tracker.id, 0),
          fingerprint: tracker.last_fate || '',
          territory: number(tracker.territory, 0),
          dc: tracker.datacenter,
          lastUpdate: tracker.last_update,
          ago: now - tracker.last_update,
          aliveIds: ids,
          activeEvents: activeEvents,
          ceId: Pots.currentId(ces),
          fateId: Pots.currentId(fates)
        };
        var identity = item.fingerprint ? 'f:' + item.fingerprint : 't:' + item.id;
        var key = item.territory + ':' + item.dc + ':' + identity;
        var current = groups[key];
        if (!current || item.lastUpdate > current.lastUpdate ||
            (item.lastUpdate === current.lastUpdate && item.rowId > current.rowId)) {
          groups[key] = item;
        }
      });
      return Object.keys(groups).map(function (key) { return groups[key]; });
    },

    /**
     * Bind only from a DR fingerprint or an unambiguous local Add timestamp.
     * A plain active FATE id is intentionally insufficient because several
     * islands can run the same FATE at once.
     */
    matchIsland: function (islands, evidence, dc, tolerance) {
      islands = islands || [];
      evidence = evidence || {};
      tolerance = Math.max(0, number(tolerance, 15));
      var scoped = dc ? islands.filter(function (item) {
        return number(item.dc, 0) === number(dc, 0);
      }) : islands.slice();
      var territory = number(evidence.territory, 0);
      if (territory) scoped = scoped.filter(function (item) {
        return number(item.territory, 0) === territory;
      });

      var hashes = evidence.fingerprints || [];
      if (hashes.length) {
        var fingerprintMatches = scoped.filter(function (item) {
          return item.fingerprint && hashes.indexOf(String(item.fingerprint).toUpperCase()) >= 0;
        });
        if (fingerprintMatches.length === 1) return fingerprintMatches[0];
        if (fingerprintMatches.length > 1) return null;
      }

      var signals = evidence.events || [];
      var candidates = scoped.filter(function (item) {
        return signals.some(function (signal) {
          return (item.activeEvents || []).some(function (remote) {
            return number(remote.fateId, 0) === number(signal.fateId, 0) &&
              Math.abs(number(remote.spawnEpoch, 0) - number(signal.spawnEpoch, 0)) <= tolerance;
          });
        });
      });
      return candidates.length === 1 ? candidates[0] : null;
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
          territory: number(tracker.territory, 0),
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
        var key = item.territory + ':' + item.dc + ':' + signature;
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
