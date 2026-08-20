# Occult Crescent Overlay

A multilingual ACT / OverlayPlugin map overlay for FFXIV's South Horn and North Horn.
It connects automatically and uses shared cloud data without a tracker ID.

## Features

- Live map and radar for the player, coffers, carrots, Magic Pots, and survey points.
- Magic Pot guidance, timing, and configurable ACT TTS reminders.
- CE, FATE, Forked Tower, drop, trigger-monster, and Phantom Dispeller information.
- Simplified Chinese, English, and Japanese UI with independent CN and Global data regions.
- Toggleable layers, opacity and voice controls, collapse mode, and automatic zone visibility.

## Use

Add `index.html` or a deployed URL as a Custom/URL overlay in OverlayPlugin. The overlay connects through the `HOST_PORT` or `OVERLAY_WS` parameter supplied by OverlayPlugin.

## Deploy

Deploy the repository as a static site with the Cloudflare Pages framework preset set to None and output directory `/`, or run `npx wrangler pages deploy .`.

The fixed `dev` branch is published as a Pages preview at `https://dev.occultoverlay.pages.dev/`.

## Reference

- [EurekaTrackerAutoPopper](https://github.com/Infiziert90/EurekaTrackerAutoPopper)

## License

MIT. Not affiliated with SQUARE ENIX. FINAL FANTASY XIV © SQUARE ENIX.
