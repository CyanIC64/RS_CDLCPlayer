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
- Render the highway to an MP4 video, with room left for a guitar camera (see V1.4).
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

The scripts in `web/` are V1.2.1's, unchanged. They are built from the sources in `src_v1.2.1/`
(in the development tree) with esbuild:

```bash
ESBUILD=/path/to/node_modules/esbuild node build.mjs
```

---

## Browser support

A current Chrome, Edge or Firefox on a desktop computer. The page needs `DecompressionStream`,
Web Audio and Web Workers. Safari has not been tested. Portrait screens (a phone held upright, a
monitor turned on its side) get their own layout; see V1.3 below.

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

**V1.4.8**, built on V1.4.7:
- **Render, picture in picture:** the camera can be resized by dragging any of its corners in the
  preview, as well as moved. The preview marks it as movable and resizable: a four-way arrow in the
  middle and a handle on each corner (only in the preview; the video's space stays plain). The size
  is remembered with the place, and **Reset** puts both back.

**V1.4.7**, built on V1.4.6:
- **Render:** with the difficulty bars left out, the note-hit light stays where it is with them,
  instead of drifting to wherever the screen's bars last were.

**V1.4.6**, built on V1.4.5:
- **Render dialog:** the Show checkboxes are drawn in the page's own dark style (a blue box with a
  white tick when on) instead of the browser's.

**V1.4.5**, built on V1.4.4:
- **Render dialog:** the selection boxes are all the same width, so they line up.

**V1.4.4**, built on V1.4.3:
- **Render, song title:** the title and artist fade in and out at the start of the video, where the
  lyrics stand (title on the first row, artist on the second), instead of staying in the corner.
  They are left out when the lyrics would already be up in those first seconds.

**V1.4.3**, built on V1.4.2:
- **Render preview:** while the song plays, the dialog's preview plays along with it, camera
  moving as it will in the video. Pressing **Render** pauses the song first.

**V1.4.2**, built on V1.4.1:
- **Render, picture in picture:** in portrait the camera space starts at the left, right under the
  lyrics, with room left for a third line when a long line wraps. The camera can be dragged
  anywhere in the dialog's preview (the video uses that place, and it is remembered); **Reset**
  puts it back.

**V1.4.1**, built on V1.4:
- **Render, portrait picture in picture:** the camera space sits under the lyrics instead of over them.
- **Render:** the chord diagram is left out of videos (the option is gone).
- **Chord names:** a long name seen close up (a near camera, a narrow screen) is drawn see-through,
  so the notes under it stay in view. Short names are unchanged.

**V1.4**, built on V1.3.10:
- **Render 3D Highway** (Options → Render): makes an MP4 video of the highway with the song's
  audio, for content creators. Part of the picture can be left empty for a guitar camera, to be
  filled in a video editor:
  - portrait (9:16) and square (1:1): camera on top, highway on top, or picture in picture;
  - landscape (16:9): camera left, camera right, or picture in picture; or no camera space at all;
  - the camera space can be black or green screen.
  - Resolution 720p, 1080p or 1440p; 30 or 60 fps; the whole song, or the loop (or the section
    on screen).
  - Shown or left out: difficulty bars, lyrics, chord names, chord diagram, finger positions,
    note-hit light, section and time, song title.
  - The video is drawn frame by frame at its own size, not recorded off the screen, so a phone
    held upright can make a landscape video, and 60 fps stays smooth on a slow device (it only
    takes longer). A preview in the dialog shows the layout; when it is done the video can be
    saved, or shared on a phone.
  - Needs a browser that can encode video (WebCodecs): a current Chrome or Edge, on a computer or
    on Android. Keep the page open while it renders.

**V1.3.10**, built on V1.3.9:
- **Options → Sync:** the line about what a positive offset means gives way to a **Bluetooth latency**
  row that shows the output delay measured, and the switch under it is now called **Compensate
  delay**. The two rows no longer overlap on a phone.

**V1.3.9**, built on V1.3.8:
- **Portrait section name:** the seek bar's section blocks no longer carry names (too narrow on a
  phone). The section being played is named instead at the bottom-left corner of the highway, right
  above the elapsed time. Landscape is unchanged.

**V1.3.8**, built on V1.3.7:
- **Portrait controls:** the row under the seek bar now has the path picker on the left, the
  transport buttons centred and the stem picker on the right (it used to be hidden on phones). The
  row below keeps Tab, the sliders, Open and Options. Landscape is unchanged.

**V1.3.7**, built on V1.3.6:
- **Auto audio delay:** the notes are drawn at the moment you hear them, not the moment the sound is
  sent out. The browser reports the delay of the audio output (about 0.2 s for a Bluetooth headset, a
  few ms for wired speakers); it is measured all the time, so plugging in or pairing a headset mid-song
  is followed. When playback starts the picture waits for the first sound to arrive. Options → Sync
  shows the delay measured and can switch it off; the note offset adds on top. The metronome and note
  synth are unaffected: they go through the same output and stay in step with the song.

**V1.3.6**, built on V1.3.5:
- **Screen stays on while a song plays:** a screen wake lock keeps the phone (or computer) from
  dimming and locking mid-song, and is let go as soon as playback stops. It needs a browser that
  offers wake locks and a page served over HTTPS (any normal host); elsewhere nothing changes.

**V1.3.5**, built on V1.3.4:
- **Looping on a phone:** tap and hold on the difficulty bars (or hold and drag across them) now
  selects a loop on touch screens. The browser used to take a held or dragged finger over as a scroll
  or long-press, which cancelled the selection. Fingers also get a wider margin around the bars, and
  a long press no longer opens the browser's menu.

**V1.3.4**, built on V1.3.3:
- **Portrait tab scrolling:** the tab now jumps straight to the next row, with no scrolling
  animation in between (the 200 ms glide of V1.3.3 was dizzying on a phone). Landscape still scrolls
  smoothly.

**V1.3.3**, built on V1.3.2:
- **Tab view:** two bars to a row instead of four, which was cramped. A row of fast notes, or of
  more words than two bars leave room for, takes one bar.
- **Portrait tab scrolling:** moving on to the next row glides over a set 200 ms. Touching the tab
  stops the glide.

**V1.3.2**, built on V1.3.1:
- **Portrait highway:** the camera is closer, with the highway at nearly the landscape angle, so it
  rises gently instead of steeply. The empty space under the lyrics is left that way on purpose.
- **Portrait settings of their own:** camera speed and zoom are kept apart from landscape's and
  saved separately. The Options slider (and the mouse wheel) change the one on screen. Portrait's
  camera speed starts at 150%, as the closer camera has further to move.
- **Portrait read-out:** the arrangement, section, tone and note-speed read-out is hidden, so the
  lyrics get the width.
- **Tab view:** four bars to a row, in every orientation. A row of fast notes, or of more words
  than four bars leave room for, takes two bars (or one) so it stays readable. In portrait the tab's
  writing is a little smaller.

**V1.3.1**, built on V1.3:
- **Phones:** the bottom row of controls (sliders, Open, Options, Tab) was hidden behind the
  browser's own toolbar. The page now fits the height the browser actually shows (`100dvh`), and
  keeps clear of a phone's home-indicator area.
- **Difficulty bars:** shorter, about half as tall on a phone and a quarter shorter in landscape.

**V1.3**, built on V1.2.1:
- **Portrait screens:** a layout of its own for a phone held upright or a monitor on its side.
  - The camera climbs higher and looks further down, so the highway runs up the whole screen.
  - The song details (cover, title, artist, tuning) give way; the controls move to two rows under
    the seek bar, with transport centred, so the volume, speed, metronome and synth sliders fit again.
  - Lyrics and the corner read-out are sized by the screen's width.
  - Landscape is unchanged.
- **Highway:**
  - pinch harmonics drawn as a bright, glowing head inside two frames of light;
  - bass slap and pop marked on the head (a white V and a white peak);
  - muted strums crossed out boldly, as in the game;
  - open strings drawn as a bar across the hand position, on legs when played alone.
- **Fix:** the stem picker hides on narrow windows again instead of crowding the controls.
- A debug panel for the camera and the scene (F8). It is closed unless you open it.

Known limit: the page can draw pre-bends and the full shape of compound bends, but the converter
in `web/` is still V1.2.1's and does not pass bend curves on, so bends look as they did in V1.2.1.

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
