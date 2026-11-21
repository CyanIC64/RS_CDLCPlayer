# Play Song

**See and hear a guitar chart on a 3-D note highway or as tablature, right in your browser.**

Play Song is a single static web page. Drop a custom song (`.psarc`), a `.feedpak`, or a chart's
arrangement `.xml` files onto it, and it plays the song with the notes flying toward a fretboard,
like a rhythm game, or scrolls along a tab sheet. Everything runs on your own computer: there is no
server, no upload and no account.

> **Please use only songs you have obtained legally.** Play Song is an independent, non-commercial
> project. It does not provide any songs, does not open official songs from the game's store, and is
> not affiliated with any game publisher or rights holder.

---

## Features

### The highway
- 3-D note highway drawn with Canvas2D, with a camera that follows the hand position and eases
  over to new positions ahead of time.
- Every playing technique has its own notehead and tail: slides, bends, vibrato, hammer-ons,
  pull-offs, harmonics, palm mutes, tremolo, accents and more.
- Chord frames with chord names, finger-position numbers, and a chord diagram for the chord being held.
- Fret numbers that fade as notes reach the fretboard, a note-hit light, and a gradual glow as notes approach.
- **Left-handed view**: the whole scene is mirrored (nut on the right) while all writing stays readable.
- **Invert strings**: low string at the bottom instead of the top.

### Tab view
- The chart as guitar tablature with rhythm stems, chord names and lyrics under the bars.
- A pointer line that glides with the music and highlights the notes being played.
- Press **T** or click **Tab** to switch.

### Playing along
- Arrangement picker (Lead / Rhythm / Bass / ...) right in the control bar.
- Song speed from 20 % to 100 % without changing pitch.
- Loop the current section, or press, hold and drag on the difficulty bars to loop any stretch.
- Metronome and a note synth that plays the chart's notes.
- Karaoke-style lyrics, two lines at a time.
- Tone changes marked on the seek bar, with the current tone shown in the corner. Each tone is
  labelled **clean**, **crunch** or **distortion**, from the author's tags or else from its gear
  (amp gain, drive pedals); the seek-bar flags take the same colours. Packages without arrangement
  XML get their tone switches from the chart (`.sng`).
- **Play through the song's tone** (*Options → Guitar input*, or **A**): the guitar input is heard
  through a pedalboard set from each tone's gear, in the order of Rocksmith's tone designer: **Pre**
  (pedals before the amp), **Amp** (voice, gain, EQ), **Loop** (the amp's effects loop, before the
  cabinet), **Cabinet** (speakers and microphone) and **Rack** (studio effects after the cabinet), with
  drive, compressor, chorus, flanger, phaser, tremolo, wah, EQ, octave, delay and reverb. It switches tone when the song does. Use headphones.
- **Pedalboard** (**P**, or *Options → Guitar input → Pedalboard*): every tone of the song, from all
  its arrangements, is rebuilt from its gear and listed on a bar at the top (the tone in force is
  underlined; *Follow the song* keeps the board on it). Pick any tone to see and change its amp,
  cabinet and pedals, even one of another arrangement. Every amp, effect and cabinet of Rocksmith 2014
  and Rocksmith+ is recognised by its key (from the RS-to-AT5p gear map) and played as the real gear it
  stands for: the amp's voice (tweed, American clean, Plexi, JCM, AC, Orange, Rectifier, Mark, high
  gain, German, JC, bass, DI), its cabinet and the microphone on it. Amps and pedals wear the face of
  the real gear: its enclosure and colours, and its own controls (knobs, faders, switches, a wah's
  treadle) - a Mark series head has its five-band EQ, a Twin its bright switch and reverb, a Metal Zone
  its EQ, a rack unit its ears and bypass. The amp's *Model* puts another head on the board, and **+**
  offers the library's real pedals as well as the plain ones. Turn the knobs (drag around them, the wheel or the arrow keys; double-click
  puts one back), switch pedals on and off, drag them into another order or into the effects loop, and
  add pedals with **+**. Changes are kept in this browser per song and tone; *Song's tone* puts the
  board back as the song has it.
- Stem picker for `.feedpak` files that carry separated stems.
- Note-sync offset in 1 ms and 10 ms steps.
- Guitar input (in progress): plug in the Rocksmith Real Tone Cable, or any audio input, and
  *Options → Guitar input* shows its level and the note it hears. A cable icon in the control bar shows
  when the cable is plugged in, and **U** opens a tuner set to the open strings of the arrangement
  (its tuning and cent offset); click a string there to tune only that one. While the song plays, every note of the chart is checked against
  what you play (single notes, chords - a finger on the wrong fret is caught - slides, bends and
  palm mutes): *Notes hit* in the corner counts the notes and chords you got right out of all in
  the arrangement, and with *Note-hit light* on (Options, off by default) the light rings green on a hit and red on a miss and each
  note turns green on the strings when you hit it, or dark and ringed in red when you miss it. The tab view marks them the same way;
  the phrase bars at the top take the colour of your score in each phrase, with its percentage. At the end of the
  song a summary gives your score, best streak and the phrases most worth practising (click one to go there).
  *Calibrate* measures the input latency from a few strikes on a click.

### Opening songs
| What you drop | What happens |
|---|---|
| Custom song `.psarc` (CDLC) | Unpacked and converted on the page, audio included |
| `.feedpak` | Opened as it is, including its stems |
| Arrangement `.xml` files + audio + cover art, or the whole project folder | Played directly, handy while charting. Audio can be `.wem`, `.ogg`, `.mp3`, `.wav`, `.flac` or `.m4a`. Without audio the chart plays silently |

Only CDLC's are supported.

### Performance
- Converting runs in a Web Worker, so the page keeps drawing while a song opens.
- Sprite caches for noteheads and text, a render-scale option, and optional automatic resolution.
- Settings are remembered in the browser (`localStorage`).

---

## Getting started

### Use it locally
Open `index.html` in Chrome, Edge or Firefox. It works straight from disk (`file://`); nothing needs to be installed.

### Host it
The folder is a plain static site: `index.html` and the `web/` folder. Put it on any static host,
such as GitHub Pages, Vercel, Netlify or your own web server. No build step or server code is needed.

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
| `G` | Guitar input on / off |
| `A` | Play the guitar through the song's tone |
| `U` | Tuner (`Esc` closes it) |
| `M` | Mute |
| `O` | Options |
| `,` / `.` | Note offset −1 / +1 ms |

---

## Files

```
index.html                  the whole player: highway, tab view, audio, controls
web/converter.worker.js     the converter, started as a Web Worker
web/converter.js            the same converter for the page itself (used when a Worker cannot start)
web/ww2ogg.bundle.js        audio converter (.wem to Ogg Vorbis) for the in-page converter
web/pitch.js                guitar input: pitch detection in an AudioWorklet (window.PitchKit)
web/amp.js                  guitar input: the pedalboard for the song's tones (window.AmpKit)
```

The scripts in `web/` are built from the converter sources (`src/` in the development tree)
with esbuild:

```bash
ESBUILD=/path/to/node_modules/esbuild node build.mjs
```

---

## Browser support

A current Chrome, Edge or Firefox on a desktop computer. The page needs `DecompressionStream`,
Web Crypto (`crypto.subtle`), Web Audio and Web Workers. Safari has not been tested.
Phones can open it, but the control bar is made for wider screens.

---

## Privacy

Songs are opened on your own computer. Nothing you drop is uploaded, and your files are never
changed. The only data the page stores is your settings, in your browser's `localStorage`.

---

## Limitations

- Very long songs can take a few seconds to decode on slower computers.
- Only the hardest difficulty level of a chart is shown.

---

## Third-party code

- ww2ogg-ts, a TypeScript port of ww2ogg by Adam Gashlin, under the BSD-3-Clause licence.
- [js-yaml](https://github.com/nodeca/js-yaml) 4.1.0, under the MIT licence.
- [Tuna.js](https://github.com/Theodeus/tuna) 1.1.3 (the pedalboard's effects, and its cabinet and
  reverb impulse responses), by DinahMoe AB and Oskar Eriksson, under the MIT licence.
- [JS Rocks](https://github.com/vitaliy-bobrov/js-rocks) by Vitaliy Bobrov, under the MIT licence: the
  pedalboard's design and knob, and cabinet impulse responses.
- Which real amp, effect and cabinet each Rocksmith gear key stands for: the gear map of
  [RS-to-AT5p](https://github.com/zagatozee/RS-to-AT5p) (`gear_mapping_reference.md`), and the community
  sheet "Rocksmith 2014 / Real World" for the real gear behind each pedal and amp name.

---

## Version

**V1.1**, built on V1, adds:
- the converter running in a Web Worker;
- fixed lyric-line rules;
- the Tab view with a line pointer and note highlighting;
- the left-handed view and the invert-strings option;
- raw XML input and the arrangement picker in the control bar;
- stacked sliders;
- a gradual note glow.
