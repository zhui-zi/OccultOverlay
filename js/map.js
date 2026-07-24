/* =========================================================================
 * map.js — 主视图：半透明真实地图 + 点位图层 + CE/FATE 高亮 + 玩家位置
 * 底图 assets/map.png（2048x2048），世界坐标 (x,z) -> 像素 (x+1024, z+1024)。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var TEX = 2048;

  // 图层定义：key 对应 settings.mapLayers 与 OC.MAP.points
  var LAYERS = [
    { key: 'bronze', src: 'bronze', color: '#c8862f', r: 11 },
    { key: 'silver', src: 'silver', color: '#cfd8e2', r: 13 },
    { key: 'potN', src: 'potNorth', color: '#4a90ff', r: 12, ring: true },
    { key: 'potS', src: 'potSouth', color: '#ff8a3c', r: 12, ring: true },
    { key: 'reroll', src: 'reroll', color: '#b061ff', r: 10, diamond: true },
    { key: 'bunny', src: 'bunny', color: '#39d353', r: 11, tri: true }
  ];
  OC.MAP_LAYERS = LAYERS;

  var Map = OC.Map = {
    layerDefs: LAYERS,

    render: function (container) {
      var layers = OC.Settings.get('mapLayers');
      var pts = OC.MAP.points;
      var svg = '<svg viewBox="0 0 ' + TEX + ' ' + TEX + '" class="map-svg" preserveAspectRatio="xMidYMid meet">';
      // 底图
      svg += '<image href="assets/map.png" x="0" y="0" width="' + TEX + '" height="' + TEX + '" ' +
        'onerror="this.remove()"/>';
      // 暗色叠加，提高标记对比
      svg += '<rect x="0" y="0" width="' + TEX + '" height="' + TEX + '" fill="#0a1018" opacity="0.28"/>';

      // 图层点位
      LAYERS.forEach(function (L) {
        if (!layers[L.key]) return;
        (pts[L.src] || []).forEach(function (p) {
          svg += marker(p[0] + 1024, p[1] + 1024, L);
        });
      });

      // CE/FATE 高亮位置
      var hi = OC.State && OC.State.highlights ? OC.State.highlights : [];
      hi.forEach(function (h) {
        var loc = OC.MAP.encounters[h.id];
        if (!loc) return;
        svg += '<g class="hi-mark"><circle cx="' + (loc[0] + 1024) + '" cy="' + (loc[1] + 1024) + '" r="26" ' +
          'fill="none" stroke="' + (h.type === 'ce' ? '#ff5252' : '#5b9bd5') + '" stroke-width="6"/>' +
          '<circle cx="' + (loc[0] + 1024) + '" cy="' + (loc[1] + 1024) + '" r="10" fill="' + (h.type === 'ce' ? '#ff5252' : '#5b9bd5') + '"/></g>';
      });

      // 玩家位置
      if (OC.Overlay && OC.Overlay.playerPos) {
        var pp = OC.Overlay.playerPos;
        svg += '<g class="you"><circle cx="' + (pp.x + 1024) + '" cy="' + (pp.z + 1024) + '" r="16" fill="#fff" stroke="#e11d48" stroke-width="6"/></g>';
      }

      svg += '</svg>';
      container.innerHTML = svg;
    },

    // 供 rail 按钮调用：切换图层并重绘
    toggle: function (key, container) {
      OC.Settings.toggleLayer(key);
      this.render(container);
    }
  };

  function marker(x, y, L) {
    var c = L.color, r = L.r;
    if (L.diamond) {
      return '<path d="M' + x + ' ' + (y - r) + ' L' + (x + r) + ' ' + y + ' L' + x + ' ' + (y + r) + ' L' + (x - r) + ' ' + y + ' Z" fill="' + c + '" stroke="#000" stroke-width="2" opacity="0.95"/>';
    }
    if (L.tri) {
      return '<path d="M' + x + ' ' + (y - r) + ' L' + (x + r) + ' ' + (y + r) + ' L' + (x - r) + ' ' + (y + r) + ' Z" fill="' + c + '" stroke="#000" stroke-width="2" opacity="0.95"/>';
    }
    var s = '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '" stroke="#000" stroke-width="2" opacity="0.95"/>';
    if (L.ring) s += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 5) + '" fill="none" stroke="' + c + '" stroke-width="2" opacity="0.7"/>';
    return s;
  }
})(typeof window !== 'undefined' ? window : this);
