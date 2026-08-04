const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let radarCoffers = true;
let radarCarrots = true;
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
      get(key) {
        if (key === 'radarCoffers') return radarCoffers;
        if (key === 'radarCarrots') return radarCarrots;
        return null;
      },
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
assert.equal(targets[0].bearing, 0);
assert.equal(targets[1].absoluteKey, 'direction_east');
assert.equal(targets[1].bearing, 90);
assert.equal(targets[2].absoluteKey, 'direction_south');
assert.equal(targets[2].bearing, 180);
radarCoffers = false;
Radar.setEnabled(true);
assert.deepEqual(Array.from(Radar.targets(), target => target.kind), ['carrot'], 'coffers can be hidden independently');
radarCoffers = true;
radarCarrots = false;
Radar.setEnabled(true);
assert.deepEqual(Array.from(Radar.targets(), target => target.kind), ['silver', 'bronze'], 'carrots can be hidden independently');
radarCarrots = true;
Radar.setEnabled(true);
assert.equal(Radar.targets().length, 3, 'coffers and carrots can be enabled together');
assert.ok(Math.abs(Radar.bearingForDelta(1, -Math.sqrt(3)) - 30) < 0.000001,
  'radar bearings must preserve exact angles inside a compass sector');

source.playerPos = { x: -10, y: 0, z: -5, h: 2.4 };
source.emit('position', source.playerPos);
targets = Radar.targets();
assert.ok(Math.abs(targets[0].distance - Math.sqrt(2125)) < 0.000001,
  'player movement must update the exact distance immediately');
assert.ok(Math.abs(targets[0].bearing - 12.528807709151522) < 0.000001,
  'the live arrow must follow the exact target bearing instead of player heading');

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

  Radar.reset();
  const alertCountBeforeScopeTest = alerts.length;
  radarCoffers = false;
  radarCarrots = true;
  Radar.setEnabled(true);
  Radar.scan([
    { ID: 0x40000030, BNpcID: 1789, PosX: 1, PosY: 1, PosZ: 1 },
    { ID: 0x40000031, BNpcID: 2010139, PosX: 2, PosY: 2, PosZ: 1 },
  ]);
  assert.deepEqual(Array.from(Radar.targets(), target => target.kind), ['carrot']);
  assert.deepEqual(Array.from(alerts.slice(alertCountBeforeScopeTest), target => target.kind), ['carrot'],
    'disabled radar scopes must not emit alerts');
  radarCarrots = false;
  Radar.setEnabled(false);
  assert.equal(Radar.targets().length, 0);
  console.log('radar tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
