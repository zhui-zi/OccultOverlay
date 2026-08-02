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
  var TRACKER_VERSION = 'OccultOverlay-v69';
  var HIGHLIGHT_REMOVE_GRACE_MS = 7000;

  var State = OC.State = { highlights: [], detail: null, detailId: null, detailLocating: false };

  var App = OC.App = {
    openPanel: null,
    collapsed: false,
    _dc: [],        // 撒娇罐总览数据（去重排序后）
    _dcTick: 0,

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
      if (this.openPanel) this.renderPanel();
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
        global.addEventListener('resize', function () { App.applyUiScale(); });
        global.addEventListener('languagechange', function () {
          if (OC.Settings.getRaw && OC.Settings.getRaw('lang') === 'auto') App.changeLanguage('auto');
        });
      }
      this.renderShell();
      this.wireOverlay();
      OC.Overlay.start();
      this.fetchDc();
      this.startLoops();
    },

    renderShell: function () {
      var app = document.getElementById('app');
      var h = '';
      h += '<div id="mapLayer" class="map-layer"></div>';
      h += '<div class="chips">';
      h += '<div id="chip-conn" class="chip chip-conn clickable" title="' + t('collapse') + '"></div>';
      h += '<div id="chip-pot" class="chip chip-pot clickable" title="' + t('my_island_hint') + '"></div>';
      h += '<div id="chips-active" class="chips-active"></div>';
      h += '</div>';
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

    // 构造与 DR 相同的实例证据：大区 + 最新可信普通 FATE + Add 时间。
    // 进岛/重连时 OverlayPlugin 重放的 Add 不是出生时间，不参与指纹。
    // Remove 时间可用于稍后与云端历史唯一匹配。
    instanceEvidence: function () {
      var meta = OC.Overlay.memMeta || {};
      var events = [];
      var ends = [];
      Object.keys(meta).forEach(function (key) {
        var id = Number(key), item = meta[key] || {};
        if (item.spawnTrusted && item.spawnEpoch && id !== 48) {
          events.push({ fateId: id, spawnEpoch: Number(item.spawnEpoch) });
        }
        if (item.deathEpoch && (OC.FATES[id] || OC.POTS[id])) {
          ends.push({ fateId: id, deathEpoch: Number(item.deathEpoch) });
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
        events: events,
        ends: ends,
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

    // 已经严格绑定本岛后，后续可信 FATE Add 仍属于同一实例。
    // 立即推进绑定指纹，避免等待共享记录回写期间把本岛罐时误判为未知。
    adoptTrustedFateContext: function (fateId, spawnEpoch) {
      var context = this.trackerContext(fateId, spawnEpoch);
      if (context && this.myIslandRowId) this.myIslandFingerprint = context.fingerprint;
      return context;
    },

    bindMatchedIsland: function (matched, record) {
      if (!matched) return null;
      if (this.myIslandRowId && Number(this.myIslandRowId) !== Number(matched.rowId)) {
        return null;
      }
      if (!record && this._previewIsland &&
          Number(this._previewIsland.rowId) === Number(matched.rowId)) {
        record = this._previewIsland.record;
      }
      var changed = this.myIslandRowId !== matched.rowId;
      this.myIslandRowId = matched.rowId;
      this.myIslandFingerprint = matched.fingerprint || '';
      this.myIslandId = matched.id || ('row:' + matched.rowId);
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
      if (!this.myIslandRowId && this.cloudIslandEvidenceCount(this.instanceEvidence(), record && {
        fate: pj(record.fate_history),
        pot: pj(record.pot_history)
      }) < 2) return null;
      var id = this.bindMatchedIsland(matched, record);
      if (!id) return null;
      return id;
    },

    // 仅接受 DR 指纹或唯一的本地 Add 时间匹配。普通“同 FATE 正在进行”
    // 在多岛环境没有区分度，不能用于显示魔法罐倒计时。
    resolveMyIsland: function () {
      var all = this._islands || [];
      var pdc = OC.Overlay.playerDc;
      var evidence = this.instanceEvidence();
      var matched = OC.Pots.matchIsland(all, evidence, pdc, 15);
      if (matched) {
        if (!this.myIslandRowId) {
          var record = (this._dcRows || []).filter(function (row) {
            return Number(row.id) === Number(matched.rowId);
          })[0];
          if (!record && this._previewIsland &&
              Number(this._previewIsland.rowId) === Number(matched.rowId)) {
            record = this._previewIsland.record;
          }
          if (this.cloudIslandEvidenceCount(evidence, record && {
            fate: pj(record.fate_history),
            pot: pj(record.pot_history)
          }) < 2) return null;
        }
        var bound = this.bindMatchedIsland(matched);
        if (bound) return bound;
      }
      // 强证据绑定后保持到换区/断线；云端列表短暂掉线不能让正确实例丢失。
      if (this.myIslandRowId) return this.myIslandId;
      return null;
    },

    // 参考 AutoPopper/DR：有 Add 指纹后直接按 last_fate 查询，而不是等待
    // 当前数据服务器对应的数据中心记录下载完成。查询结果仍需通过同一套严格匹配。
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
        if (!local) {
          if (snapshotComplete && isAlive(entry)) {
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
        if (seen > Number(entry.last_seen || -1)) entry.last_seen = seen;
        if (!Array.isArray(entry.respawn_times)) entry.respawn_times = [];
        if (!isFinite(Number(entry.killed_fates))) entry.killed_fates = 0;
        if (!isFinite(Number(entry.killed_ces))) entry.killed_ces = 0;
        return entry;
      });
    },

    buildLocalTrackerRecord: function (fingerprint) {
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 0;
      var dc = Number(OC.Overlay.playerDc) || 0;
      var def = OC.TERRITORIES && OC.TERRITORIES[territory];
      if (!def || !dc || !this.isDatacenterInScope(dc) || !/^[0-9A-F]{64}$/i.test(String(fingerprint || ''))) return null;
      var shared = this._island || {};
      return {
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
              App.queueIslandUpload(null, true);
              App.updateChips();
              return true;
            }
            context.stopRetry = true;
            return false;
          }
          if (App.myIslandRowId) {
            App._missingTrackerChecks[checkKey] = 0;
            App.queueIslandUpload(context.fingerprint, true);
            return true;
          }

          if (App.localInstanceSignalCount(App.instanceEvidence()) < 2) {
            context.stopRetry = true;
            return false;
          }

          App._missingTrackerChecks[checkKey] =
            Number(App._missingTrackerChecks[checkKey] || 0) + 1;
          if (App._missingTrackerChecks[checkKey] < 2) return false;
          var record = App.buildLocalTrackerRecord(context.fingerprint);
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
              App._scheduledTrackerChecks[key] = setTimeout(runCheck, 3000);
            } else {
              App._checkedTrackerKeys[key] = true;
            }
          });
      }
      this._scheduledTrackerChecks[key] = setTimeout(runCheck, 8000);
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

    queueIslandUpload: function (fingerprint, immediate) {
      if (!this.myIslandRowId || !OC.Overlay.connected || !OC.Overlay.inOccult) return;
      this._pendingUploadFingerprint = fingerprint || this.instanceEvidence().fingerprint || this.myIslandFingerprint;
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
          var fingerprint = App._pendingUploadFingerprint ||
            App.instanceEvidence().fingerprint || App.myIslandFingerprint;
          App._pendingUploadFingerprint = '';
          var record = App.buildLocalTrackerRecord(fingerprint);
          if (!record) return false;
          return OC.Api.updateIslandTracker(rowId, record).then(function (updated) {
            if (generation !== (App._locateGeneration || 0) ||
                Number(rowId) !== Number(App.myIslandRowId)) return false;
            if (updated) {
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

    // 每次区域/实例切换或断线都清空；即便 territoryId 相同也重新识别。
    resetIsland: function (preserveLocal) {
      this.myIslandId = null; this.myIslandRowId = null; this.myIslandFingerprint = '';
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
      this._previewIsland = null; this._dcRows = []; this._dc = []; this._islands = []; this._dcLoaded = false;
      this._island = null; this._potAlertedFor = null; this._alerted = {};
      this._highlightMissingSince = {};
      this._lastIslandFetch = 0; this._lastDcFetch = 0;
      if (!preserveLocal) this._localPot = null; // 换本后本机观测的罐状态作废
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

    // 不在新月岛时完全隐藏悬浮窗；在岛内则按折叠状态决定是否显示地图
    updateMapVisible: function () {
      var app = document.getElementById('app'); if (!app) return;
      // 未连接游戏=独立/调试模式，保持显示
      var outside = OC.Overlay.connected && !OC.Overlay.inOccult;
      app.style.display = outside ? 'none' : '';
      var toasts = document.getElementById('toasts');
      if (toasts) toasts.style.display = outside ? 'none' : '';
      app.classList.toggle('no-map', this.collapsed);
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
      // 保持滚动位置（面板每秒重绘，避免被顶回最上）
      var oldBody = pop.querySelector('.panel-body');
      var scroll = oldBody ? oldBody.scrollTop : 0;
      if (this.openPanel === 'dcpots') OC.UI.renderDcPots(pop, this._dc, !this._dcLoaded);
      else if (this.openPanel === 'battle') OC.UI.renderBattlePanel(pop, State.detail, State.detailId, State.detailLocating);
      else if (this.openPanel === 'settings') this.renderSettings(pop);
      pop.classList.toggle('compact', this.openPanel === 'dcpots'); // 魔法罐总览用紧凑样式
      var newBody = pop.querySelector('.panel-body');
      if (newBody && scroll) newBody.scrollTop = scroll;
    },

    // 顶部罐计时始终打开本岛详情；未严格定位时停留在本岛定位状态，
    // 不回退到与右侧“罐”按钮重复的四大区总览。
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
      // 网络数据每 5 秒刷新一次；两次请求之间仍需按当前时间推进 30 分钟轮次，
      // 否则倒计时到 0 后会停在“即将出现”。
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

    cloudIslandEvidenceCount: function (evidence, history) {
      evidence = evidence || {};
      history = history || this._island;
      if (!history && this._dcRows && this.myIslandRowId) {
        var row = this._dcRows.filter(function (item) {
          return Number(item.id) === Number(App.myIslandRowId);
        })[0];
        if (row) {
          history = {
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

    // 本机可信 Add/Remove 不等待实例匹配；云端时间只允许来自严格确认的实例。
    localPotInfo: function () {
      var evidence = this.instanceEvidence();
      var currentFingerprint = String(evidence.fingerprint || '').toUpperCase();
      var boundFingerprint = String(this.myIslandFingerprint || '').toUpperCase();
      var currentFingerprints = (evidence.fingerprints || []).map(function (fingerprint) {
        return String(fingerprint || '').toUpperCase();
      });
      if (currentFingerprint && currentFingerprints.indexOf(currentFingerprint) < 0) {
        currentFingerprints.push(currentFingerprint);
      }
      // 结束时间和 director 快照足以辅助定位，但不能授权精确罐子时间。
      // 只有绑定记录的指纹仍在当前本机 Add 的 ±15 秒严格证据窗口内，且该行
      // 至少与两个不同的本机 Add/Remove 信号一致，才采用云端锚点。单个 FATE
      // 可能与其它岛时间碰撞；ACT 观测时间与 tracker StartTimeEpoch 也可有数秒偏差。
      // 否则与 OccultPotNotifier 一样保持未知，避免弱绑定把其它岛的罐时带进来。
      var cloudTimingAuthorized = !!this.myIslandRowId && !!boundFingerprint &&
        currentFingerprints.indexOf(boundFingerprint) >= 0 &&
        this.cloudIslandEvidenceCount(evidence) >= 2;
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
        if (localDirectorsAreAuthoritative && isAlive(copy) &&
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

      // update 事件可能是悬浮窗重载后才收到的首个信号，没有可靠 spawn_time。
      // 此时只确认“正在进行”和方位，不伪造下一轮的精确时间。
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

    // 当前岛正在进行的 FATE/CE 胶囊（随界面缩放；带掉落颜色后缀）
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
          return '<div class="chip chip-act ' + cls + '">' + OC.UI.esc(nm(def.name)) + rewardSuffix(def.drops) + '</div>';
        }).join('');
      }
      // Rebuilding identical nodes makes ACT's Chromium surface flash.
      if (box._ocActiveHtml === html) return;
      box._ocActiveHtml = html;
      box.innerHTML = html;
    },

    wireOverlay: function () {
      OC.Overlay.on('connected', function () { App.updateChips(); App.updateMapVisible(); });
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
        App.refreshHighlights();   // 视野内的 boss 也纳入高亮
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
            detail.eventType === 'add');
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
      // 30 分钟窗口：岛屿上报间隔可能较长，窗口太窄会导致识别不到所在岛
      var territory = Number(OC.Overlay.territoryId) || Number(OC.MAP && OC.MAP.territory) || 1252;
      OC.Api.fetchDcPots(this.trackerDatacenters(), 1800, territory).then(function (rows) {
        App._dcRows = rows;
        App._dc = OC.Pots.dcOverview(rows);
        App._islands = OC.Pots.islandList(rows);  // 全部活跃岛（用于识别所在岛，不依赖罐数据）
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
      // 不在新月岛时不拉取本岛数据（避免残留数据触发提示）
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

    // 地图高亮 = 本机内存态 ∪ 已严格定位到本岛的云端状态。
    refreshHighlights: function () {
      // 258 FateDirector 是本机全岛状态，优先用于 FATE/魔法罐。
      // 部分 ACT/游戏版本在北征完全不产出 259 CEDirector，因此 CE 必须合并
      // 已通过 territory + world/DC + 玩家实例证据严格绑定的本岛 tracker。
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
          if (isAlive(e) && id && ids.indexOf(id) < 0) ids.push(id);
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

    // 播报筛选：总开关优先；关闭时使用魔法罐和当前区域关键奖励筛选。
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

    // 岛上 FATE/CE 刷新时提示：同一目标在“存活期间”只提示一次
    // （云端 spawn_time 会被不同上报者反复更新，不能用它判断“新出现”）
    checkIslandAlerts: function (h) {
      // 岛内 FATE/魔法罐以本机 258 为准；北征 CE 在部分 ACT 版本没有 259，
      // 因此允许已严格绑定到本岛的 tracker 补足 CE 播报。
      var ceFallbackOnly = OC.Overlay.connected && OC.Overlay.inOccult;
      var first = !this._island;                 // 首次拉取该岛：只建立基线，不提示
      var alerted = this._alerted = this._alerted || {};
      ['ce', 'fate', 'pot'].forEach(function (tp) {
        if (ceFallbackOnly && tp !== 'ce') return;
        h[tp].forEach(function (e) {
          var key = tp + ':' + e.fate_id;
          if (!isAlive(e)) {
            // 云端可能滞后/抖动：内存仍显示进行中时不要解除提示锁，否则会重复播报
            if (!(OC.Overlay.memActive || {})[e.fate_id]) delete alerted[key];
            return;
          }
          if (alerted[key]) return;                            // 存活期间已提示过
          alerted[key] = 1;
          if (first) return;                                   // 基线不提示
          var def = tp === 'ce' ? OC.CES[e.fate_id] : tp === 'pot' ? OC.POTS[e.fate_id] : OC.FATES[e.fate_id];
          if (!def) return;
          App.notifyEncounter(tp, e.fate_id, def);
        });
      });
    },

    // 撒娇罐：预计出现前 3 分钟提示（而非出现时）
    checkPotPreAlert: function () {
      if (!OC.Settings.get('alertPot')) return;
      var mine = this.localPotInfo();
      if (!mine || mine.alive || !mine.nextEpoch) return;
      var eta = mine.nextEpoch - Math.floor(Date.now() / 1000);
      // 用“取整到 5 分钟”的窗口做标记，避免各上报者时间戳抖动导致重复提示
      var slot = Math.round(mine.nextEpoch / 300);
      if (eta > 0 && eta <= 180 && this._potAlertedFor !== slot) {
        this._potAlertedFor = slot;
        var side = mine.side === 'north' ? t('pot_north') : mine.side === 'south' ? t('pot_south') : '';
        App.fireAlert('pot', t('pot_pre_alert') + (side ? ' · ' + side : ''), 'potpre');
      }
    },

    fireAlert: function (kind, msg, dedupKey) {
      // 不在新月岛时不提示（避免播报其它岛/无关数据）
      if (OC.Overlay.connected && !OC.Overlay.inOccult) return;
      var now = Date.now();
      var key = dedupKey || msg;
      // 出现类提示用长窗口（10 分钟）：同一次出现持续数分钟，短窗口会重复播报
      var ttl = /^spawn:/.test(key) ? 600000 : 60000;
      this._alertLast = this._alertLast || {};
      if (this._alertLast[key] && now - this._alertLast[key] < ttl) return;
      // 跨实例去重：同一浏览器/悬浮窗开了多个实例时，只让第一个播报
      if (!claimAlert(key, ttl, now)) { this._alertLast[key] = now; return; }
      this._alertLast[key] = now;
      // 排队播报：同一时刻多个提示时依次播放，避免 TTS 叠在一起
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
      // 每秒：更新胶囊 + 面板计时文本（不重绘，避免滚动被顶回/闪烁）+ 撒娇罐提前提示
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
      h += '<div class="s-grp">' + t('alert_title') + '</div>';
      h += rowChk('a-all', t('alert_all'), g('alertAllEncounters'));
      h += rowChk('a-tower', t('alert_tower'), g('alertTower'));
      h += rowChk('a-pot', t('alert_pot_opt'), g('alertPot'));
      h += '<div class="s-sub">' + t(territory === 1346 ? 'alert_dispeller' : 'alert_demiatma') + '</div><div class="color-grid">';
      rewardIds.forEach(function (id) {
        var it = OC.ITEMS[id], on = !!colors[id];
        h += '<label class="color-chk' + (on ? ' on' : '') + '" data-cid="' + id + '" style="--sc:' + swatch[id] + '">' +
          '<input type="checkbox" data-color="' + id + '"' + (on ? ' checked' : '') + '>' +
          '<span class="sw"></span>' + esc(OC.localName(it.name, g('lang'))) + '</label>';
      });
      h += '</div>';
      h += rowChk('a-tts', t('alert_tts'), g('useTts'));
      h += '<div class="s-grp">' + t('panel_settings') + '</div>';
      var languageMode = OC.Settings.getRaw ? OC.Settings.getRaw('lang') : g('lang');
      h += row(t('set_lang'), '<select id="s-lang">' + languageOptions(languageMode) + '</select>');
      h += row(t('set_data_region'), '<select id="s-data-region">' + dataRegionOptions(g('dataRegion')) + '</select>');
      h += rowChk('s-chips', t('set_show_chips'), g('showActiveChips'));
      h += row(t('set_opacity'), '<input id="s-op" type="range" min="0.3" max="1" step="0.05" value="' + g('opacity') + '">');
      h += row(t('set_scale'), '<input id="s-scale" type="range" min="0.8" max="2" step="0.1" value="' + (g('uiScale') || 1) + '">');
      h += '<div class="repo-link"><a id="s-repo" href="#">github.com/zhui-zi/OccultOverlay</a></div>';
      var names = ['可畏', '三角初华', '柳墨琉', '茫lan', '皇帝驾到', '羽山凌', '魂魄妖妖梦', '正在烧烤中', '沧璃'];
      h += '<div class="made-with">made with 💗 for ' + esc(names[Math.floor(Math.random() * names.length)]) + '</div>';
      h += '</div>';
      pop.innerHTML = h;

      var op = pop.querySelector('#s-op');
      op.addEventListener('input', function () {
        OC.Settings.set('opacity', Number(op.value));
        document.documentElement.style.setProperty('--app-opacity', op.value);
      });
      var sc = pop.querySelector('#s-scale');
      sc.addEventListener('input', function () {
        OC.Settings.set('uiScale', Number(sc.value));
        App.applyUiScale();
      });
      var lang = pop.querySelector('#s-lang');
      if (lang) lang.addEventListener('change', function () { App.changeLanguage(lang.value); });
      var dataRegion = pop.querySelector('#s-data-region');
      if (dataRegion) dataRegion.addEventListener('change', function () { App.changeDataRegion(dataRegion.value); });
      bindChk(pop, 'a-pot', 'alertPot');
      bindChk(pop, 'a-all', 'alertAllEncounters');
      bindChk(pop, 'a-tower', 'alertTower', function () { App.updateActive(); });
      bindChk(pop, 'a-tts', 'useTts');
      var chipsChk = pop.querySelector('#s-chips');
      if (chipsChk) chipsChk.addEventListener('change', function () {
        OC.Settings.set('showActiveChips', chipsChk.checked);
        App.updateActive();
      });
      var repo = pop.querySelector('#s-repo');
      if (repo) repo.addEventListener('click', function (e) {
        e.preventDefault();
        var url = 'https://github.com/zhui-zi/OccultOverlay';
        // 优先让 ACT 用系统浏览器打开；未连接时回退到普通打开
        if (!OC.Overlay.openUrl(url)) window.open(url, '_blank');
      });
      pop.querySelectorAll('input[data-color]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var c = OC.Settings.get('alertColors') || {};
          c[cb.getAttribute('data-color')] = cb.checked;
          OC.Settings.set('alertColors', c);
          cb.closest('.color-chk').classList.toggle('on', cb.checked);
          if (cb.checked) OC.UI.speak(OC.localName(OC.ITEMS[cb.getAttribute('data-color')].name, g('lang'))); // 试听
        });
      });
    }
  };

  // 跨实例提示去重：用 localStorage 记录已播报的 key（同源共享）。
  // 多个悬浮窗实例/标签页同时运行时，避免同一条提示被读好几遍。
  var ALERT_LS = 'occultOverlay.alerts';
  function claimAlert(key, ttl, now) {
    try {
      var map = JSON.parse(localStorage.getItem(ALERT_LS) || '{}');
      if (map[key] && now - map[key] < ttl) return false; // 已有实例播报过
      map[key] = now;
      // 清理过期项，避免无限增长
      Object.keys(map).forEach(function (k) { if (now - map[k] > 1800000) delete map[k]; });
      localStorage.setItem(ALERT_LS, JSON.stringify(map));
      return true;
    } catch (e) { return true; } // localStorage 不可用时不阻断提示
  }

  function pj(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
  function isAlive(e) {
    return !!(e && (Number(e.state) > 0 ||
      (e.spawn_time > 0 && (e.death_time <= 0 || e.death_time < e.spawn_time))));
  }

  function rewardSuffix(drops) { return OC.UI.rewardSuffix(drops); }
  function row(l, c) { return '<div class="s-row"><label>' + l + '</label>' + c + '</div>'; }
  function languageOptions(selected) {
    return [
      ['auto', t('lang_auto')],
      ['zh', '简体中文'],
      ['en', 'English'],
      ['ja', '日本語']
    ].map(function (item) {
      return '<option value="' + item[0] + '"' + (selected === item[0] ? ' selected' : '') + '>' + item[1] + '</option>';
    }).join('');
  }
  function dataRegionOptions(selected) {
    return [
      ['cn', t('data_region_cn')],
      ['global', t('data_region_global')]
    ].map(function (item) {
      return '<option value="' + item[0] + '"' + (selected === item[0] ? ' selected' : '') + '>' + item[1] + '</option>';
    }).join('');
  }
  function rowChk(id, l, on) { return '<div class="s-row s-check"><label><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + l + '</label></div>'; }
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
      h += '<button class="rbtn' + (layers[l.key] ? ' on' : '') + '" data-layer="' + l.key + '" title="' + OC.i18n.t('layer_' + l.key) + '" style="--rc:' + l.color + '">' + OC.i18n.t('layer_short_' + l.key) + '</button>';
    });
    h += '<div class="rail-div"></div>';
    if (App.showsCnDcOverview()) h += '<button class="rbtn panel dc" data-panel="dcpots" title="' + OC.i18n.t('panel_dcpots') + '">罐</button>';
    h += '<button class="rbtn panel" data-panel="settings" title="' + OC.i18n.t('panel_settings') + '">⚙</button>';
    return h;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { App.init(); });
  else App.init();
})(typeof window !== 'undefined' ? window : this);
