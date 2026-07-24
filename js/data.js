/* =========================================================================
 * data.js — 新月岛（隐秘月华 / Occult Crescent · South Horn）静态数据
 *
 * FATE / CE / 撒娇罐 / 掉落物 定义。
 * 数据源：tracker.xivstats.com 的公开数据模型（PostgREST: OccultTrackerV3）。
 * name 里保留官方多语言（en/ja/de/fr），并补充社区中文（zh）。
 * ========================================================================= */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  // --- 后端与图标服务 -----------------------------------------------------
  OC.BACKEND = {
    // PostgREST 表端点（读取 / 轮询 / 上报）
    url: 'https://infi.ovh/api/OccultTrackerV3',
    // 公开匿名 JWT（role: anon），与官方站点一致
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.Ur6wgi_rD4dr3uLLvbLoaEvfLCu4QFWdrF-uHRtbl_s',
    // 图标资源：把游戏 tex 路径转成 png（beta.xivapi 可用）
    iconBase: 'https://beta.xivapi.com/api/1/asset?format=png&path='
  };

  // 把定义里的 img（ui/icon/xxx.tex）转成可显示的 URL
  OC.iconUrl = function (texPath) {
    if (!texPath) return '';
    return OC.BACKEND.iconBase + encodeURIComponent(texPath);
  };

  // --- 大区 / 数据中心 ----------------------------------------------------
  OC.DATACENTERS = {
    1: { name: 'Elemental', region: 'Japan' },
    2: { name: 'Gaia', region: 'Japan' },
    3: { name: 'Mana', region: 'Japan' },
    4: { name: 'Aether', region: 'North America' },
    5: { name: 'Primal', region: 'North America' },
    6: { name: 'Chaos', region: 'Europe' },
    7: { name: 'Light', region: 'Europe' },
    8: { name: 'Crystal', region: 'North America' },
    9: { name: 'Materia', region: 'Oceania' },
    10: { name: 'Meteor', region: 'Japan' },
    11: { name: 'Dynamis', region: 'North America' },
    101: { name: '陆行鸟', region: 'China' },
    102: { name: '莫古力', region: 'China' },
    103: { name: '猫小胖', region: 'China' },
    104: { name: '豆豆柴', region: 'China' },
    201: { name: 'Eorzea', region: 'Korea' }
  };

  // --- 时间常量（秒），取自数据源 ----------------------------------------
  OC.TIMERS = {
    FATE_WINDOW_MIN: 1800, // 30min
    FATE_WINDOW_MAX: 7200, // 2h
    CE_COOLDOWN: 3600,     // CE 冷却参考值（近似，可在设置里调整）
    RESPAWN: 3600
  };

  // 掉落分类
  OC.DROP_CAT = {
    demiatma: { zh: '半魂晶', en: 'Demiatma', color: '#5bc0de' },
    notes: { zh: '调查记录', en: 'Exploration Notes', color: '#c9a227' },
    soulshard: { zh: '灵魂碎晶', en: 'Soul Shard', color: '#b06bd6' },
    accessory: { zh: '饰品', en: 'Accessory', color: '#e0843c' },
    misc: { zh: '其他', en: 'Misc', color: '#9aa0a6' }
  };

  // --- 掉落物（item_id -> 定义） -----------------------------------------
  // cat 为掉落分类；name 为多语言；img 为游戏图标 tex 路径。
  OC.ITEMS = {
    // 半魂晶 Demiatma
    47744: { cat: 'demiatma', img: 'ui/icon/026000/026025.tex', name: { zh: '青色半魂晶', en: 'Azurite Demiatma', ja: '青晶のデミアートマ' } },
    47745: { cat: 'demiatma', img: 'ui/icon/026000/026035.tex', name: { zh: '碧色半魂晶', en: 'Verdigris Demiatma', ja: '碧晶のデミアートマ' } },
    47746: { cat: 'demiatma', img: 'ui/icon/026000/026034.tex', name: { zh: '绿色半魂晶', en: 'Malachite Demiatma', ja: '緑晶のデミアートマ' } },
    47747: { cat: 'demiatma', img: 'ui/icon/026000/026026.tex', name: { zh: '橙色半魂晶', en: 'Realgar Demiatma', ja: '橙晶のデミアートマ' } },
    47748: { cat: 'demiatma', img: 'ui/icon/026000/026027.tex', name: { zh: '紫色半魂晶', en: 'Caput Mortuum Demiatma', ja: '紫晶のデミアートマ' } },
    47749: { cat: 'demiatma', img: 'ui/icon/026000/026029.tex', name: { zh: '黄色半魂晶', en: 'Orpiment Demiatma', ja: '黄晶のデミアートマ' } },
    // 调查记录 Exploration Notes
    47728: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：封印大妖', en: 'Notes on the Cloister Demon', ja: '探査記録:クロイスターデーモン' } },
    47729: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：神秘偶像', en: 'Notes on the Mythic Idol', ja: '探査記録:ミシカルアイドル' } },
    47730: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：狂战士', en: 'Notes on the Crescent Berserker', ja: '探査記録:クレセント・バーサーカー' } },
    47731: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：尼姆鲨', en: 'Notes on the Nymian Petalodus', ja: '探査記録:ニーム・ペタロドゥス' } },
    47732: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：黑陆行鸟', en: 'Notes on Black Chocobos', ja: '探査記録:黒チョコボ' } },
    47733: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：交易龟', en: 'Notes on the Trade Tortoise', ja: '探査記録:コイントートス' } },
    47734: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：恶魔石板', en: 'Notes on the Demon Tablet', ja: '探査記録:デモンズ・タブレット' } },
    47735: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：星头三人组', en: 'Notes on the Dead Stars', ja: '探査記録:星頭の三人組' } },
    47736: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：大理石龙', en: 'Notes on the Marble Dragon', ja: '探査記録:マーブルドラゴン' } },
    47737: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：魔导牛头', en: 'Notes on Magitaur', ja: '探査記録:マギタウロス' } },
    47738: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '探查记录：撒娇罐', en: 'Notes on Persistent Pots', ja: '探査記録:おねだりポット' } },
    // 灵魂碎晶 Soul Shard
    47751: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：狂战士', en: "Berserker's Soul Shard", ja: 'ソウルシャード:バーサーカー' } },
    47752: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：游侠', en: "Ranger's Soul Shard", ja: 'ソウルシャード:狩人' } },
    47757: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：预言者', en: "Oracle's Soul Shard", ja: 'ソウルシャード:予言士' } },
    // 饰品 Accessory
    49826: { cat: 'accessory', img: 'ui/icon/055000/055562_hr1.tex', name: { zh: '新月魔战士耳环', en: 'Occult Earrings of Blood', ja: 'クレセントマギ・ファイターイヤリング' } },
    49827: { cat: 'accessory', img: 'ui/icon/055000/055107_hr1.tex', name: { zh: '新月魔战士项链', en: 'Occult Necklace of Blood', ja: 'クレセントマギ・ファイターネックレス' } },
    49828: { cat: 'accessory', img: 'ui/icon/055000/055905_hr1.tex', name: { zh: '新月魔战士手镯', en: 'Occult Bracelet of Blood', ja: 'クレセントマギ・ファイターブレスレット' } },
    49831: { cat: 'accessory', img: 'ui/icon/055000/055562_hr1.tex', name: { zh: '新月魔法师耳环', en: 'Occult Earrings of Magic', ja: 'クレセントマギ・ソーサラーイヤリング' } },
    49832: { cat: 'accessory', img: 'ui/icon/055000/055107_hr1.tex', name: { zh: '新月魔法师项链', en: 'Occult Necklace of Magic', ja: 'クレセントマギ・ソーサラーネックレス' } },
    49833: { cat: 'accessory', img: 'ui/icon/055000/055905_hr1.tex', name: { zh: '新月魔法师手镯', en: 'Occult Bracelet of Magic', ja: 'クレセントマギ・ソーサラーブレスレット' } },
    // 其他 Misc
    47739: { cat: 'misc', img: 'ui/icon/065000/065121.tex', name: { zh: '魔纹起动证：力之塔', en: 'Sanguine Cipher', ja: '魔紋起動証:力の塔' } },
    47740: { cat: 'misc', img: 'ui/icon/026000/026527.tex', name: { zh: '古旧钱箱（辅助道具）', en: 'Occult Coffer', ja: 'サポートアイテム:古びた銭箱' } },
    47741: { cat: 'misc', img: 'ui/icon/020000/020603.tex', name: { zh: '魔晶药水', en: 'Occult Potion', ja: 'マギ・ポーション' } },
    47868: { cat: 'misc', img: 'ui/icon/021000/021467.tex', name: { zh: '力之魔石', en: 'Sanguinite', ja: '力の魔石' } },
    48008: { cat: 'misc', img: 'ui/icon/026000/026187.tex', name: { zh: '大妖异的契约书', en: 'Voidsent Contract', ja: '大妖異の契約書' } }
  };

  // --- 普通 FATE（fate_id -> 定义） --------------------------------------
  OC.FATES = {
    1962: { name: { zh: '涌潮海魔——纳木', en: 'Rough Waters', ja: '波起こしの海魔「ナンム」' }, drops: [47744], encounter_id: 28 },
    1963: { name: { zh: '古代怪石——金色石面', en: 'The Golden Guardian', ja: '金色の怪石「ゴールデンブロックス」' }, drops: [47744], encounter_id: 14 },
    1964: { name: { zh: '悲鸣收集者——罗普罗斯', en: 'King of the Crescent', ja: '悲鳴の蒐集者「ロプロス」' }, drops: [47749], encounter_id: 10 },
    1965: { name: { zh: '甲板清扫者——巨大鸟', en: 'The Winged Terror', ja: '甲板の掃除人「巨大鳥」' }, drops: [47747], encounter_id: 27 },
    1966: { name: { zh: '神罚石兽——西西弗斯', en: 'An Unending Duty', ja: '神罰の石獣「シジフォス」' }, drops: [47746], encounter_id: 26 },
    1967: { name: { zh: '进化的毒鸟——高等魔鸟', en: 'Brain Drain', ja: '進化せし怪蛇「アドバンスドエイビス」' }, drops: [47747], encounter_id: 24 },
    1968: { name: { zh: '湿度猎手——除湿之火', en: 'A Delicate Balance', ja: '湿度の狩手「ディヒューミディファイア」' }, drops: [47745], encounter_id: 25 },
    1969: { name: { zh: '土壤守护者——癫泥怪', en: 'Sworn to Soil', ja: '土壌の守り手「マッドマッド」' }, drops: [47745], encounter_id: 18 },
    1970: { name: { zh: '监视之瞳——岛屿监视者', en: 'A Prying Eye', ja: '監視の瞳「アイルオブザーバー」' }, drops: [47744], encounter_id: 29 },
    1971: { name: { zh: '美丽的咒杀者——执行者', en: 'Fatal Allure', ja: '美しき呪殺者「イグゼクレーター」' }, drops: [47749], encounter_id: 17 },
    1972: { name: { zh: '凶恶使魔——生命收割者', en: 'Serving Darkness', ja: '命の収奪者「ライフギャザラー」' }, drops: [47748], encounter_id: 24 }
  };

  // --- 撒娇罐 Pots（fate_id -> 定义），1976 北 / 1977 南 -----------------
  OC.POTS = {
    1976: { name: { zh: '幸福的魔法罐（北）', en: 'Pleading Pots (North)', ja: 'しあわせのマジックポット(北)' }, side: 'north', drops: [47749, 47738], encounter_id: 40 },
    1977: { name: { zh: '瑟瑟发抖的魔法罐（南）', en: 'Persistent Pots (South)', ja: 'カチカチのマジックポット(南)' }, side: 'south', drops: [47745, 47737], encounter_id: 18 }
  };

  // --- 危命任务 CE（encounter_id -> 定义），33-47 常规 + 48 岔路塔 -------
  // spawn_type=true 表示由特定怪物（monster）击杀触发。
  OC.CES = {
    33: { name: { zh: '脑髓爱好者——夺心魔', en: 'Scourge of the Mind', ja: '脳髄愛好家「マインドフレイア」' }, drops: [49831, 49826, 47744], spawn_type: true, monster: { en: 'Crescent Monk', ja: 'クレセント・モンク' } },
    34: { name: { zh: '黑色连队', en: 'The Black Regiment', ja: '黒の連隊' }, drops: [49831, 49826, 47749, 47752, 47732], spawn_type: false },
    35: { name: { zh: '愤怒的人造人——新月狂战士', en: 'The Unbridled', ja: '怒れる人造人間「クレセント・バーサーカー」' }, drops: [49831, 49826, 47744, 47751, 47730], spawn_type: false },
    36: { name: { zh: '潜影撕裂者——死亡爪', en: 'Crawling Death', ja: '忍び寄る爪「デスクロー」' }, drops: [49831, 49826, 47744], spawn_type: false },
    37: { name: { zh: '挣脱封印的大妖异——回廊恶魔', en: 'Calamity Bound', ja: '封印大妖「クロイスターデーモン」' }, drops: [49831, 49826, 47745, 47728, 48008], spawn_type: true, monster: { en: 'Crescent Inkstain', ja: 'クレセント・インクステイン' } },
    38: { name: { zh: '拟造使魔——水晶龙', en: 'Trial by Claw', ja: '模造されしもの「水晶竜」' }, drops: [49833, 49828, 47746], spawn_type: false },
    39: { name: { zh: '双极的造物——神秘土偶', en: 'From Times Bygone', ja: '神秘の偶像「ミシカルアイドル」' }, drops: [49833, 49828, 47746, 47729], spawn_type: true, monster: { en: 'Crescent Byblos', ja: 'クレセント・ビブロス' } },
    40: { name: { zh: '石制骑士团', en: 'Company of Stone', ja: '石造りの守護騎士たち' }, drops: [49827, 49832, 47748], spawn_type: false },
    41: { name: { zh: '传说中的鲨鱼——尼姆瓣齿鲨', en: 'Shark Attack', ja: '伝説の鮫「ニーム・ペタロドゥス」' }, drops: [49833, 49828, 47747, 47731], spawn_type: true, monster: { en: 'Crescent Petalodite', ja: 'クレセント・レッサーペタロドゥス' } },
    42: { name: { zh: '双足狮人——跃立狮', en: 'On the Hunt', ja: '二足の獅子「ランパントライオン」' }, drops: [49827, 49832, 47748, 47757], spawn_type: true, monster: { en: 'Crescent Fan', ja: 'クレセント・ファン' } },
    43: { name: { zh: '防卫指令', en: 'With Extreme Prejudice', ja: 'セキュリティ・コマンドー' }, drops: [49833, 49828, 47747], spawn_type: false },
    44: { name: { zh: '厌鸟巨兽——进化加鲁拉', en: 'Noise Complaint', ja: '鳥嫌いの巨獣「ネオガルラ」' }, drops: [49827, 49832, 47749], spawn_type: true, monster: { en: 'Crescent Garula', ja: 'クレセント・ガルラ' } },
    45: { name: { zh: '贩卖诅咒的商贩——金钱龟', en: 'Cursed Concern', ja: '呪いの商亀「コイントートス」' }, drops: [49827, 49832, 47747, 47733], spawn_type: false },
    46: { name: { zh: '城塞守卫——复原狮像', en: 'Eternal Watch', ja: '復元された獅子像「リペアドライオン」' }, drops: [49827, 49832, 47748], spawn_type: false },
    47: { name: { zh: '昏暗妖魂——鬼火苗', en: 'Flame of Dusk', ja: '昏き篝火「ヒンキーパンク」' }, drops: [49833, 49828, 47746], spawn_type: false },
    48: { name: { zh: '两歧塔 力之塔', en: 'The Forked Tower: Blood', ja: 'フォークタワー：力の塔' }, drops: [47868, 47734, 47735, 47736, 47737], spawn_type: false, type: 'tower' }
  };

  // --- 撒娇罐时刻表常量（分钟），取自社区实测 ----------------------------
  OC.POT_SCHEDULE = {
    firstMin: 5,     // 副本开启后 5 分钟第一只（北）
    intervalMin: 30, // 之后每 30 分钟交替 北/南
    instanceMaxMin: 180 // 副本最长寿命
    // 偶数序号=北(North / 1976)，奇数序号=南(South / 1977)
  };

  // 取本地化名字：优先 lang，回退 zh -> en -> ja -> 任意
  OC.localName = function (nameObj, lang) {
    if (!nameObj) return '';
    return nameObj[lang] || nameObj.zh || nameObj.en || nameObj.ja || Object.values(nameObj)[0] || '';
  };
})(typeof window !== 'undefined' ? window : this);
