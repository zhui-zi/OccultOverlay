(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var LAYERS = [
    { key: 'bronze', src: 'bronze', color: '#e0912f', r: 15 },
    { key: 'silver', src: 'silver', color: '#e8eef5', r: 17 },
    { key: 'potN', src: 'potNorth', color: '#4a90ff', r: 16, ring: true },
    { key: 'potS', src: 'potSouth', color: '#ff8a3c', r: 16, ring: true },
    { key: 'reroll', src: 'reroll', color: '#c56bff', r: 15, diamond: true },
    { key: 'bunny', src: 'bunny', color: '#3ddb63', r: 15, tri: true },
    { key: 'survey', src: 'survey', color: '#55e6d4', r: 15, square: true }
  ];
  OC.MAP_LAYERS = LAYERS;

  var Map = OC.Map = {
    layerDefs: LAYERS,

    handleBackgroundError: function (image) {
      if (!image) return;
      var href = image.getAttribute('href');
      var fallback = image.getAttribute('data-fallback');
      var finalFallback = image.getAttribute('data-final-fallback');
      if (fallback && href !== fallback && href !== finalFallback) {
        image.setAttribute('href', fallback);
      } else if (finalFallback && href !== finalFallback) {
        image.setAttribute('href', finalFallback);
      } else {
        image.remove();
      }
    },

    render: function (container) {
      if (!container) return;
      var layers = OC.Settings.get('mapLayers');
      var map = OC.MAP;
      var tex = map.texSize || 2048;
      var center = map.center || tex / 2;
      var pts = map.points;
      var background = map.background || 'assets/map.png';
      var fallbackBackground = map.fallbackBackground || '';
      var finalFallbackBackground = map.finalFallbackBackground || '';
      var s = '<svg viewBox="0 0 ' + tex + ' ' + tex + '" class="map-svg" preserveAspectRatio="xMidYMin meet">';
      s += '<g class="map-bg">';
      s += '<image href="' + esc(background) + '"' +
        (fallbackBackground ? ' data-fallback="' + esc(fallbackBackground) + '"' : '') +
        (finalFallbackBackground ? ' data-final-fallback="' + esc(finalFallbackBackground) + '"' : '') +
        ' x="0" y="0" width="' + tex + '" height="' + tex +
        '" onerror="OC.Map.handleBackgroundError(this)"/>';
      s += '<rect x="0" y="0" width="' + tex + '" height="' + tex + '" fill="#0a1018" opacity="0.15"/>';
      s += '</g>';

      s += '<g class="map-marks">';
      LAYERS.forEach(function (L) {
        if (!layers[L.key]) return;
        (pts[L.src] || []).forEach(function (p) { s += marker(p[0] + center, p[1] + center, L); });
      });
      s += '</g>';

      s += '<g class="radar-wrap">' + radarSvg() + '</g>';
      s += '<g class="hi-wrap">' + highlightsSvg() + '</g>';
      s += '<g class="you-wrap">' + youMarker() + '</g>';

      s += '</svg>';
      container.innerHTML = s;
    },

    updatePlayer: function (container) {
      container = container || document.getElementById('mapLayer');
      if (!container) return;
      var wrap = container.querySelector('.you-wrap');
      if (!wrap) return this.render(container);
      wrap.innerHTML = youMarker();
    },

    updateHighlights: function (container) {
      container = container || document.getElementById('mapLayer');
      if (!container) return;
      var wrap = container.querySelector('.hi-wrap');
      if (!wrap) return this.render(container);
      wrap.innerHTML = highlightsSvg();
    },

    updateRadar: function (container) {
      container = container || document.getElementById('mapLayer');
      if (!container) return;
      var wrap = container.querySelector('.radar-wrap');
      if (!wrap) return this.render(container);
      wrap.innerHTML = radarSvg();
    },

    toggle: function (key, container) {
      OC.Settings.toggleLayer(key);
      this.render(container);
    }
  };

  function radarSvg() {
    var list = OC.Radar && OC.Radar.targets ? OC.Radar.targets() : [];
    var center = (OC.MAP && OC.MAP.center) || 1024;
    var colors = { bronze: '#e0912f', silver: '#e8eef5', carrot: '#3ddb63' };
    var s = '';
    list.forEach(function (target) {
      if (!isFinite(target.x) || !isFinite(target.z)) return;
      var x = Number(target.x) + center;
      var y = Number(target.z) + center;
      var color = colors[target.kind] || '#fff';
      var label = target.kind === 'carrot' ? 'C' : String(target.slot || '');
      s += '<g class="radar-mark radar-' + esc(target.kind) + '">' +
        '<circle class="radar-pulse" cx="' + x + '" cy="' + y + '" r="34" fill="none" stroke="' + color + '" stroke-width="7"/>' +
        '<circle cx="' + x + '" cy="' + y + '" r="22" fill="' + color + '" stroke="#071019" stroke-width="6"/>' +
        '<text x="' + x + '" y="' + (y + 10) + '" text-anchor="middle" class="radar-label">' + label + '</text>' +
        '</g>';
    });
    return s;
  }

  function highlightsSvg() {
    var ids = (OC.State && OC.State.highlights) || [];
    // 实时坐标优先：bossPos 来自 getCombatants（走近 boss 时更新），否则用静态表
    var bossPos = (OC.Overlay && OC.Overlay.bossPos) || {};
    var center = (OC.MAP && OC.MAP.center) || 1024;
    var s = '';
    ids.forEach(function (id) {
      var loc = bossPos[id] || OC.MAP.encounters[id]; if (!loc) return;
      var isCe = !!OC.CES[id];
      var col = isCe ? '#ff4d4d' : (OC.POTS[id] ? '#b061ff' : '#ffd24d');
      var x = loc[0] + center, y = loc[1] + center;
      var label = OC.localName((OC.CES[id] || OC.FATES[id] || OC.POTS[id] || {}).name, OC.Settings.get('lang')) || '';
      s += '<g class="hi-mark">' +
        '<circle cx="' + x + '" cy="' + y + '" r="42" fill="none" stroke="' + col + '" stroke-width="8"/>' +
        '<circle cx="' + x + '" cy="' + y + '" r="14" fill="' + col + '" stroke="#000" stroke-width="3"/>' +
        '<text x="' + x + '" y="' + (y - 62) + '" text-anchor="middle" class="hi-label">' + esc(label) + '</text></g>';
    });
    return s;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function youMarker() {
    var pp = OC.Overlay && OC.Overlay.playerPos;
    if (!pp) return '';
    var center = (OC.MAP && OC.MAP.center) || 1024;
    var x = pp.x + center, y = pp.z + center;
    var g = '<g class="you">';
    // 面向：柔和的锥形视野扇（heading 弧度，0=朝南=向下）
    if (pp.h != null) {
      var d = { x: Math.sin(pp.h), y: Math.cos(pp.h) };
      var pr = { x: Math.cos(pp.h), y: -Math.sin(pp.h) };
      var tip = [x + d.x * 46, y + d.y * 46];
      var bl = [x + d.x * 10 + pr.x * 15, y + d.y * 10 + pr.y * 15];
      var br = [x + d.x * 10 - pr.x * 15, y + d.y * 10 - pr.y * 15];
      g += '<path d="M' + bl[0].toFixed(1) + ' ' + bl[1].toFixed(1) + ' L' + tip[0].toFixed(1) + ' ' + tip[1].toFixed(1) +
        ' L' + br[0].toFixed(1) + ' ' + br[1].toFixed(1) + ' Z" fill="rgba(255,255,255,0.55)"/>';
    }
    g += '<circle cx="' + x + '" cy="' + y + '" r="22" fill="rgba(225,29,72,0.2)"/>';
    g += '<circle cx="' + x + '" cy="' + y + '" r="11" fill="#fff" stroke="#e11d48" stroke-width="5"/>';
    g += '</g>';
    return g;
  }

  function marker(x, y, L) {
    var c = L.color, r = L.r;
    // 白色描边光晕，保证在地图上清晰可见
    var halo = 'stroke="#0a0f16" stroke-width="4"';
    if (L.diamond) {
      return '<path d="M' + x + ' ' + (y - r) + ' L' + (x + r) + ' ' + y + ' L' + x + ' ' + (y + r) + ' L' + (x - r) + ' ' + y + ' Z" fill="' + c + '" ' + halo + '/>';
    }
    if (L.tri) {
      return '<path d="M' + x + ' ' + (y - r) + ' L' + (x + r) + ' ' + (y + r) + ' L' + (x - r) + ' ' + (y + r) + ' Z" fill="' + c + '" ' + halo + '/>';
    }
    if (L.square) {
      return '<rect x="' + (x - r) + '" y="' + (y - r) + '" width="' + (r * 2) + '" height="' + (r * 2) + '" rx="4" fill="' + c + '" ' + halo + '/>' +
        '<path d="M' + (x - 8) + ' ' + y + ' H' + (x + 8) + ' M' + x + ' ' + (y - 8) + ' V' + (y + 8) + '" stroke="#0a0f16" stroke-width="4"/>';
    }
    var out = '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '" ' + halo + '/>';
    if (L.ring) out += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 7) + '" fill="none" stroke="' + c + '" stroke-width="3"/>';
    return out;
  }
})(typeof window !== 'undefined' ? window : this);
