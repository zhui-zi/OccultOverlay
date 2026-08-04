const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let radarEnabled = true;
const handlers = {};
const source = {
  inOccult: true,
  territoryId: 1252,
  playerId: 0x10000001,
  playerName: 'Keita',
  playerPos: { x: 0, y: 0, z: 0, h: 0 },
  on(name, handler) {
    (handlers[name] = handlers[name] || []).push(handler);
  },
  emit(name, ...args) {
    (handlers[name] || []).forEach(handler => handler(...args));
  },
  callHandler() {
    return Promise.resolve({ combatants: [] });
  },
};

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  OC: {
    Settings: {
      get(key) { return key === 'radarEnabled' ? radarEnabled : null; },
    },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require.resolve('../js/radar.js'), 'utf8'), sandbox, { filename: 'js/radar.js' });

const Radar = sandbox.OC.Radar;
assert.equal(Radar.classifyNpc(1789), 'silver');
assert.equal(Radar.classifyNpc(1796), 'silver');
assert.equal(Radar.classifyNpc(1797), 'bronze');
assert.equal(Radar.classifyNpc(2006), 'silver');
assert.equal(Radar.classifyNpc(2013), 'silver');
assert.equal(Radar.classifyNpc(2014), 'bronze');
assert.equal(Radar.classifyNpc(2073), 'bronze');
assert.equal(Radar.classifyNpc(2074), '');
assert.equal(Radar.classifyNpc(2010139), 'carrot');
assert.equal(Radar.classifyNpc('740', true), 'bronze', '105 BNpc IDs are hexadecimal');

const alerts = [];
Radar.onAlert(target => alerts.push(target));
Radar.start(source);

source.emit('combatants', [
  { ID: 0x40000001, BNpcID: 1789, PosX: 0, PosY: -50, PosZ: 10 },
  { ID: 0x40000002, BNpcID: 1797, PosX: 50, PosY: 0, PosZ: 12 },
  { ID: 0x40000003, BNpcID: 2010139, PosX: 0, PosY: 40, PosZ: 8 },
]);

let targets = Radar.targets();
assert.equal(targets.length, 3);
assert.equal(alerts.length, 3);
assert.equal(targets[0].kind, 'silver');
assert.equal(targets[0].distanceRounded, 50);
assert.equal(targets[0].absoluteKey, 'direction_north');
assert.equal(targets[0].relativeKey, 'relative_back');
assert.equal(targets[1].relativeKey, 'relative_left');
assert.equal(targets[2].relativeKey, 'relative_front');

source.emit('combatants', [
  { ID: 0x40000001, BNpcID: 1789, PosX: 0, PosY: -50, PosZ: 10 },
  { ID: 0x40000002, BNpcID: 1797, PosX: 50, PosY: 0, PosZ: 12 },
  { ID: 0x40000003, BNpcID: 2010139, PosX: 0, PosY: 40, PosZ: 8 },
]);
assert.equal(alerts.length, 3, 'the same actor must only alert once');

source.emit('combatants', [
  { ID: 0x40000004, BNpcID: 1798, PosX: 10, PosY: 10, PosZ: 0 },
  { ID: 0x40000005, BNpcID: 1799, PosX: 20, PosY: 10, PosZ: 0 },
  { ID: 0x40000006, BNpcID: 1800, PosX: 30, PosY: 10, PosZ: 0 },
]);
targets = Radar.targets();
assert.equal(targets.filter(target => target.kind !== 'carrot').length, 4, 'only four coffers are retained');
assert.deepEqual(
  Array.from(targets.filter(target => target.kind !== 'carrot'), target => target.slot),
  [1, 2, 3, 4],
  'coffers keep stable numbered slots',
);

Radar.reset();
source.playerPos = { x: 0, y: 0, z: 0, h: 0 };
source.emit('combatants', [
  { ID: 0x40000010, BNpcID: 1789, PosX: 5, PosY: 0, PosZ: 0 },
  { ID: 0x40000011, BNpcID: 2010139, PosX: 10, PosY: 0, PosZ: 0 },
]);
source.emit('log', 0, ['0'], '00:083E::Keita获得了“战利品”');
assert.deepEqual(Array.from(Radar.targets(), target => target.kind), ['carrot']);
source.emit('log', 15, ['15', '', '10000001', 'Keita', '200BBE0'], '15:10000001:Keita:200BBE0:');
assert.equal(Radar.targets().length, 0, 'using a nearby carrot clears it');

(async function () {
  let request = null;
  source.callHandler = function (payload) {
    request = payload;
    return Promise.resolve({
      combatants: [{ ID: 0x40000020, PosX: -25, PosY: 5, PosZ: 3 }],
    });
  };
  source.emit('log', 105, ['105', '', 'Add', '40000020', 'BNpcID', '740', 'Type', '4'], '');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(request.call, 'getCombatants');
  assert.deepEqual(Array.from(request.ids), [0x40000020]);
  assert.equal(Radar.targets()[0].kind, 'bronze');
  assert.equal(Radar.targets()[0].bnpcId, 1856);

  radarEnabled = false;
  Radar.scan([{ ID: 0x40000030, BNpcID: 1789, PosX: 1, PosY: 1, PosZ: 1 }]);
  assert.equal(Radar.targets().length, 1, 'disabling does not mutate existing state until the switch handler resets it');
  Radar.setEnabled(false);
  assert.equal(Radar.targets().length, 0);
  console.log('radar tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
