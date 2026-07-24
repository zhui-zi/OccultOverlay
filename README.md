# 新月岛悬浮窗 · Occult Crescent Overlay

一个可在 **ACT / OverlayPlugin**（也兼容 IINACT、浏览器独立运行）中使用的悬浮窗，
用于跟踪《最终幻想14》**新月岛（隐秘月华 / Occult Crescent · South Horn）** 的实时信息。

数据与共享榜单来自公开的社区 Tracker 后端（`tracker.xivstats.com`），支持**读取与上报**。

## 功能

- **危命任务 CE / FATE 通知**：侦测到所在区域出现 CE / FATE 时弹出提醒（可开声音）。
- **掉落一览**：每个 CE / FATE / 罐子会显示掉落的**半魂晶 / 调查记录 / 灵魂碎晶 / 饰品**（带游戏图标）。
- **CE 触发状态**：显示当前是否有 CE 进行中、还有多久可触发、或“**现在可触发**”。
- **撒娇罐预告**：按“进本后 +5 分钟出第一只（北），之后每 30 分钟交替南北”的规律预测下一只罐子还有多久出现；
  看到罐子点一下“出现”即可**自动校准**，误差从 ±5 分钟收敛到 ±30 秒。副本剩余寿命一并显示。
- **共享 Tracker 上报**：面板上每个目标都有“出现 / 击杀”按钮，一键同步到共享榜单；也可开启“侦测到即自动上报”。
- **地图图层**：可分别开关显示 **青铜宝箱 / 白银宝箱 / 北罐 / 南罐 / 续罐 / 萝卜（采集点）** 的点位。
- **多语言**：中文 / English / 日本語。

## 使用（ACT / OverlayPlugin）

1. 打开 ACT → 插件 → OverlayPlugin，新建一个 **自定义（Custom / URL）** 悬浮窗。
2. 地址填入本项目 `index.html` 的路径，例如：
   - 本地文件：`file:///C:/Users/你/…/OccultOverlay/index.html`
   - 或用任意静态服务器托管后填 `http://localhost:端口/index.html`
3. 悬浮窗会自动连接 OverlayPlugin 的 WebSocket（默认 `ws://127.0.0.1:10501/ws`）。
   如端口不同，可在**设置**页填写；也可通过 URL 参数 `?OVERLAY_WS=ws://127.0.0.1:10501/ws` 指定。
4. 在**设置**页填入你的 **Tracker ID**（在 [tracker.xivstats.com](https://tracker.xivstats.com) 新建，或直接点“新建 Tracker”），
   即可与队伍/大区共享数据并上报。

> 独立运行：直接用浏览器打开 `index.html` 也能用（面板/预测/地图正常），只是没有游戏内区域侦测。

## 设置项

| 项 | 说明 |
| --- | --- |
| 语言 | 中文 / English / 日本語 |
| Tracker ID / 密码 | 共享榜单标识；密码仅为软锁 |
| 数据中心 | 新建 Tracker 时使用（含国服 陆行鸟/莫古力/猫小胖/豆豆柴） |
| OverlayPlugin WS 地址 | 默认 `ws://127.0.0.1:10501/ws` |
| 新月岛区域ID | 若区域名未能自动识别，可手填 territoryId 强制判定 |
| CE 冷却(秒) | CE“可触发”倒计时的参考冷却值（近似，可调） |
| 通知 | 声音提醒 / 仅在新月岛内提醒 / 侦测到即自动上报 |

## 地图点位数据

青铜/白银宝箱、南北罐、萝卜（采集点）的**精确坐标没有公开数据源**，本项目已搭好地图与图层框架，
点位数据集中在 [`data/mapPoints.js`](data/mapPoints.js) 中，按游戏坐标 `(x, y)`（约 0–42）填写即可，
界面会自动把新增点位画到地图上，无需改动其它代码。若把真实地图贴图放到 `assets/map.png`，会自动作为底图。

## 目录结构

```
OccultOverlay/
├─ index.html
├─ css/style.css
├─ js/
│  ├─ data.js        # CE/FATE/罐/掉落 定义
│  ├─ api.js         # 共享 Tracker 后端（读取/轮询/上报/新建）
│  ├─ overlay.js     # OverlayPlugin 连接 + 区域侦测 + 日志解析
│  ├─ pots.js        # 撒娇罐时刻预测 + 校准
│  ├─ ce.js          # CE 触发/冷却判定
│  ├─ map.js         # 地图渲染 + 图层开关
│  ├─ ui.js          # 面板/掉落/通知
│  ├─ settings.js    # 本地设置
│  ├─ i18n.js        # 文案
│  └─ main.js        # 主控/轮询/状态
└─ data/mapPoints.js # 可编辑的地图点位坐标
```

## 数据来源与致谢

- 榜单数据模型与图标：社区 Tracker（`tracker.xivstats.com` / `infi.ovh`）。
- 游戏图标：`beta.xivapi.com`。

本项目仅为社区辅助工具，与 SQUARE ENIX 无关。FINAL FANTASY XIV © SQUARE ENIX。

## 许可

MIT，见 [LICENSE](LICENSE)。
