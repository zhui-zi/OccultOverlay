/* =========================================================================
 * i18n.js — 界面文案（zh / en / ja）
 * ========================================================================= */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  var STR = {
    zh: {
      title: '新月岛悬浮窗',
      tab_board: '面板', tab_pots: '撒娇罐', tab_map: '地图', tab_settings: '设置',
      status_connected: '已连接游戏', status_disconnected: '未连接（独立模式）',
      in_occult: '当前在新月岛', not_in_occult: '不在新月岛',
      section_ce: '危命任务 CE', section_fate: 'FATE', section_pot: '撒娇罐',
      ce_active: '进行中', ce_can_trigger: '现在可触发', ce_cooldown: '冷却中',
      ce_next_in: '距可触发', no_active_ce: '当前无进行中的 CE',
      drops: '掉落', spawned: '出现', dead: '击杀', report: '上报',
      alive: '存活', dead_state: '已消失', respawn_in: '重生',
      pot_next: '下一只', pot_north: '北', pot_south: '南', pot_now: '即将出现！',
      pot_setup: '设置副本时间', pot_oldest: '最老玩家在本(分钟)', pot_start_fresh: '刚进新本(0分钟)',
      pot_calibrate_hint: '看到罐子时点“出现”即可自动校准',
      instance_left: '副本剩余', calibrations: '已校准',
      set_tracker: '共享 Tracker', set_tracker_id: 'Tracker ID', set_password: '密码',
      set_dc: '数据中心', set_ws: 'OverlayPlugin WS 地址', set_lang: '语言',
      set_create: '新建 Tracker', set_open_site: '打开网页版',
      set_notify: '通知', set_sound: '声音提醒', set_only_zone: '仅在新月岛内提醒',
      set_auto_report: '侦测到即自动上报', set_ce_cd: 'CE 冷却(秒)', set_territory: '新月岛区域ID(可选)',
      set_saved: '已保存', copied: '已复制',
      layer_bronze: '青铜宝箱', layer_silver: '白银宝箱',
      layer_potN: '北罐点位', layer_potS: '南罐点位', layer_potC: '续罐点位', layer_carrot: '萝卜',
      map_no_data: '该图层坐标数据待补充（可在 data/mapPoints.js 中填入）',
      map_you: '你',
      notify_ce: '出现 CE', notify_fate: '出现 FATE', notify_pot: '撒娇罐即将出现',
      loc: '位置', tower: '大型任务', trigger_monster: '触发怪',
      no_tracker: '未设置 Tracker ID：面板为演示数据，上报不可用',
      connecting: '连接中…'
    },
    en: {
      title: 'Occult Crescent Overlay',
      tab_board: 'Board', tab_pots: 'Pots', tab_map: 'Map', tab_settings: 'Settings',
      status_connected: 'Game connected', status_disconnected: 'Not connected (standalone)',
      in_occult: 'In Occult Crescent', not_in_occult: 'Not in Occult Crescent',
      section_ce: 'Critical Engagements', section_fate: 'FATEs', section_pot: 'Pots',
      ce_active: 'Active', ce_can_trigger: 'Can trigger now', ce_cooldown: 'Cooldown',
      ce_next_in: 'Next in', no_active_ce: 'No active CE',
      drops: 'Drops', spawned: 'Spawned', dead: 'Killed', report: 'Report',
      alive: 'Alive', dead_state: 'Gone', respawn_in: 'Respawn',
      pot_next: 'Next', pot_north: 'N', pot_south: 'S', pot_now: 'Spawning soon!',
      pot_setup: 'Instance timing', pot_oldest: 'Oldest player mins', pot_start_fresh: 'Fresh instance (0m)',
      pot_calibrate_hint: 'Press "Spawned" on a pot to auto-calibrate',
      instance_left: 'Instance left', calibrations: 'Calibrations',
      set_tracker: 'Shared Tracker', set_tracker_id: 'Tracker ID', set_password: 'Password',
      set_dc: 'Datacenter', set_ws: 'OverlayPlugin WS URL', set_lang: 'Language',
      set_create: 'Create Tracker', set_open_site: 'Open website',
      set_notify: 'Notifications', set_sound: 'Sound alert', set_only_zone: 'Only alert in zone',
      set_auto_report: 'Auto-report on detect', set_ce_cd: 'CE cooldown (s)', set_territory: 'Occult territory ID (opt)',
      set_saved: 'Saved', copied: 'Copied',
      layer_bronze: 'Bronze coffers', layer_silver: 'Silver coffers',
      layer_potN: 'North pots', layer_potS: 'South pots', layer_potC: 'Extra pots', layer_carrot: 'Carrots',
      map_no_data: 'Coordinates pending (fill data/mapPoints.js)',
      map_you: 'You',
      notify_ce: 'CE spawned', notify_fate: 'FATE spawned', notify_pot: 'Pot spawning soon',
      loc: 'Location', tower: 'Large-scale', trigger_monster: 'Trigger mob',
      no_tracker: 'No Tracker ID set: board shows demo data, reporting disabled',
      connecting: 'Connecting…'
    },
    ja: {
      title: '新月島オーバーレイ',
      tab_board: 'ボード', tab_pots: 'ポット', tab_map: 'マップ', tab_settings: '設定',
      status_connected: 'ゲーム接続済み', status_disconnected: '未接続（単独）',
      in_occult: '南方海域に居ます', not_in_occult: '南方海域外',
      section_ce: '危機的遭遇 CE', section_fate: 'FATE', section_pot: 'マジックポット',
      ce_active: '進行中', ce_can_trigger: '発生可能', ce_cooldown: 'クールダウン',
      ce_next_in: '発生可能まで', no_active_ce: '進行中の CE なし',
      drops: 'ドロップ', spawned: '出現', dead: '討伐', report: '報告',
      alive: '出現中', dead_state: '消滅', respawn_in: 'リポップ',
      pot_next: '次', pot_north: '北', pot_south: '南', pot_now: 'まもなく出現！',
      pot_setup: 'インスタンス時間', pot_oldest: '最古参の滞在(分)', pot_start_fresh: '新規(0分)',
      pot_calibrate_hint: 'ポット出現時に「出現」で自動校正',
      instance_left: 'インスタンス残り', calibrations: '校正回数',
      set_tracker: '共有トラッカー', set_tracker_id: 'トラッカーID', set_password: 'パスワード',
      set_dc: 'データセンター', set_ws: 'OverlayPlugin WS URL', set_lang: '言語',
      set_create: 'トラッカー作成', set_open_site: 'Webを開く',
      set_notify: '通知', set_sound: '音で通知', set_only_zone: 'ゾーン内のみ通知',
      set_auto_report: '検知で自動報告', set_ce_cd: 'CDクールダウン(秒)', set_territory: '南方海域 ID(任意)',
      set_saved: '保存しました', copied: 'コピーしました',
      layer_bronze: 'ブロンズ宝箱', layer_silver: 'シルバー宝箱',
      layer_potN: '北ポット', layer_potS: '南ポット', layer_potC: '追加ポット', layer_carrot: 'キャロット',
      map_no_data: '座標データ未登録（data/mapPoints.js に追記）',
      map_you: '自分',
      notify_ce: 'CE 出現', notify_fate: 'FATE 出現', notify_pot: 'ポットまもなく',
      loc: '位置', tower: '大規模', trigger_monster: 'トリガー',
      no_tracker: 'トラッカーID未設定：デモ表示、報告不可',
      connecting: '接続中…'
    }
  };

  OC.i18n = {
    t: function (key) {
      var lang = (OC.Settings && OC.Settings.get('lang')) || 'zh';
      var pack = STR[lang] || STR.zh;
      return pack[key] != null ? pack[key] : (STR.zh[key] != null ? STR.zh[key] : key);
    },
    langs: ['zh', 'en', 'ja']
  };
})(typeof window !== 'undefined' ? window : this);
