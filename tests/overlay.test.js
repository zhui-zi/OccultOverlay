'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/overlay.js'), 'utf8');

function loadOverlay(search) {
  const intervals = [];
  const timeouts = [];
  let websocketCount = 0;

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = {};
      websocketCount++;
    }
    addEventListener(name, cb) {
      (this.listeners[name] = this.listeners[name] || []).push(cb);
    }
    send() {}
    emit(name, data) {
      if (name === 'open') this.readyState = 1;
      if (name === 'close') this.readyState = 3;
      (this.listeners[name] || []).forEach((cb) => cb(data || {}));
    }
    close() {
      this.emit('close');
    }
  }

  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    Promise,
    location: { search: search || '' },
    document: { addEventListener() {} },
    setInterval(cb) { intervals.push(cb); return intervals.length; },
    clearInterval() {},
    setTimeout(cb) { timeouts.push(cb); return timeouts.length; },
    WebSocket: FakeWebSocket,
    OC: {
      Settings: { get() { return ''; } },
      CES: { 49: { name: {} }, 64: { name: {} }, 65: { name: {} } },
      FATES: { 1962: { name: {} }, 2074: { name: {} } },
      POTS: {
        1976: { name: {}, side: 'north' },
        1977: { name: {}, side: 'south' },
        2072: { name: {}, side: 'north' },
        2073: { name: {}, side: 'south' }
      }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'overlay.js' });
  return {
    sandbox,
    intervals,
    timeouts,
    get websocketCount() { return websocketCount; }
  };
}

const legacy = loadOverlay('');
legacy.sandbox.OC.Overlay.start();
assert.equal(legacy.websocketCount, 0);
legacy.sandbox.OverlayPluginApi = {
  ready: true,
  callHandler(_message, cb) { if (cb) cb('{}'); }
};
legacy.intervals.forEach((cb) => cb());
assert.equal(legacy.sandbox.OC.Overlay.connected, true);

const ws = loadOverlay('?OVERLAY_WS=ws%3A%2F%2F127.0.0.1%3A10501%2Fws');
ws.sandbox.OverlayPluginApi = {
  ready: true,
  callHandler() { throw new Error('legacy transport must not be used'); }
};
ws.sandbox.OC.Overlay.start();
assert.equal(ws.websocketCount, 1);
assert.equal(ws.intervals.length, 1); // position polling only; no legacy polling

const memory = loadOverlay('');
memory.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', '2026-07-26T10:00:00.000Z', 'Add', '0000', '000007AA', '00000000']
});
const firstSpawn = memory.sandbox.OC.Overlay.memMeta[1962].spawnEpoch;
memory.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', '2026-07-26T10:05:00.000Z', 'Update', '0000', '000007AA', '00000032']
});
assert.equal(memory.sandbox.OC.Overlay.memMeta[1962].spawnEpoch, firstSpawn);
assert.equal(memory.sandbox.OC.Overlay.memMeta[1962].active, true);
memory.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', '2026-07-26T10:06:00.000Z', 'Remove', '0000', '000007AA', '00000064']
});
assert.equal(memory.sandbox.OC.Overlay.memMeta[1962].active, false);
assert.equal(memory.sandbox.OC.Overlay.memActive[1962], undefined);
memory.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', '2026-07-26T11:00:00.000Z', 'Add', '0000', '000007AA', '00000000']
});
assert.ok(memory.sandbox.OC.Overlay.memMeta[1962].spawnEpoch > firstSpawn);
assert.equal(memory.sandbox.OC.Overlay.memMeta[1962].deathEpoch, null);

const player = loadOverlay('');
let playerContext = null;
player.sandbox.OC.Overlay.on('playerContext', (context) => { playerContext = context; });
player.sandbox.dispatchOverlayEvent({
  type: 'ChangePrimaryPlayer',
  charID: '1002AC15',
  charName: '吴邪'
});
player.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['03', '2026-07-28T07:13:45.000+08:00', '1002AC15', '吴邪', '00', '00', '00000000', '499']
});
assert.equal(player.sandbox.OC.Overlay.playerWorld, 1177);
assert.equal(player.sandbox.OC.Overlay.playerDc, 103);
assert.equal(playerContext.worldId, 1177);
assert.equal(playerContext.dc, 103);

assert.equal(player.sandbox.OC.ceKeyToId(0, 1252), 48);
assert.equal(player.sandbox.OC.ceKeyToId(1, 1346), 49);
assert.equal(player.sandbox.OC.ceKeyToId(0, 1346), 64);
assert.equal(player.sandbox.OC.ceKeyToId(16, 1346), 65);

console.log('overlay tests passed');
