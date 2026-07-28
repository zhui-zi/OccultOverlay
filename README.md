# Occult Crescent Overlay

A map overlay for FFXIV's Occult Crescent (South Horn and North Horn), for ACT / OverlayPlugin.
Everything is automatic — no setup, no tracker id. Data comes from the shared cloud.

## Features

- Translucent zone map with toggleable point layers: bronze / silver coffers, north / south / reroll pots, carrots.
- Your character position on the map.
- Pot overview across the CN datacenters, sorted by next-pot time; click an island for its CE / FATE and drops.
- Optional ACT TTS alerts for every CE, FATE, and pot, with per-spawn deduplication.
- Only visible while you are in Occult Crescent.
- Collapse mode to hide the map.
- zh / en / ja.

## Use

Add as a Custom/URL overlay in OverlayPlugin, pointing at `index.html` (or a deployed URL).
It connects to the game automatically via the `HOST_PORT` / `OVERLAY_WS` parameter OverlayPlugin provides.

## Deploy (Cloudflare Pages)

Static site. Connect the repo in Cloudflare Pages with framework preset None and output directory `/`,
or run `npx wrangler pages deploy .`.

## License

MIT. Not affiliated with SQUARE ENIX. FINAL FANTASY XIV © SQUARE ENIX.
