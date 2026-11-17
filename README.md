# Play Song

**See and hear a guitar chart on a 3-D note highway or as tablature, right in your browser.**

Play Song is a single static web page. Drop a `.feedpak` or `.sloppak` song pack onto it, or a
chart's arrangement files with their audio, and it plays the song: the notes fly toward a
fretboard like a rhythm game, or scroll along a tab sheet. Everything runs on your own computer.
There is no server, no upload and no account.

> **Please use only songs you have obtained legally.** Play Song is an independent, non-commercial
> project. It does not provide any songs and is not affiliated with any game publisher or rights holder.

---

## Features

### The highway
- 3-D note highway drawn with Canvas2D. The camera follows the hand position and eases over to new
  positions ahead of time.
- Every playing technique has its own notehead and tail: slides, bends, vibrato, hammer-ons,
  pull-offs, harmonics, palm and fret-hand mutes, taps, tremolo, accents and more.
  Technique symbols are visible as far down the highway as the note itself.
- Chord frames with chord names, finger-position indicators, and a chord diagram for the chord being held.
  Muted chords are drawn darker than played ones, so the two are told apart at a glance.
- Open strings written with a slide sweep off toward the nut, the way the slide is played.
- Past the nut, the strings fade out and each one ends in the note it is tuned to, in its own colour.
- Chord names and fret numbers are sized with the fretboard, as if printed on it, and fade in
  as they come closer.
- The glow on the fret numbers under the neck slides to the next hand position together with the
  finger indicators.
- A note-hit light, and a glow that builds up gradually as notes approach.
- **Left-handed view**: the whole scene is mirrored, nut on the right, with all writing still readable.
- **Invert strings**: low string at the bottom instead of the top.

### Tab view
- The chart as guitar tablature, with rhythm stems, chord names and lyrics under the bars.
- A pointer line glides with the music and highlights the notes being played.
- The syllable being sung is highlighted too. Bars sung before the guitar comes in are included.
- Press **T** or click **Tab** to switch. It opens right at the line being played.

### Lyrics
- Karaoke-style, two lines in view. When a line is sung, the lyrics scroll up one line: the finished line
  fades out as it rises and the next one fades in below.
- Seeking, or coming back from Tab view, puts the right lines in place at once.
- Lyrics from a vocals XML are moved to match the singing (a vocals XML is timed slightly late on purpose).

### Playing along
- Arrangement picker (Lead / Rhythm / Bass / …) right in the control bar.
- Song speed from 20 % to 100 % without changing pitch.
- Difficulty bars across the top: each phrase's bar is as tall as its hardest level, with an orange
  line under the phrases still to come.
- Loop the current section, or press, hold and drag on the difficulty bars to loop any stretch.
  Cyan pins mark where the loop starts and ends, already while you drag.
- Metronome and a note synth that plays the chart's notes.
- Tone changes marked on the seek bar, with the current tone shown in the corner.
- Stem picker for packs that carry separated stems.
- Note-sync offset in 1 ms and 10 ms steps.
- Switching songs while one plays fades the old one out over a second, sound and picture together,
  before the new one loads. While a song is opening, the controls are locked so nothing is
  pressed by accident.
- At the end of a song, playback goes back to the start and pauses, ready to play again.

### Opening songs
| What you drop | What happens |
|---|---|
| `.feedpak` or `.sloppak` | Opened as it is, stems included (`.sloppak` is the same format under its earlier name) |
| An unpacked pack folder (`manifest.yaml`, `arrangements/*.json`, `stems/`, …) | Opened like the packed file |
| Arrangement `.json` files in the pack format, with their audio (and `lyrics.json`, cover) | Played directly; the arrangements are found by their notes and chords |
| Arrangement `.xml` files with their audio and cover art, or the whole project folder | Played directly, handy while charting. Audio can be `.wem`, `.ogg`, `.mp3`, `.wav`, `.flac` or `.m4a` |

A chart dropped without audio plays silently, with a notice.

### Performance
- Songs are opened in a Web Worker, so the page keeps drawing while a song loads.
- A pack's stems are decoded two at a time and mixed as they finish: quick, without stalling the picture.
- Sprite caches for noteheads and text, a render-scale option, and optional automatic resolution.
- Settings are remembered in the browser (`localStorage`).

---

## Getting started

### Use it locally
Open `index.html` in Chrome, Edge or Firefox. It works straight from disk (`file://`), and nothing
needs to be installed.

### Host it
The folder is a plain static site: `index.html` and the `web/` folder. Put it on any static host,
such as GitHub Pages, Vercel, Netlify or your own web server. There is no build step and no server code.

**GitHub Pages:** push this folder to a repository, then go to *Settings → Pages* and choose the
branch and folder to publish.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Back / forward 1 s (`Shift` for 5 s) |
| `[` / `]` | Previous / next section |
| `R` | Restart |
| `L` | Loop the current section |
| `1` – `6` | Switch arrangement |
| `T` | Tab view |
| `C` | Metronome on / off |
| `N` | Note synth on / off |
| `M` | Mute |
| `O` | Options |
| `,` / `.` | Note offset −1 / +1 ms |

---

## Files

```
index.html                  the whole player: highway, tab view, lyrics, audio, controls
web/converter.worker.js     opens songs in a Web Worker (packs, arrangement JSON and XML)
web/converter.js            the same for the page itself (used when a Worker cannot start)
web/ww2ogg.bundle.js        audio converter (.wem to Ogg Vorbis) for the in-page converter
```

The scripts in `web/` are built from the sources in `src_v1.2.1/` (in the development tree) with esbuild:

```bash
ESBUILD=/path/to/node_modules/esbuild node build.mjs
```

---

## Browser support

A current Chrome, Edge or Firefox on a desktop computer. The page needs `DecompressionStream`,
Web Audio and Web Workers. Safari has not been tested. Phones can open it, but the control bar is
made for wider screens.

---

## Privacy

Songs are opened on your own computer. Nothing you drop is uploaded, and your files are never
changed. The only data the page stores is your settings, in your browser's `localStorage`.

---

## Limitations

- Only the hardest difficulty level of a chart is shown.
- Very long songs, or packs with many stems, can take several seconds to decode on slower computers.

---

## Third-party code

- ww2ogg-ts, a TypeScript port of ww2ogg by Adam Gashlin, under the BSD-3-Clause licence.
- [js-yaml](https://github.com/nodeca/js-yaml) 4.1.0, under the MIT licence.

---

## Version

**V1.2.1**, built on V1.2:
- **Difficulty bars:** heights follow each phrase's hardest level, with gaps between bars and an
  orange line under the phrases still to come.
- **Loops:** cyan pins mark the start and end of a loop, and show while you drag a selection.
- **Highway:**
  - muted chords drawn darker;
  - open strings with a slide sweep toward the nut;
  - each string's tuning written past the nut.
- **Lyrics:** vocals XML lyrics are moved to match the singing; coming back from Tab view no longer
  scrolls the lyrics from far away.
- **Tab view:** opens right at the line being played.
- **Playback:** at the end of a song, it goes back to the start and pauses, with the camera easing back.
- **Loading:** the controls are locked while a song opens.
- **Icon:** a page icon.

**V1.2**, built on V1.1:
- **Formats:** opens `.feedpak` and `.sloppak` packs, unpacked pack folders, arrangement JSON and
  arrangement XML. It no longer opens game archives.
- **Lyrics:** scroll line by line, and stay in place when you seek.
- **Tab view:** highlights the syllable being sung.
- **Song switching:** smoother, with a one-second fade-out and the camera easing to rest.
- **Loading:** faster, with stems decoded in parallel.
- **Highway:**
  - technique symbols visible at any distance;
  - chord names and fret numbers sized with the fretboard, and fading in;
  - the fret-number glow moves with the finger indicators.
- **Fix:** the stem picker no longer covers the Play button.
