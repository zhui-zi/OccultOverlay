const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let requestedUrl = '';
const sandbox = {
  console,
  Promise,
  fetch(url) {
    requestedUrl = url;
    return Promise.resolve({
      ok: true,
      json() { return Promise.resolve([{ id: 7 }]); },
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

  requestedUrl = '';
  const empty = await sandbox.OC.Api.fetchIslandByFingerprints(['invalid'], 1346, 103);
  assert.deepEqual(Array.from(empty), []);
  assert.equal(requestedUrl, '');
  console.log('api tests passed');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
