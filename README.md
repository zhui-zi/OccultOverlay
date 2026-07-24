# 新月岛悬浮窗 · Occult Crescent Overlay

一个以**地图为主体**的《最终幻想14》**新月岛（南方海域 / Occult Crescent · South Horn）** 悬浮窗，
可在 **ACT / OverlayPlugin**（也兼容 IINACT、浏览器）中使用，数据来自公开的社区云端 Tracker。

> 设计原则：**数据只从云端获取与提交，不做人工上报、不做本地推算**，尽量保证可靠。

## 界面

- **半透明真实地图**为主视图，右侧一排**圆形小按钮**：
  - 图层开关：**铜宝箱 / 银宝箱 / 北罐 / 南罐 / 额外机会（续罐）/ 胡萝卜（萝卜）**
  - 面板：**战斗**（CE/FATE/罐 一览）、**设置**
- 顶部常驻信息胶囊：当前区域、**紧急遭遇战（CE）**状态、**撒娇罐**倒计时。

## 功能

- **CE / FATE 通知**：所在区域出现紧急遭遇战 / 危命任务时弹窗提醒（可开声音），并在地图上高亮其位置。
- **掉落一览**：每个 CE / FATE / 罐显示掉落的**半魂晶 / 调查记录 / 灵魂碎晶 / 饰品**（带游戏图标）。
- **CE 触发状态**：**进行中** / **可触发** / **冷却 mm:ss**（依据云端 spawn/death 时间）。
- **撒娇罐预告**：下一只 = 云端记录的上次出现时间 **+30 分钟**（北=1976 / 南=1977），非人工估算。
- **地图点位**：铜/银宝箱、南北罐、续罐、萝卜的真实坐标，可分别开关。
- **云端同步**：每秒轮询共享 Tracker；侦测到 CE/FATE/罐 时**自动提交**（无人工按钮）。
- **多语言**：中文 / English / 日本語。

## 使用（ACT / OverlayPlugin）

1. ACT → 插件 → OverlayPlugin → 新建 **自定义 / URL** 悬浮窗。
2. URL 填 `index.html` 路径，或填已部署的网址（见下方 Cloudflare Pages）。
3. 悬浮窗自动连接 `ws://127.0.0.1:10501/ws`（端口不同可在设置里改，或用 `?OVERLAY_WS=` 参数）。
4. 设置页填 **Tracker ID**（在 [tracker.xivstats.com](https://tracker.xivstats.com) 新建，或点“新建”），即可同步云端。

## 部署到 Cloudflare Pages（开放给所有人用）

本项目是纯静态站点，可直接部署：

1. Fork / 使用本仓库，登录 Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 选择本仓库，**Framework preset = None**，**Build command 留空**，**Build output directory = `/`（根目录）**。
3. 部署后得到 `https://<项目名>.pages.dev`，把该网址填进 OverlayPlugin 的 URL 即可。

> 关于混合内容：页面走 HTTPS，而 OverlayPlugin 走 `ws://127.0.0.1`。OverlayPlugin 内置浏览器（CEF）允许此本地连接，
> 因此 Pages 上的 HTTPS 页面在 ACT 内可正常连游戏；普通浏览器里则只能作独立查看（无游戏数据）。

也可用 Wrangler：`npx wrangler pages deploy . --project-name occult-overlay`。

## 数据与坐标来源

- 云端数据模型 / 图标：社区 Tracker（`tracker.xivstats.com` / `infi.ovh`）。
- 地图与点位坐标（铜/银宝箱、南北罐、续罐、萝卜）、中文术语：取自作者本人的
  [EurekaTrackerAutoPopper](https://github.com/zhui-zi/EurekaTrackerAutoPopper)。
- 地图底图 `assets/map.png` 与掉落图标：`xivapi.com`（Map o6b1/01，2048×2048）。
- 世界坐标 → 贴图像素：`px = x + 1024, py = z + 1024`（SizeFactor=100，Offset=0）。

## 目录结构

```
OccultOverlay/
├─ index.html
├─ assets/map.png          # 南方海域地图底图
├─ css/style.css
├─ data/mapPoints.js       # 真实点位坐标（60 铜 / 8 银 / 30 北罐 / 30 南罐 / 20 续罐 / 25 萝卜）
└─ js/
   ├─ data.js   ├─ api.js    ├─ overlay.js ├─ pots.js
   ├─ ce.js     ├─ map.js    ├─ ui.js      ├─ settings.js
   ├─ i18n.js   └─ main.js
```

## 许可

MIT，见 [LICENSE](LICENSE)。与 SQUARE ENIX 无关。FINAL FANTASY XIV © SQUARE ENIX。
