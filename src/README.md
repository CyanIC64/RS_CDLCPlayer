# Sources of deploy_ready/V1.2

The converter scripts in `deploy_ready/V1.2/web/` are built from these sources. The page itself,
`deploy_ready/V1.2/index.html`, is edited directly and has no build step.

V1.2 opens song packs and charts only:
- `.feedpak` and `.sloppak` packs (the same format under two names);
- unpacked pack folders and loose arrangement JSON;
- arrangement XML with its audio.

## Files

| File | Does |
|---|---|
| `worker.entry.js` | the converter as a Web Worker; becomes `web/converter.worker.js` (bundled with ww2ogg, kept as a string so the page can start it from a Blob, also from `file://`) |
| `converter.entry.js` | the same converter for the page itself (fallback when no Worker can start); becomes `web/converter.js` |
| `js/feedpak.js` | a pack (zip) or a pack's own files (unpacked folder, loose arrangement JSON) → the page's payload |
| `js/convert.js` | arrangement XML → payload; lyric line rules and tone read-out shared with `feedpak.js` |
| `js/song.js`, `js/xml.js` | arrangement XML parser and its port of the chart model |
| `js/tones.js` | tone names from a project's manifest JSON |
| `js/cover.js` | DDS cover art decoder (charting project folders) |
| `js/zip.js` | minimal zip reader (`DecompressionStream`) |
| `vendor/` | ww2ogg (BSD-3-Clause) and js-yaml (MIT) |
| `build.mjs` | esbuild bundling into `../deploy_ready/V1.2/web/` |

## Build

From `play_song_web_experiment/src_v1.2/`:

```bash
ESBUILD=/path/to/node_modules/esbuild node build.mjs
```

The script writes `converter.js` and `converter.worker.js` to `../deploy_ready/V1.2/web/`.
`web/ww2ogg.bundle.js` is a copy of `vendor/ww2ogg.bundle.js`.

## History

Copied from the desktop Play Song's converter (`play_song_src`), with the game-archive reader, the
encrypted chart reader and everything that used them removed. The desktop keeps them.
