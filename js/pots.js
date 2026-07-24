/* =========================================================================
 * pots.js — 撒娇罐（マジックポット）出现时刻预测
 *
 * 规律（社区实测）：副本开启后 +5 分钟出现第一只（北），之后每 30 分钟
 * 交替 北/南；偶数序号=北(1976)，奇数序号=南(1977)；副本最长 180 分钟。
 *
 * 由于无法直接读取副本创建时间，采用「估算 + 校准」：
 *   - 估算：进本时按最老玩家在本时间反推，或直接以进本时刻为 0。
 *   - 校准：每观测到一次罐子（面板上报或共享数据里的 spawn_time），
 *           把时刻表吸附到真实节奏，误差从 ±5min 收敛到 ±30s。
 * ========================================================================= */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};
  var S = OC.POT_SCHEDULE;

  var Pots = OC.Pots = {
    startEpoch: null,   // 假定的副本创建时刻（epoch 秒）
    calibrations: 0,    // 已校准次数
    lastSide: null,

    /** 序号 n 的相对出现时间（分钟） */
    fateTimeMin: function (n) { return S.firstMin + n * S.intervalMin; },
    /** 序号 n 的方位 */
    side: function (n) { return (n % 2 === 0) ? 'north' : 'south'; },

    reset: function () { this.startEpoch = null; this.calibrations = 0; this.lastSide = null; },

    /** 直接指定副本创建时刻 */
    setInstanceStart: function (epoch) { this.startEpoch = epoch; },

    /** 用「最老玩家在本分钟数」估算副本创建时刻 */
    estimateFromOldestPlayer: function (minutes, nowEpoch) {
      nowEpoch = nowEpoch || Math.floor(Date.now() / 1000);
      this.startEpoch = nowEpoch - Math.round(minutes * 60);
    },

    ageMin: function (nowEpoch) {
      if (this.startEpoch == null) return null;
      nowEpoch = nowEpoch || Math.floor(Date.now() / 1000);
      return (nowEpoch - this.startEpoch) / 60;
    },

    /**
     * 用一次观测（方位 + 出现时刻）校准时刻表。
     * @param side  'north' | 'south'
     * @param epoch 该罐出现的 epoch 秒
     */
    calibrate: function (side, epoch) {
      if (this.startEpoch == null) {
        // 首次观测：假定它是该方位可能的最早序号
        var n0 = side === 'north' ? 0 : 1;
        // 若时间上明显偏后，向后推更靠谱的序号
        this.startEpoch = epoch - this.fateTimeMin(n0) * 60;
      }
      var ageAtPop = (epoch - this.startEpoch) / 60;
      var nApprox = Math.round((ageAtPop - S.firstMin) / S.intervalMin);
      if (nApprox < 0) nApprox = 0;
      // 修正奇偶以匹配方位
      var wantEven = side === 'north';
      if ((nApprox % 2 === 0) !== wantEven) {
        // 选择更接近的相邻序号
        var up = nApprox + 1, down = nApprox - 1;
        var dUp = Math.abs(this.fateTimeMin(up) - ageAtPop);
        var dDown = down >= 0 ? Math.abs(this.fateTimeMin(down) - ageAtPop) : Infinity;
        nApprox = dUp <= dDown ? up : down;
      }
      if (nApprox < 0) nApprox = wantEven ? 0 : 1;
      this.startEpoch = epoch - this.fateTimeMin(nApprox) * 60;
      this.calibrations++;
      this.lastSide = side;
    },

    /**
     * 返回从 now 起接下来的若干只罐子。
     * @returns [{ n, side, epoch, etaSec, isPast }]
     */
    getUpcoming: function (nowEpoch, count) {
      nowEpoch = nowEpoch || Math.floor(Date.now() / 1000);
      count = count || 4;
      if (this.startEpoch == null) return [];
      var out = [];
      var maxN = Math.floor((S.instanceMaxMin - S.firstMin) / S.intervalMin);
      for (var n = 0; n <= maxN; n++) {
        var epoch = this.startEpoch + this.fateTimeMin(n) * 60;
        var eta = epoch - nowEpoch;
        if (eta < -90) continue; // 已过去超过 90 秒的跳过
        out.push({ n: n, side: this.side(n), epoch: epoch, etaSec: eta, isPast: eta < 0 });
        if (out.length >= count) break;
      }
      return out;
    },

    /** 最近的下一只罐子（可能正处于出现窗口） */
    nextPot: function (nowEpoch) {
      var up = this.getUpcoming(nowEpoch, 6);
      for (var i = 0; i < up.length; i++) if (up[i].etaSec > -90) return up[i];
      return null;
    },

    /** 副本剩余寿命（秒），未知返回 null */
    instanceRemainingSec: function (nowEpoch) {
      if (this.startEpoch == null) return null;
      nowEpoch = nowEpoch || Math.floor(Date.now() / 1000);
      var end = this.startEpoch + S.instanceMaxMin * 60;
      return Math.max(0, end - nowEpoch);
    }
  };
})(typeof window !== 'undefined' ? window : this);
