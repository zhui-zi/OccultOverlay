const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let requestedUrl = '';
let requestedOptions = {};
const sandbox = {
  console,
  Promise,
  fetch(url, options) {
    requestedUrl = url;
    requestedOptions = options || {};
    return Promise.resolve({
      ok: true,
      json() { return Promise.resolve([{ id: 7, tracker_id: 'created' }]); },
    });
  },
  OC: {
    BACKEND: { url: 'https://example.test/trackers', anonKey: 'test' },
    CES: {},
    FATES: {},
    POTS: {},
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/api.js', 'utf8'), sandbox);

(async function () {
  const a = 'A'.repeat(64);
  const b = 'B'.repeat(64);
  const rows = await sandbox.OC.Api.fetchIslandByFingerprints([a, b], 1346, 103);
  assert.deepEqual(Array.from(rows, row => row.id), [7]);
  assert.match(requestedUrl, /last_fate=in\.\(A{64},B{64}\)/);
  assert.match(requestedUrl, /territory=eq\.1346/);
  assert.match(requestedUrl, /datacenter=eq\.103/);
  assert.match(requestedUrl, /order=last_update\.desc,id\.desc/);
  assert.equal(requestedOptions.cache, 'no-store');

  requestedUrl = '';
  const empty = await sandbox.OC.Api.fetchIslandByFingerprints(['invalid'], 1346, 103);
  assert.deepEqual(Array.from(empty), []);
  assert.equal(requestedUrl, '');

  assert.equal(sandbox.OC.Api.blankEntry(49).state, 0);

  const record = {
    territory: 1346,
    datacenter: 103,
    last_fate: a,
    tracker_type: 1,
  };
  const created = await sandbox.OC.Api.createIslandTracker(record);
  assert.equal(created.tracker_id, 'created');
  assert.equal(requestedUrl, 'https://example.test/trackers');
  assert.equal(requestedOptions.method, 'POST');
  assert.deepEqual(JSON.parse(requestedOptions.body), record);
  assert.equal(requestedOptions.headers.Prefer, 'return=representation');

  const updated = await sandbox.OC.Api.updateIslandTracker(7, record);
  assert.equal(updated.id, 7);
  assert.equal(requestedUrl, 'https://example.test/trackers?id=eq.7');
  assert.equal(requestedOptions.method, 'PATCH');
  assert.deepEqual(JSON.parse(requestedOptions.body), record);
  console.log('api tests passed');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
