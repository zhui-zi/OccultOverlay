'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadRoute() {
  const sandbox = {
    console,
    Math,
    OC: {
      Overlay: {
        territoryId: 1346,
        playerPos: null,
      },
    },
  };
  sandbox.window = sandbox;
  for (const file of ['../data/treasureRoutes.js', '../js/route.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve(file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox;
}

const sandbox = loadRoute();
const { Route, TREASURE_ROUTES: routes } = sandbox.OC;

assert.equal(routes[1252].points.length, 68, 'South Horn must include all 68 coffer points');
assert.equal(routes[1346].points.length, 68, 'North Horn must include all 68 coffer points');
assert.equal(new Set(routes[1252].points.map((row) => row[4])).size, 68, 'South Horn node IDs must be unique');
assert.equal(new Set(routes[1346].points.map((row) => row[4])).size, 68, 'North Horn node IDs must be unique');

const expectedNorthNodeOrder = [
  2014, 2016, 2015, 2017, 2019, 2020,
  2070, 2018, 2032, 2008, 2033, 2073,
  2023, 2007, 2027, 2031, 2054, 2010, 2057, 2056, 2055, 2030, 2028, 2029, 2021, 2006, 2022, 2071,
  2044, 2042, 2009, 2046, 2043, 2047, 2062, 2063, 2012, 2064, 2065, 2049, 2048, 2026, 2025, 2024, 2045,
  2038, 2061, 2060, 2059, 2011, 2058, 2037, 2036, 2034, 2035, 2040, 2039, 2041,
  2051, 2050, 2052, 2053, 2072, 2066, 2067, 2068, 2013, 2069,
];
assert.deepEqual(Array.from(routes[1346].points, (row) => row[4]), expectedNorthNodeOrder,
  'North Horn must preserve the current BOCCHI segment order');
assert.deepEqual(Array.from(Object.entries(routes[1346].transitions), ([leg, transition]) => [
  leg,
  transition.type,
  transition.aetheryte || '',
]), [
  ['2020:2070', 'return-teleport', 'crown'],
  ['2073:2023', 'return-teleport', 'sinking'],
  ['2071:2044', 'return-teleport', 'moldering'],
  ['2045:2038', 'return-teleport', 'suspended'],
  ['2041:2051', 'return-teleport', 'unhallowed'],
  ['2069:2014', 'return', ''],
], 'North Horn must preserve the resolved BOCCHI segment transitions');

const north68 = routes[1346].points[67];
const northOrder = Route._buildOrder(1346, { x: north68[0], y: north68[1], z: north68[2] });
assert.equal(northOrder.length, 68);
assert.deepEqual(Array.from(northOrder.slice(0, 4), (point) => point.routeNumber), [68, 1, 2, 3],
  'the BOCCHI North Horn loop must wrap from route point 68 to 1');

let position = { x: north68[0], y: north68[1], z: north68[2] };
sandbox.OC.Overlay.playerPos = position;
let view = Route.open(1346, position);
assert.equal(view.target.routeNumber, 68, 'the route must start at the nearest North Horn point');
assert.equal(view.target.layerKey, 'subterrane');
assert.equal(view.progress, 1);
assert.equal(view.total, 68);

Route.updatePosition(position, 1346);
assert.equal(Route.view(position).target.routeNumber, 68, 'one position sample must not skip a point');
Route.updatePosition(position, 1346);
view = Route.view(position);
assert.equal(view.status, 'transition');
assert.equal(view.target, null, 'a segment transition must replace the distant route target');
assert.equal(view.transition.type, 'return');
assert.equal(view.transition.aetheryteKey, '');
assert.equal(view.transition.nextRouteNumber, 1);
assert.equal(view.visited, 1);
assert.equal(view.progress, 1);
assert.equal(Route.mapView().active, false, 'segment transitions must hide distant map markers');
Route.next();
view = Route.view(position);
assert.equal(view.target.routeNumber, 1, 'continuing after Return must reveal the next route point');
assert.equal(view.progress, 2);
assert.equal(Route.previous(), true);
assert.equal(Route.view(position).target.routeNumber, 68, 'manual previous must restore the prior route point');

Route.pause();
assert.equal(Route.isActive(), false);
Route.open(1346, position);
assert.equal(Route.view(position).target.routeNumber, 68, 'closing and reopening must preserve unfinished progress');

const transitionCases = [
  { from: 6, to: 7, aetheryte: 'crown' },
  { from: 12, to: 13, aetheryte: 'sinking' },
  { from: 28, to: 29, aetheryte: 'moldering' },
  { from: 45, to: 46, aetheryte: 'suspended' },
  { from: 58, to: 59, aetheryte: 'unhallowed' },
];
transitionCases.forEach(({ from, to, aetheryte }) => {
  const row = routes[1346].points[from - 1];
  position = { x: row[0], y: row[1], z: row[2] };
  sandbox.OC.Overlay.playerPos = position;
  Route.restartNearest(1346, position);
  assert.equal(Route.view(position).target.routeNumber, from);
  Route.next();
  view = Route.view(position);
  assert.equal(view.status, 'transition');
  assert.equal(view.transition.type, 'return-teleport');
  assert.equal(view.transition.aetheryteKey, aetheryte);
  assert.equal(view.transition.nextRouteNumber, to);
  assert.equal(view.target, null);
  assert.equal(Route.mapView().active, false);
  Route.next();
  assert.equal(Route.view(position).target.routeNumber, to);
});

const north62 = routes[1346].points[61];
position = { x: north62[0], y: north62[1], z: north62[2] };
sandbox.OC.Overlay.playerPos = position;
Route.restartNearest(1346, position);
view = Route.view(position);
assert.equal(view.target.routeNumber, 62);
assert.equal(view.target.nodeId, 2053);
assert.equal(view.target.mapId, 1135, 'North Horn point 62 must remain on the surface map');
Route.next();
assert.equal(Route.view(position).target.routeNumber, 63);
assert.equal(Route.view(position).target.nodeId, 2072);
assert.equal(Route.view(position).target.mapId, 1244, 'North Horn point 63 must enter the subterrane map');
assert.ok(routes[1346].points.slice(62).every((row) => row[3] === 1244),
  'North Horn points 63 through 68 must remain on the subterrane map');

const north1 = routes[1346].points[0];
position = { x: north1[0], y: north1[1], z: north1[2] };
sandbox.OC.Overlay.playerPos = position;
Route.restartNearest(1346, position);
let northTransitionCount = 0;
let northAdvanceCount = 0;
while (!Route.view(position).complete && northAdvanceCount < 100) {
  if (Route.view(position).transition) northTransitionCount += 1;
  Route.next();
  northAdvanceCount += 1;
}
assert.equal(Route.view(position).complete, true, 'North Horn must complete after all points and transitions');
assert.equal(northTransitionCount, 5, 'a basecamp start must cross all five authored segment boundaries');
assert.equal(northAdvanceCount, 73, 'five transitions must add one confirmation step each');

const south68 = routes[1252].points[67];
const southOrder = Route._buildOrder(1252, { x: south68[0], y: south68[1], z: south68[2] });
assert.equal(southOrder.length, 68);
assert.equal(southOrder[0].nodeId, south68[4], 'South Horn must start at the nearest route node');
assert.equal(new Set(southOrder.map((point) => point.nodeId)).size, 68,
  'South Horn nearest-neighbor planning must visit every point once');

Route.handleZone(1252);
position = { x: south68[0], y: south68[1], z: south68[2] + 1 };
sandbox.OC.Overlay.playerPos = position;
view = Route.open(1252, position);
assert.equal(view.target.nodeId, south68[4]);
assert.equal(view.target.displayNumber, 1, 'South Horn labels must show visit order instead of internal node order');
assert.ok(Math.abs(view.target.bearing) < 0.000001, 'the live arrow must preserve an exact north bearing');
assert.equal(view.target.directionKey, 'north');
assert.ok(Math.abs(view.target.distance - 1) < 0.000001);

for (let index = 0; index < 68; index += 1) Route.next();
view = Route.view(position);
assert.equal(view.complete, true);
assert.equal(view.visited, 68);
assert.equal(view.target, null);
assert.equal(Route.mapView().active, false, 'a completed route must clear its map markers');

Route.handleZone(9999);
view = Route.open(9999, { x: 0, y: 0, z: 0 });
assert.equal(view.supported, false);
assert.equal(view.total, 0);

console.log('route tests passed');
