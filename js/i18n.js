/* =========================================================================
 * i18n.js — 界面文案（zh / en / ja）
 * 中文术语对齐 EurekaTrackerAutoPopper：紧急遭遇战(CE) / 危命任务(FATE) /
 * 两歧塔 / 魔法罐 / 铜宝箱·银宝箱 / 胡萝卜 / 额外机会。
 * ========================================================================= */
(function (global) {
  'use strict';
  var OC = global.OC = global.OC || {};

  var STR = {
    zh: {
      title: '新月岛',
      connected: '已连接', disconnected: '未连接',
      in_occult: '新月岛', not_in_occult: '不在新月岛',
      ce: '紧急遭遇战', fate: '危命任务', pot: '魔法罐', tower: '两歧塔',
      ce_active: '进行中', ce_can_trigger: '可触发', ce_cooldown: '冷却',
      no_ce: '暂无', next: '下一个', respawn: '重生',
      pot_active: '进行中', pot_next: '下一罐', pot_north: '北', pot_south: '南', pot_soon: '即将出现',
      alive: '存活', gone: '已消失', unknown: '—', last_seen: '上次',
      drops: '掉落', demiatma: '半魂晶', dispeller: '消幻晶', notes: '调查记录', soulshard: '灵魂碎晶', accessory: '饰品', misc: '其他',
      trigger_mob: '触发怪', loc: '位置',
      layer_bronze: '铜宝箱', layer_silver: '银宝箱', layer_potN: '北罐', layer_potS: '南罐', layer_potAny: 'Pot coffer',
      layer_reroll: '额外机会', layer_bunny: '胡萝卜',
      panel_battle: '战斗', panel_settings: '设置', close: '关闭',
      set_lang: '语言', set_tracker: '共享 Tracker', set_tracker_id: 'Tracker ID', set_password: '密码',
      set_dc: '数据中心', set_ws: 'OverlayPlugin WS', set_territory: '新月岛区域ID',
      set_ce_cd: 'CE 冷却(秒)', set_create: '新建', set_open: '网页版',
      set_sound: '声音提醒', set_auto: '自动上报（侦测到即提交云端）', set_opacity: '不透明度', set_scale: '界面缩放',
      saved: '已保存', no_tracker: '未设置 Tracker ID：仅显示本地演示，无法同步云端',
      notify_ce: '紧急遭遇战', notify_fate: '危命任务', notify_pot: '魔法罐',
      cloud_hint: '数据来自共享云端，请配合游戏内工具自动上报',
      panel_dcpots: '魔法罐总览', dc_pots_title: '魔法罐总览',
      no_active_island: '当前四大区暂无活跃岛屿', updated: '更新', loading: '加载中…',
      collapse: '折叠（隐藏地图）', expand: '展开地图', locating: '定位所在岛…',
      auto_hint: '数据自动来自国服四大区云端，无需任何设置；点击列表中的岛可查看该岛 CE/FATE。',
      alert_title: '提示', alert_all: '播报所有 CE / FATE / 魔法罐',
      alert_pot_opt: '魔法罐出现前3分钟提示', alert_demiatma: '出现掉落以下半魂晶的 CE/FATE 时提示：',
      alert_dispeller: '出现掉落以下消幻晶的 CE/FATE 时提示：',
      alert_dispeller_pending: 'Per-event Phantom Dispeller drop mappings are not available yet.',
      alert_tts: '语音提示', alert_pot: '魔法罐出现', pot_pre_alert: '魔法罐即将出现',
      my_island_hint: '点击查看你所在岛的 CE/FATE（?=同大区多岛未能确认）', set_show_chips: '显示当前 FATE/CE 胶囊', chips_hidden: '已隐藏（可在设置中重新打开）'
    },
    en: {
      title: 'Occult Crescent',
      connected: 'Connected', disconnected: 'Offline',
      in_occult: 'Occult Crescent', not_in_occult: 'Outside',
      ce: 'Critical Engagement', fate: 'FATE', pot: 'Pots', tower: 'Forked Tower',
      ce_active: 'Active', ce_can_trigger: 'Ready', ce_cooldown: 'Cooldown',
      no_ce: 'None', next: 'Next', respawn: 'Respawn',
      pot_active: 'Active', pot_next: 'Next pot', pot_north: 'N', pot_south: 'S', pot_soon: 'Soon',
      alive: 'Alive', gone: 'Gone', unknown: '—', last_seen: 'Last',
      drops: 'Drops', demiatma: 'Demiatma', dispeller: 'Phantom Dispeller', notes: 'Notes', soulshard: 'Soul Shard', accessory: 'Accessory', misc: 'Misc',
      trigger_mob: 'Trigger', loc: 'Loc',
      layer_bronze: 'Bronze', layer_silver: 'Silver', layer_potN: 'N Pot', layer_potS: 'S Pot', layer_potAny: 'Pot coffer',
      layer_reroll: 'Reroll', layer_bunny: 'Carrot',
      panel_battle: 'Battle', panel_settings: 'Settings', close: 'Close',
      set_lang: 'Language', set_tracker: 'Shared Tracker', set_tracker_id: 'Tracker ID', set_password: 'Password',
      set_dc: 'Datacenter', set_ws: 'OverlayPlugin WS', set_territory: 'Occult territory ID',
      set_ce_cd: 'CE cooldown (s)', set_create: 'Create', set_open: 'Website',
      set_sound: 'Sound alert', set_auto: 'Auto-report to cloud on detect', set_opacity: 'Opacity', set_scale: 'UI scale',
      saved: 'Saved', no_tracker: 'No Tracker ID: local demo only, no cloud sync',
      notify_ce: 'CE', notify_fate: 'FATE', notify_pot: 'Pot',
      cloud_hint: 'Data comes from the shared cloud; pair with an in-game reporter',
      panel_dcpots: 'Pot Overview', dc_pots_title: 'Pot Overview',
      no_active_island: 'No active islands right now', updated: 'upd', loading: 'Loading…',
      collapse: 'Collapse (hide map)', expand: 'Expand map', locating: 'Locating island…',
      auto_hint: 'Data is loaded automatically from the CN datacenters; click an island to see its CE/FATE.',
      alert_title: 'Alerts', alert_all: 'Alert on every CE / FATE / pot',
      alert_pot_opt: 'Alert 3 min before a pot', alert_demiatma: 'Alert on CE/FATE dropping these demiatma:',
      alert_dispeller: 'Alert on CE/FATE dropping these Phantom Dispellers:',
      alert_dispeller_pending: 'Per-event Phantom Dispeller drop mappings are not available yet.',
      alert_tts: 'Voice', alert_pot: 'Pot spawned', pot_pre_alert: 'Pot spawning soon',
      my_island_hint: 'Click to see your island CE/FATE (? = island unconfirmed)', set_show_chips: 'Show active FATE/CE chips', chips_hidden: 'Hidden (re-enable in settings)'
    },
    ja: {
      title: '南方海域',
      connected: '接続済み', disconnected: '未接続',
      in_occult: '南方海域', not_in_occult: 'エリア外',
      ce: '危機的遭遇', fate: 'FATE', pot: 'マジックポット', tower: 'フォークタワー',
      ce_active: '進行中', ce_can_trigger: '発生可能', ce_cooldown: 'クールダウン',
      no_ce: 'なし', next: '次', respawn: 'リポップ',
      pot_active: '進行中', pot_next: '次のポット', pot_north: '北', pot_south: '南', pot_soon: 'まもなく',
      alive: '出現中', gone: '消滅', unknown: '—', last_seen: '前回',
      drops: 'ドロップ', demiatma: 'デミアートマ', dispeller: 'ファントムディスペラー', notes: '探査記録', soulshard: 'ソウルシャード', accessory: 'アクセ', misc: 'その他',
      trigger_mob: 'トリガー', loc: '位置',
      layer_bronze: '銅宝箱', layer_silver: '銀宝箱', layer_potN: '北ポット', layer_potS: '南ポット', layer_potAny: 'Pot coffer',
      layer_reroll: 'リロール', layer_bunny: 'キャロット',
      panel_battle: '戦闘', panel_settings: '設定', close: '閉じる',
      set_lang: '言語', set_tracker: '共有トラッカー', set_tracker_id: 'トラッカーID', set_password: 'パスワード',
      set_dc: 'データセンター', set_ws: 'OverlayPlugin WS', set_territory: '南方海域 ID',
      set_ce_cd: 'CDクールダウン(秒)', set_create: '作成', set_open: 'Web',
      set_sound: '音で通知', set_auto: '検知でクラウド自動報告', set_opacity: '不透明度', set_scale: 'UI拡大',
      saved: '保存しました', no_tracker: 'トラッカーID未設定：ローカルデモのみ',
      notify_ce: '危機的遭遇', notify_fate: 'FATE', notify_pot: 'ポット',
      cloud_hint: 'データは共有クラウド由来。ゲーム内ツールと併用してください',
      panel_dcpots: 'ポット一覧', dc_pots_title: 'ポット一覧',
      no_active_island: '現在アクティブな島はありません', updated: '更新', loading: '読込中…',
      collapse: '折りたたむ（マップ非表示）', expand: 'マップ展開', locating: '島を特定中…',
      auto_hint: 'データは中国4DCから自動取得。設定不要。島をクリックでCE/FATE表示。',
      alert_title: '通知', alert_all: 'すべてのCE / FATE / ポットを通知',
      alert_pot_opt: 'ポット出現3分前に通知', alert_demiatma: '以下のデミアートマをドロップするCE/FATE出現で通知：',
      alert_dispeller: '以下のファントムディスペラーをドロップするCE/FATE出現で通知：',
      alert_dispeller_pending: 'Per-event Phantom Dispeller drop mappings are not available yet.',
      alert_tts: '音声通知', alert_pot: 'ポット出現', pot_pre_alert: 'ポットまもなく出現',
      my_island_hint: 'クリックで自分の島のCE/FATE（?=島未確定）', set_show_chips: '現在のFATE/CEを表示', chips_hidden: '非表示にしました（設定で再表示）'
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
