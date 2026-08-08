/* Magic-pot state machine aligned with OccultPotNotifier. */
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

    // The cloud may miss an end packet. A record still marked alive after a full
    // refresh cycle must not suppress later predictions.
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
    if (spawn <= 0 || now < spawn) return null;

    // Predict only the next cycle after an observed anchor. Once its ETA passes,
    // wait for a new Add anchor instead of extrapolating old data indefinitely.
    var nextEpoch = spawn + RESPAWN;
    if (now >= nextEpoch) return null;
    var anchorSide = sideOf(anchor.fate_id);
    return {
      alive: false,
      nextEpoch: nextEpoch,
      etaSec: nextEpoch - now,
      side: otherSide(anchorSide),
      anchorEpoch: spawn,
      anchorId: number(anchor.fate_id, 0),
      cycles: 1
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

  function sortedIds(values) {
    var seen = {};
    return (values || []).map(function (value) { return number(value, 0); })
      .filter(function (value) {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      }).sort(function (a, b) { return a - b; });
  }

  function sameIds(left, right) {
    left = sortedIds(left);
    right = sortedIds(right);
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function fingerprintMatchesWindow(item, fateIds, now, lookbackSec) {
    if (item.fingerprintValid) return true;
    var target = String(item.fingerprint || '').toUpperCase();
    var dc = number(item.dc, 0);
    if (!/^[0-9A-F]{64}$/.test(target) || !dc) return false;
    fateIds = sortedIds(fateIds).filter(isContextFate);
    if (!fateIds.length) return false;
    now = number(now, Math.floor(Date.now() / 1000));
    lookbackSec = Math.max(0, number(lookbackSec, 3600));
    for (var i = 0; i < fateIds.length; i++) {
      for (var epoch = now + 15; epoch >= now - lookbackSec; epoch--) {
        if (contextFingerprint(dc, fateIds[i], epoch) !== target) continue;
        item.fingerprintValid = true;
        item.fingerprintFateId = fateIds[i];
        item.fingerprintSpawnEpoch = epoch;
        return true;
      }
    }
    return false;
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
     * Calculate the current state from a pot_history set.
     * Return only a live state or the next cycle anchored by the latest observed spawn;
     * return null for an expired anchor.
     * Returns { alive, etaSec, nextEpoch, side, anchorEpoch, anchorId, cycles } or null.
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
     * Merge cloud and local pot_history using the reference module's rules.
     * For each fate_id, keep the newer last_seen record and prefer a populated
     * death_time when timestamps match.
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

    // Select the current or latest target by the greatest last_seen/spawn_time.
    currentId: function (arr) {
      var best = 0, id = null;
      (arr || []).forEach(function (entry) {
        var seen = seenAt(entry);
        if (seen > best) { best = seen; id = entry.fate_id; }
      });
      return id;
    },

    /**
     * List all active islands independently of Magic Pot data to identify the player's island.
     * Returns [{ id, rowId, fingerprint, dc, lastUpdate, aliveIds:[], activeEvents:[] }].
     */
    islandList: function (rows, now) {
      now = number(now, Math.floor(Date.now() / 1000));
      var groups = {};
      (rows || []).forEach(function (tracker) {
        var lastUpdate = number(tracker.last_update, 0);
        function alive(entry) {
          return OC.historyAlive(entry, lastUpdate, now);
        }
        var ces = parse(tracker.encounter_history);
        var fates = parse(tracker.fate_history);
        var pots = parse(tracker.pot_history);
        var ids = [], activeEvents = [], cePhases = [];
        ces.forEach(function (entry) {
          var fateId = number(entry && entry.fate_id, 0);
          var status = number(entry && (entry.state != null ? entry.state : entry.status), 0);
          var popTime = number(entry && entry.pop_time, 0);
          if (fateId && status > 0 && popTime >= 1000000000 && alive(entry)) {
            cePhases.push({ fateId: fateId, status: status, popTime: popTime });
          }
        });
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
        var activeDirectorIds = [];
        fates.concat(pots).forEach(function (entry) {
          var fateId = number(entry.fate_id, 0);
          var entryAlive = POT_IDS.indexOf(fateId) >= 0 ? isOpen(entry, now) : alive(entry);
          if (entryAlive) activeDirectorIds.push(fateId);
        });
        var endEvents = [];
        fates.concat(pots).forEach(function (entry) {
          var deathEpoch = number(entry && entry.death_time, -1);
          if (deathEpoch <= 0) return;
          endEvents.push({
            fateId: number(entry.fate_id, 0),
            deathEpoch: deathEpoch
          });
        });
        var fingerprint = tracker.last_fate || '';
        var fingerprintValid = !!fingerprint && fates.some(function (entry) {
          var fateId = number(entry && entry.fate_id, 0);
          var spawnEpoch = number(entry && entry.spawn_time, 0);
          return isContextFate(fateId) && spawnEpoch > 0 &&
            contextFingerprint(number(tracker.datacenter, 0), fateId, spawnEpoch) ===
              String(fingerprint).toUpperCase();
        });
        var item = {
          id: tracker.tracker_id,
          rowId: number(tracker.id, 0),
          fingerprint: fingerprint,
          fingerprintValid: fingerprintValid,
          territory: number(tracker.territory, 0),
          dc: tracker.datacenter,
          lastUpdate: lastUpdate,
          ago: now - lastUpdate,
          aliveIds: ids,
          activeEvents: activeEvents,
          cePhases: cePhases,
          activeDirectorIds: sortedIds(activeDirectorIds),
          endEvents: endEvents,
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

      // A CE popTime is the server-provided deadline for its current status,
      // so the tuple remains precise even when received immediately on entry.
      var ceSignals = evidence.cePhases || [];
      if (ceSignals.length) {
        var bestCeScore = 0;
        var ceMatches = [];
        scoped.forEach(function (item) {
          var score = ceSignals.filter(function (signal) {
            return (item.cePhases || []).some(function (remote) {
              return number(remote.fateId, 0) === number(signal.fateId, 0) &&
                number(remote.status, 0) === number(signal.status, 0) &&
                number(remote.popTime, 0) === number(signal.popTime, 0);
            });
          }).length;
          if (!score || score < bestCeScore) return;
          if (score > bestCeScore) {
            bestCeScore = score;
            ceMatches = [];
          }
          ceMatches.push(item);
        });
        if (ceMatches.length === 1) return ceMatches[0];
      }

      var hashes = evidence.fingerprints || [];
      if (hashes.length) {
        var exact = String(evidence.fingerprint || '').toUpperCase();
        if (exact) {
          var exactMatches = scoped.filter(function (item) {
            return String(item.fingerprint || '').toUpperCase() === exact;
          });
          if (exactMatches.length === 1) return exactMatches[0];
          if (exactMatches.length > 1) return null;
        }
        var fingerprintMatches = scoped.filter(function (item) {
          return item.fingerprint && hashes.indexOf(String(item.fingerprint).toUpperCase()) >= 0;
        });
        if (fingerprintMatches.length === 1) return fingerprintMatches[0];
        if (fingerprintMatches.length > 1) return null;
      }

      var ends = evidence.ends || [];
      if (ends.length) {
        var bestEndScore = 0;
        var endMatches = [];
        scoped.forEach(function (item) {
          var score = ends.filter(function (signal) {
            return (item.endEvents || []).some(function (remote) {
              return number(remote.fateId, 0) === number(signal.fateId, 0) &&
                Math.abs(number(remote.deathEpoch, 0) - number(signal.deathEpoch, 0)) <= tolerance;
            });
          }).length;
          if (!score || score < bestEndScore) return;
          if (score > bestEndScore) {
            bestEndScore = score;
            endMatches = [];
          }
          endMatches.push(item);
        });
        if (endMatches.length === 1) return endMatches[0];
        if (endMatches.length > 1) return null;
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
     * Fast read-only candidate used during OverlayPlugin's initial FATE replay.
     * Require a self-consistent tracker fingerprint and an exact match of the
     * active 258-director FATE/pot set. This candidate is never used for writes.
     */
    matchSnapshotIsland: function (islands, activeIds, dc, territory, timestamp) {
      activeIds = sortedIds(activeIds);
      if (!activeIds.length) return null;
      var stateMatches = (islands || []).filter(function (item) {
        return (!dc || number(item.dc, 0) === number(dc, 0)) &&
          (!territory || number(item.territory, 0) === number(territory, 0)) &&
          sameIds(item.activeDirectorIds, activeIds);
      });
      if (stateMatches.length !== 1) return null;
      var matches = stateMatches.filter(function (item) {
        return fingerprintMatchesWindow(item, activeIds, timestamp, 3600);
      });
      return matches.length === 1 ? matches[0] : null;
    },

    /**
     * Region overview. Merge duplicate records by the reference module's last_fate
     * fingerprint, falling back to the Pot spawn-sequence signature for legacy rows.
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
