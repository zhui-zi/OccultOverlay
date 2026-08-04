'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/overlay.js'), 'utf8');

function loadOverlay(search) {
  const intervals = [];
  const intervalDelays = [];
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
    setInterval(cb, delay) { intervals.push(cb); intervalDelays.push(delay); return intervals.length; },
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
    intervalDelays,
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
assert.equal(ws.intervalDelays[0], 250, 'the live position scheduler must react within 250 ms');

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
assert.equal(memory.sandbox.OC.Overlay.memMeta[1962].deathQuality, 'direct');
memory.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', '2026-07-26T11:00:00.000Z', 'Add', '0000', '000007AA', '00000000']
});
assert.ok(memory.sandbox.OC.Overlay.memMeta[1962].spawnEpoch > firstSpawn);
assert.equal(memory.sandbox.OC.Overlay.memMeta[1962].deathEpoch, null);

const staleCeFields = loadOverlay('');
staleCeFields.sandbox.dispatchOverlayEvent({
  type: 'ChangeZone',
  zoneID: 1346,
  zoneName: 'North Horn',
});
staleCeFields.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: [
    '259', '2026-08-04T10:00:00.000Z', '69B1F000', '00000020', '00000000',
    '00000001', '00000005', '00000000', '00000000', '00000000',
  ],
});
assert.equal(staleCeFields.sandbox.OC.Overlay.memActive[49], undefined);
assert.equal(staleCeFields.sandbox.OC.Overlay.memMeta[49].active, false);
assert.equal(staleCeFields.sandbox.OC.Overlay.memMeta[49].ceStatus, 0);

const updateOnlyPot = loadOverlay('');
let updateOnlyPotDetail = null;
updateOnlyPot.sandbox.OC.Overlay.on('memActive', (_id, _active, detail) => {
  updateOnlyPotDetail = detail;
});
updateOnlyPot.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', '2026-08-02T10:38:41.411+08:00', 'Update', '0000', '00000818', '00000000'],
});
assert.equal(updateOnlyPot.sandbox.OC.Overlay.memMeta[2072].spawnEpoch, 1785638321);
assert.equal(updateOnlyPot.sandbox.OC.Overlay.memMeta[2072].spawnTrusted, true);
assert.equal(updateOnlyPotDetail.eventType, 'add', 'first zero-progress pot Update must recover the missing Add');
updateOnlyPot.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['258', '2026-08-02T10:39:37.240+08:00', 'Remove', '0000', '00000818', '00000000'],
});
assert.equal(updateOnlyPot.sandbox.OC.Overlay.memMeta[2072].deathEpoch, 1785638377);

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
  type: 'LogLine',
  line: ['258', new Date().toISOString(), 'Update', '0000', '00000818', '00000000'],
});
assert.equal(snapshot.sandbox.OC.Overlay.memMeta[2072].spawnEpoch, undefined);
assert.equal(snapshot.sandbox.OC.Overlay.memMeta[2072].spawnTrusted, undefined);
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

const globalWorlds = {
  45: 1, 69: 2, 70: 3, 73: 4, 78: 5, 400: 6,
  402: 7, 91: 8, 21: 9, 24: 10, 408: 11,
};
Object.keys(globalWorlds).forEach((worldId) => {
  assert.equal(
    player.sandbox.OC.WORLD2DC[worldId],
    globalWorlds[worldId],
    `global world ${worldId} must map to its tracker datacenter`,
  );
});

const globalPlayer = loadOverlay('');
globalPlayer.sandbox.dispatchOverlayEvent({
  type: 'ChangePrimaryPlayer',
  charID: '1002AC16',
  charName: 'Global Player'
});
globalPlayer.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: ['03', '2026-08-02T12:00:00.000+08:00', '1002AC16', 'Global Player', '00', '00', '00000000', '45']
});
assert.equal(globalPlayer.sandbox.OC.Overlay.playerWorld, 69, 'LogLine world IDs must be decoded as hexadecimal');
assert.equal(globalPlayer.sandbox.OC.Overlay.playerDc, 2, 'Bahamut must resolve to Gaia instead of decimal world 45');

assert.equal(player.sandbox.OC.ceKeyToId(0, 1252), 48);
assert.equal(player.sandbox.OC.ceKeyToId(1, 1346), 49);
assert.equal(player.sandbox.OC.ceKeyToId(0, 1346), 64);
assert.equal(player.sandbox.OC.ceKeyToId(16, 1346), 0);

const cePhase = loadOverlay('');
const cePhaseEvents = [];
cePhase.sandbox.OC.Overlay.on('memActive', (id, active, detail) => {
  if (id === 49) cePhaseEvents.push({ active, detail });
});
cePhase.sandbox.dispatchOverlayEvent({
  type: 'ChangeZone',
  zoneID: 1346,
  zoneName: 'North Horn',
});
const recruitingDeadline = 1785643097;
cePhase.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: [
    '259', '2026-08-02T11:55:17.000+08:00', recruitingDeadline.toString(16),
    '000000B4', '00000000', '00000001', '00000003', '00000001',
  ],
});
assert.equal(cePhase.sandbox.OC.Overlay.memMeta[49].ceStatus, 1);
assert.equal(cePhase.sandbox.OC.Overlay.memMeta[49].cePopTime, recruitingDeadline);
assert.equal(
  cePhase.sandbox.OC.Overlay.memMeta[49].spawnEpoch,
  null,
  'CE popTime must not be reused as a spawn timestamp during the entry snapshot',
);
const readyDeadline = recruitingDeadline + 11;
cePhase.sandbox.dispatchOverlayEvent({
  type: 'LogLine',
  line: [
    '259', '2026-08-02T11:58:18.000+08:00', readyDeadline.toString(16),
    '0000000A', '00000000', '00000001', '00000003', '00000002',
  ],
});
assert.equal(cePhase.sandbox.OC.Overlay.memMeta[49].ceStatus, 2);
assert.equal(cePhase.sandbox.OC.Overlay.memMeta[49].cePopTime, readyDeadline);
assert.equal(cePhaseEvents.length, 2, 'a CE phase change must trigger immediate rematching and upload');

const position = loadOverlay('');
let observedPosition = null;
let observedCombatants = null;
let combatantPolls = 0;
position.sandbox.OverlayPluginApi = {
  ready: true,
  callHandler(message, cb) {
    const request = JSON.parse(message);
    if (request.call === 'getCombatants') combatantPolls += 1;
    const response = request.call === 'getCombatants'
      ? { combatants: [{ ID: 1, Name: 'Player', Type: 1, PosX: 12, PosY: 34, PosZ: -100, Heading: 1.5 }] }
      : {};
    if (cb) cb(JSON.stringify(response));
  },
};
position.sandbox.OC.Overlay.on('position', (value) => { observedPosition = value; });
position.sandbox.OC.Overlay.on('combatants', (value) => { observedCombatants = value; });
position.sandbox.OC.Overlay.start();
position.intervals[0](); // connect legacy transport
position.intervals[1](); // poll getCombatants

Promise.resolve().then(() => {
  assert.deepEqual(
    { x: observedPosition.x, y: observedPosition.y, z: observedPosition.z, h: observedPosition.h },
    { x: 12, y: -100, z: 34, h: 1.5 },
  );
  assert.equal(observedCombatants.length, 1, 'position polling must expose the same object snapshot to radar consumers');
  position.advanceTime(250);
  position.intervals[1]();
  assert.equal(combatantPolls, 1, 'idle position polling must keep its existing two-second throttle');
  position.sandbox.OC.Treasure = { isActive() { return true; } };
  position.intervals[1]();
  assert.equal(combatantPolls, 2, 'active treasure guidance must poll the live position after 250 ms');
  console.log('overlay tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
