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
      CES: {},
      FATES: { 1962: { name: {} } },
      POTS: {
        1976: { name: {}, side: 'north' },
        1977: { name: {}, side: 'south' }
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

console.log('overlay tests passed');
