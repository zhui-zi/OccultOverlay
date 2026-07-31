'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/overlay.js'), 'utf8');

function loadOverlay(search) {
  const intervals = [];
  const timeouts = [];
  let websocketCount = 0;
  let nowMs = Date.now();

  class ClockDate extends Date {
    static now() { return nowMs; }
  }

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
    Date: ClockDate,
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
      CES: { 49: { name: {} }, 64: { name: {} } },
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
    advanceTime(ms) { nowMs += ms; },
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

const snapshot = loadOverlay('');
let snapshotDetail = null;
snapshot.sandbox.OC.Overlay.on('memActive', (_id, _active, detail) => {
  snapshotDetail = detail;
});
snapshot.sandbox.dispatchOverlayEvent({
  type: 'ChangeZone',
  zoneID: 1346,
  zoneName: 'North Horn',
});
snapshot.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', new Date().toISOString(), 'Add', '0000', '0000081A', '00000020'],
});
assert.equal(snapshot.sandbox.OC.Overlay.memMeta[2074].spawnEpoch, null);
assert.equal(snapshot.sandbox.OC.Overlay.memMeta[2074].spawnTrusted, false);
assert.equal(snapshotDetail.startTrusted, false, 'initial Add replay must remain read-only');
snapshot.sandbox.dispatchOverlayEvent({
  type: 'onFateEvent',
  eventType: 'add',
  fateID: 2074,
  startTimeEpoch: 1785195089,
});
assert.equal(snapshot.sandbox.OC.Overlay.memMeta[2074].spawnEpoch, 1785195089);
assert.equal(snapshot.sandbox.OC.Overlay.memMeta[2074].spawnTrusted, true);

const duplicateZone = loadOverlay('');
let zoneEvents = 0;
duplicateZone.sandbox.OC.Overlay.on('zone', () => { zoneEvents++; });
duplicateZone.sandbox.dispatchOverlayEvent({
  type: 'ChangeZone',
  zoneID: 1346,
  zoneName: '蜃景幻界新月岛 北征之章',
});
const firstSnapshotUntil = duplicateZone.sandbox.OC.Overlay.fateSnapshotUntil;
duplicateZone.advanceTime(3000);
duplicateZone.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['01', '2026-07-31T18:58:37.374+08:00', '542', '蜃景幻界新月岛 北征之章'],
});
assert.equal(zoneEvents, 1, 'a delayed duplicate zone signal must not reset the matched island');
assert.equal(
  duplicateZone.sandbox.OC.Overlay.fateSnapshotUntil,
  firstSnapshotUntil,
  'a delayed duplicate must not restart the initial FATE snapshot window',
);
duplicateZone.advanceTime(1000);
duplicateZone.sandbox.dispatchOverlayEvent({
  type: 'ChangeZone',
  zoneID: 1278,
  zoneName: '幻境村',
});
duplicateZone.advanceTime(1000);
duplicateZone.sandbox.dispatchOverlayEvent({
  type: 'ChangeZone',
  zoneID: 1346,
  zoneName: '蜃景幻界新月岛 北征之章',
});
assert.equal(zoneEvents, 3, 'leaving and re-entering through another territory must still reset');

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
assert.equal(player.sandbox.OC.ceKeyToId(16, 1346), 0);

const position = loadOverlay('');
let observedPosition = null;
position.sandbox.OverlayPluginApi = {
  ready: true,
  callHandler(message, cb) {
    const request = JSON.parse(message);
    const response = request.call === 'getCombatants'
      ? { combatants: [{ ID: 1, Name: 'Player', Type: 1, PosX: 12, PosY: 34, PosZ: -100, Heading: 1.5 }] }
      : {};
    if (cb) cb(JSON.stringify(response));
  },
};
position.sandbox.OC.Overlay.on('position', (value) => { observedPosition = value; });
position.sandbox.OC.Overlay.start();
position.intervals[0](); // connect legacy transport
position.intervals[1](); // poll getCombatants

Promise.resolve().then(() => {
  assert.deepEqual(
    { x: observedPosition.x, y: observedPosition.y, z: observedPosition.z, h: observedPosition.h },
    { x: 12, y: -100, z: 34, h: 1.5 },
  );
  console.log('overlay tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
