/* PostgREST client for the shared OccultTrackerV3 backend. */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  function headers(extra) {
    var h = {
      apikey: OC.BACKEND.anonKey,
      Authorization: 'Bearer ' + OC.BACKEND.anonKey
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function blankEntry(id) {
    return { fate_id: id, spawn_time: -1, death_time: -1, last_seen: -1, respawn_times: [], killed_fates: 0, killed_ces: 0, state: 0 };
  }

  function defaultRecord(password, datacenter) {
    var enc = Object.keys(OC.CES).map(function (k) { return blankEntry(Number(k)); });
    var fat = Object.keys(OC.FATES).map(function (k) { return blankEntry(Number(k)); });
    var pot = Object.keys(OC.POTS).map(function (k) { return blankEntry(Number(k)); });
    return {
      password: password || '',
      tracker_type: 2,
      datacenter: datacenter || 0,
      last_fate: '',
      encounter_history: JSON.stringify(enc),
      fate_history: JSON.stringify(fat),
      pot_history: JSON.stringify(pot)
    };
  }

  var Api = OC.Api = {
    fetchTracker: function (id) {
      var url = OC.BACKEND.url + '?tracker_id=eq.' + encodeURIComponent(id) +
        '&order=last_update.desc,id.desc&limit=1';
      return fetch(url, { headers: headers(), cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0] : null;
      });
    },

    /** 按数据库主键读取已确认的实例，避免同 tracker_id 的旧/重复行串岛。 */
    fetchTrackerRow: function (rowId) {
      var url = OC.BACKEND.url + '?id=eq.' + encodeURIComponent(rowId) + '&limit=1';
      return fetch(url, { headers: headers(), cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0] : null;
      });
    },

    fetchLastUpdate: function (id) {
      var url = OC.BACKEND.url + '?tracker_id=eq.' + encodeURIComponent(id) +
        '&select=last_update&order=last_update.desc,id.desc&limit=1';
      return fetch(url, { headers: headers(), cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0].last_update : null;
      });
    },

    report: function (id, record, type, fateId, status) {
      var field = type === 'ce' ? 'encounter_history' : type === 'fate' ? 'fate_history' : 'pot_history';
      var arr;
      try { arr = JSON.parse(record[field] || '[]'); } catch (e) { arr = []; }
      var entry = arr.filter(function (e) { return e.fate_id === fateId; })[0];
      if (!entry) { entry = blankEntry(fateId); arr.push(entry); }

      var now = Math.floor(Date.now() / 1000);
      if (status === 'spawned') {
        entry.spawn_time = now;
        entry.death_time = -1;
        entry.last_seen = now;
      } else if (status === 'dead') {
        entry.death_time = now;
        entry.last_seen = now;
        if (type === 'ce') entry.killed_ces = (entry.killed_ces || 0) + 1;
        else entry.killed_fates = (entry.killed_fates || 0) + 1;
      }

      var body = {};
      body[field] = JSON.stringify(arr);
      body.last_update = now;

      var url = OC.BACKEND.url + '?tracker_id=eq.' + encodeURIComponent(id);
      return fetch(url, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) throw new Error('上报失败 HTTP ' + r.status);
        return arr;
      });
    },

    fetchDcPots: function (dcList, sinceSec, territory) {
      var now = Math.floor(Date.now() / 1000);
      var url = OC.BACKEND.url +
        '?datacenter=in.(' + dcList.join(',') + ')' +
        '&last_update=gt.' + (now - sinceSec) +
        (territory ? '&territory=eq.' + encodeURIComponent(territory) : '') +
        '&select=id,tracker_id,territory,datacenter,last_fate,last_update,pot_history,encounter_history,fate_history';
      return fetch(url, { headers: headers(), cache: 'no-store' }).then(function (r) {
        return r.ok ? r.json() : [];
      });
    },

    /** 按 DR 实例指纹直接查询本岛，避免先下载整个大区的活跃记录。 */
    fetchIslandByFingerprints: function (fingerprints, territory, datacenter) {
      fingerprints = (fingerprints || []).filter(function (value, index, all) {
        return /^[0-9A-F]{64}$/i.test(String(value)) && all.indexOf(value) === index;
      });
      if (!fingerprints.length || !territory || !datacenter) return Promise.resolve([]);
      var url = OC.BACKEND.url +
        '?last_fate=in.(' + fingerprints.map(encodeURIComponent).join(',') + ')' +
        '&territory=eq.' + encodeURIComponent(territory) +
        '&datacenter=eq.' + encodeURIComponent(datacenter) +
        '&select=id,tracker_id,territory,datacenter,last_fate,last_update,pot_history,encounter_history,fate_history' +
        '&order=last_update.desc,id.desc';
      return fetch(url, { headers: headers(), cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    },

    createIslandTracker: function (record) {
      return fetch(OC.BACKEND.url, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(record)
      }).then(function (r) {
        if (!r.ok) throw new Error('新建实例失败 HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0] : null;
      });
    },

    /** 只更新已经严格绑定的数据库主键，避免 tracker_id 重复记录串岛。 */
    updateIslandTracker: function (rowId, record) {
      var url = OC.BACKEND.url + '?id=eq.' + encodeURIComponent(rowId);
      return fetch(url, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(record)
      }).then(function (r) {
        if (!r.ok) throw new Error('更新实例失败 HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0] : null;
      });
    },

    create: function (password, datacenter) {
      var rec = defaultRecord(password, datacenter);
      return fetch(OC.BACKEND.url, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(rec)
      }).then(function (r) {
        if (!r.ok) throw new Error('新建失败 HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0].tracker_id : null;
      });
    },

    blankEntry: blankEntry,
    defaultRecord: defaultRecord
  };
})(typeof window !== 'undefined' ? window : this);
