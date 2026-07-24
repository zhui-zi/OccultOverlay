/* =========================================================================
 * api.js — 与 tracker.xivstats.com 后端（PostgREST）通信
 *
 * 端点：https://infi.ovh/api/OccultTrackerV3
 *   读取：  GET  ?tracker_id=eq.{id}
 *   轮询：  GET  ?tracker_id=eq.{id}&select=last_update   （每秒）
 *   上报：  PATCH ?tracker_id=eq.{id}   body: { <history>: json, last_update }
 *   新建：  POST  body: 默认记录 + password + datacenter
 *
 * 记录字段：
 *   tracker_id, password, tracker_type, datacenter, last_update,
 *   encounter_history(CE 33-48), fate_history(1962-1972), pot_history(1976/1977)
 * 每条 history 是 JSON 字符串，数组元素形如：
 *   { fate_id, spawn_time, death_time, last_seen, respawn_times, killed_fates, killed_ces }
 * ========================================================================= */
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

  // 构造一条空白 history 记录
  function blankEntry(id) {
    return { fate_id: id, spawn_time: -1, death_time: -1, last_seen: -1, respawn_times: [], killed_fates: 0, killed_ces: 0 };
  }

  // 构造新建 tracker 用的默认记录
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
    /** 读取整条 tracker 记录，返回对象或 null */
    fetchTracker: function (id) {
      var url = OC.BACKEND.url + '?tracker_id=eq.' + encodeURIComponent(id);
      return fetch(url, { headers: headers() }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0] : null;
      });
    },

    /** 只取 last_update（用于每秒轮询变化） */
    fetchLastUpdate: function (id) {
      var url = OC.BACKEND.url + '?tracker_id=eq.' + encodeURIComponent(id) + '&select=last_update';
      return fetch(url, { headers: headers() }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (rows) {
        return rows && rows.length ? rows[0].last_update : null;
      });
    },

    /**
     * 上报某个 FATE/CE/罐 的状态。
     * @param id       tracker_id
     * @param record   当前完整记录（含各 history 字符串）
     * @param type     'ce' | 'fate' | 'pot'
     * @param fateId   对应 fate_id / encounter_id
     * @param status   'spawned' | 'dead'
     * @returns Promise<更新后的 history 数组>
     */
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

    /** 拉取若干大区最近活跃的岛屿（含 pot_history），用于总览 */
    fetchDcPots: function (dcList, sinceSec) {
      var now = Math.floor(Date.now() / 1000);
      var url = OC.BACKEND.url +
        '?datacenter=in.(' + dcList.join(',') + ')' +
        '&last_update=gt.' + (now - sinceSec) +
        '&select=tracker_id,datacenter,last_update,pot_history,encounter_history,fate_history';
      return fetch(url, { headers: headers() }).then(function (r) {
        return r.ok ? r.json() : [];
      });
    },

    /** 新建一个 tracker，返回 tracker_id */
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
