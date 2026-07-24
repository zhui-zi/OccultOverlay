/* =========================================================================
 * overlay.js — 与 ACT / OverlayPlugin 的连接层
 *
 * 支持两种接入：
 *   1) 现代 ngld/OverlayPlugin WebSocket（?OVERLAY_WS=ws://127.0.0.1:10501/ws）
 *   2) 旧版 window.OverlayPluginApi（IINACT / 内置浏览器）
 * 若都不可用，进入“独立/演示”模式，界面照常可用（手动上报）。
 *
 * 对外事件（OC.Overlay.on(name, cb)）：
 *   'connected'   () 已连接游戏
 *   'disconnected'() 断开
 *   'zone'        (territoryId:Number, zoneName:String, inOccult:Boolean)
 *   'log'         (type:Number, parts:Array, raw:String)  每条日志行
 *   'ce'          ({encounterId, status:'spawned'|'dead', name}) 侦测到 CE
 *   'fate'        ({fateId, status, name}) 侦测到 FATE
 * ========================================================================= */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  // 新月岛（南方海域 / South Horn）区域判定。
  // 官方 territoryId 若与默认不符，可在设置里覆盖；同时用区域名兜底匹配。
  var OCCULT_TERRITORY_IDS = [1252, 1253, 1254]; // South Horn 及相关分区（可扩展）
  var OCCULT_NAME_RE = /occult|crescent|south horn|新月|隠世|クレセント|południ|kreszent/i;

  function EventBus() { this._h = {}; }
  EventBus.prototype.on = function (name, cb) {
    (this._h[name] = this._h[name] || []).push(cb);
    return this;
  };
  EventBus.prototype.emit = function (name) {
    var args = Array.prototype.slice.call(arguments, 1);
    (this._h[name] || []).forEach(function (cb) {
      try { cb.apply(null, args); } catch (e) { console.error('[overlay] handler', name, e); }
    });
  };

  var Overlay = OC.Overlay = new EventBus();
  Overlay.connected = false;
  Overlay.territoryId = null;
  Overlay.zoneName = '';
  Overlay.inOccult = false;
  Overlay.playerName = '';
  Overlay.playerPos = null; // {x, y} 若数据源提供，否则 null

  // ---- 事件订阅列表 -----------------------------------------------------
  var SUBSCRIBE = ['ChangeZone', 'ChangePrimaryPlayer', 'LogLine'];

  // ---- 现代 WebSocket 接入 ----------------------------------------------
  var ws = null;
  var wsUrl = null;
  var reconnectTimer = null;

  function getWsUrl() {
    var m = /[?&]OVERLAY_WS=([^&]+)/.exec(location.search);
    if (m) return decodeURIComponent(m[1]);
    if (OC.Settings && OC.Settings.get('wsUrl')) return OC.Settings.get('wsUrl');
    return 'ws://127.0.0.1:10501/ws';
  }

  function connectWs() {
    wsUrl = getWsUrl();
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws.addEventListener('open', function () {
      SUBSCRIBE.forEach(function (ev) {
        ws.send(JSON.stringify({ call: 'subscribe', events: [ev] }));
      });
      Overlay.connected = true;
      Overlay.emit('connected');
    });
    ws.addEventListener('message', function (msg) {
      var d;
      try { d = JSON.parse(msg.data); } catch (e) { return; }
      handleMessage(d);
    });
    ws.addEventListener('close', function () {
      Overlay.connected = false;
      Overlay.emit('disconnected');
      scheduleReconnect();
    });
    ws.addEventListener('error', function () { try { ws.close(); } catch (e) {} });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connectWs();
    }, 5000);
  }

  // ---- 旧版 OverlayPluginApi 接入（IINACT / 内置浏览器） ----------------
  function connectLegacy() {
    // 旧版通过全局回调派发事件
    document.addEventListener('onOverlayDataUpdate', function () {});
    if (global.OverlayPluginApi && global.OverlayPluginApi.ready) {
      SUBSCRIBE.forEach(function (ev) {
        global.OverlayPluginApi.callHandler(
          JSON.stringify({ call: 'subscribe', events: [ev] }), function () {}
        );
      });
    }
    // 事件派发：OverlayPlugin 会调用 document.dispatchOverlayEvent
    global.__OverlayCallback = handleMessage;
    document.addEventListener('onOverlayStateUpdate', function () {});
    Overlay.connected = true;
    Overlay.emit('connected');
  }

  // OverlayPlugin 通用回调（common.js 兼容）
  global.dispatchOverlayEvent = function (msg) { handleMessage(msg); };
  document.addEventListener('onOverlayDataUpdate', function (e) {
    if (e && e.detail) handleMessage(e.detail);
  });

  // ---- 消息分发 ---------------------------------------------------------
  function handleMessage(d) {
    if (!d || !d.type) return;
    switch (d.type) {
      case 'ChangeZone':
        setZone(d.zoneID != null ? d.zoneID : d.zoneId, d.zoneName);
        break;
      case 'ChangePrimaryPlayer':
        Overlay.playerName = d.charName || d.name || '';
        break;
      case 'LogLine':
        handleLogLine(d);
        break;
    }
  }

  function setZone(id, name) {
    Overlay.territoryId = id != null ? Number(id) : null;
    Overlay.zoneName = name || '';
    var byId = OC.Settings && OC.Settings.get('occultTerritoryId')
      ? Overlay.territoryId === Number(OC.Settings.get('occultTerritoryId'))
      : OCCULT_TERRITORY_IDS.indexOf(Overlay.territoryId) >= 0;
    var byName = OCCULT_NAME_RE.test(Overlay.zoneName);
    Overlay.inOccult = !!(byId || byName);
    Overlay.emit('zone', Overlay.territoryId, Overlay.zoneName, Overlay.inOccult);
  }

  // ---- 日志行解析（尽力侦测 CE/FATE） ----------------------------------
  // OverlayPlugin LogLine：d.line = [typeHex, ts, ...parts]，d.rawLine 原文
  function handleLogLine(d) {
    var line = d.line || [];
    var type = parseInt(line[0], 10);
    Overlay.emit('log', type, line, d.rawLine || '');

    // 01 = ChangeZone（部分环境只发 LogLine 不发 ChangeZone 事件）
    if (type === 1) {
      setZone(parseInt(line[2], 16), line[3]);
      return;
    }

    // 系统消息 / 战斗日志：尝试从文本匹配 CE/FATE 名称触发通知。
    // ACT 环境无法稳定拿到内存态 FATE 列表，这里做“文本兜底”，
    // 主上报仍以数据面板按钮 + 共享 tracker 数据为准。
    if (type === 0 || type === 257 /* 0x101 */ || type === 561) {
      var text = line[line.length - 1] || '';
      detectFromText(text);
    }
  }

  var _matchIndex = null;
  function buildMatchIndex() {
    _matchIndex = [];
    function add(kind, id, nameObj) {
      ['zh', 'en', 'ja'].forEach(function (lang) {
        var n = nameObj[lang];
        if (!n) return;
        // 取「」内怪名或整名
        var core = (/[「『](.+?)[」』]/.exec(n) || [null, n])[1];
        if (core && core.length >= 2) _matchIndex.push({ kind: kind, id: id, needle: core });
      });
    }
    Object.keys(OC.CES).forEach(function (k) { add('ce', Number(k), OC.CES[k].name); });
    Object.keys(OC.FATES).forEach(function (k) { add('fate', Number(k), OC.FATES[k].name); });
    Object.keys(OC.POTS).forEach(function (k) { add('pot', Number(k), OC.POTS[k].name); });
  }

  function detectFromText(text) {
    if (!text) return;
    if (!_matchIndex) buildMatchIndex();
    for (var i = 0; i < _matchIndex.length; i++) {
      var m = _matchIndex[i];
      if (text.indexOf(m.needle) >= 0) {
        Overlay.emit(m.kind === 'ce' ? 'ce' : 'fate', {
          encounterId: m.id, fateId: m.id, status: 'spawned',
          name: m.kind === 'ce' ? OC.CES[m.id].name : (OC.POTS[m.id] || OC.FATES[m.id]).name
        });
        return; // 每行只匹配一次
      }
    }
  }

  // ---- 启动 -------------------------------------------------------------
  Overlay.start = function () {
    if (global.OverlayPluginApi) {
      connectLegacy();
      // 同时尝试 WS（部分 IINACT 也开放 ws 端口）
    }
    connectWs();
  };

  // 手动设置区域（演示 / 调试用）
  Overlay.setZoneManual = setZone;

  Overlay.isConnected = function () { return Overlay.connected; };
})(typeof window !== 'undefined' ? window : this);
