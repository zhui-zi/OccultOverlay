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

  // 国服 WorldID -> 大区(tracker dc id 101-104)，用于判断玩家所在大区
  var WORLD2DC = { 160: 101, 161: 101, 165: 101, 166: 101, 168: 102, 170: 101, 171: 101, 186: 102, 187: 102, 190: 102, 1042: 101, 1043: 103, 1044: 101, 1045: 103, 1060: 101, 1076: 102, 1081: 101, 1106: 103, 1113: 102, 1121: 102, 1166: 102, 1167: 101, 1169: 103, 1170: 102, 1171: 102, 1172: 102, 1173: 101, 1174: 101, 1175: 101, 1176: 102, 1177: 103, 1178: 103, 1179: 103, 1180: 104, 1183: 104, 1186: 104, 1192: 104, 1200: 104, 1201: 104 };
  OC.WORLD2DC = WORLD2DC;

  var Overlay = OC.Overlay = new EventBus();
  Overlay.connected = false;
  Overlay.territoryId = null;
  Overlay.zoneName = '';
  Overlay.inOccult = false;
  Overlay.playerName = '';
  Overlay.playerPos = null; // {x, y} 若数据源提供，否则 null

  // ---- 事件订阅列表 -----------------------------------------------------
  // onFateEvent 由网络包解析产生（cactbot/IINACT FateWatcher），全岛可见、即时，
  // 与玩家距离无关，是识别所在岛最快的信号（进岛即有，无需走到 FATE 面前）。
  var SUBSCRIBE = ['ChangeZone', 'ChangePrimaryPlayer', 'LogLine', 'onFateEvent'];

  // ---- 现代 WebSocket 接入 ----------------------------------------------
  var ws = null;
  var wsUrl = null;
  var reconnectTimer = null;

  function getWsUrl() {
    // OverlayPlugin 会以 OVERLAY_WS 或 HOST_PORT 传入 ws 地址（HOST_PORT 常为 faker 地址，
    // 必须原样连接以便注入的 WebSocket faker 桥接到游戏内存）。
    var m = /[?&]OVERLAY_WS=([^&]+)/.exec(location.search);
    if (m) return decodeURIComponent(m[1]);
    var hp = /[?&]HOST_PORT=([^&]+)/.exec(location.search);
    if (hp) return decodeURIComponent(hp[1]);
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
  // 内置浏览器模式：无需开启 WS 服务，直接用注入的 OverlayPluginApi。
  // API 可能在脚本之后才注入，这里轮询等待其就绪再订阅。
  var legacyTimer = null;
  function connectLegacy() {
    global.__OverlayCallback = handleMessage;
    if (legacyTimer) return;
    var tries = 0;
    legacyTimer = setInterval(function () {
      tries++;
      var api = global.OverlayPluginApi;
      if (api && api.ready) {
        clearInterval(legacyTimer); legacyTimer = null;
        SUBSCRIBE.forEach(function (ev) {
          try { api.callHandler(JSON.stringify({ call: 'subscribe', events: [ev] }), function () {}); } catch (e) {}
        });
        Overlay.connected = true;
        Overlay.emit('connected');
      } else if (tries > 60) { // ~30 秒后放弃，交给 WS 路径
        clearInterval(legacyTimer); legacyTimer = null;
      }
    }, 500);
  }

  // OverlayPlugin 通用回调（common.js 兼容）
  global.dispatchOverlayEvent = function (msg) { handleMessage(msg); };
  document.addEventListener('onOverlayDataUpdate', function (e) {
    if (e && e.detail) handleMessage(e.detail);
  });

  // ---- 请求/响应（getCombatants 等，读内存） ---------------------------
  var _rseq = 0;
  var _pending = {};
  Overlay.callHandler = function (obj) {
    // 旧版：OverlayPluginApi.callHandler(msg, cb)
    if (global.OverlayPluginApi && global.OverlayPluginApi.ready) {
      return new Promise(function (resolve) {
        global.OverlayPluginApi.callHandler(JSON.stringify(obj), function (data) {
          try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
      });
    }
    // 现代 WS：用 rseq 关联响应
    if (ws && ws.readyState === 1) {
      var id = ++_rseq;
      obj.rseq = id;
      return new Promise(function (resolve) {
        _pending[id] = resolve;
        try { ws.send(JSON.stringify(obj)); } catch (e) { delete _pending[id]; resolve(null); }
        setTimeout(function () { if (_pending[id]) { delete _pending[id]; resolve(null); } }, 4000);
      });
    }
    return Promise.resolve(null);
  };

  // 定时读取自己坐标（内存），供地图显示玩家位置；
  // 同时通过 getFates 读取全图 FATE 状态（距离无关），用于即时识别所在岛。
  var posTimer = null;
  function startPositionPolling() {
    if (posTimer) return;
    posTimer = setInterval(function () {
      if (!Overlay.connected) return;

      // --- getCombatants：玩家坐标 + 大区检测 + 近距离 boss 扫描 ---
      Overlay.callHandler({ call: 'getCombatants' }).then(function (data) {
        if (!data || !data.combatants) return;
        var arr = data.combatants;
        var me = null, i, c;
        // 1) 按主角 ID 精确匹配
        if (Overlay.playerId != null) {
          for (i = 0; i < arr.length; i++) { c = arr[i]; if (c.ID == Overlay.playerId) { me = c; break; } }
        }
        // 2) 按主角名匹配（type/Type 兼容大小写，1 = PC）
        if (!me && Overlay.playerName) {
          for (i = 0; i < arr.length; i++) { c = arr[i]; if (c.Name === Overlay.playerName) { me = c; break; } }
        }
        // 3) 兜底：第一个 PC
        if (!me) for (i = 0; i < arr.length; i++) { c = arr[i]; if ((c.type === 1 || c.Type === 1) && c.Name) { me = c; break; } }
        if (!me || me.PosX == null) return;
        // Dalamud(x,z) 水平 == OverlayPlugin(PosX, PosY)
        Overlay.playerPos = { x: me.PosX, z: me.PosY, h: me.Heading };
        // 跨区旅行时以”当前世界”为准（CurrentWorldID），而非home世界(WorldID)
        var wid = me.CurrentWorldID || me.CurrentWorld || me.WorldID;
        if (wid) {
          Overlay.playerWorld = wid;
          if (WORLD2DC[wid]) Overlay.playerDc = WORLD2DC[wid];
        }
        // FATE/CE 状态一律以 258/259 内存数据为准；
        // 战斗单位名字是模糊匹配，会把普通怪误判成 FATE/CE，故不再使用。
        Overlay.emit('position', Overlay.playerPos);
      });

    }, 2000);
  }

  // ---- 消息分发 ---------------------------------------------------------
  function handleMessage(d) {
    if (!d || !d.type) return;
    if (d.rseq != null && _pending[d.rseq]) { var f = _pending[d.rseq]; delete _pending[d.rseq]; f(d); return; }
    switch (d.type) {
      case 'ChangeZone':
        setZone(d.zoneID != null ? d.zoneID : d.zoneId, d.zoneName);
        break;
      case 'ChangePrimaryPlayer':
        Overlay.playerName = d.charName || d.name || '';
        if (d.charID != null) Overlay.playerId = d.charID;
        break;
      case 'LogLine':
        handleLogLine(d);
        break;
      case 'onFateEvent':
        handleFateEvent(d);
        break;
    }
  }

  // onFateEvent: { type, eventType:'add'|'remove'|'update', fateID:Number, progress:Number }
  // 由网络包解析（FateWatcher）产生，全岛可见且即时，与玩家距离无关。
  // 撒娇罐(1976/1977)也是 FATE，会一并从这里得到，进岛立即用于识别所在岛。
  function handleFateEvent(d) {
    var id = d.fateID != null ? Number(d.fateID) : (d.fateId != null ? Number(d.fateId) : 0);
    if (!id) return;
    memChanged(id, d.eventType !== 'remove'); // add / update = 存在；remove = 结束
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

    // 调试钩子：设置 OC.Overlay.debugRaw = fn 可捕获原始日志行
    if (Overlay.debugRaw) { try { Overlay.debugRaw(line); } catch (e) {} }

    // 258 FateDirector / 259 CEDirector：由 ACT 读取内存产生，
    // 与距离无关且即时，是获取全岛 FATE/CE 状态的最佳来源。
    if (type === 258) { handleFateDirector(line); return; }
    if (type === 259) { handleCeDirector(line); return; }

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

  // ---- 内存态 FATE/CE（258/259 director 行 + getFates 主动轮询）--------
  // Overlay.memActive: { id: true } 当前岛上正在进行的 FATE/CE（与距离无关）
  Overlay.memActive = {};

  function memChanged(id, active) {
    id = Number(id);
    if (!id) return;
    // 只接受新月岛已知的 CE/FATE/魔法罐，过滤其它区域或无关的 director 数据
    if (!OC.CES[id] && !OC.FATES[id] && !OC.POTS[id]) return;
    var was = !!Overlay.memActive[id];
    if (active) Overlay.memActive[id] = true; else delete Overlay.memActive[id];
    if (was !== !!active) Overlay.emit('memActive', id, !!active);
  }

  // 258|ts|category(Add/Update/Remove)|padding|fateId(hex)|progress(hex)|...
  function handleFateDirector(line) {
    var cat = String(line[2] || '');
    var fateId = parseInt(line[4], 16);
    if (!fateId) return;
    if (cat === 'Remove') memChanged(fateId, false);
    else memChanged(fateId, true); // Add / Update
  }

  // CEDirector 的 ceKey 是 0-15 的序号，并非 DynamicEvent 行号(33-48)。
  // 对应关系（与 cactbot zone_south_horn 一致）：0=两歧塔(48)，1-15 => 32+ceKey。
  function ceKeyToId(k) { return k === 0 ? 48 : (k >= 1 && k <= 15) ? 32 + k : 0; }
  OC.ceKeyToId = ceKeyToId;

  // 259|ts|popTime|timeRemaining|unk|ceKey(hex)|numPlayers|status|unk|progress|...
  function handleCeDirector(line) {
    var ceKey = parseInt(line[5], 16);
    if (isNaN(ceKey)) return;
    var id = ceKeyToId(ceKey);
    if (!id) return;
    var status = parseInt(line[7], 16) || 0;   // 0=未激活 1=招募人手 2=准备开始 3=战斗中
    var remain = parseInt(line[3], 16) || 0;
    var players = parseInt(line[6], 16) || 0;
    var active;
    if (Overlay.memActive[id]) {
      active = status !== 0;                   // 已在进行中：status 0 才算结束
    } else {
      // 首次出现（含“招募人手”阶段）：有倒计时或已有人报名也算已出现，
      // 同时过滤掉进本时那种全空的占位记录。
      active = status !== 0 || remain > 0 || players > 0;
    }
    memChanged(id, active);
  }

  // ---- boss 名称索引：从场上战斗单位判断活跃的 FATE/CE ------------------
  var _bossIndex = null;
  function bossTokens(nameObj) {
    if (!nameObj) return [];
    var tk = [];
    if (nameObj.zh) { var z = nameObj.zh, i = z.lastIndexOf('——'); tk.push(i >= 0 ? z.slice(i + 2) : z); }
    if (nameObj.ja) { var m = /[「『](.+?)[」』]/.exec(nameObj.ja); tk.push(m ? m[1] : nameObj.ja); }
    if (nameObj.en) tk.push(nameObj.en);
    return tk.filter(function (x) { return x && x.length >= 2; });
  }
  function buildBossIndex() {
    _bossIndex = [];
    function add(id, nameObj) { bossTokens(nameObj).forEach(function (t) { _bossIndex.push({ id: id, t: t }); }); }
    Object.keys(OC.CES).forEach(function (k) { add(Number(k), OC.CES[k].name); });
    Object.keys(OC.FATES).forEach(function (k) { add(Number(k), OC.FATES[k].name); });
  }
  function scanBosses(combatants) {
    if (!_bossIndex) buildBossIndex();
    var found = {};
    Overlay.bossPos = Overlay.bossPos || {};
    (combatants || []).forEach(function (c) {
      var name = c && c.Name; if (!name || name.length < 2) return;
      // 仅 BNpc/敌方单位（type 2）才可能是 FATE/CE boss；排除玩家等
      if (c.type != null && c.type !== 2) return;
      for (var i = 0; i < _bossIndex.length; i++) {
        var b = _bossIndex[i];
        // 精确匹配，或战斗单位名包含完整 boss 名（不做反向包含，避免误报）
        if (name === b.t || name.indexOf(b.t) >= 0) {
          found[b.id] = 1;
          // 记录 boss 实际坐标，用于地图精确定位（静态表可能有误）
          if (c.PosX != null) Overlay.bossPos[b.id] = [c.PosX, c.PosY];
          break;
        }
      }
    });
    return Object.keys(found).map(Number);
  }

  // 用系统浏览器打开链接（OverlayPlugin 'openWebsiteWithWS' 会调用 Process.Start）
  Overlay.openUrl = function (url) {
    var obj = { call: 'openWebsiteWithWS', url: url };
    if (global.OverlayPluginApi && global.OverlayPluginApi.ready) {
      try { global.OverlayPluginApi.callHandler(JSON.stringify(obj), function () {}); return true; } catch (e) {}
    }
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch (e) {} }
    return false; // 未连接 ACT：由调用方回退到 window.open
  };

  // ACT 自带 TTS（OverlayPlugin 'say' 处理器），不使用系统 TTS
  Overlay.say = function (text) {
    var obj = { call: 'say', text: text };
    if (global.OverlayPluginApi && global.OverlayPluginApi.ready) {
      try { global.OverlayPluginApi.callHandler(JSON.stringify(obj), function () {}); return true; } catch (e) {}
    }
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch (e) {} }
    return false;
  };

  // ---- 启动 -------------------------------------------------------------
  Overlay.start = function () {
    // 两种接入方式并行：内置浏览器注入的 OverlayPluginApi（无需 WS 服务），
    // 以及 WebSocket（OVERLAY_WS / HOST_PORT）。哪个先就绪就用哪个。
    connectLegacy();
    connectWs();
    startPositionPolling();
  };

  // 手动设置区域（演示 / 调试用）
  Overlay.setZoneManual = setZone;

  Overlay.isConnected = function () { return Overlay.connected; };
})(typeof window !== 'undefined' ? window : this);
