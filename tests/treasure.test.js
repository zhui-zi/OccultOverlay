'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadTreasure(territory = 1346, treasureGuide = true) {
  const handlers = {};
  let enabled = treasureGuide;
  const overlay = {
    playerName: '吴邪',
    territoryId: territory,
    inOccult: true,
    playerPos: { x: 233, y: 0, z: -470 },
    on(name, cb) {
      (handlers[name] = handlers[name] || []).push(cb);
      return this;
    },
    emit(name, ...args) {
      (handlers[name] || []).forEach((cb) => cb(...args));
    },
  };
  const sandbox = {
    console,
    Date,
    Math,
    OC: {
      Overlay: overlay,
      POTS: {
        1976: { territory: 1252, side: 'north' },
        1977: { territory: 1252, side: 'south' },
        2072: { territory: 1346, side: 'north' },
        2073: { territory: 1346, side: 'south' },
      },
      Settings: {
        get(key) { return key === 'treasureGuide' ? enabled : null; },
      },
    },
  };
  sandbox.window = sandbox;
  for (const file of ['../data/mapPoints.js', '../js/treasure.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve(file), 'utf8'), sandbox, { filename: file });
  }
  sandbox.OC.Treasure.start(overlay);
  return {
    sandbox,
    overlay,
    Treasure: sandbox.OC.Treasure,
    setTreasureGuide(value) {
      enabled = value;
      sandbox.OC.Treasure.setEnabled(value);
    },
  };
}

function logLine(subtype, message, timestamp = '2026-08-04T07:36:46.0000000+08:00') {
  return ['00', timestamp, subtype, '', message, 'checksum'];
}

function directionMessage(direction) {
  return `财宝好像是在${direction}方向很远的地方！`;
}

function startNorth(context) {
  const at = Math.floor(Date.parse('2026-08-04T07:36:46.0000000+08:00') / 1000);
  context.overlay.emit('memActive', 2072, false, { eventType: 'remove', observedAt: at });
  context.overlay.emit('log', 0, logLine('08AE', '吴邪附加了“指引财宝”效果。'));
}

{
  const context = loadTreasure(1346, false);
  startNorth(context);
  assert.equal(context.Treasure.view().active, false, 'disabled guidance must ignore qualifying ACT events');

  context.setTreasureGuide(true);
  startNorth(context);
  assert.equal(context.Treasure.view().active, true, 're-enabling must allow a future qualifying treasure session');

  context.setTreasureGuide(false);
  assert.equal(context.Treasure.view().active, false, 'disabling must stop an active treasure session immediately');
  assert.equal(context.Treasure.view().lastReason, 'disabled');
}

{
  const { Treasure } = loadTreasure();
  const candidates = [
    { x: 0, z: -10 },
    { x: 10, z: -10 },
    { x: -10, z: -10 },
    { x: 4, z: -10 },
    { x: 4.2, z: -10 },
  ];
  const north = Treasure.refineCandidates(candidates, { x: 0, z: 0 }, '正北');
  assert.deepEqual(Array.from(north, (entry) => [entry.x, entry.z]), [[0, -10], [4, -10]]);
  assert.equal(Treasure.directionForDelta(4.2, -10), 1, 'the clockwise side of the 22.5 degree boundary must be northeast');
  assert.ok(Math.abs(Treasure.bearingForDelta(1, -Math.sqrt(3)) - 30) < 0.000001,
    'display bearing must preserve angles inside an eight-direction sector');
  assert.equal(Treasure.parseDirection('财宝好像是在东北方向很远的地方！'), '东北');
}

{
  const context = loadTreasure();
  const { overlay, Treasure, sandbox } = context;
  const at = Math.floor(Date.parse('2026-08-04T07:36:46.0000000+08:00') / 1000);

  overlay.emit('memActive', 2072, false, { eventType: 'remove', observedAt: at });
  overlay.emit('log', 0, logLine('222E', '别的玩家附加了“指引财宝”效果。'));
  assert.equal(Treasure.view().active, false, 'another player buff must never start guidance');

  overlay.playerName = '';
  overlay.emit('log', 0, logLine('08AE', '吴邪附加了“指引财宝”效果。'));
  overlay.playerName = '吴邪';
  let view = Treasure.view();
  assert.equal(view.active, true);
  assert.equal(view.mode, 'initial');
  assert.equal(view.side, 'north');
  assert.equal(view.candidateCount, 30);
  assert.equal(view.candidates.length, 30, 'an active session must expose every current map candidate');
  assert.deepEqual(
    [view.candidates[0].x, view.candidates[0].z],
    Array.from(context.sandbox.OC.MAPS[1346].points.potNorth[0]),
    'map candidates must preserve their world coordinates',
  );

  assert.equal(Treasure.dismiss(), true, 'manual close must dismiss the current guide');
  view = Treasure.view();
  assert.equal(view.active, true, 'manual close must keep the treasure session active');
  assert.equal(view.dismissed, true);
  assert.equal(view.candidateCount, 30, 'manual close must preserve current map candidates');
  assert.equal(Treasure.dismiss(), false, 'repeated close must not publish duplicate state changes');

  const originalPool = sandbox.OC.MAPS[1346].points.potNorth;
  const firstMatches = Treasure.refineCandidates(originalPool, overlay.playerPos, '正东');
  assert.ok(firstMatches.length > 1, 'fixture must leave several east candidates');
  overlay.emit('log', 0, logLine('0839', directionMessage('正东'), '2026-08-04T07:37:00.0000000+08:00'));
  view = Treasure.view();
  assert.equal(view.candidateCount, firstMatches.length);
  assert.equal(view.candidates.length, firstMatches.length, 'direction refinement must update the map candidate set');
  assert.ok(view.target);
  assert.ok(view.candidateCount < 30);

  const oldTarget = { x: view.target.x, z: view.target.z };
  let liveView = null;
  Treasure.onChange((nextView) => { liveView = nextView; });
  overlay.playerPos = { x: oldTarget.x - 10, y: 0, z: oldTarget.z + 5 };
  overlay.emit('position', overlay.playerPos);
  assert.ok(liveView && liveView.target, 'a position update must immediately publish a fresh guide view');
  assert.ok(Math.abs(liveView.target.distance - Math.sqrt(125)) < 0.000001);
  assert.ok(Math.abs(liveView.target.bearing - 63.43494882292201) < 0.000001,
    'the live arrow bearing must not snap to the nearest direction sector');

  const another = firstMatches.find((candidate) => {
    const dx = candidate.x - oldTarget.x;
    const dz = candidate.z - oldTarget.z;
    return dx * dx + dz * dz >= 1;
  });
  assert.ok(another, 'fixture must retain another point for a second probe');
  const nextSector = Treasure.directionForDelta(another.x - oldTarget.x, another.z - oldTarget.z);
  const nextDirection = Treasure.directions[nextSector];
  overlay.playerPos = { x: oldTarget.x, y: 0, z: oldTarget.z };
  overlay.emit('position', overlay.playerPos);
  overlay.emit('log', 0, logLine('0839', directionMessage(nextDirection), '2026-08-04T07:38:00.0000000+08:00'));
  view = Treasure.view();
  assert.ok(view.candidateCount > 0);
  assert.ok(view.candidateCount < firstMatches.length, 'a later probe must intersect the previous candidate set');

  overlay.emit('log', 0, logLine('0039', '给我更多的圣灵药，我就再帮你找一次财宝！', '2026-08-04T08:19:03.0000000+08:00'));
  view = Treasure.view();
  assert.equal(view.mode, 'reroll');
  assert.equal(view.dismissed, false, 'a continuation must show the guide again');
  assert.equal(view.candidateCount, 20);
  assert.equal(view.candidates.length, 20);
  assert.equal(view.status, 'waiting-direction');

  overlay.playerPos = { x: -839.7816, y: 62.5782, z: 737.0380 };
  overlay.emit('position', overlay.playerPos);
  const rerollPoint = sandbox.OC.MAPS[1346].points.reroll[0];
  const rerollDirection = Treasure.directions[Treasure.directionForDelta(
    rerollPoint[0] - overlay.playerPos.x,
    rerollPoint[1] - overlay.playerPos.z,
  )];
  overlay.emit('log', 0, logLine('0839', directionMessage(rerollDirection), '2026-08-04T08:20:17.0000000+08:00'));
  view = Treasure.view();
  assert.ok(view.target);
  assert.equal(view.safeCount, 0);
  assert.equal(view.target.dangerous, true, 'North Horn reroll points must show a danger warning');
  assert.ok(view.candidates.every((candidate) => candidate.dangerous),
    'the dynamic map layer must receive danger state for every North Horn reroll candidate');

  overlay.emit('log', 0, logLine('08B0', '其他人的“指引财宝”状态效果消失了。', '2026-08-04T08:23:14.0000000+08:00'));
  assert.equal(Treasure.view().active, true);
  overlay.emit('log', 0, logLine('08B0', '吴邪的“指引财宝”状态效果消失了。', '2026-08-04T08:23:15.0000000+08:00'));
  assert.equal(Treasure.view().active, false);
  assert.equal(Treasure.view().candidates.length, 0, 'ending the session must clear the dynamic map candidates');
  assert.equal(Treasure.view().lastReason, 'buff-lost');
}

{
  const context = loadTreasure();
  const { overlay, Treasure } = context;
  const at = Math.floor(Date.parse('2026-08-04T07:36:46.0000000+08:00') / 1000);
  overlay.emit('log', 0, logLine('08AE', '吴邪附加了“指引财宝”效果。'));
  assert.equal(Treasure.view().active, false);
  overlay.emit('log', 258, ['258', '2026-08-04T07:36:46.9200000+08:00', 'Remove', '0000', '00000818']);
  assert.equal(Treasure.view().active, true, 'buff-before-remove delivery order must still start guidance');
  overlay.territoryId = 999;
  overlay.inOccult = false;
  overlay.emit('zone', 999, 'Other zone', false);
  assert.equal(Treasure.view().active, false);
  assert.equal(Treasure.view().lastReason, 'zone-left');
}

{
  const { Treasure } = loadTreasure();
  const selected = Treasure.selectTarget(
    [{ x: 440.298, z: -926.5872 }, { x: 500, z: -926.5872 }],
    { x: 440, z: -927 },
    { territory: 1346, mode: 'initial', side: 'north', direction: '正东' },
  );
  assert.equal(selected.safeCount, 1);
  assert.equal(selected.dangerCount, 1);
  assert.equal(selected.target.x, 500, 'a safe point must win even when a danger point is closer');
  assert.equal(selected.target.danger, false);
}

{
  const context = loadTreasure(1252);
  const { overlay, Treasure } = context;
  overlay.playerPos = { x: 0, y: 0, z: 0 };
  const at = Math.floor(Date.parse('2026-08-04T07:36:46.0000000+08:00') / 1000);
  overlay.emit('memActive', 1977, false, { eventType: 'remove', observedAt: at });
  overlay.emit('log', 0, logLine('08AE', '吴邪附加了“指引财宝”效果。'));
  overlay.emit('log', 0, logLine('0839', directionMessage('正北')));
  const view = Treasure.view();
  assert.ok(view.target);
  assert.equal(view.safeCount, 0);
  assert.equal(view.target.dangerous, true, 'South Horn south-pot north sector must be marked dangerous');
}

console.log('treasure tests passed');
