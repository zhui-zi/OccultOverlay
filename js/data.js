/* Static Occult Crescent data from EurekaTrackerAutoPopper and OccultTrackerV3. */
(function (global) {
  'use strict';

  var OC = global.OC = global.OC || {};

  OC.TERRITORIES = {
    1252: {
      key: 'southHorn',
      name: { zh: '新月岛 南征之章', en: 'Occult Crescent: South Horn', ja: '蜃気楼の島 クレセントアイル：南征編' },
      mapId: 967,
      fateIds: [1962, 1963, 1964, 1965, 1966, 1967, 1968, 1969, 1970, 1971, 1972],
      potIds: [1976, 1977],
      ceIds: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]
    },
    1346: {
      key: 'northHorn',
      name: { zh: '蜃景幻界新月岛 北征之章', en: 'Occult Crescent: North Horn', ja: '北征編' },
      mapId: 1135,
      mapIds: [1135, 1244],
      fateIds: [2074, 2075, 2076, 2077, 2078, 2079, 2080, 2081, 2082, 2083, 2084],
      potIds: [2072, 2073],
      ceIds: [49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64]
    }
  };

  // --- 后端与图标服务 -----------------------------------------------------
  OC.BACKEND = {
    url: 'https://infi.ovh/api/OccultTrackerV3',
    // 公开匿名 JWT（role: anon），与官方站点一致
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.Ur6wgi_rD4dr3uLLvbLoaEvfLCu4QFWdrF-uHRtbl_s',
    iconBase: 'https://beta.xivapi.com/api/1/asset?format=png&path='
  };

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

  OC.WEAKNESS = {
    fire: { name: { zh: '火', en: 'Fire', ja: '火' }, img: 'ui/icon/229000/229983_hr1.tex' },
    ice: { name: { zh: '冰', en: 'Ice', ja: '氷' }, img: 'ui/icon/229000/229984_hr1.tex' },
    lightning: { name: { zh: '雷', en: 'Lightning', ja: '雷' }, img: 'ui/icon/229000/229985_hr1.tex' },
    wind: { name: { zh: '风', en: 'Wind', ja: '風' }, img: 'ui/icon/229000/229986_hr1.tex' }
  };

  OC.DROP_CAT = {
    demiatma: { zh: '半魂晶', en: 'Demiatma', color: '#5bc0de' },
    dispeller: { zh: '消幻晶', en: 'Phantom Dispeller', color: '#79c8ff' },
    notes: { zh: '调查记录', en: 'Exploration Notes', color: '#c9a227' },
    soulshard: { zh: '灵魂碎晶', en: 'Soul Shard', color: '#b06bd6' },
    accessory: { zh: '饰品', en: 'Accessory', color: '#e0843c' },
    misc: { zh: '其他', en: 'Misc', color: '#9aa0a6' }
  };

  // --- 掉落物（item_id -> 定义） -----------------------------------------
  OC.ITEMS = {
    // 半魂晶 Demiatma
    47744: { cat: 'demiatma', img: 'ui/icon/026000/026025.tex', name: { zh: '青色半魂晶', en: 'Azurite Demiatma', ja: '青晶のデミアートマ' } },
    47745: { cat: 'demiatma', img: 'ui/icon/026000/026035.tex', name: { zh: '碧色半魂晶', en: 'Verdigris Demiatma', ja: '碧晶のデミアートマ' } },
    47746: { cat: 'demiatma', img: 'ui/icon/026000/026034.tex', name: { zh: '绿色半魂晶', en: 'Malachite Demiatma', ja: '緑晶のデミアートマ' } },
    47747: { cat: 'demiatma', img: 'ui/icon/026000/026026.tex', name: { zh: '橙色半魂晶', en: 'Realgar Demiatma', ja: '橙晶のデミアートマ' } },
    47748: { cat: 'demiatma', img: 'ui/icon/026000/026027.tex', name: { zh: '紫色半魂晶', en: 'Caput Mortuum Demiatma', ja: '紫晶のデミアートマ' } },
    47749: { cat: 'demiatma', img: 'ui/icon/026000/026029.tex', name: { zh: '黄色半魂晶', en: 'Orpiment Demiatma', ja: '黄晶のデミアートマ' } },
    // 消幻晶 Phantom Dispeller
    50974: { cat: 'dispeller', img: 'ui/icon/026000/026229.tex', name: { zh: '消幻晶α', en: 'Phantom Dispeller α', ja: 'ファントムディスペラーα' } },
    50975: { cat: 'dispeller', img: 'ui/icon/026000/026231.tex', name: { zh: '消幻晶β', en: 'Phantom Dispeller β', ja: 'ファントムディスペラーβ' } },
    50976: { cat: 'dispeller', img: 'ui/icon/026000/026230.tex', name: { zh: '消幻晶γ', en: 'Phantom Dispeller γ', ja: 'ファントムディスペラーγ' } },
    // 调查记录 Exploration Notes
    47728: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：封印大妖', en: 'Notes on the Cloister Demon', ja: '探査記録:クロイスターデーモン' } },
    47729: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：神秘偶像', en: 'Notes on the Mythic Idol', ja: '探査記録:ミシカルアイドル' } },
    47730: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：狂战士', en: 'Notes on the Crescent Berserker', ja: '探査記録:クレセント・バーサーカー' } },
    47731: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：尼姆鲨', en: 'Notes on the Nymian Petalodus', ja: '探査記録:ニーム・ペタロドゥス' } },
    47732: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：黑陆行鸟', en: 'Notes on Black Chocobos', ja: '探査記録:黒チョコボ' } },
    47733: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：交易龟', en: 'Notes on the Trade Tortoise', ja: '探査記録:コイントートス' } },
    47734: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：恶魔石板', en: 'Notes on the Demon Tablet', ja: '探査記録:デモンズ・タブレット' } },
    47735: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：星头三人组', en: 'Notes on the Dead Stars', ja: '探査記録:星頭の三人組' } },
    47736: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：大理石龙', en: 'Notes on the Marble Dragon', ja: '探査記録:マーブルドラゴン' } },
    47737: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：魔导牛头', en: 'Notes on Magitaur', ja: '探査記録:マギタウロス' } },
    47738: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：撒娇罐', en: 'Notes on Persistent Pots', ja: '探査記録:おねだりポット' } },
    // 灵魂碎晶 Soul Shard
    47751: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：狂战士', en: "Berserker's Soul Shard", ja: 'ソウルシャード:バーサーカー' } },
    47752: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：游侠', en: "Ranger's Soul Shard", ja: 'ソウルシャード:狩人' } },
    47757: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：预言者', en: "Oracle's Soul Shard", ja: 'ソウルシャード:予言士' } },
    51972: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：青魔法师', en: "Blue Mage's Soul Shard", ja: 'ソウルシャード:青魔道士' } },
    51974: { cat: 'soulshard', img: 'ui/icon/026000/026681.tex', name: { zh: '灵魂碎晶：死灵法师', en: "Necromancer's Soul Shard", ja: 'ソウルシャード:ネクロマンサー' } },
    // North Horn exploration notes
    51979: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：古术魔典', en: 'Notes on Arbatel', ja: '探査記録:アルバテル' } },
    51980: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：小小法师', en: 'Notes on the Tiny Mage', ja: '探査記録:タイニーメイジ' } },
    51981: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：阿尔戈尔', en: 'Notes on Algol', ja: '探査記録:アルゴル' } },
    51982: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：变形法师', en: 'Notes on the Metamorph', ja: '探査記録:メタモルファ' } },
    51983: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：惨白魔人', en: 'Notes on the Pallmagia', ja: '探査記録:ペイルマギア' } },
    51984: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：魔亡灵法师', en: 'Notes on the Phantom Necromancer', ja: '探査記録:マギ・ネクロマンサー' } },
    51985: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：诱拐魔', en: 'Notes on the Abductor', ja: '探査記録:アブダクター' } },
    51986: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：赤龙', en: 'Notes on the Claret Dragon', ja: '探査記録:ルブルムドラゴン' } },
    51987: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：雪石膏之剑', en: 'Notes on the Alabaster Blade', ja: '探査記録:アラバスターブレード' } },
    51988: { cat: 'notes', img: 'ui/icon/026000/026603.tex', name: { zh: '调查记录：卡洛菲斯提莉二重身', en: 'Notes on Conjured Calofisteri', ja: '探査記録:カロフィステリ・ダブル' } },
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
    1962: { name: { zh: '涌潮海魔—纳木', en: 'Rough Waters', ja: '波起こしの海魔「ナンム」' }, drops: [47744], encounter_id: 28 },
    1963: { name: { zh: '古代怪石—金色石面', en: 'The Golden Guardian', ja: '金色の怪石「ゴールデンブロックス」' }, drops: [47744], encounter_id: 14 },
    1964: { name: { zh: '悲鸣收集者—罗普罗斯', en: 'King of the Crescent', ja: '悲鳴の蒐集者「ロプロス」' }, drops: [47749], encounter_id: 10 },
    1965: { name: { zh: '甲板清扫者—巨大鸟', en: 'The Winged Terror', ja: '甲板の掃除人「巨大鳥」' }, drops: [47747], encounter_id: 27 },
    1966: { name: { zh: '神罚石兽—西西弗斯', en: 'An Unending Duty', ja: '神罰の石獣「シジフォス」' }, drops: [47746], encounter_id: 26 },
    1967: { name: { zh: '进化的毒鸟—高等魔鸟', en: 'Brain Drain', ja: '進化せし怪蛇「アドバンスドエイビス」' }, drops: [47747], encounter_id: 24 },
    1968: { name: { zh: '湿度猎手—除湿之火', en: 'A Delicate Balance', ja: '湿度の狩手「ディヒューミディファイア」' }, drops: [47745], encounter_id: 25 },
    1969: { name: { zh: '土壤守护者—癫泥怪', en: 'Sworn to Soil', ja: '土壌の守り手「マッドマッド」' }, drops: [47745], encounter_id: 18 },
    1970: { name: { zh: '监视之瞳—岛屿监视者', en: 'A Prying Eye', ja: '監視の瞳「アイルオブザーバー」' }, drops: [47744], encounter_id: 29 },
    1971: { name: { zh: '美丽的咒杀者—执行者', en: 'Fatal Allure', ja: '美しき呪殺者「イグゼクレーター」' }, drops: [47749], encounter_id: 17 },
    1972: { name: { zh: '凶恶使魔—生命收割者', en: 'Serving Darkness', ja: '命の収奪者「ライフギャザラー」' }, drops: [47748], encounter_id: 24 },

    // North Horn Phantom Dispeller drops and elemental weaknesses.
    2074: { name: { zh: '暴力牛魔—好战弥诺陶洛斯', en: 'Raging Thrall', ja: '暴力の牛魔「ミノタウロス・マキア」' }, drops: [50974], weakness: ['fire'], encounter_id: 0 },
    2075: { name: { zh: '诅咒宝珠—邪瞳', en: 'Eye to Eye', ja: '呪いの宝珠「イビルシーア」' }, drops: [50975], weakness: ['fire'], encounter_id: 0 },
    2076: { name: { zh: '水边暴君—统领奇美拉', en: 'Shoreline Showdown', ja: '水辺の暴君「レグナントキマイラ」' }, drops: [50976], weakness: ['wind'], encounter_id: 0 },
    2077: { name: { zh: '历战水马—凯尔派总领', en: 'Waved Away', ja: '歴戦水馬「アーチケルピー」' }, drops: [50974], weakness: ['lightning'], encounter_id: 0 },
    2078: { name: { zh: '魔界的叹息—妖艳魔花珊迪', en: 'Allure of the Occult', ja: 'ため息モルボル「センシュアル・サンディ」' }, drops: [50975], weakness: ['fire'], encounter_id: 0 },
    2079: { name: { zh: '自怨自艾的歌手—伊阿姆柏', en: 'Inconstant Gardener', ja: '自滅の歌い手「イアムベー」' }, drops: [50976], weakness: ['fire'], encounter_id: 0 },
    2080: { name: { zh: '狼占狗窝—遗迹冰狼', en: 'Territorial Dispute', ja: '遺跡荒らしの氷狼「ルーインハウンド」' }, drops: [50975], weakness: ['fire'], encounter_id: 0 },
    2081: { name: { zh: '腐坏街道的守护者—忍耐基路伯', en: 'A Rotten Affair', ja: '腐都の守護者「ペイシェント・クリブ」' }, drops: [50974], weakness: ['wind', 'lightning'], encounter_id: 0 },
    2082: { name: { zh: '驾驭自然的巨兽—呼风狮鹫', en: 'Gale-force Encounter', ja: '暴風の操者「ストームコーラー」' }, drops: [50974], weakness: ['fire'], encounter_id: 0 },
    2083: { name: { zh: '仿制的蛇人偶—半灵美杜莎', en: 'Scale Model', ja: '模造の蛇人形「デミメデューサ」' }, drops: [50976], weakness: ['ice'], encounter_id: 0 },
    2084: { name: { zh: '高傲的雷兽—新月女王', en: 'Thunderregnum', ja: '気高き雷獣「クレセントレギナ」' }, drops: [50975], weakness: ['fire'], encounter_id: 0 }
  };

  // --- 撒娇罐 Pots（fate_id -> 定义） -----------------------------------
  OC.POTS = {
    1976: { name: { zh: '幸福的魔法罐（北）', en: 'Persistent Pots (North)', ja: 'しあわせのマジックポット(北)' }, territory: 1252, side: 'north', drops: [47749, 47738], encounter_id: 40 },
    1977: { name: { zh: '瑟瑟发抖的魔法罐（南）', en: 'Pleading Pots (South)', ja: 'カチカチのマジックポット(南)' }, territory: 1252, side: 'south', drops: [47745, 47737], encounter_id: 18 },
    2072: { name: { zh: '被欺负的魔法罐(北)', en: 'Daylight Pottery (North)', ja: '隠されのマジックポット（北）' }, territory: 1346, side: 'north', drops: [50976], weakness: ['fire'], encounter_id: 0 },
    2073: { name: { zh: '被吹飞的魔法罐(南)', en: 'In a Pot of Bother (South)', ja: '飛ばされのマジックポット（南）' }, territory: 1346, side: 'south', drops: [50975], weakness: ['lightning'], encounter_id: 0 }
  };

  // --- 危命任务 CE（encounter_id -> 定义） -------------------------------
  // spawn_type=true 表示由特定怪物（monster）击杀触发。
  OC.CES = {
    33: { name: { zh: '脑髓爱好者—夺心魔', en: 'Scourge of the Mind', ja: '脳髄愛好家「マインドフレイア」' }, drops: [49831, 49826, 47744], spawn_type: true, monster: { zh: '新月鬼鱼', en: 'Crescent Monk', ja: 'クレセント・モンク' }, monster_image: 'assets/trigger-monsters/33.png' },
    34: { name: { zh: '黑色连队', en: 'The Black Regiment', ja: '黒の連隊' }, drops: [49831, 49826, 47749, 47752, 47732], spawn_type: false },
    35: { name: { zh: '愤怒的人造人—新月狂战士', en: 'The Unbridled', ja: '怒れる人造人間「クレセント・バーサーカー」' }, drops: [49831, 49826, 47744, 47751, 47730], spawn_type: false },
    36: { name: { zh: '潜影撕裂者—死亡爪', en: 'Crawling Death', ja: '忍び寄る爪「デスクロー」' }, drops: [49831, 49826, 47744], spawn_type: false },
    37: { name: { zh: '挣脱封印的大妖异—回廊恶魔', en: 'Calamity Bound', ja: '封印大妖「クロイスターデーモン」' }, drops: [49831, 49826, 47745, 47728, 48008], spawn_type: true, monster: { zh: '新月墨渍', en: 'Crescent Inkstain', ja: 'クレセント・インクステイン' }, monster_image: 'assets/trigger-monsters/37.png' },
    38: { name: { zh: '拟造使魔—水晶龙', en: 'Trial by Claw', ja: '模造されしもの「水晶竜」' }, drops: [49833, 49828, 47746], spawn_type: false },
    39: { name: { zh: '双极的造物—神秘土偶', en: 'From Times Bygone', ja: '神秘の偶像「ミシカルアイドル」' }, drops: [49833, 49828, 47746, 47729], spawn_type: true, monster: { zh: '新月比布鲁斯', en: 'Crescent Byblos', ja: 'クレセント・ビブロス' }, monster_image: 'assets/trigger-monsters/39.png' },
    40: { name: { zh: '石制骑士团', en: 'Company of Stone', ja: '石造りの守護騎士たち' }, drops: [49827, 49832, 47748], spawn_type: false },
    41: { name: { zh: '传说中的鲨鱼—尼姆瓣齿鲨', en: 'Shark Attack', ja: '伝説の鮫「ニーム・ペタロドゥス」' }, drops: [49833, 49828, 47747, 47731], spawn_type: true, monster: { zh: '新月小瓣齿鲨', en: 'Crescent Petalodite', ja: 'クレセント・レッサーペタロドゥス' }, monster_image: 'assets/trigger-monsters/41.png' },
    42: { name: { zh: '双足狮人—跃立狮', en: 'On the Hunt', ja: '二足の獅子「ランパントライオン」' }, drops: [49827, 49832, 47748, 47757], spawn_type: true, monster: { zh: '新月风扇', en: 'Crescent Fan', ja: 'クレセント・ファン' }, monster_image: 'assets/trigger-monsters/42.png' },
    43: { name: { zh: '防卫指令', en: 'With Extreme Prejudice', ja: 'セキュリティ・コマンドー' }, drops: [49833, 49828, 47747], spawn_type: false },
    44: { name: { zh: '厌鸟巨兽—进化加鲁拉', en: 'Noise Complaint', ja: '鳥嫌いの巨獣「ネオガルラ」' }, drops: [49827, 49832, 47749], spawn_type: true, monster: { zh: '新月加鲁拉', en: 'Crescent Garula', ja: 'クレセント・ガルラ' }, monster_image: 'assets/trigger-monsters/44.png' },
    45: { name: { zh: '贩卖诅咒的商贩—金钱龟', en: 'Cursed Concern', ja: '呪いの商亀「コイントートス」' }, drops: [49827, 49832, 47747, 47733], spawn_type: false },
    46: { name: { zh: '城塞守卫—复原狮像', en: 'Eternal Watch', ja: '復元された獅子像「リペアドライオン」' }, drops: [49827, 49832, 47748], spawn_type: false },
    47: { name: { zh: '昏暗妖魂—鬼火苗', en: 'Flame of Dusk', ja: '昏き篝火「ヒンキーパンク」' }, drops: [49833, 49828, 47746], spawn_type: false },
    48: { name: { zh: '两歧塔 力之塔', en: 'The Forked Tower: Blood', ja: 'フォークタワー：力の塔' }, drops: [47868, 47734, 47735, 47736, 47737], spawn_type: false, type: 'tower' },

    // North Horn elemental weaknesses and reward drops.
    49: { name: { zh: '四颚斧花—提蔛', en: 'Many Mouths to Feed', ja: '四つ顎の魔樹「ペレキュス」' }, drops: [50974], weakness: ['ice'], spawn_type: true, monster: { zh: '新月瓦魔蛾', en: 'Crescent Wamoura', ja: 'クレセント・ワモーラ' }, monster_image: 'assets/trigger-monsters/49.png' },
    50: { name: { zh: '魔女复制体—卡洛菲斯提莉二重身', en: 'Doubled Trouble', ja: '魔女の複製体「カロフィステリ・ダブル」' }, drops: [49832, 49827, 51988, 50976], weakness: ['wind'], spawn_type: true, monster: { zh: '新月黑卫', en: 'Crescent Blackguard', ja: 'クレセント・ブラックガード' }, monster_image: 'assets/trigger-monsters/50.png' },
    51: { name: { zh: '纯白守护者—雪石膏之剑', en: 'Quarried Away', ja: '白の守護者「アラバスターブレード」' }, drops: [49831, 49826, 51987, 50975], weakness: ['lightning'], spawn_type: false },
    52: { name: { zh: '禁书化形—古术魔典', en: 'Forbidden Folios', ja: '禁忌の魔道書「アルバテル」' }, drops: [49833, 49828, 51979, 50974], weakness: ['fire'], spawn_type: false },
    53: { name: { zh: '暗红尸骸—赤龙', en: 'Cursed Resurgence', ja: '暗紅の屍竜「ルブルムドラゴン」' }, drops: [51986, 50975], weakness: ['fire'], spawn_type: true, monster: { zh: '新月大角牛', en: 'Crescent Big Horn', ja: 'クレセント・ビッグホーン' }, monster_image: 'assets/trigger-monsters/53.png' },
    54: { name: { zh: '暴食咒鬼—阿尔戈尔', en: 'Imbalanced Diet', ja: '大食の呪鬼「アルゴル」' }, drops: [49831, 49826, 51981, 50975], weakness: ['fire'], spawn_type: false },
    55: { name: { zh: '残暴的母蜘蛛—新月阿剌克涅', en: 'Web of Terror', ja: '猟奇の母蜘蛛「クレセント・アルケニー」' }, drops: [49832, 49827, 50974], weakness: ['ice'], spawn_type: true, monster: { zh: '新月地狱犬', en: 'Crescent Hellhound', ja: 'クレセント・ヘルハウンド' }, monster_image: 'assets/trigger-monsters/55.png' },
    56: { name: { zh: '叛逆使魔—负隅宝石兽', en: 'A Beast Unleashed', ja: '反逆の使い魔「アトラス・カーバンクル」' }, drops: [49833, 49828, 50976], weakness: ['ice'], spawn_type: false },
    57: { name: { zh: '天道好轮回—魔亡灵法师', en: 'Dark Artistry', ja: '死霊使いの亡霊「マギ・ネクロマンサー」' }, drops: [49832, 49827, 51974, 51984, 50975], weakness: ['wind'], spawn_type: false },
    58: { name: { zh: '求道的人造人—神木巨人', en: 'Familiar Tactics', ja: '求道の人造人間「エルムギガース」' }, drops: [49833, 49828, 50976], weakness: ['lightning'], spawn_type: false },
    59: { name: { zh: '诅咒的继承者—惨白魔人', en: 'Appalling Behavior', ja: '呪いを継ぐ者「ペイルマギア」' }, drops: [49831, 49826, 51972, 51983, 50974], weakness: ['fire'], spawn_type: false },
    60: { name: { zh: '魔法军团—小小法师', en: 'Tiny Terror', ja: '魔道兵団「タイニーメイジ」' }, drops: [49833, 49828, 51980, 50975], weakness: ['lightning'], spawn_type: false },
    61: { name: { zh: '孤岛的绑架犯—诱拐魔', en: 'Lost on the Wind', ja: '絶島の誘拐者「アブダクター」' }, drops: [49832, 49827, 51985, 50976], weakness: ['lightning'], spawn_type: false },
    62: { name: { zh: '苏醒的多头龙—魔许德拉', en: 'Ahead of the Competition', ja: '覚醒の多頭竜「マギ・ヒュドラ」' }, drops: [49833, 49828, 50974], weakness: ['ice'], spawn_type: false },
    63: { name: { zh: '拟态使魔—变形法师', en: 'Accept No Imitators', ja: '変化の使い魔「メタモルファ」' }, drops: [49831, 49826, 51982, 50976], weakness: ['wind'], spawn_type: false },
    64: { name: { zh: '两岐塔 魔之塔', en: 'The Forked Tower: Magic', ja: 'フォークタワー：魔の塔' }, drops: [], spawn_type: false, type: 'tower' }
  };

  // --- 撒娇罐时刻表常量（分钟），取自社区实测 ----------------------------
  OC.POT_SCHEDULE = {
    firstMin: 5,     // 副本开启后 5 分钟第一只（北）
    intervalMin: 30, // 之后每 30 分钟交替 北/南
    instanceMaxMin: 180 // 副本最长寿命
    // 偶数序号=北(North / 1976)，奇数序号=南(South / 1977)
  };

  OC.localName = function (nameObj, lang) {
    if (!nameObj) return '';
    return nameObj[lang] || nameObj.zh || nameObj.en || nameObj.ja || Object.values(nameObj)[0] || '';
  };
})(typeof window !== 'undefined' ? window : this);
