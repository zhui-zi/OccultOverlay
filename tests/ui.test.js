'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let currentLang = 'en';
const uiStrings = {
  en: {
    weakness: 'Weakness', tower: 'Forked Tower', last_seen: 'Last', tower_predicted: 'Predicted',
    ce_active: 'Active', pot_active: 'Active',
    tower_window: 'Expected window reached', tower_reduced: 'Reduced',
    tower_upcoming: 'More after completion', tower_history: 'Previous intervals',
    treasure_title: 'Magic Pot Treasure', treasure_reroll: 'Reroll coffer', treasure_candidates: 'Candidates',
    treasure_safe: 'Safe', treasure_reported: 'Reported', treasure_danger: 'Only dangerous points remain.',
    route_title: 'Treasure Patrol', route_unsupported: 'No treasure patrol route is available in this area.',
    route_complete: 'All coffer points visited', route_complete_help: 'Replan to start another lap.',
    route_wait_position: 'Reading player position…', route_progress: 'Patrol progress', route_point: 'Route point',
    route_layer_surface: 'Surface', route_layer_subterrane: 'Subterrane', route_change_layer: 'Next point is on',
    route_previous: 'Previous', route_restart: 'Replan', route_next: 'Next',
    direction_north: 'North', direction_east: 'East', close: 'Close',
  },
  zh: {
    weakness: '弱点', tower: '两歧塔', last_seen: '上次', tower_predicted: '预计',
    ce_active: '进行中', pot_active: '进行中',
    tower_window: '预计可出现', tower_reduced: '已缩短',
    tower_upcoming: '完成后再缩短', tower_history: '历史间隔',
  },
};
const sandbox = {
  console,
  Date,
  Math,
  OC: {
    Settings: { get(key) { return key === 'lang' ? currentLang : null; } },
    Overlay: { territoryId: 1346 },
    MAP: { territory: 1346, mapId: 1135 },
    Pots: { status() { return null; } },
    i18n: { t(key) { return (uiStrings[currentLang] && uiStrings[currentLang][key]) || key; } },
  },
};
sandbox.window = sandbox;

for (const file of ['../js/data.js', '../js/history.js', '../js/ui.js']) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: file });
}

const host = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(host, {
  territory: 1346,
  lastUpdate: 100,
  ce: [{ fate_id: 49, spawn_time: 100, death_time: -1, last_seen: 100 }],
  fate: [{ fate_id: 2074, spawn_time: 100, death_time: -1, last_seen: 100 }],
  pot: [],
}, 'north-test');

assert.equal((host.innerHTML.match(/class="p-row ce/g) || []).length, 16);
assert.equal((host.innerHTML.match(/class="p-row fate/g) || []).length, 11);
assert.equal((host.innerHTML.match(/class="p-row pot/g) || []).length, 2);
assert.match(host.innerHTML, /The Forked Tower: Magic/);
assert.doesNotMatch(host.innerHTML, /The Forked Tower: Magic \(Extreme\)/);
assert.ok(
  host.innerHTML.indexOf('The Forked Tower: Magic') < host.innerHTML.indexOf('Many Mouths to Feed'),
  'North Horn tower must be the first CE row',
);
assert.match(host.innerHTML, /Thunderregnum/);
assert.match(host.innerHTML, /In a Pot of Bother \(South\)/);
assert.match(host.innerHTML, /title="Weakness: Ice"/);
assert.match(host.innerHTML, /alt="Ice"/);
assert.match(host.innerHTML, /data-monster-image="assets\/trigger-monsters\/49\.png"/);
assert.match(host.innerHTML, />▸ Crescent Wamoura<\/button>/);
assert.doesNotMatch(host.innerHTML, /src="assets\/trigger-monsters\/49\.png"/, 'monster location images must load on demand');

const current = Math.floor(Date.now() / 1000);
assert.equal(
  sandbox.OC.UI.historyAlive(
    { state: 0, spawn_time: current - 100, death_time: current - 200, last_seen: current - 200 },
    { lastUpdate: current },
  ),
  false,
  'stale inverted timestamps must not highlight a FATE row',
);
assert.equal(
  sandbox.OC.UI.historyAlive(
    { state: 0, spawn_time: current - 100, death_time: current - 200, last_seen: current },
    { lastUpdate: current },
  ),
  true,
  'a current observation must still recover a new cycle after clock inversion',
);
const towerHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(towerHost, {
  territory: 1346,
  lastUpdate: current,
  ce: [
    { fate_id: 49, spawn_time: current - 60, death_time: -1, last_seen: current },
    {
      fate_id: 64,
      spawn_time: current - 4800,
      death_time: current - 1200,
      last_seen: current - 1200,
      killed_ces: 2,
      killed_fates: 3,
      respawn_times: [3600, 3300],
    },
  ],
  fate: [{ fate_id: 2074, spawn_time: current - 30, death_time: -1, last_seen: current }],
  pot: [],
}, 'tower-test');
assert.match(towerHost.innerHTML, /Predicted/);
assert.match(towerHost.innerHTML, /Reduced 13:00 · CE×2 \/ FATE×3/);
assert.match(towerHost.innerHTML, /More after completion CE -5:00 \/ FATE -1:00/);
assert.match(towerHost.innerHTML, /Previous intervals 1:00:00 \/ 55:00/);

const activeTowerHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(activeTowerHost, {
  territory: 1346,
  lastUpdate: current,
  ce: [{
    fate_id: 64,
    spawn_time: 0,
    death_time: 0,
    last_seen: current,
    state: 3,
    killed_ces: 6,
    killed_fates: 20,
  }],
  fate: [],
  pot: [],
}, 'active-tower-test');
assert.match(activeTowerHost.innerHTML, /class="p-row ce alive tower"/);
assert.match(activeTowerHost.innerHTML, />● Active<\/span>/);
assert.doesNotMatch(activeTowerHost.innerHTML, /Predicted/, 'an active tracker state must replace the stale tower ETA');

currentLang = 'zh';
assert.match(sandbox.OC.UI.weaknessIcons(['fire']), /title="弱点: 火"/);
assert.match(sandbox.OC.UI.weaknessIcons(['fire']), /alt="火"/);
const southHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(southHost, {
  territory: 1252,
  lastUpdate: 100,
  ce: [{ fate_id: 33, spawn_time: 100, death_time: -1, last_seen: 100 }],
  fate: [],
  pot: [],
}, 'south-test');
assert.match(southHost.innerHTML, /data-monster-image="assets\/trigger-monsters\/33\.png"/);
assert.match(southHost.innerHTML, />▸ 新月鬼鱼<\/button>/);
assert.ok(
  southHost.innerHTML.indexOf('两歧塔 力之塔') < southHost.innerHTML.indexOf('脑髓爱好者—夺心魔'),
  'South Horn tower must be the first CE row',
);
assert.doesNotMatch(southHost.innerHTML, /class="weaknesses"/, 'South Horn rows must not gain unverified weaknesses');
assert.doesNotMatch(southHost.innerHTML, /src="assets\/trigger-monsters\/33\.png"/, 'south monster location images must load on demand');

const locatingHost = { innerHTML: '' };
sandbox.OC.UI.renderBattlePanel(locatingHost, null, null, true);
assert.match(locatingHost.innerHTML, />locating</);
assert.doesNotMatch(locatingHost.innerHTML, />loading</);

const overviewHost = { innerHTML: '', querySelectorAll() { return []; } };
sandbox.OC.Pots.respawnSec = 1800;
sandbox.OC.UI.renderDcPots(overviewHost, [{
  id: 'stale',
  dc: 103,
  alive: false,
  nextEpoch: current,
  etaSec: 0,
  anchorEpoch: current - 1800,
  side: 'north',
}], false);
assert.doesNotMatch(overviewHost.innerHTML, /class="dc-row/, 'an expired ETA must disappear immediately');
assert.doesNotMatch(overviewHost.innerHTML, /pot_soon/, 'an expired ETA must not be shown as soon');

const guideClasses = new Set(['hidden']);
const guideHost = {
  innerHTML: '',
  classList: {
    add(name) { guideClasses.add(name); },
    remove(name) { guideClasses.delete(name); },
    toggle(name, enabled) { if (enabled) guideClasses.add(name); else guideClasses.delete(name); },
  },
};
currentLang = 'en';
sandbox.OC.UI.renderTreasureGuide(guideHost, {
  active: true,
  mode: 'reroll',
  status: 'guiding',
  candidateCount: 3,
  safeCount: 0,
  lastDirection: '正东',
  target: { bearing: 73.2, directionKey: 'east', distance: 42.4, dangerous: true },
});
assert.equal(guideClasses.has('hidden'), false);
assert.equal(guideClasses.has('danger'), true);
assert.match(guideHost.innerHTML, /Reroll coffer/);
assert.match(guideHost.innerHTML, /data-treasure-close/);
assert.match(guideHost.innerHTML, /aria-label="Close"/);
assert.match(guideHost.innerHTML, />East</);
assert.match(guideHost.innerHTML, /transform:rotate\(73\.2deg\)/, 'the arrow must use the exact live bearing');
assert.match(guideHost.innerHTML, />↑<\/span>/);
assert.match(guideHost.innerHTML, /42\.4 m/);
assert.match(guideHost.innerHTML, /Only dangerous points remain/);

sandbox.OC.UI.renderTreasureGuide(guideHost, { active: true, dismissed: true });
assert.equal(guideClasses.has('hidden'), true, 'manual close must hide only the guide window');
assert.equal(guideHost.innerHTML, '');

const routeClasses = new Set(['hidden']);
const routeHost = {
  innerHTML: '',
  classList: {
    add(name) { routeClasses.add(name); },
    remove(name) { routeClasses.delete(name); },
  },
};
sandbox.OC.UI.renderRouteGuide(routeHost, {
  active: true,
  supported: true,
  complete: false,
  status: 'ready',
  progress: 4,
  visited: 3,
  total: 68,
  target: {
    routeNumber: 17,
    bearing: 73.2,
    directionKey: 'east',
    distance: 42.4,
    layerKey: 'subterrane',
    mapId: 1244,
  },
});
assert.equal(routeClasses.has('hidden'), false);
assert.match(routeHost.innerHTML, /Treasure Patrol/);
assert.match(routeHost.innerHTML, /4 \/ 68/);
assert.match(routeHost.innerHTML, /class="tg-head"/);
assert.match(routeHost.innerHTML, /class="tg-route"/);
assert.match(routeHost.innerHTML, /class="tg-arrow"/);
assert.match(routeHost.innerHTML, /class="tg-destination"/);
assert.match(routeHost.innerHTML, /class="tg-meta">Route point 17 · Subterrane</);
assert.match(routeHost.innerHTML, /data-route-close/);
assert.match(routeHost.innerHTML, /transform:rotate\(73\.2deg\)/, 'the patrol arrow must use the exact live bearing');
assert.match(routeHost.innerHTML, />East</);
assert.match(routeHost.innerHTML, /42\.4 m/);
assert.match(routeHost.innerHTML, /Next point is on Subterrane/, 'a cross-layer target must show a map transition hint');
assert.match(routeHost.innerHTML, /data-route-action="previous"/);
assert.match(routeHost.innerHTML, /data-route-action="restart"/);
assert.match(routeHost.innerHTML, /data-route-action="next"/);

sandbox.OC.UI.renderRouteGuide(routeHost, {
  active: true,
  supported: true,
  complete: true,
  progress: 68,
  visited: 68,
  total: 68,
  target: null,
});
assert.match(routeHost.innerHTML, /All coffer points visited/);
assert.match(routeHost.innerHTML, /data-route-action="next" disabled/);

sandbox.OC.UI.renderRouteGuide(routeHost, { active: false });
assert.equal(routeClasses.has('hidden'), true, 'closing patrol guidance must hide only its guide window');
assert.equal(routeHost.innerHTML, '');

console.log('ui tests passed');
