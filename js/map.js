/* =========================================================================
 * map.js — 地图标签页：SVG 示意地图 + 图层开关 + 点位绘制
 *
 * 无需游戏地图贴图也能用（画一张示意底图）；若把真实地图图片放到
 * assets/map.png，会自动作为底图使用。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};
  var t = function (k) { return OC.i18n.t(k); };

  var LAYER_DEFS = [
    { key: 'bronze', src: 'bronze', color: '#b87333', shape: 'chest', i18n: 'layer_bronze' },
    { key: 'silver', src: 'silver', color: '#c8d0d8', shape: 'chest', i18n: 'layer_silver' },
    { key: 'potN', src: 'potNorth', color: '#3b82f6', shape: 'pot', i18n: 'layer_potN' },
    { key: 'potS', src: 'potSouth', color: '#f97316', shape: 'pot', i18n: 'layer_potS' },
    { key: 'potC', src: 'potContinue', color: '#a855f7', shape: 'pot', i18n: 'layer_potC' },
    { key: 'carrot', src: 'carrot', color: '#22c55e', shape: 'carrot', i18n: 'layer_carrot' }
  ];

  var VB = 1000; // SVG 视图尺寸

  var Map = OC.Map = {
    render: function (container) {
      var pts = OC.MAP_POINTS;
      var size = pts.size || 42;
      var layers = OC.Settings.get('mapLayers');
      var scale = VB / size;

      var html = '';
      // 图层开关
      html += '<div class="map-toolbar">';
      LAYER_DEFS.forEach(function (L) {
        var on = layers[L.key];
        var count = (pts[L.src] || []).length;
        html += '<button class="layer-btn' + (on ? ' on' : '') + '" data-layer="' + L.key + '">' +
          '<span class="swatch" style="background:' + L.color + '"></span>' +
          t(L.i18n) + ' <span class="cnt">' + count + '</span></button>';
      });
      html += '</div>';

      // SVG 地图
      var hasImg = false; // 若存在 assets/map.png，img onerror 会退回示意图
      html += '<div class="map-wrap"><svg viewBox="0 0 ' + VB + ' ' + VB + '" class="map-svg" preserveAspectRatio="xMidYMid meet">';
      // 底图：真实图片 or 示意
      html += '<image href="assets/map.png" x="0" y="0" width="' + VB + '" height="' + VB + '" ' +
        'onerror="this.style.display=\'none\'" opacity="0.9"/>';
      html += schematic();

      // 各图层点位
      LAYER_DEFS.forEach(function (L) {
        if (!layers[L.key]) return;
        (pts[L.src] || []).forEach(function (p) {
          html += marker(p.x * scale, p.y * scale, L.color, L.shape, p.label);
        });
      });

      // 玩家位置
      if (OC.Overlay && OC.Overlay.playerPos) {
        var pp = OC.Overlay.playerPos;
        html += '<g class="you-marker">' +
          '<circle cx="' + (pp.x * scale) + '" cy="' + (pp.y * scale) + '" r="14" fill="#fff" stroke="#e11d48" stroke-width="4"/>' +
          '<text x="' + (pp.x * scale) + '" y="' + (pp.y * scale - 22) + '" text-anchor="middle" class="you-label">' + t('map_you') + '</text></g>';
      }

      html += '</svg></div>';

      // 空图层提示
      var anyEmpty = LAYER_DEFS.some(function (L) { return layers[L.key] && (pts[L.src] || []).length === 0; });
      if (anyEmpty) html += '<div class="map-hint">' + t('map_no_data') + '</div>';

      container.innerHTML = html;

      // 绑定图层开关
      container.querySelectorAll('.layer-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          OC.Settings.toggleLayer(btn.getAttribute('data-layer'));
          Map.render(container);
        });
      });
    }
  };

  // 示意底图：北/南两大区块 + 海岸
  function schematic() {
    return '' +
      '<rect x="0" y="0" width="' + VB + '" height="' + VB + '" fill="#0e1726"/>' +
      '<rect x="60" y="40" width="880" height="440" rx="40" fill="#16324a" opacity="0.55"/>' +
      '<rect x="60" y="520" width="880" height="440" rx="40" fill="#3a2a16" opacity="0.55"/>' +
      '<line x1="60" y1="500" x2="940" y2="500" stroke="#2b3b52" stroke-width="3" stroke-dasharray="10 10"/>' +
      '<text x="500" y="90" text-anchor="middle" class="region-label" fill="#5b9bd5">NORTH · 北</text>' +
      '<text x="500" y="950" text-anchor="middle" class="region-label" fill="#d59b5b">SOUTH · 南</text>';
  }

  function marker(x, y, color, shape, label) {
    var g = '<g class="pt">';
    if (shape === 'chest') {
      g += '<rect x="' + (x - 9) + '" y="' + (y - 7) + '" width="18" height="14" rx="2" fill="' + color + '" stroke="#000" stroke-width="1.5"/>';
    } else if (shape === 'pot') {
      g += '<circle cx="' + x + '" cy="' + y + '" r="10" fill="' + color + '" stroke="#000" stroke-width="1.5"/>' +
        '<rect x="' + (x - 5) + '" y="' + (y - 12) + '" width="10" height="5" fill="' + color + '" stroke="#000" stroke-width="1"/>';
    } else if (shape === 'carrot') {
      g += '<polygon points="' + x + ',' + (y + 10) + ' ' + (x - 7) + ',' + (y - 8) + ' ' + (x + 7) + ',' + (y - 8) + '" fill="' + color + '" stroke="#000" stroke-width="1.5"/>';
    } else {
      g += '<circle cx="' + x + '" cy="' + y + '" r="8" fill="' + color + '"/>';
    }
    if (label) g += '<text x="' + x + '" y="' + (y - 16) + '" text-anchor="middle" class="pt-label">' + esc(label) + '</text>';
    g += '</g>';
    return g;
  }

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
})(typeof window !== 'undefined' ? window : this);
