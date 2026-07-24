/* =========================================================================
 * map.js — 主视图：地图 + 点位图层 + CE/FATE 高亮 + 玩家位置
 * 底图 assets/map.png（2048x2048），世界坐标 (x,z) -> 像素 (x+1024, z+1024)。
 * 只有底图受不透明度影响；标记始终清晰（不透明）。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var TEX = 2048;

  var LAYERS = [
    { key: 'bronze', src: 'bronze', color: '#e0912f', r: 15 },
    { key: 'silver', src: 'silver', color: '#e8eef5', r: 17 },
    { key: 'potN', src: 'potNorth', color: '#4a90ff', r: 16, ring: true },
    { key: 'potS', src: 'potSouth', color: '#ff8a3c', r: 16, ring: true },
    { key: 'reroll', src: 'reroll', color: '#c56bff', r: 15, diamond: true },
    { key: 'bunny', src: 'bunny', color: '#3ddb63', r: 15, tri: true }
  ];
  OC.MAP_LAYERS = LAYERS;

  var Map = OC.Map = {
    layerDefs: LAYERS,

    render: function (container) {
      if (!container) return;
      var layers = OC.Settings.get('mapLayers');
      var pts = OC.MAP.points;
      var s = '<svg viewBox="0 0 ' + TEX + ' ' + TEX + '" class="map-svg" preserveAspectRatio="xMidYMid meet">';
      // 仅底图受不透明度影响
      s += '<g class="map-bg">';
      s += '<image href="assets/map.png" x="0" y="0" width="' + TEX + '" height="' + TEX + '" onerror="this.remove()"/>';
      s += '<rect x="0" y="0" width="' + TEX + '" height="' + TEX + '" fill="#0a1018" opacity="0.15"/>';
      s += '</g>';

      // 标记层（始终清晰）
      s += '<g class="map-marks">';
      LAYERS.forEach(function (L) {
        if (!layers[L.key]) return;
        (pts[L.src] || []).forEach(function (p) { s += marker(p[0] + 1024, p[1] + 1024, L); });
      });
      // CE/FATE 高亮（进行中的）
      (OC.State && OC.State.highlights ? OC.State.highlights : []).forEach(function (h) {
        var loc = OC.MAP.encounters[h.id]; if (!loc) return;
        var col = h.type === 'ce' ? '#ff4d4d' : '#5b9bd5';
        s += '<g class="hi-mark">' +
          '<circle cx="' + (loc[0] + 1024) + '" cy="' + (loc[1] + 1024) + '" r="40" fill="none" stroke="' + col + '" stroke-width="7"/>' +
          '<circle cx="' + (loc[0] + 1024) + '" cy="' + (loc[1] + 1024) + '" r="13" fill="' + col + '" stroke="#000" stroke-width="3"/></g>';
      });
      s += '</g>';

      // 玩家位置（独立组，便于单独更新）
      s += '<g class="you-wrap">' + youMarker() + '</g>';

      s += '</svg>';
      container.innerHTML = s;
    },

    // 仅更新玩家位置（不重绘整图，避免底图闪烁）
    updatePlayer: function (container) {
      container = container || document.getElementById('mapLayer');
      if (!container) return;
      var wrap = container.querySelector('.you-wrap');
      if (!wrap) { return this.render(container); }
      wrap.innerHTML = youMarker();
    },

    toggle: function (key, container) {
      OC.Settings.toggleLayer(key);
      this.render(container);
    }
  };

  function youMarker() {
    var pp = OC.Overlay && OC.Overlay.playerPos;
    if (!pp) return '';
    var x = pp.x + 1024, y = pp.z + 1024;
    var g = '<g class="you">';
    g += '<circle cx="' + x + '" cy="' + y + '" r="26" fill="rgba(225,29,72,0.25)"/>';
    g += '<circle cx="' + x + '" cy="' + y + '" r="13" fill="#fff" stroke="#e11d48" stroke-width="6"/>';
    // 朝向箭头（Heading，0=南，逆时针）
    if (pp.h != null) {
      var ang = -pp.h; // 转到屏幕角度
      var tipx = x + Math.sin(pp.h) * 40, tipy = y + Math.cos(pp.h) * 40;
      g += '<line x1="' + x + '" y1="' + y + '" x2="' + tipx.toFixed(1) + '" y2="' + tipy.toFixed(1) + '" stroke="#e11d48" stroke-width="6"/>';
    }
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
    var out = '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '" ' + halo + '/>';
    if (L.ring) out += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 7) + '" fill="none" stroke="' + c + '" stroke-width="3"/>';
    return out;
  }
})(typeof window !== 'undefined' ? window : this);
