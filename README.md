# Occult Crescent Overlay

A map overlay for FFXIV's Occult Crescent (South Horn and North Horn), for ACT / OverlayPlugin.
Everything is automatic — no setup, no tracker id. Data comes from the shared cloud.

## Features

- Translucent zone map with toggleable point layers: bronze / silver coffers, north / south / reroll pots, carrots, and survey points.
- Your character position on the map.
- Magic Pot treasure guidance from personal buff and direction logs, with strict eight-sector filtering and safe-point priority.
- Simplified Chinese, English, and Japanese UI with an independent CN/global data-region selector.
- CN pot overview when the CN data region is selected, sorted by next-pot time; click an island for its CE / FATE and drops.
- Pot timing only uses an observed current-cycle spawn from a strictly matched instance.
- Optional ACT TTS alerts for every CE, FATE, and pot, with per-spawn deduplication.
- Optional Forked Tower alerts and active-event chips.
- South Horn demiatma filters; North Horn soul-shard and exploration-note drops.
- On-demand North Horn trigger-monster location maps.
- North Horn Phantom Dispeller mappings and filtered spawn alerts.
- Only visible while you are in Occult Crescent.
- Collapse mode to hide the map.

## Language

The default `System default` mode follows the computer language: Chinese selects Simplified Chinese, Japanese selects Japanese, and all other languages select English. The language can also be selected manually in Settings.

On first use, the data region defaults to CN for Chinese and Global for other languages. It is then stored independently from the UI language.

- CN matches datacenters `101–104` and shows the CN pot overview.
- Global matches datacenters `1–11` and hides the CN pot overview.

## Use

Add as a Custom/URL overlay in OverlayPlugin, pointing at `index.html` (or a deployed URL).
It connects to the game automatically via the `HOST_PORT` / `OVERLAY_WS` parameter OverlayPlugin provides.

## Deploy (Cloudflare Pages)

Static site. Connect the repo in Cloudflare Pages with framework preset None and output directory `/`,
or run `npx wrangler pages deploy .`.

The fixed `dev` branch is published as a Pages preview at `https://dev.occultoverlay.pages.dev/`.

## License

MIT. Not affiliated with SQUARE ENIX. FINAL FANTASY XIV © SQUARE ENIX.
