/* ACT director state with strictly matched shared-tracker fallback. */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };
  function nm(o) { return OC.localName(o, OC.Settings.get('lang')); }
  function now() { return Math.floor(Date.now() / 1000); }
  function potForSide(side, territory) {
    var found = null;
    Object.keys(OC.POTS).some(function (key) {
      var def = OC.POTS[key];
      if (def.side !== side || Number(def.territory) !== Number(territory)) return false;
      found = def;
      return true;
    });
    return found;
  }
  var CN_DCS = [101, 102, 103, 104];
  var GLOBAL_DCS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  var TRACKER_VERSION = 'OccultOverlay-v73-dev';
  var HIGHLIGHT_REMOVE_GRACE_MS = 7000;
  var BINDING_ROLLOVER_GRACE_MS = 15000;
  var MIN_ISLAND_EVIDENCE = 3;

  var State = OC.State = { highlights: [], detail: null, detailId: null, detailLocating: false };

  var App = OC.App = {
    openPanel: null,
    settingsSection: 'general',
    collapsed: false,
    _dc: [],        // Deduplicated and sorted Magic Pot overview data.
    _dcTick: 0,

    trackerCheckDelayMs: function () {
      return 2500 + Math.floor(Math.random() * 1500);
    },

    displayScale: function (width, height, pixelRatio) {
      width = Number(width) || 0;
      height = Number(height) || 0;
      pixelRatio = Number(pixelRatio) || 1;
      if (width <= 1100 || height <= 650) return 0.9;
      if (width <= 1440 || height <= 800) return 0.95;
      if (pixelRatio > 1.1) return 1;
      return width >= 3000 && height >= 1700 ? 1.5 : 1;
    },

    effectiveUiScale: function (manual, width, height, pixelRatio) {
      manual = Number(manual) || 1;
      return Math.max(0.8, Math.min(2, manual * this.displayScale(width, height, pixelRatio)));
    },

    applyUiScale: function () {
      var effective = this.effectiveUiScale(
        OC.Settings.get('uiScale'),
        global.innerWidth,
        global.innerHeight,
        global.devicePixelRatio
      );
      document.documentElement.style.setProperty('--ui-scale', effective);
      return effective;
    },

    showsCnDcOverview: function () {
      return OC.Settings.get('dataRegion') === 'cn';
    },

    trackerDatacenters: function () {
      var playerDc = Number(OC.Overlay.playerDc) || 0;
      if (CN_DCS.indexOf(playerDc) >= 0) return CN_DCS.slice();
      if (GLOBAL_DCS.indexOf(playerDc) >= 0) return GLOBAL_DCS.slice();
      return (this.showsCnDcOverview() ? CN_DCS : GLOBAL_DCS).slice();
    },

    isDatacenterInScope: function (datacenter) {
      return this.trackerDatacenters().indexOf(Number(datacenter)) >= 0;
    },

    applyDocumentLanguage: function () {
      var lang = OC.Settings.get('lang');
      if (document.documentElement) document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
      document.title = t('page_title');
    },

    changeLanguage: function (lang) {
      if (lang !== 'auto' && OC.i18n.langs.indexOf(lang) < 0) return;
      OC.Settings.set('lang', lang);
      this.applyDocumentLanguage();
      this.refreshRail();
      OC.Map.render(document.getElementById('mapLayer'));
      this.updateChips();
      this.updateTreasureGuide();
      this.updateRadar();
      if (this.openPanel) this.renderPanel();
    },

    syncSystemLanguage: function () {
      if (!OC.Overlay || !OC.Overlay.callHandler || !OC.Settings.setSystemLanguage) return Promise.resolve(false);
      return OC.Overlay.callHandler({ call: 'getLanguage' }).then(function (result) {
        return App.applySystemLanguage(result && result.language);
      }).catch(function () { return false; });
    },

    applySystemLanguage: function (language) {
      var changed = OC.Settings.setSystemLanguage && OC.Settings.setSystemLanguage(language);
      if (!changed || !OC.Settings.getRaw || OC.Settings.getRaw('lang') !== 'auto') return false;
      this.changeLanguage('auto');
      return true;
    },

    changeDataRegion: function (region) {
      if (['cn', 'global'].indexOf(region) < 0 || OC.Settings.get('dataRegion') === region) return;
      OC.Settings.set('dataRegion', region);
      this.resetIsland(true);
      if (this.openPanel === 'dcpots' && !this.showsCnDcOverview()) this.closePanel();
      this.refreshRail();
      this.updateChips();
      if (this.openPanel) this.renderPanel();
      this.fetchDc(true);
    },

    init: function () {
      this.collapsed = !!OC.Settings.get('collapsed');
      document.documentElement.style.setProperty('--app-opacity', OC.Settings.get('opacity'));
      this.applyUiScale();
      this.applyDocumentLanguage();
      if (global.addEventListener) {
        global.addEventListener('resize', function () {
          App.applyUiScale();
          App.updateRadarPlacement();
        });
        global.addEventListener('languagechange', function () {
          if (OC.Settings.getRaw && OC.Settings.getRaw('lang') === 'auto') App.changeLanguage('auto');
        });
      }
      this.renderShell();
      if (OC.Radar) {
        OC.Radar.onChange(function () {
          OC.Map.updateRadar(document.getElementById('mapLayer'));
          App.updateRadar();
        });
        OC.Radar.onAlert(function (target) { App.alertRadar(target); });
        OC.Radar.start(OC.Overlay);
      }
      this.wireOverlay();
      if (OC.Treasure) {
        OC.Treasure.onChange(function (view) {
          OC.Map.updateTreasure(document.getElementById('mapLayer'));
          App.updateTreasureGuide(view);
        });
        OC.Treasure.start(OC.Overlay);
      }
      this.updateRadar();
      OC.Overlay.start();
      this.fetchDc();
      this.startLoops();
    },

    renderShell: function () {
      var app = document.getElementById('app');
      var h = '';
      h += '<div id="mapLayer" class="map-layer"></div>';
      h += '<div id="status-chips" class="chips">';
      h += '<div id="chip-conn" class="chip chip-conn clickable" title="' + t('collapse') + '"></div>';
      h += '<div id="chip-pot" class="chip chip-pot clickable" title="' + t('my_island_hint') + '"></div>';
      h += '<div id="chips-active" class="chips-active"></div>';
      h += '</div>';
      h += '<div id="treasure-guide" class="treasure-guide hidden" role="status" aria-live="polite"></div>';
      h += '<div id="radar-panel" class="radar-panel hidden" role="status" aria-live="polite"></div>';
      h += '<div class="rail">' + railHtml() + '</div>';
      h += '<div id="popover" class="popover hidden"></div>';
      app.innerHTML = h;

      OC.Map.render(document.getElementById('mapLayer'));
      this.bindRail();
      this.updateChips();
      this.updateMapVisible();

      document.getElementById('chip-conn').addEventListener('click', function () { App.toggleCollapse(); });
      document.getElementById('chip-pot').addEventListener('click', function (e) {
        e.stopPropagation();
        App.showMyIsland();
      });
      document.getElementById('chips-active').addEventListener('contextmenu', function (e) {
        e.preventDefault();
        OC.Settings.set('showActiveChips', false);
        App.updateActive();
        OC.UI.toast('fate', t('chips_hidden'), '');
      });
      var pop = document.getElementById('popover');
      pop.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) App.closePanel();
      });
    },

    bindRail: function () {
      var app = document.getElementById('app');
      app.querySelectorAll('.rbtn[data-layer]').forEach(function (b) {
        b.addEventListener('click', function () {
          OC.Map.toggle(b.getAttribute('data-layer'), document.getElementById('mapLayer'));
          b.classList.toggle('on', OC.Settings.get('mapLayers')[b.getAttribute('data-layer')]);
        });
      });
      app.querySelectorAll('.rbtn[data-panel]').forEach(function (b) {
        b.addEventListener('click', function () { App.togglePanel(b.getAttribute('data-panel')); });
      });
    },

    refreshRail: function () {
      var rail = document.querySelector('.rail');
      if (!rail) return;
      rail.innerHTML = railHtml();
      this.bindRail();
    },

    toggleCollapse: function () {
      this.collapsed = !this.collapsed;
      OC.Settings.set('collapsed', this.collapsed);
      var conn = document.getElementById('chip-conn');
      if (conn) conn.title = t(this.collapsed ? 'expand' : 'collapse');
      this.updateMapVisible();
    },

    // Build the same instance evidence as DR: region + latest trusted standard FATE + Add time.
    // OverlayPlugin replays Add on zone entry/reconnect, so those timestamps are not spawn evidence.
    // Remove timestamps can later identify a unique cloud-history match.
    instanceEvidence: function () {
      var meta = OC.Overlay.memMeta || {};
      var events = [];
      var ends = [];
      var cePhases = [];
      Object.keys(meta).forEach(function (key) {
        var id = Number(key), item = meta[key] || {};
        if (OC.CES[id] && Number(item.ceStatus) > 0 && Number(item.cePopTime) >= 1000000000) {
          cePhases.push({
            fateId: id,
            status: Number(item.ceStatus),
            popTime: Number(item.cePopTime)
          });
        }
        if (item.spawnTrusted && item.spawnEpoch && (OC.FATES[id] || OC.POTS[id])) {
          events.push({
            fateId: id,
            spawnEpoch: Number(item.spawnEpoch),
            quality: String(item.spawnQuality || 'observed')
          });
        }
        if (item.deathEpoch && (OC.FATES[id] || OC.POTS[id])) {
          ends.push({
            fateId: id,
            deathEpoch: Number(item.deathEpoch),
            quality: String(item.deathQuality || 'observed')
          });
        }
      });
      var fateEvents = events.filter(function (item) {
        return !!OC.FATES[item.fateId];
      }).sort(function (a, b) { return b.spawnEpoch - a.spawnEpoch; });
      var latest = fateEvents[0];
      var dc = Number(OC.Overlay.playerDc) || 0;
      if (!this.isDatacenterInScope(dc)) dc = 0;
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      var key = latest && dc ? dc + ':' + latest.fateId + ':' + latest.spawnEpoch : '';
      if (this._evidenceKey !== key) {
        this._evidenceKey = key;
        this._contextFingerprint = latest && dc
          ? OC.Pots.contextFingerprint(dc, latest.fateId, latest.spawnEpoch)
          : '';
        this._contextFingerprints = latest && dc
          ? OC.Pots.contextFingerprints(dc, latest.fateId, latest.spawnEpoch, 15)
          : [];
      }
      return {
        fingerprint: this._contextFingerprint || '',
        fingerprints: this._contextFingerprints || [],
        fingerprintQuality: latest ? String(latest.quality || 'observed') : '',
        events: events,
        ends: ends,
        cePhases: cePhases,
        territory: territory
      };
    },

    snapshotActiveIds: function () {
      return Object.keys(OC.Overlay.memActive || {}).map(Number).filter(function (id) {
        return !!OC.FATES[id] || !!OC.POTS[id];
      }).sort(function (a, b) { return a - b; });
    },

    updatePreviewIsland: function () {
      if (this.myIslandRowId) {
        this._previewIsland = null;
        return null;
      }
      var matched = OC.Pots.matchSnapshotIsland(
        this._islands || [],
        this.snapshotActiveIds(),
        Number(OC.Overlay.playerDc) || 0,
        Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0,
        now()
      );
      if (!matched) {
        this._previewIsland = null;
        return null;
      }
      var record = (this._dcRows || []).filter(function (row) {
        return Number(row.id) === Number(matched.rowId);
      })[0];
      if (!record) {
        this._previewIsland = null;
        return null;
      }
      this._previewIsland = {
        id: matched.id,
        rowId: matched.rowId,
        pot: pj(record.pot_history),
        record: record
      };
      return this._previewIsland;
    },

    trackerContext: function (fateId, spawnEpoch) {
      var dc = Number(OC.Overlay.playerDc) || 0;
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      fateId = Number(fateId) || 0;
      spawnEpoch = Number(spawnEpoch) || 0;
      if (!dc || !this.isDatacenterInScope(dc) || !territory || !OC.FATES[fateId] || !spawnEpoch) return null;
      return {
        fingerprint: OC.Pots.contextFingerprint(dc, fateId, spawnEpoch),
        fingerprints: OC.Pots.contextFingerprints(dc, fateId, spawnEpoch, 15),
        events: [{ fateId: fateId, spawnEpoch: spawnEpoch }],
        fateId: fateId,
        spawnEpoch: spawnEpoch,
        territory: territory,
        dc: dc,
        generation: this._locateGeneration || 0
      };
    },

    // After strict island binding, later trusted FATE Add events still belong to this instance.
    // Advance the bound fingerprint immediately to avoid unknown Pot timing while shared data catches up.
    adoptTrustedFateContext: function (fateId, spawnEpoch) {
      var context = this.trackerContext(fateId, spawnEpoch);
      if (context && this.myIslandRowId) {
        this.myIslandFingerprint = context.fingerprint;
        if (this._bindingConfirmed) {
          this._bindingRolloverFingerprint = context.fingerprint;
          this._bindingRolloverUntil = Date.now() + BINDING_ROLLOVER_GRACE_MS;
        }
      }
      return context;
    },

    bindMatchedIsland: function (matched, record, confirmed) {
      if (!matched) return null;
      if (this.myIslandRowId && Number(this.myIslandRowId) !== Number(matched.rowId)) {
        return null;
      }
      if (!record && this._previewIsland &&
          Number(this._previewIsland.rowId) === Number(matched.rowId)) {
        record = this._previewIsland.record;
      }
      var changed = this.myIslandRowId !== matched.rowId;
      if (changed) {
        this._bindingConfirmed = !!confirmed;
        this._bindingRolloverFingerprint = this._bindingConfirmed ? (matched.fingerprint || '') : '';
        this._bindingRolloverUntil = this._bindingConfirmed
          ? Date.now() + BINDING_ROLLOVER_GRACE_MS : 0;
      } else if (confirmed) {
        this._bindingConfirmed = true;
      }
      this.myIslandRowId = matched.rowId;
      this.myIslandFingerprint = matched.fingerprint || '';
      this.myIslandId = matched.id || ('row:' + matched.rowId);
      this.myIslandDatacenter = Number(matched.dc) || Number(record && record.datacenter) ||
        Number(OC.Overlay.playerDc) || 0;
      this.myIslandTerritory = Number(matched.territory) || Number(record && record.territory) ||
        Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      this._previewIsland = null;
      if (changed) {
        this._island = null;
        this._potAlertedFor = null;
        this._alerted = {};
      }
      if (record) this.applyIslandRecord(record, this.myIslandId);
      return this.myIslandId;
    },

    bindIslandRows: function (rows, evidence, dc) {
      if (!rows || !rows.length) return null;
      var direct = OC.Pots.islandList(rows);
      var matched = OC.Pots.matchIsland(direct, evidence, dc, 15);
      if (!matched) return null;
      var directRows = {};
      direct.forEach(function (item) { directRows[item.rowId] = true; });
      this._islands = direct.concat((this._islands || []).filter(function (item) {
        return !directRows[item.rowId];
      }));
      var record = rows.filter(function (row) {
        return Number(row.id) === Number(matched.rowId);
      })[0];
      var confirmed = !!this._bindingConfirmed;
      if (!this.myIslandRowId) {
        var bindingStatus = this.islandBindingEvidenceStatus(
          this.instanceEvidence(),
          record && {
            ce: pj(record.encounter_history),
            fate: pj(record.fate_history),
            pot: pj(record.pot_history)
          },
          record && record.last_fate
        );
        if (!bindingStatus.authorized) return null;
        confirmed = true;
      }
      var id = this.bindMatchedIsland(matched, record, confirmed);
      if (!id) return null;
      return id;
    },

    // Accept only a DR fingerprint or a unique local Add-time match. A shared active FATE
    // cannot distinguish concurrent islands and must not authorize a Magic Pot countdown.
    resolveMyIsland: function () {
      var all = this._islands || [];
      var pdc = OC.Overlay.playerDc;
      var evidence = this.instanceEvidence();
      if (this.myIslandRowId && !this.boundIslandScopeMatches()) {
        this.releaseIslandBinding();
      } else if (this.myIslandRowId) {
        var boundStatus = this.boundIslandEvidenceStatus(evidence);
        if (boundStatus.available && !boundStatus.authorized &&
            boundStatus.local >= MIN_ISLAND_EVIDENCE &&
            boundStatus.matched < MIN_ISLAND_EVIDENCE) {
          this.releaseIslandBinding();
        }
      }
      var matched = OC.Pots.matchIsland(all, evidence, pdc, 15);
      if (matched) {
        var confirmed = !!this._bindingConfirmed;
        if (!this.myIslandRowId) {
          var record = (this._dcRows || []).filter(function (row) {
            return Number(row.id) === Number(matched.rowId);
          })[0];
          if (!record && this._previewIsland &&
              Number(this._previewIsland.rowId) === Number(matched.rowId)) {
            record = this._previewIsland.record;
          }
          var bindingStatus = this.islandBindingEvidenceStatus(
            evidence,
            record && {
              ce: pj(record.encounter_history),
              fate: pj(record.fate_history),
              pot: pj(record.pot_history)
            },
            record && record.last_fate || matched.fingerprint
          );
          if (!bindingStatus.authorized) return null;
          confirmed = true;
        }
        var bound = this.bindMatchedIsland(matched, record, confirmed);
        if (bound) return bound;
      }
      // Keep strong-evidence binding until zone change/disconnect; a cloud outage must not drop it.
      if (this.myIslandRowId) return this.myIslandId;
      return null;
    },

    // Follow AutoPopper/DR: query last_fate directly once an Add fingerprint exists instead
    // of waiting for all data-center records. Apply the same strict matching to the result.
    locateMyIslandFast: function (force) {
      if (this.resolveMyIsland()) return Promise.resolve(true);
      var evidence = this.instanceEvidence();
      var dc = Number(OC.Overlay.playerDc) || 0;
      var territory = Number(evidence.territory) || 0;
      if (!evidence.fingerprints.length || !dc || !territory ||
          !OC.Api || !OC.Api.fetchIslandByFingerprints) {
        return Promise.resolve(false);
      }

      var key = territory + ':' + dc + ':' + evidence.fingerprints.join(',');
      var tn = Date.now();
      if (!force && this._lastLocateKey === key && tn - (this._lastLocateAt || 0) < 2000) {
        return this._locatePromise || Promise.resolve(false);
      }
      this._lastLocateKey = key;
      this._lastLocateAt = tn;
      var generation = this._locateGeneration || 0;
      var request = OC.Api.fetchIslandByFingerprints(evidence.fingerprints, territory, dc)
        .then(function (rows) {
          if (generation !== (App._locateGeneration || 0) || !rows || !rows.length) return false;
          if (!App.bindIslandRows(rows, evidence, dc)) return false;
          App._missingTrackerChecks = {};
          App.queueIslandUpload();
          App.updateChips();
          return true;
        })
        .catch(function () { return false; });
      this._locatePromise = request;
      request.then(function () {
        if (App._locatePromise === request) App._locatePromise = null;
      });
      return request;
    },

    localTrackerHistory: function (ids, shared, closeMissingDirectors) {
      var byId = {};
      (shared || []).forEach(function (entry) {
        if (!entry || !entry.fate_id) return;
        byId[Number(entry.fate_id)] = JSON.parse(JSON.stringify(entry));
      });
      var meta = OC.Overlay.memMeta || {};
      var snapshotComplete = !!closeMissingDirectors &&
        OC.Overlay.connected && OC.Overlay.inOccult &&
        now() > Number(OC.Overlay.fateSnapshotUntil || 0);
      var observedNow = now();
      return (ids || []).map(function (id) {
        id = Number(id);
        var entry = byId[id] || OC.Api.blankEntry(id);
        var local = meta[id];
        if (!Array.isArray(entry.respawn_times)) entry.respawn_times = [];
        if (!isFinite(Number(entry.killed_fates))) entry.killed_fates = 0;
        if (!isFinite(Number(entry.killed_ces))) entry.killed_ces = 0;
        var pending = App._pendingTowerProgress;
        if (pending && id === Number(pending.towerId) &&
            Number(pending.territory) === Number(OC.Overlay.territoryId)) {
          if (pending.reset) {
            entry.killed_fates = pending.killedFates;
            entry.killed_ces = pending.killedCes;
          } else {
            entry.killed_fates = Math.max(Number(entry.killed_fates) || 0, pending.killedFates);
            entry.killed_ces = Math.max(Number(entry.killed_ces) || 0, pending.killedCes);
          }
        }
        if (!local) {
          if (snapshotComplete && isActiveCandidate(entry)) {
            entry.death_time = observedNow;
            entry.last_seen = Math.max(Number(entry.last_seen) || -1, observedNow);
          }
          return entry;
        }
        var spawn = Number(local.spawnEpoch) || -1;
        var death = Number(local.deathEpoch) || -1;
        var seen = Number(local.lastSeen) || -1;
        if (local.spawnTrusted && spawn > 0 && spawn >= Number(entry.spawn_time || -1)) {
          entry.spawn_time = spawn;
          entry.death_time = local.active ? -1 : (death > 0 ? death : -1);
        } else if (local.active && Number(entry.spawn_time) > 0) {
          entry.death_time = -1;
        } else if (!local.active && death > 0 && Number(entry.spawn_time) > 0) {
          entry.death_time = death;
        }
        if (OC.CES[id]) {
          if (local.ceStatus != null) {
            entry.state = Math.max(0, Number(local.ceStatus) || 0);
            entry.pop_time = entry.state > 0 && Number(local.cePopTime) >= 1000000000
              ? Number(local.cePopTime) : -1;
          } else {
            entry.state = local.active ? Math.max(1, Number(entry.state) || 0) : 0;
          }
        }
        if (seen > Number(entry.last_seen || -1)) entry.last_seen = seen;
        return entry;
      });
    },

    // Keep the shared tower reduction counters aligned with the current zone.
    // Every completed CE removes five minutes; every FATE or pot removes one.
    // A completed normal tower starts the next cycle from zero in both zones.
    recordTowerCompletion: function (id) {
      id = Number(id) || 0;
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      var zone = OC.TERRITORIES && OC.TERRITORIES[territory];
      var encounters = this._island && this._island.ce;
      if (!id || !zone || !zone.towerId || !Array.isArray(encounters)) return false;

      var towerId = Number(zone.towerId);
      var tower = encounters.filter(function (entry) {
        return Number(entry && entry.fate_id) === towerId;
      })[0];
      if (!tower) return false;

      var currentPending = this._pendingTowerProgress;
      var pending;
      if (!currentPending || Number(currentPending.territory) !== territory ||
          Number(currentPending.towerId) !== towerId) {
        pending = {
          territory: territory,
          towerId: towerId,
          killedFates: Math.max(0, Number(tower.killed_fates) || 0),
          killedCes: Math.max(0, Number(tower.killed_ces) || 0),
          reset: false
        };
      } else {
        pending = {
          territory: territory,
          towerId: towerId,
          killedFates: currentPending.killedFates,
          killedCes: currentPending.killedCes,
          reset: currentPending.reset
        };
      }
      if (!pending.reset) {
        pending.killedFates = Math.max(pending.killedFates, Number(tower.killed_fates) || 0);
        pending.killedCes = Math.max(pending.killedCes, Number(tower.killed_ces) || 0);
      }

      if (id === towerId) {
        pending.killedFates = 0;
        pending.killedCes = 0;
        pending.reset = true;
        this._pendingTowerProgress = pending;
        return true;
      }

      if ((OC.Overlay.memActive || {})[towerId] ||
          (!pending.reset && isAlive(tower, this._island && this._island.lastUpdate))) return false;
      var field = OC.CES[id] ? 'killed_ces' :
        (OC.FATES[id] || OC.POTS[id]) ? 'killed_fates' : '';
      if (!field) return false;
      if (field === 'killed_ces') pending.killedCes += 1;
      else pending.killedFates += 1;
      this._pendingTowerProgress = pending;
      return true;
    },

    buildLocalTrackerRecord: function (fingerprint, context) {
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      var dc = Number(OC.Overlay.playerDc) || 0;
      var def = OC.TERRITORIES && OC.TERRITORIES[territory];
      if (!def || !dc || !this.isDatacenterInScope(dc) || !/^[0-9A-F]{64}$/i.test(String(fingerprint || ''))) return null;
      var shared = this._island || {};
      var record = {
        version: TRACKER_VERSION,
        territory: territory,
        tracker_type: 1,
        datacenter: dc,
        last_fate: String(fingerprint).toUpperCase(),
        last_update: now(),
        encounter_history: JSON.stringify(this.localTrackerHistory(def.ceIds, shared.ce)),
        fate_history: JSON.stringify(this.localTrackerHistory(def.fateIds, shared.fate)),
        pot_history: JSON.stringify(this.localTrackerHistory(def.potIds, shared.pot, true))
      };
      var server = Number(OC.Overlay.playerWorld) || 0;
      if (server) record.server = server;
      if (context && String(context.fingerprint || '').toUpperCase() === record.last_fate &&
          OC.FATES[Number(context.fateId)] && Number(context.spawnEpoch) > 0) {
        record.fate = Number(context.fateId);
        record.fate_timestamp = Number(context.spawnEpoch);
      }
      return record;
    },

    // AutoPopper-compatible missing-instance state machine. Only scheduled
    // FATE Add checks increment the counter; position polling never creates rows.
    checkOrCreateIsland: function (context) {
      if (!context || !OC.Overlay.connected || !OC.Overlay.inOccult ||
          context.generation !== (this._locateGeneration || 0)) {
        return Promise.resolve(false);
      }
      var checkKey = String(context.fingerprint || '');
      this._missingTrackerChecks = this._missingTrackerChecks || {};
      return OC.Api.fetchIslandByFingerprints(context.fingerprints, context.territory, context.dc)
        .then(function (rows) {
          if (context.generation !== (App._locateGeneration || 0)) return false;
          if (rows && rows.length) {
            var found = App.bindIslandRows(rows, context, context.dc);
            if (found) {
              App._missingTrackerChecks[checkKey] = 0;
              App.queueIslandUpload(null, true, context);
              App.updateChips();
              return true;
            }
            context.stopRetry = true;
            return false;
          }
          if (App.myIslandRowId) {
            App._missingTrackerChecks[checkKey] = 0;
            App.queueIslandUpload(context.fingerprint, true, context);
            return true;
          }

          if (!App.localEvidenceReadyForCreation(App.instanceEvidence())) {
            context.stopRetry = true;
            return false;
          }

          App._missingTrackerChecks[checkKey] =
            Number(App._missingTrackerChecks[checkKey] || 0) + 1;
          if (App._missingTrackerChecks[checkKey] < 2) return false;
          var record = App.buildLocalTrackerRecord(context.fingerprint, context);
          if (!record) return false;
          return OC.Api.createIslandTracker(record).then(function (created) {
            if (context.generation !== (App._locateGeneration || 0)) return false;
            if (created && App.bindIslandRows([created], context, context.dc)) {
              App._missingTrackerChecks[checkKey] = 0;
              App.updateChips();
              return true;
            }
            return OC.Api.fetchIslandByFingerprints(
              [context.fingerprint], context.territory, context.dc
            ).then(function (createdRows) {
              var found = App.bindIslandRows(createdRows, context, context.dc);
              if (found) {
                App._missingTrackerChecks[checkKey] = 0;
                App.updateChips();
              }
              return !!found;
            });
          });
        })
        .catch(function () { return false; });
    },

    scheduleTrackerCheck: function (fateId, spawnEpoch) {
      var context = this.trackerContext(fateId, spawnEpoch);
      if (!context) return;
      var key = context.fingerprint;
      this._scheduledTrackerChecks = this._scheduledTrackerChecks || {};
      this._checkedTrackerKeys = this._checkedTrackerKeys || {};
      if (this._scheduledTrackerChecks[key] || this._checkedTrackerKeys[key]) return;
      function runCheck() {
        delete App._scheduledTrackerChecks[key];
        if (context.generation !== (App._locateGeneration || 0)) return;
        App._trackerCheckChain = (App._trackerCheckChain || Promise.resolve())
          .catch(function () {})
          .then(function () { return App.checkOrCreateIsland(context); })
          .then(function (found) {
            if (found || context.stopRetry ||
                context.generation !== (App._locateGeneration || 0)) {
              App._checkedTrackerKeys[key] = true;
              return;
            }
            var count = Number((App._missingTrackerChecks || {})[key] || 0);
            if (count < 2) {
              App._scheduledTrackerChecks[key] = setTimeout(runCheck, App.trackerCheckDelayMs());
            } else {
              App._checkedTrackerKeys[key] = true;
            }
          });
      }
      this._scheduledTrackerChecks[key] = setTimeout(runCheck, this.trackerCheckDelayMs());
    },

    scheduleKnownTrackerChecks: function () {
      var meta = OC.Overlay.memMeta || {};
      Object.keys(meta).map(function (key) {
        return { id: Number(key), meta: meta[key] || {} };
      }).filter(function (item) {
        return !!OC.FATES[item.id] && !!item.meta.spawnTrusted && !!item.meta.spawnEpoch;
      }).sort(function (a, b) {
        return Number(a.meta.spawnEpoch) - Number(b.meta.spawnEpoch);
      }).forEach(function (item) {
        App.scheduleTrackerCheck(item.id, item.meta.spawnEpoch);
      });
    },

    queueIslandUpload: function (fingerprint, immediate, context) {
      if (!this.myIslandRowId || !OC.Overlay.connected || !OC.Overlay.inOccult) return;
      this._pendingUploadFingerprint = fingerprint || this.instanceEvidence().fingerprint || this.myIslandFingerprint;
      if (context) this._pendingTrackerContext = context;
      if (this._uploadTimer) clearTimeout(this._uploadTimer);
      this._uploadTimer = setTimeout(function () {
        App._uploadTimer = null;
        App.flushIslandUpload();
      }, immediate ? 0 : 400);
    },

    flushIslandUpload: function () {
      var rowId = this.myIslandRowId;
      var generation = this._locateGeneration || 0;
      if (!rowId) return Promise.resolve(false);
      this._uploadChain = (this._uploadChain || Promise.resolve())
        .catch(function () {})
        .then(function () {
          if (generation !== (App._locateGeneration || 0) ||
              Number(rowId) !== Number(App.myIslandRowId) ||
              !OC.Overlay.connected || !OC.Overlay.inOccult) return false;
          if (!App.boundIslandScopeMatches()) {
            App.releaseIslandBinding();
            return false;
          }
          var boundStatus = App.boundIslandEvidenceStatus();
          if (!boundStatus.authorized) {
            if (boundStatus.available && boundStatus.local >= MIN_ISLAND_EVIDENCE) {
              App.releaseIslandBinding();
            }
            return false;
          }
          var fingerprint = App._pendingUploadFingerprint ||
            App.instanceEvidence().fingerprint || App.myIslandFingerprint;
          App._pendingUploadFingerprint = '';
          var trackerContext = App._pendingTrackerContext;
          App._pendingTrackerContext = null;
          var pendingTowerProgress = App._pendingTowerProgress;
          var record = App.buildLocalTrackerRecord(fingerprint, trackerContext);
          if (!record) return false;
          return OC.Api.updateIslandTracker(rowId, record).then(function (updated) {
            if (generation !== (App._locateGeneration || 0) ||
                Number(rowId) !== Number(App.myIslandRowId)) return false;
            if (updated) {
              if (pendingTowerProgress && App._pendingTowerProgress === pendingTowerProgress) {
                App._pendingTowerProgress = null;
              }
              var evidence = {
                fingerprint: record.last_fate,
                fingerprints: [record.last_fate],
                events: [],
                territory: record.territory
              };
              App.bindIslandRows([updated], evidence, record.datacenter);
              App.myIslandFingerprint = record.last_fate;
              App.updateChips();
            }
            return !!updated;
          });
        });
      return this._uploadChain;
    },

    // Clear on every zone/instance change or disconnect; re-identify even if territoryId is unchanged.
    resetIsland: function (preserveLocal) {
      this.myIslandId = null; this.myIslandRowId = null; this.myIslandFingerprint = '';
      this.myIslandDatacenter = 0; this.myIslandTerritory = 0;
      this._evidenceKey = ''; this._contextFingerprint = ''; this._contextFingerprints = [];
      this._locateGeneration = (this._locateGeneration || 0) + 1;
      this._lastLocateKey = ''; this._lastLocateAt = 0; this._locatePromise = null;
      Object.keys(this._scheduledTrackerChecks || {}).forEach(function (key) {
        clearTimeout(App._scheduledTrackerChecks[key]);
      });
      if (this._uploadTimer) clearTimeout(this._uploadTimer);
      this._scheduledTrackerChecks = {}; this._checkedTrackerKeys = {};
      this._missingTrackerChecks = {}; this._trackerCheckChain = Promise.resolve();
      this._uploadTimer = null; this._uploadChain = Promise.resolve();
      this._pendingUploadFingerprint = '';
      this._pendingTrackerContext = null;
      this._pendingTowerProgress = null;
      this._bindingConfirmed = false;
      this._bindingRolloverFingerprint = '';
      this._bindingRolloverUntil = 0;
      this._previewIsland = null; this._dcRows = []; this._dc = []; this._islands = []; this._dcLoaded = false;
      this._island = null; this._potAlertedFor = null; this._alerted = {};
      this._highlightMissingSince = {};
      this._lastIslandFetch = 0; this._lastDcFetch = 0;
      if (!preserveLocal) this._localPot = null; // Local Pot observations expire after an instance change.
      State.detail = null; State.detailId = null;
      State.detailLocating = this.openPanel === 'battle';
      if (!preserveLocal) {
        if (OC.Overlay.resetMemory) OC.Overlay.resetMemory();
        else OC.Overlay.memActive = {};
        OC.State.highlights = [];
        OC.Map.updateHighlights(document.getElementById('mapLayer'));
      } else {
        this.refreshHighlights();
      }
      if (State.detailLocating) this.renderPanel();
    },

    // Hide the overlay off-island; on-island map visibility follows the collapsed state.
    updateMapVisible: function () {
      var app = document.getElementById('app'); if (!app) return;
      // Keep visible when disconnected for standalone/debug mode.
      var outside = OC.Overlay.connected && !OC.Overlay.inOccult;
      app.style.display = outside ? 'none' : '';
      var toasts = document.getElementById('toasts');
      if (toasts) toasts.style.display = outside ? 'none' : '';
      app.classList.toggle('no-map', this.collapsed);
      this.updateRadar();
    },

    togglePanel: function (which) {
      if (which === 'dcpots' && !this.showsCnDcOverview()) return;
      if (this.openPanel === which) return this.closePanel();
      this.openPanel = which;
      document.getElementById('popover').classList.remove('hidden');
      if (which === 'dcpots') this.fetchDc();
      this.renderPanel();
    },
    closePanel: function () {
      this.openPanel = null;
      State.detailId = null; State.detail = null; State.detailLocating = false;
      document.getElementById('popover').classList.add('hidden');
    },

    renderPanel: function () {
      var pop = document.getElementById('popover');
      if (this.openPanel === 'dcpots' && !this.showsCnDcOverview()) return this.closePanel();
      // Preserve scroll position while the panel redraws each second.
      var oldBody = pop.querySelector('.panel-body');
      var scroll = oldBody ? oldBody.scrollTop : 0;
      if (this.openPanel === 'dcpots') OC.UI.renderDcPots(pop, this._dc, !this._dcLoaded);
      else if (this.openPanel === 'battle') OC.UI.renderBattlePanel(pop, State.detail, State.detailId, State.detailLocating);
      else if (this.openPanel === 'settings') this.renderSettings(pop);
      pop.classList.toggle('compact', this.openPanel === 'dcpots'); // Use compact styling for the Pot overview.
      var newBody = pop.querySelector('.panel-body');
      if (newBody && scroll) newBody.scrollTop = scroll;
    },

    // The top Pot timer always opens local-island details. Before strict identification,
    // keep the locator view instead of duplicating the regional overview button.
    showMyIsland: function () {
      var id = this.resolveMyIsland();
      if (id) return this.showIsland(id, this.myIslandRowId);
      State.detail = null; State.detailId = null; State.detailLocating = true;
      this.openPanel = 'battle';
      var pop = document.getElementById('popover');
      pop.classList.remove('hidden');
      OC.UI.renderBattlePanel(pop, null, null, true);
      this.locateMyIslandFast(true);
      this.fetchDc(true);
    },

    showIsland: function (id, rowId) {
      State.detail = null; State.detailId = id; State.detailLocating = false;
      this.openPanel = 'battle';
      document.getElementById('popover').classList.remove('hidden');
      OC.UI.renderBattlePanel(document.getElementById('popover'), null, id); // loading
      var request = rowId ? OC.Api.fetchTrackerRow(rowId) : OC.Api.fetchTracker(id);
      request.then(function (rec) {
        if (!rec) return;
        if (App.openPanel !== 'battle' || State.detailId !== id) return;
        var territory = Number(rec.territory) || Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
        State.detail = {
          territory: territory,
          lastUpdate: Number(rec.last_update) || 0,
          ce: pj(rec.encounter_history),
          fate: pj(rec.fate_history),
          pot: pj(rec.pot_history)
        };
        App.renderPanel();
      }).catch(function () {});
    },

    updateVisibility: function () {
      var app = document.getElementById('app'); if (!app) return;
      var show = OC.Overlay.inOccult || !OC.Overlay.connected;
      app.style.visibility = show ? '' : 'hidden';
      var toasts = document.getElementById('toasts');
      if (toasts) toasts.style.visibility = show ? '' : 'hidden';
    },

    updateChips: function () {
      // Network data refreshes every five seconds. Advance the 30-minute cycle locally
      // between requests so the countdown does not remain at "soon" after reaching zero.
      if (this._dcRows) {
        this._dc = OC.Pots.dcOverview(this._dcRows, now());
      }
      var conn = document.getElementById('chip-conn');
      if (conn) {
        conn.title = t(this.collapsed ? 'expand' : 'collapse');
        var c = OC.Overlay.connected;
        var zone = c ? (OC.Overlay.inOccult ? t('in_occult') : (OC.Overlay.zoneName || t('not_in_occult'))) : t('disconnected');
        conn.innerHTML = '<span class="dot ' + (c ? 'ok' : 'off') + '"></span>' + OC.UI.esc(zone);
      }
      var pot = document.getElementById('chip-pot');
      if (pot) {
        pot.title = t('my_island_hint');
        this.resolveMyIsland();
        var mine = this.localPotInfo();
        var body = '<span class="chip-k">' + t('pot') + '</span>';
        var ready = false;
        if (!mine && !this._dcLoaded) {
          body += '<span class="s">' + t('loading') + '</span>';
        } else if (mine) {
          var side = mine.side ? '<span class="side-' + mine.side + '">' + (mine.side === 'north' ? t('pot_north') : t('pot_south')) + '</span>' : '';
          var pdef = potForSide(mine.side, OC.Overlay.territoryId || (OC.MAP && OC.MAP.territory));
          if (pdef) side += OC.UI.rewardSuffixIfWanted(pdef.drops);
          if (mine.alive) { body += '<span class="s a">' + t('alive') + '</span> ' + side; ready = true; }
          else { body += '<b>' + OC.UI.fmtDur(Math.max(0, mine.etaSec)) + '</b> ' + side; ready = mine.etaSec <= 60; }
        } else {
          body += '<span class="s">' + t('island_unknown') + '</span>';
        }
        pot.classList.toggle('ready', ready);
        pot.innerHTML = body;
      }
      this.updateActive();
      this.updateRadarPlacement();
    },

    localInstanceSignalCount: function (evidence) {
      var ids = {};
      (evidence && evidence.events || []).forEach(function (signal) {
        if (Number(signal.fateId)) ids[Number(signal.fateId)] = true;
      });
      (evidence && evidence.ends || []).forEach(function (signal) {
        if (Number(signal.fateId)) ids[Number(signal.fateId)] = true;
      });
      return Object.keys(ids).length;
    },

    localStrongFateSignalCount: function (evidence) {
      var ids = {};
      (evidence && evidence.events || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var quality = String(signal.quality || '');
        if (OC.FATES[id] && (quality === 'direct' || quality === 'exact')) ids[id] = true;
      });
      return Object.keys(ids).length;
    },

    localPreciseFateSignalCount: function (evidence) {
      var ids = {};
      (evidence && evidence.events || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var quality = String(signal.quality || '');
        if (OC.FATES[id] && (quality === 'direct' || quality === 'exact')) ids[id] = true;
      });
      (evidence && evidence.ends || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var quality = String(signal.quality || '');
        if (OC.FATES[id] && Number(signal.deathEpoch) > 0 &&
            (quality === 'direct' || quality === 'exact')) ids[id] = true;
      });
      return Object.keys(ids).length;
    },

    localEvidenceReadyForCreation: function (evidence) {
      evidence = evidence || {};
      return String(evidence.fingerprintQuality || '') === 'exact' ||
        this.localPreciseFateSignalCount(evidence) >= 2 ||
        this.localInstanceSignalCount(evidence) >= MIN_ISLAND_EVIDENCE;
    },

    cloudIslandEvidenceCount: function (evidence, history) {
      evidence = evidence || {};
      history = history || this._island;
      if (!history && this._dcRows && this.myIslandRowId) {
        var row = this._dcRows.filter(function (item) {
          return Number(item.id) === Number(App.myIslandRowId);
        })[0];
        if (row) {
          history = {
            ce: pj(row.encounter_history),
            fate: pj(row.fate_history),
            pot: pj(row.pot_history)
          };
        }
      }
      if (!history) return 0;
      var remote = (history.fate || []).concat(history.pot || []);
      var matchedIds = {};
      (evidence.events || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var epoch = Number(signal.spawnEpoch) || 0;
        if (!id || !epoch) return;
        if (remote.some(function (entry) {
          return Number(entry.fate_id) === id && Number(entry.spawn_time) > 0 &&
            Math.abs(Number(entry.spawn_time) - epoch) <= 15;
        })) matchedIds[id] = true;
      });
      (evidence.ends || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var epoch = Number(signal.deathEpoch) || 0;
        if (!id || !epoch) return;
        if (remote.some(function (entry) {
          return Number(entry.fate_id) === id && Number(entry.death_time) > 0 &&
            Math.abs(Number(entry.death_time) - epoch) <= 15;
        })) matchedIds[id] = true;
      });
      return Object.keys(matchedIds).length;
    },

    cloudStrongFateEvidenceCount: function (evidence, history) {
      evidence = evidence || {};
      history = history || this._island;
      if (!history) return 0;
      var remote = history.fate || [];
      var matchedIds = {};
      (evidence.events || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var epoch = Number(signal.spawnEpoch) || 0;
        var quality = String(signal.quality || '');
        if (!OC.FATES[id] || !epoch || (quality !== 'direct' && quality !== 'exact')) return;
        if (remote.some(function (entry) {
          return Number(entry.fate_id) === id && Number(entry.spawn_time) > 0 &&
            Math.abs(Number(entry.spawn_time) - epoch) <= 15;
        })) matchedIds[id] = true;
      });
      return Object.keys(matchedIds).length;
    },

    cloudPreciseFateEvidenceCount: function (evidence, history) {
      evidence = evidence || {};
      history = history || this._island;
      if (!history) return 0;
      var remote = history.fate || [];
      var matchedIds = {};
      (evidence.events || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var epoch = Number(signal.spawnEpoch) || 0;
        var quality = String(signal.quality || '');
        if (!OC.FATES[id] || !epoch || (quality !== 'direct' && quality !== 'exact')) return;
        if (remote.some(function (entry) {
          return Number(entry.fate_id) === id && Number(entry.spawn_time) > 0 &&
            Math.abs(Number(entry.spawn_time) - epoch) <= 15;
        })) matchedIds[id] = true;
      });
      (evidence.ends || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var epoch = Number(signal.deathEpoch) || 0;
        var quality = String(signal.quality || '');
        if (!OC.FATES[id] || !epoch || (quality !== 'direct' && quality !== 'exact')) return;
        if (remote.some(function (entry) {
          return Number(entry.fate_id) === id && Number(entry.death_time) > 0 &&
            Math.abs(Number(entry.death_time) - epoch) <= 15;
        })) matchedIds[id] = true;
      });
      return Object.keys(matchedIds).length;
    },

    cloudCePhaseEvidenceCount: function (evidence, history) {
      evidence = evidence || {};
      history = history || this._island;
      if (!history) return 0;
      var remote = history.ce || [];
      var matchedIds = {};
      (evidence.cePhases || []).forEach(function (signal) {
        var id = Number(signal.fateId) || 0;
        var status = Number(signal.status) || 0;
        var popTime = Number(signal.popTime) || 0;
        if (!id || !status || popTime < 1000000000) return;
        if (remote.some(function (entry) {
          var remoteStatus = Number(entry && (entry.state != null ? entry.state : entry.status)) || 0;
          return Number(entry && entry.fate_id) === id && remoteStatus === status &&
            Number(entry && entry.pop_time) === popTime;
        })) matchedIds[id] = true;
      });
      return Object.keys(matchedIds).length;
    },

    islandBindingEvidenceStatus: function (evidence, history, fingerprint) {
      evidence = evidence || {};
      var local = this.localInstanceSignalCount(evidence);
      var strongLocal = this.localStrongFateSignalCount(evidence);
      var matched = history ? this.cloudIslandEvidenceCount(evidence, history) : 0;
      var strongMatched = history ? this.cloudStrongFateEvidenceCount(evidence, history) : 0;
      var preciseMatched = history ? this.cloudPreciseFateEvidenceCount(evidence, history) : 0;
      var ceMatched = history ? this.cloudCePhaseEvidenceCount(evidence, history) : 0;
      var exactFingerprint = String(evidence.fingerprintQuality || '') === 'exact' &&
        !!evidence.fingerprint && !!fingerprint &&
        String(evidence.fingerprint).toUpperCase() === String(fingerprint).toUpperCase();
      return {
        available: !!history,
        local: local,
        strongLocal: strongLocal,
        matched: matched,
        strongMatched: strongMatched,
        preciseMatched: preciseMatched,
        ceMatched: ceMatched,
        exactFingerprint: exactFingerprint,
        authorized: !!history && (exactFingerprint || preciseMatched >= 2 ||
          ceMatched >= 2 || (ceMatched >= 1 && preciseMatched >= 1) ||
          (local >= MIN_ISLAND_EVIDENCE && matched >= MIN_ISLAND_EVIDENCE))
      };
    },

    boundIslandRecord: function () {
      if (!this.myIslandRowId) return null;
      return (this._dcRows || []).filter(function (row) {
        return Number(row.id) === Number(App.myIslandRowId);
      })[0] || null;
    },

    boundIslandScopeMatches: function () {
      if (!this.myIslandRowId) return false;
      var record = this.boundIslandRecord();
      var currentDc = Number(OC.Overlay.playerDc) || 0;
      var currentTerritory = Number(OC.Overlay.territoryId) ||
        Number(OC.MAP && OC.MAP.territory) || 0;
      var boundDc = Number(this.myIslandDatacenter) || Number(record && record.datacenter) || 0;
      var boundTerritory = Number(this.myIslandTerritory) || Number(record && record.territory) || 0;
      return !!currentDc && !!currentTerritory && boundDc === currentDc &&
        boundTerritory === currentTerritory;
    },

    boundIslandEvidenceStatus: function (evidence) {
      evidence = evidence || this.instanceEvidence();
      var history = this._island;
      var record = this.boundIslandRecord();
      if (!history && record) {
        history = {
          ce: pj(record.encounter_history),
          fate: pj(record.fate_history),
          pot: pj(record.pot_history)
        };
      }
      var status = this.islandBindingEvidenceStatus(
        evidence,
        history,
        record && record.last_fate || this.myIslandFingerprint
      );
      var scopeMatches = this.boundIslandScopeMatches();
      var directlyAuthorized = scopeMatches && status.authorized;
      var rolloverFingerprint = String(this._bindingRolloverFingerprint || '').toUpperCase();
      var rolloverMatches = rolloverFingerprint && (evidence.fingerprints || []).some(function (value) {
        return String(value || '').toUpperCase() === rolloverFingerprint;
      });
      var rolloverGrace = scopeMatches && this._bindingConfirmed && rolloverMatches &&
        Date.now() <= Number(this._bindingRolloverUntil || 0);
      var contradicted = scopeMatches && status.available && !directlyAuthorized &&
        status.local >= MIN_ISLAND_EVIDENCE && status.matched < MIN_ISLAND_EVIDENCE &&
        !rolloverGrace;
      status.directlyAuthorized = directlyAuthorized;
      status.rolloverGrace = !!rolloverGrace;
      status.contradicted = !!contradicted;
      status.authorized = scopeMatches && !contradicted &&
        (directlyAuthorized || !!this._bindingConfirmed);
      return status;
    },

    releaseIslandBinding: function () {
      this.myIslandId = null; this.myIslandRowId = null; this.myIslandFingerprint = '';
      this.myIslandDatacenter = 0; this.myIslandTerritory = 0;
      this._locateGeneration = (this._locateGeneration || 0) + 1;
      this._lastLocateKey = ''; this._lastLocateAt = 0; this._locatePromise = null;
      if (this._uploadTimer) clearTimeout(this._uploadTimer);
      this._uploadTimer = null; this._uploadChain = Promise.resolve();
      this._pendingUploadFingerprint = '';
      this._pendingTrackerContext = null;
      this._pendingTowerProgress = null;
      this._bindingConfirmed = false;
      this._bindingRolloverFingerprint = '';
      this._bindingRolloverUntil = 0;
      this._previewIsland = null; this._island = null;
      this._potAlertedFor = null; this._alerted = {};
      State.detail = null; State.detailId = null;
      State.detailLocating = this.openPanel === 'battle';
    },

    // Trusted local Add/Remove events do not wait for instance matching; cloud time requires strict confirmation.
    localPotInfo: function () {
      // The current fingerprint changes as FATEs rotate and must not repeatedly reject a
      // confirmed island. Revalidate with accumulated independent Add/Remove signals while
      // locking territory + data center. Local director state still corrects Pot liveness below.
      var cloudTimingAuthorized = this.boundIslandEvidenceStatus().authorized;
      var cloud = cloudTimingAuthorized && this._island && this._island.pot;
      if ((!cloud || !cloud.length) && cloudTimingAuthorized) {
        var overview = (this._dc || []).filter(function (item) {
          return item.rowId === App.myIslandRowId;
        })[0];
        if (overview) cloud = overview.potHistory;
      }

      var local = this._localPot || {};
      var localDirectorsAreAuthoritative = OC.Overlay.connected && OC.Overlay.inOccult;
      var observedNow = now();
      cloud = (cloud || []).map(function (entry) {
        var copy = JSON.parse(JSON.stringify(entry));
        var observation = local[Number(copy.fate_id)];
        if (localDirectorsAreAuthoritative && isActiveCandidate(copy) &&
            !(observation && observation.active)) {
          copy.death_time = observedNow;
          copy.last_seen = Math.max(Number(copy.last_seen) || -1, observedNow);
        }
        return copy;
      });
      var localHistory = [];
      var activeId = 0, activeSeen = -1;
      var cloudById = {};
      (cloud || []).forEach(function (entry) {
        cloudById[Number(entry.fate_id)] = entry;
      });
      Object.keys(local).forEach(function (key) {
        var id = Number(key), observation = local[key];
        if (observation.active && observation.lastSeen > activeSeen) {
          activeId = id;
          activeSeen = observation.lastSeen;
        }
        var shared = cloudById[id];
        var spawnEpoch = observation.spawnEpoch ||
          (shared && Number(shared.spawn_time) > 0 ? Number(shared.spawn_time) : 0);
        if (!spawnEpoch) return;
        var lastSeen = observation.active ? now() :
          (observation.deathEpoch || observation.lastSeen || spawnEpoch);
        localHistory.push({
          fate_id: id,
          spawn_time: spawnEpoch,
          death_time: observation.active ? -1 : (observation.deathEpoch || lastSeen),
          last_seen: lastSeen
        });
      });

      var merged = OC.Pots.merge(cloud || [], localHistory);
      var status = OC.Pots.status(merged, now());

      // Update may be the first event after an overlay reload and has no reliable spawn_time.
      // Confirm only liveness and side; do not fabricate an exact next-cycle time.
      if (activeId) {
        var side = (OC.POTS[activeId] || {}).side || null;
        if (!status) return {
          alive: true, nextEpoch: null, etaSec: null, side: side, local: true
        };
        status.alive = true;
        status.side = side;
        status.local = true;
      }
      return status;
    },

    // Active island FATE/CE chips scale with the UI and include colored drop suffixes.
    updateActive: function () {
      var box = document.getElementById('chips-active');
      if (!box) return;
      var html = '';
      if (OC.Settings.get('showActiveChips')) {
        var ids = OC.State.highlights || [];
        html = ids.map(function (id) {
          var isCe = !!OC.CES[id], isPot = !!OC.POTS[id];
          var def = isCe ? OC.CES[id] : isPot ? OC.POTS[id] : OC.FATES[id];
          if (!def) return '';
          if (isCe && def.type === 'tower' && !OC.Settings.get('alertTower')) return '';
          var cls = isCe ? 'ce' : isPot ? 'pot' : 'fate';
          var weakness = isPot ? '' : OC.UI.weaknessIcons(def.weakness);
          return '<div class="chip chip-act ' + cls + '"><span class="chip-act-name">' + weakness + OC.UI.esc(nm(def.name)) + '</span>' + rewardSuffix(def.drops) + '</div>';
        }).join('');
      }
      // Rebuilding identical nodes makes ACT's Chromium surface flash.
      if (box._ocActiveHtml === html) {
        this.updateRadarPlacement();
        return;
      }
      box._ocActiveHtml = html;
      box.innerHTML = html;
      this.updateRadarPlacement();
    },

    updateTreasureGuide: function (view) {
      var host = document.getElementById('treasure-guide');
      if (!host || !OC.UI.renderTreasureGuide) return;
      OC.UI.renderTreasureGuide(host, view || (OC.Treasure && OC.Treasure.view()));
      this.updateRadarPlacement();
    },

    updateRadarPlacement: function () {
      var host = document.getElementById('radar-panel');
      if (!host || !host.style) {
        this.updateMapPlacement();
        return;
      }
      var pinned = !!OC.Settings.get('radarPinned');
      var app = document.getElementById('app');
      var noMap = !!(app && app.classList && app.classList.contains && app.classList.contains('no-map'));
      if (!pinned || !noMap) {
        host.style.top = '';
        host.style.bottom = '';
        this.updateMapPlacement();
        return;
      }
      var top = 8;
      var chips = document.getElementById('status-chips');
      if (chips) top = Math.max(top, Number(chips.offsetTop || 0) + Number(chips.offsetHeight || 0) + 8);
      var guide = document.getElementById('treasure-guide');
      var guideHidden = guide && guide.classList && guide.classList.contains && guide.classList.contains('hidden');
      if (guide && !guideHidden) {
        top = Math.max(top, Number(guide.offsetTop || 0) + Number(guide.offsetHeight || 0) + 8);
      }
      host.style.top = Math.ceil(top) + 'px';
      host.style.bottom = 'auto';
      this.updateMapPlacement();
    },

    updateMapPlacement: function () {
      var layer = document.getElementById('mapLayer');
      if (!layer || !layer.style) return 0;
      var app = document.getElementById('app');
      var appRect = app && app.getBoundingClientRect ? app.getBoundingClientRect() : null;
      var appTop = appRect && isFinite(appRect.top) ? Number(appRect.top) : 0;
      var noMap = !!(app && app.classList && app.classList.contains && app.classList.contains('no-map'));
      var topEdge = 0;

      function includeTop(element) {
        if (!element) return;
        if (element.classList && element.classList.contains && element.classList.contains('hidden')) return;
        var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
        var edge = rect && isFinite(rect.bottom)
          ? Number(rect.bottom) - appTop
          : Number(element.offsetTop || 0) + Number(element.offsetHeight || 0);
        topEdge = Math.max(topEdge, edge);
      }

      includeTop(document.getElementById('status-chips'));
      includeTop(document.getElementById('treasure-guide'));
      if (noMap && OC.Settings.get('radarPinned')) includeTop(document.getElementById('radar-panel'));

      var top = topEdge > 0 ? Math.max(0, Math.ceil(topEdge + 8)) : 0;
      var bottom = 0;
      layer.style.top = top + 'px';
      layer.style.bottom = bottom + 'px';
      return top;
    },

    updateRadar: function () {
      var host = document.getElementById('radar-panel');
      if (!host) return;
      var allTargets = OC.Radar && OC.Radar.targets ? OC.Radar.targets() : [];
      var priorities = { carrot: 0, silver: 1, bronze: 2 };
      var list = allTargets.slice().sort(function (a, b) {
        var priority = (priorities[a.kind] == null ? 3 : priorities[a.kind]) -
          (priorities[b.kind] == null ? 3 : priorities[b.kind]);
        if (priority) return priority;
        var aDistance = isFinite(a.distance) ? Number(a.distance) : Infinity;
        var bDistance = isFinite(b.distance) ? Number(b.distance) : Infinity;
        if (aDistance !== bDistance) return aDistance - bDistance;
        return String(a.id || '').localeCompare(String(b.id || ''));
      }).slice(0, 3);
      var radarEnabled = !!(OC.Settings.get('radarCoffers') || OC.Settings.get('radarCarrots'));
      var pinned = !!OC.Settings.get('radarPinned');
      var app = document.getElementById('app');
      var noMap = !!(app && app.classList && app.classList.contains && app.classList.contains('no-map'));
      if (pinned) host.classList.add('pinned'); else host.classList.remove('pinned');
      if (!radarEnabled || !allTargets.length || (noMap && !pinned)) {
        host.classList.add('hidden');
        host.innerHTML = '';
        this.updateRadarPlacement();
        if (document.documentElement) document.documentElement.style.setProperty('--toast-bottom', '10px');
        return;
      }
      var h = '<div class="radar-head"><span>' + esc(t('radar_title')) + '</span><b>' + allTargets.length + '</b></div>';
      list.forEach(function (target) {
        var slot = target.kind === 'carrot' ? 'C' : target.slot;
        var bearing = Number(target.bearing);
        var hasBearing = target.bearing != null && isFinite(bearing);
        var arrowStyle = hasBearing ? ' style="transform:rotate(' + bearing.toFixed(1) + 'deg)"' : '';
        var distance = isFinite(target.distance) ? Number(target.distance).toFixed(1) + ' m' : t('unknown');
        h += '<div class="radar-row radar-row-' + target.kind + '">' +
          '<span class="radar-slot">' + slot + '</span>' +
          '<span class="radar-arrow" aria-hidden="true"' + arrowStyle + '>' + (hasBearing ? '↑' : '●') + '</span>' +
          '<strong>' + esc(t(target.labelKey)) + '</strong>' +
          '<span class="radar-bearing"><span>' + esc(t(target.absoluteKey)) + '</span><b>' + esc(distance) + '</b></span>' +
          '</div>';
      });
      host.innerHTML = h;
      host.classList.remove('hidden');
      this.updateRadarPlacement();
      if (document.documentElement) {
        var radarHeight = host.getBoundingClientRect ? host.getBoundingClientRect().height : host.offsetHeight;
        document.documentElement.style.setProperty('--toast-bottom', noMap ? '10px' : Math.ceil((radarHeight || 0) + 16) + 'px');
      }
    },

    alertRadar: function (target) {
      if (!target || !OC.Settings.get('radarVoice')) return;
      var distance = isFinite(target.distance) ? Number(target.distance).toFixed(1) + ' m' : t('unknown');
      var message = t(target.labelKey) + ' · ' + t(target.absoluteKey) + ' · ' + distance;
      this.fireAlert('radar', message, 'radar:' + target.id);
    },

    wireOverlay: function () {
      OC.Overlay.on('connected', function () {
        App.syncSystemLanguage();
        App.updateChips();
        App.updateMapVisible();
      });
      OC.Overlay.on('disconnected', function () {
        App.resetIsland();
        App.updateChips();
        App.updateMapVisible();
      });
      OC.Overlay.on('zone', function (territoryId) {
        if (OC.selectMap && OC.selectMap(territoryId)) {
          OC.Map.render(document.getElementById('mapLayer'));
          App.refreshRail();
        }
        App.resetIsland();
        App.updateChips(); App.updateMapVisible();
        if (OC.Overlay.inOccult) App.fetchDc();
      });
      OC.Overlay.on('position', function () {
        if (OC.selectMap && OC.selectMap(OC.Overlay.territoryId, OC.Overlay.playerPos)) {
          OC.Map.render(document.getElementById('mapLayer'));
          App.refreshRail();
        }
        OC.Map.updatePlayer(document.getElementById('mapLayer'));
        App.refreshHighlights();   // Include nearby bosses in highlights.
        if (App.resolveMyIsland()) App.pollMyIsland(true);
        else App.locateMyIslandFast();
      });
      OC.Overlay.on('playerContext', function () {
        App.scheduleKnownTrackerChecks();
        if (App.resolveMyIsland()) App.pollMyIsland(true);
        else App.locateMyIslandFast(true).then(function (found) {
          if (!found) App.fetchDc(true);
        });
      });
      OC.Overlay.on('memActive', function (id, active, detail) {
        detail = detail || {};
        var observedAt = Number(detail.observedAt) || now();
        if (OC.POTS[id]) {
          App._localPot = App._localPot || {};
          var observation = App._localPot[id] = App._localPot[id] || {};
          observation.active = active;
          observation.lastSeen = observedAt;
          if (active) {
            observation.deathEpoch = null;
            if (detail.startTrusted && detail.startEpoch) {
              observation.spawnEpoch = Number(detail.startEpoch);
              observation.spawnTrusted = true;
            }
          } else {
            observation.deathEpoch = observedAt;
          }
        }
        if (!active && detail.eventType === 'remove') App.recordTowerCompletion(id);
        App.refreshHighlights();
        if (!App.myIslandRowId) App.updatePreviewIsland();
        if (active) App.alertEncounter(id);
        var trustedFateContext = null;
        if (active && detail.startTrusted && detail.startEpoch && OC.FATES[id]) {
          trustedFateContext = App.adoptTrustedFateContext(id, Number(detail.startEpoch));
          App.scheduleTrackerCheck(id, Number(detail.startEpoch));
        }
        if (!App.resolveMyIsland()) App.locateMyIslandFast(true).then(function (found) {
          if (!found) App.fetchDc(true);
        });
        else {
          App.queueIslandUpload(trustedFateContext && trustedFateContext.fingerprint,
            detail.eventType === 'add', trustedFateContext);
          App.pollMyIsland(true);
        }
        if (!active && (OC.FATES[id] || OC.POTS[id])) {
          setTimeout(function () { App.fetchDc(true); }, 3200);
        }
      });
    },

    fetchDc: function (throttled) {
      var tn = Date.now();
      if (throttled && this._lastDcFetch && tn - this._lastDcFetch < 3000) return;
      this._lastDcFetch = tn;
      // Use a 30-minute window because long report intervals can otherwise hide the current island.
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 1252;
      OC.Api.fetchDcPots(this.trackerDatacenters(), 1800, territory).then(function (rows) {
        App._dcRows = rows;
        App._dc = OC.Pots.dcOverview(rows);
        App._islands = OC.Pots.islandList(rows);  // All active islands for identification, independent of Pot data.
        App._dcLoaded = true;
        var boundBefore = App.myIslandRowId;
        var resolved = App.resolveMyIsland();
        if (resolved && !boundBefore) App.queueIslandUpload();
        else App.updatePreviewIsland();
        App.pollMyIsland();
        App.updateChips();
        if (App.openPanel === 'dcpots') App.renderPanel();
      }).catch(function () { App._dcLoaded = true; });
    },

    applyIslandRecord: function (rec, id) {
      if (!rec) return;
      var territory = Number(rec.territory) || Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      var h = {
        territory: territory,
        lastUpdate: Number(rec.last_update) || 0,
        ce: pj(rec.encounter_history),
        fate: pj(rec.fate_history),
        pot: pj(rec.pot_history)
      };
      this.checkIslandAlerts(h);
      this._island = h;
      this.refreshHighlights();
      if (this.openPanel === 'battle' && (State.detailLocating || State.detailId === id)) {
        State.detailId = id;
        State.detailLocating = false;
        State.detail = h;
        this.renderPanel();
      }
    },

    pollMyIsland: function (throttled) {
      // Do not fetch island data off-island; stale data could trigger alerts.
      if (OC.Overlay.connected && !OC.Overlay.inOccult) { this._island = null; return; }
      var tn = Date.now();
      if (throttled && this._lastIslandFetch && tn - this._lastIslandFetch < 3000) return;
      this._lastIslandFetch = tn;
      var id = this.myIslandId;
      if (!id) { this._island = null; OC.State.highlights = []; OC.Map.updateHighlights(document.getElementById('mapLayer')); return; }
      var rowId = this.myIslandRowId;
      var request = rowId ? OC.Api.fetchTrackerRow(rowId) : OC.Api.fetchTracker(id);
      request.then(function (rec) {
        if (!rec) return;
        if ((rowId && App.myIslandRowId !== rowId) || (!rowId && App.myIslandId !== id)) return;
        App.applyIslandRecord(rec, id);
      }).catch(function () {});
    },

    // Map highlights combine local memory state with cloud state strictly bound to this island.
    refreshHighlights: function () {
      // 258 FateDirector is local island-wide state and takes priority for FATEs/Magic Pots.
      // Some ACT/game versions emit no 259 CEDirector in North Horn, so merge CEs from the
      // island tracker strictly bound by territory + world/DC + player-instance evidence.
      var ids = [];
      Object.keys(OC.Overlay.memActive || {}).forEach(function (k) {
        var id = Number(k); if (ids.indexOf(id) < 0) ids.push(id);
      });
      var trustLocalOnly = OC.Overlay.connected && OC.Overlay.inOccult;
      var isl = this._island;
      if (isl) {
        var shared = trustLocalOnly ? isl.ce : isl.ce.concat(isl.fate).concat(isl.pot);
        shared.forEach(function (e) {
          var id = Number(e.fate_id);
          var localMeta = (OC.Overlay.memMeta || {})[id];
          // A local 259 state is authoritative for this CE. Use the shared
          // tracker only when this ACT session has no director evidence for it.
          if (trustLocalOnly && OC.CES[id] && localMeta && localMeta.directorSeen) return;
          var active = OC.POTS[id] ? isActiveCandidate(e) : isAlive(e, isl.lastUpdate);
          if (active && id && ids.indexOf(id) < 0) ids.push(id);
        });
      }
      // ACT directors and the shared tracker can each miss one transient sample.
      // Show new encounters immediately, but require a continuous absence before
      // removing an existing capsule so a Remove/Add resync cannot make it flash.
      var activeNow = {};
      ids.forEach(function (id) { activeNow[id] = true; });
      var missingSince = this._highlightMissingSince = this._highlightMissingSince || {};
      var timestamp = Date.now();
      (OC.State.highlights || []).forEach(function (id) {
        id = Number(id);
        if (activeNow[id]) {
          delete missingSince[id];
          return;
        }
        if (!missingSince[id]) missingSince[id] = timestamp;
        if (timestamp - missingSince[id] < HIGHLIGHT_REMOVE_GRACE_MS) ids.push(id);
        else delete missingSince[id];
      });
      ids.forEach(function (id) {
        if (activeNow[id]) delete missingSince[id];
      });
      ids.sort(function (a, b) { return a - b; });
      OC.State.highlights = ids;
      OC.Map.updateHighlights(document.getElementById('mapLayer'));
      this.updateActive();
    },

    alertEncounter: function (id) {
      var isCe = !!OC.CES[id], isPot = !!OC.POTS[id];
      var def = isCe ? OC.CES[id] : isPot ? OC.POTS[id] : OC.FATES[id];
      if (!def) return;
      var kind = isCe ? 'ce' : isPot ? 'pot' : 'fate';
      var key = kind + ':' + id;
      this._alerted = this._alerted || {};
      if (this._alerted[key]) return;
      this._alerted[key] = 1;
      this.notifyEncounter(kind, id, def);
    },

    // Alert filtering: the global switch takes priority; otherwise use Pot and zone reward filters.
    notifyEncounter: function (kind, id, def) {
      if (OC.Settings.get('alertAllEncounters')) {
        this.fireAlert(kind, t('notify_' + kind) + ' · ' + nm(def.name), 'spawn:' + id);
        return;
      }
      if (kind === 'ce' && def.type === 'tower') {
        if (OC.Settings.get('alertTower')) this.fireAlert('ce', t('notify_ce') + ' · ' + nm(def.name), 'spawn:' + id);
        return;
      }
      if (kind === 'pot') {
        if (OC.Settings.get('alertPot')) this.fireAlert('pot', nm(def.name), 'spawn:' + id);
        return;
      }
      var colors = OC.Settings.get('alertColors') || {};
      var hit = (def.drops || []).filter(function (d) { return colors[d]; })[0];
      if (hit) this.fireAlert(kind, nm(def.name) + ' · ' + OC.localName(OC.ITEMS[hit].name, OC.Settings.get('lang')), 'spawn:' + id);
    },

    // Alert once per active lifetime when an island FATE/CE appears. Different reporters
    // repeatedly update cloud spawn_time, so it cannot identify a new spawn.
    checkIslandAlerts: function (h) {
      // Use local 258 state for island FATEs/Magic Pots. Some ACT versions lack 259 for
      // North Horn CEs, so a strictly bound island tracker may supplement CE alerts.
      var ceFallbackOnly = OC.Overlay.connected && OC.Overlay.inOccult;
      var first = !this._island;                 // First island fetch establishes a baseline without alerts.
      var alerted = this._alerted = this._alerted || {};
      ['ce', 'fate', 'pot'].forEach(function (tp) {
        if (ceFallbackOnly && tp !== 'ce') return;
        h[tp].forEach(function (e) {
          var key = tp + ':' + e.fate_id;
          var active = tp === 'pot' ? isActiveCandidate(e) : isAlive(e, h.lastUpdate);
          if (!active) {
            // Do not release the alert lock while memory shows active; cloud lag would duplicate alerts.
            if (!(OC.Overlay.memActive || {})[e.fate_id]) delete alerted[key];
            return;
          }
          if (alerted[key]) return;                            // Already alerted during this active lifetime.
          alerted[key] = 1;
          if (first) return;                                   // Do not alert for the baseline.
          var def = tp === 'ce' ? OC.CES[e.fate_id] : tp === 'pot' ? OC.POTS[e.fate_id] : OC.FATES[e.fate_id];
          if (!def) return;
          App.notifyEncounter(tp, e.fate_id, def);
        });
      });
    },

    // Magic Pot: alert three minutes before the expected spawn, not at spawn time.
    checkPotPreAlert: function () {
      if (!OC.Settings.get('alertPot')) return;
      var mine = this.localPotInfo();
      if (!mine || mine.alive || !mine.nextEpoch) return;
      var eta = mine.nextEpoch - Math.floor(Date.now() / 1000);
      // Key alerts by a five-minute bucket to avoid duplicates from reporter timestamp jitter.
      var slot = Math.round(mine.nextEpoch / 300);
      if (eta > 0 && eta <= 180 && this._potAlertedFor !== slot) {
        this._potAlertedFor = slot;
        var side = mine.side === 'north' ? t('pot_north') : mine.side === 'south' ? t('pot_south') : '';
        App.fireAlert('pot', t('pot_pre_alert') + (side ? ' · ' + side : ''), 'potpre');
      }
    },

    fireAlert: function (kind, msg, dedupKey) {
      // Do not alert off-island; this prevents unrelated or other-island announcements.
      if (OC.Overlay.connected && !OC.Overlay.inOccult) return;
      var now = Date.now();
      var key = dedupKey || msg;
      // Use a ten-minute spawn-alert window because a single spawn remains active for several minutes.
      var ttl = /^spawn:/.test(key) ? 600000 : 60000;
      this._alertLast = this._alertLast || {};
      if (this._alertLast[key] && now - this._alertLast[key] < ttl) return;
      // Deduplicate across overlay instances so only the first instance announces an alert.
      if (!claimAlert(key, ttl, now)) { this._alertLast[key] = now; return; }
      this._alertLast[key] = now;
      // Queue simultaneous alerts to prevent overlapping TTS playback.
      this._alertQueue = this._alertQueue || [];
      this._alertQueue.push({ kind: kind, msg: msg });
      this._drainAlerts();
    },

    _drainAlerts: function () {
      if (this._alertPlaying || !this._alertQueue || !this._alertQueue.length) return;
      var item = this._alertQueue.shift();
      this._alertPlaying = true;
      OC.UI.toast(item.kind, item.msg, '');
      if (!OC.UI.speak(item.msg)) OC.UI.beep(item.kind);
      setTimeout(function () {
        App._alertPlaying = false;
        App._drainAlerts();
      }, 3500);
    },

    startLoops: function () {
      setInterval(function () { App.fetchDc(); }, 5000);
      // Each second: update chips, timer text without redraw, and advance Pot warning alerts.
      setInterval(function () {
        App.updateChips();
        App.checkPotPreAlert();
        if (App.openPanel === 'dcpots' || App.openPanel === 'battle') {
          var expiredPot = OC.UI.tickPanel();
          if (expiredPot) App.renderPanel();
        }
      }, 1000);
    },

    renderSettings: function (pop) {
      var g = OC.Settings.get.bind(OC.Settings);
      var colors = g('alertColors') || {};
      var activeSection = ['general', 'treasure', 'alerts'].indexOf(this.settingsSection) >= 0
        ? this.settingsSection
        : 'general';
      this.settingsSection = activeSection;
      var swatch = {
        47744: '#4aa3ff', 47745: '#2ec4b6', 47746: '#3ddb63',
        47747: '#ff8a3c', 47748: '#b061ff', 47749: '#ffce4d',
        50974: '#5cb9ff', 50975: '#d58cff', 50976: '#ff83b6'
      };
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 1252;
      var rewardIds = territory === 1346
        ? [50974, 50975, 50976]
        : [47744, 47745, 47746, 47747, 47748, 47749];
      var h = '<div class="panel-head">' + t('panel_settings') + '<button class="pclose" data-close>' + t('close') + '</button></div>';
      h += '<div class="panel-body settings">';
      h += '<div class="settings-nav" role="tablist" aria-label="' + esc(t('panel_settings')) + '">';
      h += settingsNavButton('general', t('settings_tab_general'), activeSection);
      h += settingsNavButton('treasure', t('settings_tab_treasure'), activeSection);
      h += settingsNavButton('alerts', t('settings_tab_alerts'), activeSection);
      h += '</div>';

      h += settingsPageStart('general', activeSection);
      h += '<div class="settings-card"><div class="settings-card-title">' + t('settings_locale_title') + '</div>';
      var languageMode = OC.Settings.getRaw ? OC.Settings.getRaw('lang') : g('lang');
      h += choiceRow(t('set_lang'), t('set_lang_help'), '<div class="choice-grid lang-choice" role="group" aria-label="' + esc(t('set_lang')) + '">' + languageButtons(languageMode) + '</div>');
      h += choiceRow(t('set_data_region'), t('set_data_region_help'), '<div class="choice-grid region-choice" role="group" aria-label="' + esc(t('set_data_region')) + '">' + dataRegionButtons(g('dataRegion')) + '</div>');
      h += '</div>';
      h += '<div class="settings-card"><div class="settings-card-title">' + t('settings_display_title') + '</div>';
      h += rowChk('s-chips', t('set_show_chips'), g('showActiveChips'), t('set_show_chips_help'));
      h += sliderRow('s-op', 's-op-value', t('set_opacity'), g('opacity'), 0.3, 1, 0.05, Math.round(g('opacity') * 100) + '%');
      h += sliderRow('s-scale', 's-scale-value', t('set_scale'), g('uiScale') || 1, 0.8, 2, 0.1, Math.round((g('uiScale') || 1) * 100) + '%');
      h += '</div></section>';

      h += settingsPageStart('treasure', activeSection);
      h += '<div class="settings-card"><div class="settings-card-title">' + t('treasure_title') + '</div>';
      h += rowChk('s-treasure', t('set_treasure_guide'), g('treasureGuide'), t('set_treasure_guide_help'));
      h += '</div>';
      h += '<div class="settings-card"><div class="settings-card-title">' + t('radar_title') + '</div>';
      var radarEnabled = !!(g('radarCoffers') || g('radarCarrots'));
      h += rowChk('s-radar-coffers', t('set_radar_coffers'), g('radarCoffers'), t('set_radar_coffers_help'));
      h += rowChk('s-radar-carrots', t('set_radar_carrots'), g('radarCarrots'), t('set_radar_carrots_help'));
      h += '<div class="settings-dependent' + (radarEnabled ? '' : ' is-disabled') + '" data-radar-dependent>';
      h += rowChk('s-radar-pinned', t('set_radar_pinned'), g('radarPinned'), t('set_radar_pinned_help'), !radarEnabled);
      h += rowChk('s-radar-voice', t('set_radar_voice'), g('radarVoice'), t('set_radar_voice_help'), !radarEnabled);
      h += '</div></div></section>';

      h += settingsPageStart('alerts', activeSection);
      h += '<div class="settings-card"><div class="settings-card-title">' + t('settings_alert_rules') + '</div>';
      h += rowChk('a-all', t('alert_all'), g('alertAllEncounters'));
      h += rowChk('a-tower', t('alert_tower'), g('alertTower'));
      h += rowChk('a-pot', t('alert_pot_opt'), g('alertPot'));
      h += '</div>';
      h += '<div class="settings-card"><div class="settings-card-title">' + t('settings_drop_alerts') + '</div>';
      h += '<div class="settings-card-help">' + t(territory === 1346 ? 'alert_dispeller' : 'alert_demiatma') + '</div><div class="color-grid">';
      rewardIds.forEach(function (id) {
        var it = OC.ITEMS[id], on = !!colors[id];
        h += '<label class="color-chk' + (on ? ' on' : '') + '" data-cid="' + id + '" style="--sc:' + swatch[id] + '">' +
          '<input type="checkbox" data-color="' + id + '"' + (on ? ' checked' : '') + '>' +
          '<span class="sw"></span>' + esc(OC.localName(it.name, g('lang'))) + '</label>';
      });
      h += '</div></div>';
      h += '<div class="settings-card"><div class="settings-card-title">' + t('settings_alert_output') + '</div>';
      h += rowChk('a-tts', t('alert_tts'), g('useTts'), t('alert_tts_help'));
      h += '</div></section>';

      h += '<div class="repo-link"><a id="s-repo" href="#">github.com/zhui-zi/OccultOverlay</a></div>';
      var names = ['可畏', '三角初华', '柳墨琉', '茫lan', '皇帝驾到', '羽山凌', '魂魄妖妖梦', '正在烧烤中', '沧璃'];
      h += '<div class="made-with">made with 💗 for ' + esc(names[Math.floor(Math.random() * names.length)]) + '</div>';
      h += '</div>';
      pop.innerHTML = h;

      var op = pop.querySelector('#s-op');
      op.addEventListener('input', function () {
        OC.Settings.set('opacity', Number(op.value));
        document.documentElement.style.setProperty('--app-opacity', op.value);
        var output = pop.querySelector('#s-op-value');
        if (output) output.textContent = Math.round(Number(op.value) * 100) + '%';
      });
      var sc = pop.querySelector('#s-scale');
      sc.addEventListener('input', function () {
        OC.Settings.set('uiScale', Number(sc.value));
        App.applyUiScale();
        App.updateRadar();
        var output = pop.querySelector('#s-scale-value');
        if (output) output.textContent = Math.round(Number(sc.value) * 100) + '%';
      });
      pop.querySelectorAll('button[data-settings-section]').forEach(function (button) {
        button.addEventListener('click', function () {
          selectSettingsSection(pop, button.getAttribute('data-settings-section'));
        });
      });
      pop.querySelectorAll('button[data-lang]').forEach(function (button) {
        button.addEventListener('click', function () { App.changeLanguage(button.getAttribute('data-lang')); });
      });
      pop.querySelectorAll('button[data-data-region]').forEach(function (button) {
        button.addEventListener('click', function () { App.changeDataRegion(button.getAttribute('data-data-region')); });
      });
      bindChk(pop, 'a-pot', 'alertPot');
      bindChk(pop, 'a-all', 'alertAllEncounters');
      bindChk(pop, 'a-tower', 'alertTower', function () { App.updateActive(); });
      bindChk(pop, 'a-tts', 'useTts');
      var chipsChk = pop.querySelector('#s-chips');
      if (chipsChk) chipsChk.addEventListener('change', function () {
        OC.Settings.set('showActiveChips', chipsChk.checked);
        App.updateActive();
      });
      bindChk(pop, 's-treasure', 'treasureGuide', function (enabled) {
        if (OC.Treasure && OC.Treasure.setEnabled) OC.Treasure.setEnabled(enabled);
        App.updateTreasureGuide();
      });
      function refreshRadarSettings() {
        var enabled = !!(g('radarCoffers') || g('radarCarrots'));
        if (OC.Radar && OC.Radar.setEnabled) OC.Radar.setEnabled(enabled);
        App.updateRadar();
        syncRadarSettings(pop, enabled);
      }
      bindChk(pop, 's-radar-coffers', 'radarCoffers', refreshRadarSettings);
      bindChk(pop, 's-radar-carrots', 'radarCarrots', refreshRadarSettings);
      bindChk(pop, 's-radar-pinned', 'radarPinned', function () { App.updateRadar(); });
      bindChk(pop, 's-radar-voice', 'radarVoice');
      syncRadarSettings(pop, radarEnabled);
      var repo = pop.querySelector('#s-repo');
      if (repo) repo.addEventListener('click', function (e) {
        e.preventDefault();
        var url = 'https://github.com/zhui-zi/OccultOverlay';
        if (!OC.Overlay.openUrl(url)) window.open(url, '_blank');
      });
      pop.querySelectorAll('input[data-color]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var c = OC.Settings.get('alertColors') || {};
          c[cb.getAttribute('data-color')] = cb.checked;
          OC.Settings.set('alertColors', c);
          cb.closest('.color-chk').classList.toggle('on', cb.checked);
          if (cb.checked) OC.UI.speak(OC.localName(OC.ITEMS[cb.getAttribute('data-color')].name, g('lang')));
        });
      });
    }
  };

  // Deduplicate alerts across instances with origin-shared localStorage keys.
  // This prevents repeated announcements from multiple overlays or tabs.
  var ALERT_LS = 'occultOverlay.alerts';
  function claimAlert(key, ttl, now) {
    try {
      var map = JSON.parse(localStorage.getItem(ALERT_LS) || '{}');
      if (map[key] && now - map[key] < ttl) return false; // Another instance already announced it.
      map[key] = now;
      // Remove expired entries to prevent unbounded growth.
      Object.keys(map).forEach(function (k) { if (now - map[k] > 1800000) delete map[k]; });
      localStorage.setItem(ALERT_LS, JSON.stringify(map));
      return true;
    } catch (e) { return true; } // Do not block alerts when localStorage is unavailable.
  }

  function pj(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
  function isActiveCandidate(e) {
    return !!(e && (Number(e.state) > 0 ||
      (e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time))));
  }
  function isAlive(e, recordLastUpdate) {
    return OC.historyAlive(e, recordLastUpdate, now());
  }

  function rewardSuffix(drops) { return OC.UI.rewardSuffix(drops); }
  function choiceRow(l, help, c) {
    return '<div class="settings-choice"><div class="setting-name">' + l + '</div>' +
      '<div class="setting-help">' + help + '</div>' + c + '</div>';
  }
  function settingsNavButton(section, label, active) {
    var selected = section === active;
    return '<button type="button" class="settings-nav-btn' + (selected ? ' on' : '') + '" data-settings-section="' + section + '" role="tab" aria-selected="' + selected + '" aria-controls="settings-page-' + section + '">' + label + '</button>';
  }
  function settingsPageStart(section, active) {
    return '<section id="settings-page-' + section + '" class="settings-page" data-settings-page="' + section + '" role="tabpanel"' + (section === active ? '' : ' hidden') + '>';
  }
  function selectSettingsSection(pop, section) {
    if (['general', 'treasure', 'alerts'].indexOf(section) < 0) return;
    App.settingsSection = section;
    pop.querySelectorAll('button[data-settings-section]').forEach(function (button) {
      var active = button.getAttribute('data-settings-section') === section;
      button.classList.toggle('on', active);
      button.setAttribute('aria-selected', active);
    });
    pop.querySelectorAll('[data-settings-page]').forEach(function (page) {
      page.hidden = page.getAttribute('data-settings-page') !== section;
    });
  }
  function syncRadarSettings(pop, enabled) {
    var group = pop.querySelector('[data-radar-dependent]');
    if (group) group.classList.toggle('is-disabled', !enabled);
    ['#s-radar-pinned', '#s-radar-voice'].forEach(function (selector) {
      var input = pop.querySelector(selector);
      if (input) input.disabled = !enabled;
    });
  }
  function sliderRow(id, outputId, label, value, min, max, step, displayValue) {
    return '<label class="slider-setting" for="' + id + '"><span class="slider-label"><span class="setting-name">' + label + '</span><output id="' + outputId + '">' + displayValue + '</output></span>' +
      '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"></label>';
  }
  function choiceButtons(items, selected, attribute) {
    return items.map(function (item) {
      var active = selected === item[0];
      return '<button type="button" class="choice-btn' + (active ? ' on' : '') + '" data-' + attribute + '="' + item[0] + '" aria-pressed="' + active + '">' + esc(item[1]) + '</button>';
    }).join('');
  }
  function languageButtons(selected) {
    return choiceButtons([
      ['auto', t('lang_auto')],
      ['zh', '简体中文'],
      ['en', 'English'],
      ['ja', '日本語']
    ], selected, 'lang');
  }
  function dataRegionButtons(selected) {
    return choiceButtons([
      ['cn', t('data_region_cn')],
      ['global', t('data_region_global')]
    ], selected, 'data-region');
  }
  function rowChk(id, l, on, help, disabled) {
    return '<label class="setting-toggle">' +
      '<span class="setting-copy"><span class="setting-name">' + l + '</span>' + (help ? '<span class="setting-help">' + help + '</span>' : '') + '</span>' +
      '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="switch-track" aria-hidden="true"></span></label>';
  }
  function bindChk(pop, id, key, onChange) {
    var el = pop.querySelector('#' + id);
    if (el) el.addEventListener('change', function () {
      OC.Settings.set(key, el.checked);
      if (onChange) onChange(el.checked);
    });
  }
  function esc(s) { return OC.UI.esc(s); }

  function railHtml() {
    var L = OC.MAP_LAYERS, layers = OC.Settings.get('mapLayers');
    var h = '';
    L.forEach(function (l) {
      if (!OC.MAP.points[l.src] || !OC.MAP.points[l.src].length) return;
      var label = OC.i18n.t('layer_' + l.key);
      var marker = l.key === 'reroll' ? ' data-layer-label="' + esc(OC.i18n.t('layer_short_reroll')) + '"' : '';
      h += '<button class="rbtn' + (layers[l.key] ? ' on' : '') + '" data-layer="' + l.key + '"' + marker + ' title="' + esc(label) + '" aria-label="' + esc(label) + '" style="--rc:' + l.color + '">' +
        '<img class="rbtn-icon" src="' + esc(l.icon) + '" alt="" aria-hidden="true"></button>';
    });
    h += '<div class="rail-div"></div>';
    if (App.showsCnDcOverview()) h += '<button class="rbtn panel dc" data-panel="dcpots" title="' + OC.i18n.t('panel_dcpots') + '">罐</button>';
    h += '<button class="rbtn panel" data-panel="settings" title="' + OC.i18n.t('panel_settings') + '">⚙</button>';
    return h;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { App.init(); });
  else App.init();
})(typeof window !== 'undefined' ? window : this);
