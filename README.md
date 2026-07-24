# Occult Crescent Overlay

A map-centric overlay for FFXIV's **Occult Crescent (South Horn)**, usable inside
**ACT / OverlayPlugin** (also IINACT, or standalone in a browser). Data is read from and
reported to the public community tracker cloud.

> Design principle: **the cloud is the single source of truth**. The overlay only fetches
> from and submits to the cloud — no manual reporting and no local timer guessing.

## UI

- A translucent, real in-game map is the main view. A column of round buttons on the right:
  - Layer toggles: **Bronze coffers / Silver coffers / North pot / South pot / Reroll / Carrot**
    (all off by default; markers stay fully opaque regardless of map opacity).
  - Panels: **Battle** (CE / FATE / Pot list), **CN DC Pots**, **Settings**.
- Always-on chips at the top: current zone, **Critical Engagement** state, **Pot** countdown.
- Your character position is drawn on the map (read from game memory via OverlayPlugin `getCombatants`).

## Features

- **CE / FATE alerts**: toast + sound when a Critical Engagement / FATE spawns in your instance,
  with its fixed location highlighted on the map.
- **Drops**: every CE / FATE / pot shows its drops (Demiatma / Notes / Soul Shard / Accessory) with icons.
- **CE state**: Active / Ready / Cooldown, derived from the cloud spawn/death times.
- **Pot ETA**: next pot = cloud `spawn_time + 30min` (North = 1976, South = 1977). No local estimation.
- **CN DC Pot Overview**: one click lists every active island across the 4 CN datacenters, sorted by
  shortest pot ETA, labeled by datacenter. Duplicate islands (same DC + same pot spawn times) are merged.
- **Map data**: real coordinates for coffers, pots, reroll spots, and carrots.
- **Localization**: zh / en / ja UI. Encounter names come from the game data (Occult Crescent is not on
  CN servers yet, so no official CN names exist; zh falls back to the English game name — switch the
  language to JA for Japanese names).

## Reporting model (no duplicate islands)

The overlay reports by `PATCH`-ing a single configured tracker id; it never auto-creates trackers.
Duplicate islands on the site come from multiple people each creating their own tracker for the same
physical instance — an inherent property of the platform, not of this overlay. Mitigations here:
tracker creation is explicit-only, and the CN DC overview de-duplicates identical islands.

## Use in ACT / OverlayPlugin

1. ACT → Plugins → OverlayPlugin → new **Custom / URL** overlay.
2. Set the URL to `index.html` (local path) or your deployed address (see below).
3. It auto-connects to `ws://127.0.0.1:10501/ws`. Override with `?OVERLAY_WS=ws://host:port/ws` if needed.
4. Optional: set a shared **Tracker ID** in Settings to sync your party's instance.
5. Player position, CE alerts, and the CN pot overview work without any tracker id.

> Cache: the include URLs carry a `?v=` version. Bump it when deploying so ACT's embedded browser reloads.

## Deploy to Cloudflare Pages

Static site, deploy as-is:

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → this repo.
2. Framework preset = None, empty build command, build output directory = `/`.
3. Use the resulting `https://<project>.pages.dev` as the OverlayPlugin URL.

Mixed content note: the page is HTTPS while OverlayPlugin uses `ws://127.0.0.1`. OverlayPlugin's embedded
browser (CEF) permits this local connection, so a hosted HTTPS page works in ACT; a normal browser can
only use it as a standalone viewer (no game data). Wrangler alternative: `npx wrangler pages deploy .`.

## Data sources & credits

- Cloud data model, item ids, icons: community tracker (`tracker.xivstats.com` / `infi.ovh`).
- Map, coordinates (coffers / pots / reroll / carrots), encounter positions, CN terminology:
  the author's own [EurekaTrackerAutoPopper](https://github.com/zhui-zi/EurekaTrackerAutoPopper).
- Map tile `assets/map.png` and drop icons: `xivapi.com` (Map o6b1/01, 2048x2048).
- World-to-pixel: `px = x + 1024, py = z + 1024` (SizeFactor 100, offset 0).

## Layout

```
OccultOverlay/
├─ index.html
├─ assets/map.png
├─ css/style.css
├─ data/mapPoints.js      # real point coordinates + encounter positions
└─ js/
   ├─ data.js   ├─ api.js    ├─ overlay.js ├─ pots.js
   ├─ ce.js     ├─ map.js    ├─ ui.js      ├─ settings.js
   ├─ i18n.js   └─ main.js
```

## License

MIT (see [LICENSE](LICENSE)). Not affiliated with SQUARE ENIX. FINAL FANTASY XIV © SQUARE ENIX.
