const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let writes = 0;
let markup = '';
const activeBox = {
  get innerHTML() {
    return markup;
  },
  set innerHTML(value) {
    writes += 1;
    markup = value;
  },
};

let showActiveChips = true;
let alertAllEncounters = false;
let alertTower = false;
let alertPot = false;
let alertColors = {};
let currentLanguage = 'en';
let currentDataRegion = 'global';
const sandbox = {
  console,
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById(id) {
      return id === 'chips-active' ? activeBox : null;
    },
  },
  OC: {
    CES: {
      49: { name: { en: 'Test CE' }, drops: [50974] },
      64: { name: { en: 'Test Tower' }, drops: [], type: 'tower' },
    },
    FATES: {
      2074: { name: { en: 'Test FATE' }, drops: [50974] },
    },
    POTS: {
      2072: { name: { en: 'Test Pot' }, side: 'north', territory: 1346, drops: [50974] },
    },
    TERRITORIES: {
      1346: { towerId: 64 },
    },
    ITEMS: {
      47744: { name: { en: 'Test Demiatma 1' } },
      47745: { name: { en: 'Test Demiatma 2' } },
      47746: { name: { en: 'Test Demiatma 3' } },
      47747: { name: { en: 'Test Demiatma 4' } },
      47748: { name: { en: 'Test Demiatma 5' } },
      47749: { name: { en: 'Test Demiatma 6' } },
      50974: { name: { en: 'Test Dispeller' } },
      50975: { name: { en: 'Test Dispeller Beta' } },
      50976: { name: { en: 'Test Dispeller Gamma' } },
    },
    Overlay: {
      territoryId: 1346,
      playerDc: 103,
      connected: true,
      inOccult: true,
      memActive: {},
    },
    MAP: {
      territory: 1346,
    },
    Map: {
      updateHighlights() {},
    },
    Pots: {
      merge(shared, local) {
        sandbox._lastPotMerge = {
          shared: Array.from(shared || []),
          local: Array.from(local || []),
        };
        return (shared || []).concat(local || []);
      },
      status(entries) {
        if (!entries || !entries.length) return null;
        const entry = entries[entries.length - 1];
        return {
          alive: entry.death_time <= 0 || entry.death_time < entry.spawn_time,
          nextEpoch: entry.spawn_time + 1800,
          etaSec: 1800,
          side: entry.fate_id === 2072 ? 'north' : 'south',
        };
      },
    },
    Settings: {
      get(key) {
        if (key === 'showActiveChips') return showActiveChips;
        if (key === 'alertAllEncounters') return alertAllEncounters;
        if (key === 'alertTower') return alertTower;
        if (key === 'alertPot') return alertPot;
        if (key === 'alertColors') return alertColors;
        if (key === 'lang') return currentLanguage;
        if (key === 'dataRegion') return currentDataRegion;
        return null;
      },
      set(key, value) {
        if (key === 'lang') currentLanguage = value;
        if (key === 'dataRegion') currentDataRegion = value;
        if (key === 'alertTower') alertTower = value;
      },
      getRaw(key) {
        if (key === 'lang') return currentLanguage;
        return null;
      },
    },
    UI: {
      esc(value) {
        return String(value);
      },
      rewardSuffix() {
        return '';
      },
    },
    i18n: {
      t(key) {
        return { notify_ce: 'CE', notify_fate: 'FATE', notify_pot: 'Pot' }[key] || key;
      },
    },
    localName(value) {
      return value.en;
    },
  },
};
sandbox.window = sandbox;

for (const file of ['../js/history.js', '../js/main.js']) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: file });
}

assert.equal(sandbox.OC.App.displayScale(1024, 600, 1), 0.9);
assert.equal(sandbox.OC.App.displayScale(1093, 614, 1.25), 0.9);
assert.equal(sandbox.OC.App.displayScale(1280, 720, 1), 0.95);
assert.equal(sandbox.OC.App.displayScale(1366, 768, 1), 0.95);
assert.equal(sandbox.OC.App.displayScale(1920, 1080, 1), 1);
assert.equal(sandbox.OC.App.displayScale(3840, 2160, 1), 1.5);
assert.equal(sandbox.OC.App.displayScale(3072, 1728, 1.25), 1, 'OS DPI scaling must not be applied twice');
assert.equal(sandbox.OC.App.effectiveUiScale(1, 3840, 2160, 1), 1.5);
assert.equal(sandbox.OC.App.effectiveUiScale(2, 3840, 2160, 1), 2, 'combined scaling must remain bounded');
assert.equal(sandbox.OC.App.effectiveUiScale(0.8, 1024, 600, 1), 0.8, 'small-screen scaling must remain readable');
for (let i = 0; i < 100; i += 1) {
  const delay = sandbox.OC.App.trackerCheckDelayMs();
  assert.ok(delay >= 2500 && delay < 4000, 'tracker lookup jitter must stay within the upstream range');
}

const towerProgress = {
  fate_id: 64,
  spawn_time: -1,
  death_time: -1,
  last_seen: -1,
  state: 0,
  killed_ces: 0,
  killed_fates: 0,
};
sandbox.OC.App._island = { ce: [towerProgress], fate: [], pot: [] };
assert.equal(sandbox.OC.App.recordTowerCompletion(49), true);
const firstPendingTowerProgress = sandbox.OC.App._pendingTowerProgress;
assert.equal(sandbox.OC.App.recordTowerCompletion(2074), true);
assert.notEqual(
  sandbox.OC.App._pendingTowerProgress,
  firstPendingTowerProgress,
  'a later completion must not mutate the tower progress captured by an in-flight upload',
);
assert.equal(sandbox.OC.App.recordTowerCompletion(2072), true);
let towerUpload = sandbox.OC.App.localTrackerHistory([64], sandbox.OC.App._island.ce)[0];
assert.equal(towerUpload.killed_ces, 1, 'a completed CE must reduce the normal tower timer');
assert.equal(towerUpload.killed_fates, 2, 'FATEs and pots must share the one-minute reduction counter');
sandbox.OC.App._island = { ce: [{ ...towerProgress }], fate: [], pot: [] };
towerUpload = sandbox.OC.App.localTrackerHistory([64], sandbox.OC.App._island.ce)[0];
assert.equal(towerUpload.killed_ces, 1, 'a tracker refresh must not discard a pending tower reduction');
assert.equal(towerUpload.killed_fates, 2, 'pending FATE reductions must also survive a tracker refresh');
sandbox.OC.Overlay.memActive = { 64: true };
assert.equal(sandbox.OC.App.recordTowerCompletion(49), false, 'encounters during an active tower must not reduce its next cycle');
sandbox.OC.Overlay.memActive = {};
sandbox.OC.App._island.ce[0].state = 3;
sandbox.OC.App._island.ce[0].last_seen = Math.floor(Date.now() / 1000);
sandbox.OC.App._island.lastUpdate = sandbox.OC.App._island.ce[0].last_seen;
assert.equal(sandbox.OC.App.recordTowerCompletion(2074), false, 'shared active tower state must also block reductions');
sandbox.OC.App._island.ce[0].state = 0;
assert.equal(sandbox.OC.App.recordTowerCompletion(64), true);
towerUpload = sandbox.OC.App.localTrackerHistory([64], sandbox.OC.App._island.ce)[0];
assert.equal(towerUpload.killed_ces, 0, 'North Horn tower completion must reset CE reductions');
assert.equal(towerUpload.killed_fates, 0, 'North Horn tower completion must reset FATE reductions');
sandbox.OC.App._island.ce[0].state = 3;
assert.equal(sandbox.OC.App.recordTowerCompletion(2074), true, 'a completed tower must override stale shared active state');
towerUpload = sandbox.OC.App.localTrackerHistory([64], sandbox.OC.App._island.ce)[0];
assert.equal(towerUpload.killed_fates, 1, 'events after tower completion must count toward the new cycle');
sandbox.OC.Overlay.memMeta = {
  64: { active: false, spawnEpoch: 100, spawnTrusted: true, deathEpoch: 200, lastSeen: 200 },
};
towerUpload = sandbox.OC.App.localTrackerHistory([64], [{ ...towerProgress, state: 3, spawn_time: 100 }])[0];
assert.equal(towerUpload.state, 0, 'a local North Horn tower removal must clear stale shared active state');
sandbox.OC.App._island = null;
sandbox.OC.App._pendingTowerProgress = null;
sandbox.OC.Overlay.memMeta = {};
const ceDeadline = 1785643097;
sandbox.OC.Overlay.memMeta = {
  49: {
    active: true,
    ceStatus: 2,
    cePopTime: ceDeadline,
    lastSeen: ceDeadline - 10,
  },
};
const ceUpload = sandbox.OC.App.localTrackerHistory(
  [49],
  [{ fate_id: 49, state: 1, pop_time: ceDeadline - 60, spawn_time: -1, death_time: -1 }],
)[0];
assert.equal(ceUpload.state, 2);
assert.equal(ceUpload.pop_time, ceDeadline, 'CE phase deadline must be uploaded separately from spawn_time');
assert.equal(ceUpload.spawn_time, -1, 'CE phase deadline must never overwrite spawn_time');
sandbox.OC.Overlay.memMeta = {};
delete sandbox.OC.Overlay.playerDc;
assert.equal(sandbox.OC.App.showsCnDcOverview(), false);
assert.deepEqual(Array.from(sandbox.OC.App.trackerDatacenters()), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
assert.equal(sandbox.OC.App.isDatacenterInScope(3), true);
assert.equal(sandbox.OC.App.isDatacenterInScope(103), false);
sandbox.OC.Overlay.playerDc = 103;
assert.deepEqual(Array.from(sandbox.OC.App.trackerDatacenters()), [101, 102, 103, 104]);
assert.equal(sandbox.OC.App.isDatacenterInScope(103), true, 'detected CN DC must override a fresh origin setting');
currentLanguage = 'zh';
assert.equal(sandbox.OC.App.showsCnDcOverview(), false, 'language alone must not change the data region');
currentDataRegion = 'cn';
assert.equal(sandbox.OC.App.showsCnDcOverview(), true);
assert.deepEqual(Array.from(sandbox.OC.App.trackerDatacenters()), [101, 102, 103, 104]);
assert.equal(sandbox.OC.App.isDatacenterInScope(103), true);
assert.equal(sandbox.OC.App.isDatacenterInScope(3), false);
sandbox.OC.Overlay.playerDc = 3;
assert.deepEqual(Array.from(sandbox.OC.App.trackerDatacenters()), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
assert.equal(sandbox.OC.App.isDatacenterInScope(3), true, 'detected global DC must override the saved CN overview setting');
delete sandbox.OC.Overlay.playerDc;
currentLanguage = 'en';
assert.equal(sandbox.OC.App.showsCnDcOverview(), true, 'the selected data region must survive language changes');
currentDataRegion = 'global';

const originalRegionHandlers = {
  resetIsland: sandbox.OC.App.resetIsland,
  refreshRail: sandbox.OC.App.refreshRail,
  updateChips: sandbox.OC.App.updateChips,
  fetchDc: sandbox.OC.App.fetchDc,
};
const regionActions = [];
sandbox.OC.App.resetIsland = preserveLocal => regionActions.push(['reset', preserveLocal]);
sandbox.OC.App.refreshRail = () => regionActions.push(['rail']);
sandbox.OC.App.updateChips = () => regionActions.push(['chips']);
sandbox.OC.App.fetchDc = throttled => regionActions.push(['fetch', throttled]);
sandbox.OC.App.changeDataRegion('cn');
assert.equal(currentDataRegion, 'cn');
assert.deepEqual(regionActions, [['reset', true], ['rail'], ['chips'], ['fetch', true]]);
Object.assign(sandbox.OC.App, originalRegionHandlers);
currentDataRegion = 'global';

let detectedHostLanguage = null;
let appliedLanguageMode = null;
const originalChangeLanguage = sandbox.OC.App.changeLanguage;
sandbox.OC.Settings.setSystemLanguage = language => {
  detectedHostLanguage = language;
  return true;
};
sandbox.OC.App.changeLanguage = mode => { appliedLanguageMode = mode; };
currentLanguage = 'auto';
assert.equal(sandbox.OC.App.applySystemLanguage('Japanese'), true);
assert.equal(detectedHostLanguage, 'Japanese');
assert.equal(appliedLanguageMode, 'auto');
currentLanguage = 'en';
appliedLanguageMode = null;
assert.equal(sandbox.OC.App.applySystemLanguage('Japanese'), false, 'ACT language must not override an explicit UI language');
assert.equal(appliedLanguageMode, null);
sandbox.OC.App.changeLanguage = originalChangeLanguage;
delete sandbox.OC.Settings.setSystemLanguage;

const styles = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');
const activeChipRule = styles.match(/\.chip\.chip-act\s*\{([^}]*)\}/);
assert.ok(activeChipRule, 'active capsule style must exist');
assert.match(activeChipRule[1], /backdrop-filter:\s*none/);
assert.match(activeChipRule[1], /background:\s*rgb\(14,\s*20,\s*30\)/);

const resizeAnchorRule = styles.match(/\.resize-anchor\s*\{([^}]*)\}/);
assert.ok(resizeAnchorRule, 'ACT resize anchors must exist');
assert.match(resizeAnchorRule[1], /width:\s*16px/);
assert.match(resizeAnchorRule[1], /height:\s*16px/);
assert.match(resizeAnchorRule[1], /rgba\(0,\s*0,\s*0,\s*0\.01\)/, 'resize anchors must paint a nonzero alpha');
assert.match(resizeAnchorRule[1], /pointer-events:\s*none/, 'resize anchors must not block overlay controls');
const resizeAnchorsRule = styles.match(/\.resize-anchors\s*\{([^}]*)\}/);
assert.ok(resizeAnchorsRule, 'ACT resize anchor layer must exist');
assert.match(resizeAnchorsRule[1], /position:\s*fixed/);
assert.match(resizeAnchorsRule[1], /inset:\s*0/, 'resize anchors must follow every viewport resize');
assert.match(resizeAnchorsRule[1], /pointer-events:\s*none/, 'resize anchor layer must not block overlay controls');
const index = fs.readFileSync(require.resolve('../index.html'), 'utf8');
assert.equal((index.match(/class="resize-anchor /g) || []).length, 4, 'all four ACT resize corners must remain hit-testable');
assert.match(index, /js\/treasure\.js\?v=100/, 'the treasure state machine must load in the overlay');
assert.ok(index.indexOf('data/mapPoints.js?v=100') < index.indexOf('js/treasure.js?v=100'), 'treasure points must load before guidance');

sandbox.OC.State.highlights = [49, 64, 2074];
sandbox.OC.App.updateActive();
assert.equal(writes, 1);
assert.match(markup, /Test CE/);
assert.match(markup, /Test FATE/);
assert.doesNotMatch(markup, /Test Tower/, 'Forked Towers must not appear in the active CE overview');

sandbox.OC.App.updateActive();
assert.equal(writes, 1, 'unchanged capsules must keep their DOM nodes');

sandbox.OC.State.highlights = [49];
sandbox.OC.App.updateActive();
assert.equal(writes, 2, 'a real state change must update the capsules');

showActiveChips = false;
sandbox.OC.App.updateActive();
assert.equal(writes, 3);
assert.equal(markup, '');

sandbox.OC.App.updateActive();
assert.equal(writes, 3, 'the hidden state must not be rewritten every tick');

showActiveChips = true;
alertTower = true;
sandbox.OC.State.highlights = [64];
sandbox.OC.App.updateActive();
assert.match(markup, /Test Tower/, 'the tower option must show active Forked Tower capsules');
alertTower = false;
sandbox.OC.State.highlights = [];
sandbox.OC.App._highlightMissingSince = {};
sandbox.OC.Overlay.memActive = { 2074: true };
const trackerNow = Math.floor(Date.now() / 1000);
sandbox.OC.App._island = {
  lastUpdate: trackerNow,
  ce: [{ fate_id: 49, spawn_time: 100, death_time: -1, last_seen: trackerNow }],
  fate: [{ fate_id: 2074, spawn_time: 100, death_time: -1, last_seen: trackerNow }],
  pot: [{ fate_id: 2072, spawn_time: 100, death_time: -1, last_seen: trackerNow }],
};
sandbox.OC.App.refreshHighlights();
assert.deepEqual(
  Array.from(sandbox.OC.State.highlights),
  [49, 2074],
  'connected North Horn must merge strict-island cloud CE when CEDirector is unavailable',
);
sandbox.OC.State.highlights = [];
sandbox.OC.App._highlightMissingSince = {};
sandbox.OC.Overlay.memActive = {};
sandbox.OC.App._island = {
  lastUpdate: trackerNow,
  ce: [{ fate_id: 64, spawn_time: 0, death_time: 0, last_seen: trackerNow, state: 3 }],
  fate: [],
  pot: [],
};
sandbox.OC.App.refreshHighlights();
assert.deepEqual(
  Array.from(sandbox.OC.State.highlights),
  [64],
  'a non-inactive tracker state must mark a Forked Tower active without spawn_time',
);
sandbox.OC.State.highlights = [49, 2074];
sandbox.OC.App._highlightMissingSince = {};
sandbox.OC.Overlay.memActive = {};
sandbox.OC.App._island = { ce: [], fate: [], pot: [] };
sandbox.OC.App.updateActive();
const writesBeforeTransientDrop = writes;
sandbox.OC.App.refreshHighlights();
assert.deepEqual(
  Array.from(sandbox.OC.State.highlights),
  [49, 2074],
  'one missing director/cloud sample must not remove active capsules',
);
assert.equal(writes, writesBeforeTransientDrop, 'a transient drop must not rebuild active capsules');
sandbox.OC.Overlay.memActive = { 2074: true };
sandbox.OC.App._island = {
  lastUpdate: trackerNow,
  ce: [{ fate_id: 49, spawn_time: 100, death_time: -1, last_seen: trackerNow }],
  fate: [],
  pot: [],
};
sandbox.OC.App.refreshHighlights();
assert.deepEqual(Array.from(sandbox.OC.State.highlights), [49, 2074]);
sandbox.OC.Overlay.memActive = {};
sandbox.OC.App._island = { ce: [], fate: [], pot: [] };
sandbox.OC.App._highlightMissingSince = {
  49: Date.now() - 7001,
  2074: Date.now() - 7001,
};
sandbox.OC.App.refreshHighlights();
assert.deepEqual(
  Array.from(sandbox.OC.State.highlights),
  [],
  'a continuously absent encounter must disappear after the grace period',
);

sandbox.OC.Overlay.memActive = { 2074: true };
sandbox.OC.App._island = {
  lastUpdate: trackerNow,
  ce: [{ fate_id: 49, spawn_time: 100, death_time: -1, last_seen: trackerNow }],
  fate: [{ fate_id: 2074, spawn_time: 100, death_time: -1, last_seen: trackerNow }],
  pot: [{ fate_id: 2072, spawn_time: 100, death_time: -1, last_seen: trackerNow }],
};
sandbox.OC.App.refreshHighlights();
sandbox.OC.Overlay.connected = false;
sandbox.OC.App.refreshHighlights();
assert.deepEqual(
  Array.from(sandbox.OC.State.highlights).sort((a, b) => a - b),
  [49, 2072, 2074],
  'disconnected mode may use every shared active event',
);

const cloudPot = { fate_id: 2072, spawn_time: 100, death_time: 110, last_seen: 110 };
const originalInstanceEvidence = sandbox.OC.App.instanceEvidence;
const originalTrackerContext = sandbox.OC.App.trackerContext;
const strictFateHistory = [
  { fate_id: 2074, spawn_time: 1000, death_time: 1100, last_seen: 1100 },
  { fate_id: 2075, spawn_time: 1200, death_time: 1300, last_seen: 1300 },
  { fate_id: 2076, spawn_time: 800, death_time: 900, last_seen: 900 },
];
const strictEvidence = {
  fingerprint: 'CURRENT-INSTANCE',
  fingerprints: ['CURRENT-INSTANCE'],
  events: [{ fateId: 2074, spawnEpoch: 1000 }],
  ends: [{ fateId: 2075, deathEpoch: 1300 }, { fateId: 2076, deathEpoch: 900 }],
};
const ceBindingStatus = sandbox.OC.App.islandBindingEvidenceStatus(
  { cePhases: [{ fateId: 49, status: 2, popTime: ceDeadline }], events: [], ends: [] },
  { ce: [{ fate_id: 49, state: 2, pop_time: ceDeadline }], fate: [], pot: [] },
  '',
);
assert.equal(ceBindingStatus.ceMatched, 1);
assert.equal(ceBindingStatus.authorized, true, 'one unique CE phase signature must authorize a binding');
const exactBindingStatus = sandbox.OC.App.islandBindingEvidenceStatus(
  {
    fingerprint: 'EXACT-FATE',
    fingerprintQuality: 'exact',
    events: [{ fateId: 2074, spawnEpoch: 1000, quality: 'exact' }],
    ends: [],
  },
  { ce: [], fate: [{ fate_id: 2074, spawn_time: 1000 }], pot: [] },
  'EXACT-FATE',
);
assert.equal(exactBindingStatus.authorized, true, 'one real StartTimeEpoch fingerprint must authorize a binding');
assert.equal(
  sandbox.OC.App.localEvidenceReadyForCreation({ fingerprintQuality: 'exact', events: [] }),
  true,
  'one real StartTimeEpoch may create a missing tracker after the normal retry',
);
sandbox.OC.FATES[2075] = { name: { en: 'Second Test FATE' }, drops: [] };
const strongBindingStatus = sandbox.OC.App.islandBindingEvidenceStatus(
  {
    events: [
      { fateId: 2074, spawnEpoch: 1000, quality: 'direct' },
      { fateId: 2075, spawnEpoch: 1200, quality: 'direct' },
    ],
    ends: [],
  },
  {
    ce: [],
    fate: [
      { fate_id: 2074, spawn_time: 1000 },
      { fate_id: 2075, spawn_time: 1200 },
    ],
    pot: [],
  },
  '',
);
assert.equal(strongBindingStatus.strongMatched, 2);
assert.equal(strongBindingStatus.preciseMatched, 2);
assert.equal(strongBindingStatus.authorized, true, 'two post-baseline direct FATE Adds must authorize a binding');
assert.equal(
  sandbox.OC.App.localEvidenceReadyForCreation({
    events: [{ fateId: 2074, quality: 'direct' }, { fateId: 2075, quality: 'direct' }],
  }),
  true,
  'two post-baseline direct FATE Adds may create a missing tracker',
);
const mixedPreciseBindingStatus = sandbox.OC.App.islandBindingEvidenceStatus(
  {
    events: [{ fateId: 2074, spawnEpoch: 1000, quality: 'direct' }],
    ends: [{ fateId: 2075, deathEpoch: 1300, quality: 'direct' }],
  },
  {
    ce: [],
    fate: [
      { fate_id: 2074, spawn_time: 1000 },
      { fate_id: 2075, death_time: 1300 },
    ],
    pot: [],
  },
  '',
);
assert.equal(mixedPreciseBindingStatus.strongMatched, 1);
assert.equal(mixedPreciseBindingStatus.preciseMatched, 2);
assert.equal(
  mixedPreciseBindingStatus.authorized,
  true,
  'one direct Add plus one different FATE Remove must authorize a binding',
);
sandbox.OC.App._island = { ce: [], fate: strictFateHistory, pot: [cloudPot] };
sandbox.OC.App._dc = [{ rowId: 1, potHistory: [cloudPot] }];
sandbox.OC.App.myIslandRowId = 1;
sandbox.OC.App.myIslandFingerprint = 'CURRENT-INSTANCE';
sandbox.OC.App.myIslandDatacenter = 103;
sandbox.OC.App.myIslandTerritory = 1346;
sandbox.OC.App.instanceEvidence = () => strictEvidence;
sandbox.OC.App._previewIsland = null;
sandbox.OC.App._localPot = null;
sandbox.OC.Overlay.territoryId = 1346;
sandbox.OC.Overlay.playerDc = 103;
assert.notEqual(sandbox.OC.App.localPotInfo(), null);
assert.equal(sandbox._lastPotMerge.shared.length, 1, 'North Horn accepts strict-island cloud pot history');
assert.equal(sandbox._lastPotMerge.shared[0].death_time, cloudPot.death_time);

sandbox.OC.App.myIslandFingerprint = 'BOUND-WITHIN-WINDOW';
sandbox.OC.App.instanceEvidence = () => ({
  fingerprint: 'LOCAL-EXACT',
  fingerprints: ['LOCAL-EXACT', 'BOUND-WITHIN-WINDOW'],
  events: strictEvidence.events,
  ends: strictEvidence.ends,
});
assert.notEqual(
  sandbox.OC.App.localPotInfo(),
  null,
  'a strictly matched fingerprint within the local Add tolerance window must authorize the countdown',
);
sandbox.OC.App.instanceEvidence = () => strictEvidence;
sandbox.OC.App.myIslandFingerprint = 'CURRENT-INSTANCE';

sandbox.OC.App.instanceEvidence = () => ({
  fingerprint: 'CURRENT-INSTANCE',
  fingerprints: ['CURRENT-INSTANCE'],
  events: [{ fateId: 2074, spawnEpoch: 1000 }, { fateId: 2082, spawnEpoch: 1400 }],
  ends: [],
});
sandbox.OC.App.myIslandRowId = null;
assert.equal(
  sandbox.OC.App.localPotInfo(),
  null,
  'one coincidental FATE match must not authorize an unbound island pot prediction',
);
sandbox.OC.App.myIslandRowId = 1;
sandbox.OC.App.instanceEvidence = () => strictEvidence;

sandbox.OC.App._island = { ce: [], fate: strictFateHistory.slice(0, 2), pot: [cloudPot] };
assert.equal(
  sandbox.OC.App.localPotInfo(),
  null,
  'a bound row with only two accumulated matches must not authorize a cloud prediction',
);
sandbox.OC.App._island = { ce: [], fate: strictFateHistory, pot: [cloudPot] };

sandbox.OC.App._localPot = { 2072: { active: true, lastSeen: 120 } };
const updateOnlyPot = sandbox.OC.App.localPotInfo();
assert.equal(updateOnlyPot.alive, true);
assert.equal(updateOnlyPot.side, 'north');
assert.equal(updateOnlyPot.nextEpoch, 1900);
assert.equal(updateOnlyPot.etaSec, 1800);
assert.equal(updateOnlyPot.local, true, 'a strict-island cloud spawn may anchor a local Update');

sandbox.OC.App._localPot = { 2072: { active: false, spawnEpoch: 100, deathEpoch: 110, lastSeen: 110 } };
assert.equal(sandbox.OC.App.localPotInfo().side, 'north');
assert.equal(sandbox._lastPotMerge.local.length, 1, 'an exact local Add must drive North Horn timing');

sandbox.OC.App._island = {
  ce: [],
  fate: strictFateHistory,
  pot: [{ fate_id: 2072, spawn_time: Math.floor(Date.now() / 1000) - 300, death_time: -1, last_seen: Math.floor(Date.now() / 1000) - 60 }],
};
sandbox.OC.App._localPot = null;
sandbox.OC.Overlay.connected = true;
sandbox.OC.Overlay.inOccult = true;
const staleCloudPot = sandbox.OC.App.localPotInfo();
assert.equal(staleCloudPot.alive, false, 'local director absence must close a stale cloud pot');
assert.ok(
  sandbox._lastPotMerge.shared[0].death_time >= sandbox._lastPotMerge.shared[0].spawn_time,
  'the stale cloud record must be treated as ended without mutating the source',
);
assert.equal(sandbox.OC.App._island.pot[0].death_time, -1);
const closedForUpload = sandbox.OC.App.localTrackerHistory(
  [2072],
  sandbox.OC.App._island.pot,
  true,
);
assert.ok(
  closedForUpload[0].death_time >= closedForUpload[0].spawn_time,
  'a completed local snapshot must close the stale pot before the next upload',
);

sandbox.OC.App._island = null;
sandbox.OC.App._dcRows = [{
  id: 1,
  fate_history: JSON.stringify(strictFateHistory),
  pot_history: JSON.stringify([cloudPot]),
}];
sandbox.OC.App._dc = [{ rowId: 1, potHistory: [cloudPot] }];
sandbox.OC.App._localPot = null;
assert.notEqual(sandbox.OC.App.localPotInfo(), null);
assert.equal(sandbox._lastPotMerge.shared.length, 1);
assert.equal(
  sandbox._lastPotMerge.shared[0].death_time,
  cloudPot.death_time,
  'a strict ID match must expose the cached ETA without waiting for another row fetch',
);

sandbox.OC.App.myIslandFingerprint = 'PREVIOUS-FATE';
sandbox.OC.App.trackerContext = () => ({ fingerprint: 'CURRENT-INSTANCE' });
assert.equal(
  sandbox.OC.App.adoptTrustedFateContext(2074, 123456).fingerprint,
  'CURRENT-INSTANCE',
);
assert.equal(
  sandbox.OC.App.myIslandFingerprint,
  'CURRENT-INSTANCE',
  'a trusted new FATE must advance the fingerprint of an already bound island',
);
assert.notEqual(
  sandbox.OC.App.localPotInfo(),
  null,
  'the newly advanced fingerprint must keep the bound island countdown visible',
);
sandbox.OC.App.trackerContext = originalTrackerContext;

sandbox.OC.App.myIslandFingerprint = 'OTHER-INSTANCE';
assert.notEqual(
  sandbox.OC.App.localPotInfo(),
  null,
  'an already strict-bound island must keep its countdown while tracker fingerprints rotate',
);
sandbox.OC.App.myIslandFingerprint = 'CURRENT-INSTANCE';

sandbox.OC.Overlay.territoryId = 1252;
sandbox.OC.App.myIslandTerritory = 1252;
sandbox.OC.App._island = { ce: [], fate: strictFateHistory, pot: [cloudPot] };
assert.notEqual(sandbox.OC.App.localPotInfo(), null);
assert.equal(sandbox._lastPotMerge.shared.length, 1, 'South Horn keeps strict-island cloud fallback');

sandbox.OC.App._island = null;
sandbox.OC.App._dcRows = [];
sandbox.OC.App.myIslandRowId = null;
sandbox.OC.App.myIslandFingerprint = '';
sandbox.OC.App.myIslandDatacenter = 0;
sandbox.OC.App.myIslandTerritory = 0;
sandbox.OC.App._dc = [];
sandbox.OC.App._localPot = {
  2072: {
    active: false,
    spawnEpoch: Math.floor(Date.now() / 1000) - 60,
    deathEpoch: Math.floor(Date.now() / 1000) - 30,
    lastSeen: Math.floor(Date.now() / 1000) - 30,
  },
};
assert.notEqual(
  sandbox.OC.App.localPotInfo(),
  null,
  'a trusted local Add must provide timing without waiting for an island ID',
);
sandbox.OC.App._localPot = null;
sandbox.OC.App._previewIsland = { id: 'preview', rowId: 2, pot: [cloudPot] };
const previewPot = sandbox.OC.App.localPotInfo();
assert.equal(previewPot, null, 'an unconfirmed island must never provide a pot time');
sandbox.OC.App.instanceEvidence = originalInstanceEvidence;
alertPot = true;
let previewAlerted = false;
sandbox.OC.App.fireAlert = function () { previewAlerted = true; };
sandbox.OC.App.checkPotPreAlert();
assert.equal(previewAlerted, false, 'read-only preview must never emit a pot pre-alert');
sandbox.OC.App._previewIsland = null;
alertPot = false;

const alerts = [];
sandbox.OC.App.fireAlert = function (kind, message, key) {
  alerts.push({ kind, message, key });
};

sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(49);
sandbox.OC.App.alertEncounter(2074);
sandbox.OC.App.alertEncounter(2072);
sandbox.OC.App.alertEncounter(64);
assert.equal(alerts.length, 0, 'default filters must remain unchanged');

alertTower = true;
sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(64);
assert.deepEqual(alerts, [{ kind: 'ce', message: 'CE · Test Tower', key: 'spawn:64' }]);
alertTower = false;
alerts.length = 0;

alertAllEncounters = true;
sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(49);
sandbox.OC.App.alertEncounter(2074);
sandbox.OC.App.alertEncounter(2072);
assert.deepEqual(alerts.map((entry) => entry.kind), ['ce', 'fate', 'pot']);
assert.deepEqual(alerts.map((entry) => entry.message), [
  'CE · Test CE',
  'FATE · Test FATE',
  'Pot · Test Pot',
]);
sandbox.OC.App.alertEncounter(49);
assert.equal(alerts.length, 3, 'an active encounter must only be announced once');

sandbox.OC.Overlay.connected = true;
sandbox.OC.Overlay.inOccult = true;
sandbox.OC.App._island = { ce: [], fate: [], pot: [] };
sandbox.OC.App._alerted = {};
sandbox.OC.App.checkIslandAlerts({
  lastUpdate: trackerNow,
  ce: [{ fate_id: 49, spawn_time: 200, death_time: -1, last_seen: trackerNow }],
  fate: [{ fate_id: 2074, spawn_time: 200, death_time: -1, last_seen: trackerNow }],
  pot: [{ fate_id: 2072, spawn_time: 200, death_time: -1, last_seen: trackerNow }],
});
assert.deepEqual(
  alerts.slice(3).map((entry) => entry.kind),
  ['ce'],
  'strict-island cloud fallback must announce CE only while connected in-zone',
);

alertAllEncounters = false;
alertPot = true;
alertColors = { 50974: true };
sandbox.OC.App._alerted = {};
sandbox.OC.App.alertEncounter(49);
sandbox.OC.App.alertEncounter(2074);
sandbox.OC.App.alertEncounter(2072);
assert.deepEqual(alerts.slice(4).map((entry) => entry.message), [
  'Test CE · Test Dispeller',
  'Test FATE · Test Dispeller',
  'Test Pot',
]);

const settingsControls = {
  '#s-op': { value: '0.9', addEventListener() {} },
  '#s-scale': { value: '1', addEventListener() {} },
  '#s-chips': { checked: true, addEventListener() {} },
  '#s-repo': { addEventListener() {} },
};
const settingsPop = {
  innerHTML: '',
  querySelector(selector) {
    return settingsControls[selector] || null;
  },
  querySelectorAll() {
    return [];
  },
};
sandbox.OC.Overlay.territoryId = 1346;
sandbox.OC.App.renderSettings(settingsPop);
assert.match(settingsPop.innerHTML, /alert_tower/);
assert.match(settingsPop.innerHTML, /class="choice-grid lang-choice"/);
assert.match(settingsPop.innerHTML, /data-lang="auto" aria-pressed="false">lang_auto/);
assert.match(settingsPop.innerHTML, /class="choice-btn on" data-lang="en" aria-pressed="true">English/);
assert.match(settingsPop.innerHTML, /data-lang="ja" aria-pressed="false">日本語/);
assert.match(settingsPop.innerHTML, /class="choice-grid region-choice"/);
assert.match(settingsPop.innerHTML, /class="choice-btn on" data-data-region="global" aria-pressed="true">data_region_global/);
assert.doesNotMatch(settingsPop.innerHTML, /<select/);
assert.match(settingsPop.innerHTML, /alert_dispeller/);
assert.match(settingsPop.innerHTML, /Test Dispeller/);
assert.match(settingsPop.innerHTML, /Test Dispeller Beta/);
assert.match(settingsPop.innerHTML, /Test Dispeller Gamma/);
assert.doesNotMatch(settingsPop.innerHTML, /Test Demiatma/);

sandbox.OC.Overlay.territoryId = 1252;
sandbox.OC.App.renderSettings(settingsPop);
assert.match(settingsPop.innerHTML, /alert_demiatma/);
assert.match(settingsPop.innerHTML, /Test Demiatma 1/);
assert.doesNotMatch(settingsPop.innerHTML, /Test Dispeller/);

let shownIsland = null;
sandbox.OC.App.resolveMyIsland = function () { return 'mine'; };
sandbox.OC.App.myIslandRowId = 42;
sandbox.OC.App.showIsland = function (id, rowId) { shownIsland = { id, rowId }; };
sandbox.OC.App.showMyIsland();
assert.deepEqual(shownIsland, { id: 'mine', rowId: 42 });

let renderedLocating = false;
let fetchedForLocation = false;
const popover = {
  classList: { remove() {} },
};
sandbox.document.getElementById = function (id) {
  if (id === 'popover') return popover;
  if (id === 'chips-active') return activeBox;
  return null;
};
sandbox.OC.UI.renderBattlePanel = function (host, hist, id, locating) {
  assert.equal(host, popover);
  assert.equal(hist, null);
  assert.equal(id, null);
  renderedLocating = locating;
};
sandbox.OC.App.resolveMyIsland = function () { return null; };
sandbox.OC.App._previewIsland = { id: 'preview', rowId: 2, pot: [cloudPot] };
sandbox.OC.App.fetchDc = function (throttled) { fetchedForLocation = throttled; };
sandbox.OC.App.showMyIsland();
assert.equal(sandbox.OC.App.openPanel, 'battle');
assert.equal(sandbox.OC.State.detailLocating, true);
assert.equal(renderedLocating, true);
assert.equal(fetchedForLocation, true);
assert.deepEqual(shownIsland, { id: 'mine', rowId: 42 }, 'an unconfirmed preview must not be opened');

console.log('main tests passed');
