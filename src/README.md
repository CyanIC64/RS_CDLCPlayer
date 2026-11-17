# Sources of deploy_ready/V1.1

The converter sources V1.1's `web/` scripts are built from. They started as a
copy of `../static_web_feasibility/` (the sources of V1), so V1 can still be
rebuilt from there unchanged.

## Changes against V1

- `js/convert.js` - lyric lines: blank placeholder "words" are ignored, and a
  pause of more than 10 s between two sung words ends the line. Through the
  Fire and Flames had two blank words in its solo, which made one line last
  80 s and the whole sheet was hidden as broken.
- `worker.entry.js` (new) - the converter as a Web Worker: unpack, decrypt,
  parse, cover art and the Wwise-to-Ogg audio step all run off the page's
  thread. The chart is sent back as JSON text (cheaper for the page to take in
  than a structured clone).

The page (`deploy_ready/V1.1/index.html`) starts the worker from a Blob, so it
also works when opened from disk, and falls back to the in-page converter
(`web/converter.js`, as in V1) when a Worker cannot run.
- `js/sng.js` + `js/convert.js` - official songs from the game's store are
  refused; only custom songs (CDLC) and .feedpak files open. A package with a
  `toolkit.version` file is custom; otherwise a chart (.sng) whose compressed
  data ends right before a non-zero 56-byte signature is official (DLC Builder
  writes zeros there, the Custom Song Toolkit writes nothing). Tested: 46 of 46
  official refused, 128 of 128 custom opened. A good-faith filter, not a lock;
  a .feedpak made from an official song cannot be told apart.
- Raw XML input (`js/convert.js` `convertXmlSet`, `worker.entry.js`
  `openXmlSet`, the page's `openLocalXml`): arrangement XML files dropped
  together with the audio and cover art, or the whole project folder, are
  played directly. A .wem is converted, other audio (.ogg/.mp3/.wav/.flac/...)
  and pictures are used as they are; without audio the chart plays against a
  silent track. When a folder also holds a packed .psarc, the XML wins.
- Left-handed view (option): the scene is mirrored in `project()`; text is
  kept readable (`neckAxes`, `chordName`) and the chord diagram is mirrored.
- The arrangement picker sits in the control bar, left of Restart.

## Build

    node build.mjs

## Gear library

`amp/gear/{amps,cabinets,pedals}/<Key>.json` hold one file per Rocksmith amp,
cabinet, pedal and rack: what it is on the pedalboard (`model`, `cab`) and how
each of its knobs maps to a pedalboard parameter (`param`, `from` -> `to`,
optional `curve`). Edit a file to change how that piece of gear sounds, then
rebuild. Gear missing from the library is described on the fly by the same rules.

    node amp/make-gear.mjs <file.psarc | folder> ...   add the gear of these songs
    node amp/make-gear.mjs --force <...>               write every piece again (loses hand edits)
    node amp/gear-from-map.mjs <gear_mapping_reference.md> [rs_to_at5.py]

The library holds every amp, effect and cabinet enclosure of the RS-to-AT5p gear
map (github.com/zagatozee/RS-to-AT5p): a tone's gear is linked to its file by its
Rocksmith key (RS2014 or RS+). An amp says what it really is (`real`), its
`voice` (an amp type of `catalog.js` VOICES: tweed, American clean, Plexi, JCM,
AC, Orange, Rectifier, Mark, high gain, German, JC, bass, DI) and the `cab` it
drives; an effect, its pedalboard `model` and starting `params`; a cabinet file is
the enclosure ("Cab_CA412C"), and the microphone at the end of the tone's key
("_57_Edge") colours it. `gear-from-map.mjs` keeps the knob maps already in a file.

`build.mjs` gathers the files into `amp/gear/library.js` before bundling.

needs `esbuild` (set `ESBUILD` to its path if it is not installed locally).
It writes `converter.js` and `converter.worker.js` into `../deploy_ready/V1.1/web/`.
`web/ww2ogg.bundle.js` is copied unchanged from V1.
