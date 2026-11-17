// Arrangement XML -> wire JSON.
// Port of song.py (parse_arrangement / load_song), keeping exactly the keys
// the Play Song page consumes.
import { find, findAll, getAttr, textOf, parseArchiveXml } from "./xml.js";

// ── wire format (song.py note_to_wire ... arrangement_to_wire) ───────────────
const r3 = (v) => Math.round(v * 1000) / 1000;

export function noteToWire(n) {
  // Defaults are spelled out so a partially-built note (a synthetic chord note
  // created from a chord template, say) still serializes the full legacy key
  // set, exactly like the Python Note dataclass does.
  const out = {
    t: r3(n.time ?? 0), s: n.string ?? 0, f: n.fret ?? 0,
    sus: r3(n.sustain ?? 0),
    sl: n.slide_to ?? -1, slu: n.slide_unpitch_to ?? -1,
    bn: n.bend ? Math.round(n.bend * 10) / 10 : 0,
    ho: !!n.hammer_on, po: !!n.pull_off,
    hm: !!n.harmonic, hp: !!n.harmonic_pinch,
    pm: !!n.palm_mute, mt: !!n.mute,
    vb: !!n.vibrato,
    tr: !!n.tremolo, ac: !!n.accent, tp: !!n.tap,
  };
  if (n.link_next) out.ln = true;
  if (n.fret_hand_mute) out.fhm = true;
  if (n.pluck) out.plk = true;
  if (n.slap) out.slp = true;
  if (n.right_hand !== undefined && n.right_hand !== -1) out.rh = n.right_hand;
  if (n.pick_direction !== undefined && n.pick_direction !== -1) out.pkd = n.pick_direction;
  if (n.ignore) out.ig = true;
  return out;
}

export function chordNoteToWire(cn) {
  const d = noteToWire(cn);
  delete d.t;
  return d;
}

export const chordToWire = (c) => ({
  t: r3(c.time), id: c.chord_id, hd: c.high_density,
  notes: c.notes.map(chordNoteToWire),
});

export const anchorToWire = (a) => ({ time: a.time, fret: a.fret, width: a.width });

export const handShapeToWire = (h) => ({
  chord_id: h.chord_id, start_time: h.start_time, end_time: h.end_time, arp: h.arpeggio,
});

export const chordTemplateToWire = (ct) => ({
  name: ct.name, displayName: ct.display_name || ct.name, arp: ct.arpeggio,
  fingers: [...ct.fingers], frets: [...ct.frets],
});

export function arrangementToWire(arr) {
  const out = {
    name: arr.name, tuning: [...arr.tuning], capo: arr.capo,
    notes: arr.notes.map(noteToWire),
    chords: arr.chords.map(chordToWire),
    anchors: arr.anchors.map(anchorToWire),
    handshapes: arr.hand_shapes.map(handShapeToWire),
    templates: arr.chord_templates.map(chordTemplateToWire),
  };
  if (arr.phrases && arr.phrases.length) {
    out.phrases = arr.phrases.map((p) => ({
      start_time: r3(p.start_time), end_time: r3(p.end_time), max_difficulty: p.max_difficulty,
    }));
  }
  if (arr.tones) out.tones = arr.tones;
  return out;
}

// ── XML attribute readers (song.py _float/_int/_bool) ───────────────────────
const FALSE_LITERALS = new Set(["", "0", "false", "False", "FALSE"]);
const num = (el, attr, dflt = 0.0) => {
  const v = getAttr(el, attr);
  return v === null ? dflt : parseFloat(v);
};
const int = (el, attr, dflt = 0) => {
  const v = getAttr(el, attr);
  if (v === null) return dflt;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? Math.trunc(parseFloat(v)) || 0 : n;
};
const intOpt = (el, attr, dflt = -1) => {
  const v = getAttr(el, attr);
  if (v === null || !v.trim()) return dflt;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? dflt : n;
};
const bool = (el, attr) => {
  const v = getAttr(el, attr);
  return v !== null && !FALSE_LITERALS.has(v);
};

const handShapeArp = (el) => ["arpeggio", "Arpeggio", "arp", "Arp"].some((a) => bool(el, a));
const templateArp = (el) => {
  if (["arpeggio", "Arpeggio", "arp", "Arp"].some((a) => bool(el, a))) return true;
  const dn = (getAttr(el, "displayName", "") || "").toLowerCase();
  return dn.includes("-arp") || dn.includes("arpeggio");
};
const chordHighDensity = (el) => ["highDensity", "highdensity", "HighDensity"].some((a) => bool(el, a));

function parseNoteEl(n) {
  return {
    time: num(n, "time"), string: int(n, "string"), fret: int(n, "fret"),
    sustain: num(n, "sustain"),
    slide_to: int(n, "slideTo", -1), slide_unpitch_to: int(n, "slideUnpitchTo", -1),
    bend: num(n, "bend"),
    hammer_on: bool(n, "hammerOn"), pull_off: bool(n, "pullOff"),
    harmonic: bool(n, "harmonic"), harmonic_pinch: bool(n, "harmonicPinch"),
    palm_mute: bool(n, "palmMute"), mute: bool(n, "mute"),
    vibrato: bool(n, "vibrato"), tremolo: bool(n, "tremolo"), accent: bool(n, "accent"),
    link_next: bool(n, "linkNext"), tap: bool(n, "tap"),
    fret_hand_mute: bool(n, "fretHandMute"),
    pluck: bool(n, "pluck"), slap: bool(n, "slap"),
    right_hand: intOpt(n, "rightHand", -1), pick_direction: intOpt(n, "pickDirection", -1),
    ignore: bool(n, "ignore"),
  };
}

const lowerBound = (arr, v) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
};
const upperBound = (arr, v) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
  return lo;
};

export function parseArrangement(root, topOnly = true) {
  const arrName = textOf(find(root, "arrangement"));
  const tuning = [0, 0, 0, 0, 0, 0];
  const tunEl = find(root, "tuning");
  if (tunEl) {
    for (let i = 0; i < 6; i++) tuning[i] = int(tunEl, `string${i}`);
    let i = 6;
    while (getAttr(tunEl, `string${i}`) !== null) { tuning.push(int(tunEl, `string${i}`)); i++; }
  }
  let capo = 0;
  const capoEl = find(root, "capo");
  if (capoEl && textOf(capoEl)) { const c = parseInt(textOf(capoEl), 10); if (!Number.isNaN(c)) capo = c; }

  const chordTemplates = [];
  const ctContainer = find(root, "chordTemplates");
  if (ctContainer) {
    for (const ct of findAll(ctContainer, "chordTemplate")) {
      const name = getAttr(ct, "chordName", "");
      const display = (getAttr(ct, "displayName", "") || "").trim() || name;
      let width = 6;
      while (getAttr(ct, `fret${width}`) !== null || getAttr(ct, `finger${width}`) !== null) width++;
      chordTemplates.push({
        name, display_name: display, arpeggio: templateArp(ct),
        fingers: Array.from({ length: width }, (_, i) => int(ct, `finger${i}`, -1)),
        frets: Array.from({ length: width }, (_, i) => int(ct, `fret${i}`, -1)),
      });
    }
  }

  const levelsEl = find(root, "levels");
  const phrasesEl = find(root, "phrases");
  const itersEl = find(root, "phraseIterations");
  const allLevels = new Map();
  if (levelsEl) for (const lv of findAll(levelsEl, "level")) allLevels.set(int(lv, "difficulty"), lv);
  const nAuthored = allLevels.size;

  const parseLevelFully = (levelEl) => {
    const lvNotes = findAll(find(levelEl, "notes"), "note").map(parseNoteEl).sort((a, b) => a.time - b.time);
    const lvChords = [];
    for (const c of findAll(find(levelEl, "chords"), "chord")) {
      const t = num(c, "time");
      const cnElems = findAll(c, "chordNote");
      let chordNotes = cnElems.map(parseNoteEl);
      const cid = int(c, "chordId");
      const chPm = bool(c, "palmMute"), chMt = bool(c, "mute");
      const chFhm = bool(c, "fretHandMute"), chAcc = bool(c, "accent");
      if (cid >= 0 && cid < chordTemplates.length) {
        const ct = chordTemplates[cid];
        const fretted = [];
        for (let s = 0; s < ct.frets.length; s++) if (ct.frets[s] >= 0) fretted.push([s, ct.frets[s]]);
        if (!chordNotes.length) {
          for (const [s, f] of fretted) {
            chordNotes.push({
              time: t, string: s, fret: f, palm_mute: chPm, mute: chMt,
              fret_hand_mute: chFhm, accent: chAcc,
            });
          }
        } else if (chordNotes.length < fretted.length) {
          const have = new Set(chordNotes.map((n) => n.string));
          for (const [s, f] of fretted) {
            if (!have.has(s)) {
              chordNotes.push({
                time: t, string: s, fret: f, palm_mute: chPm, mute: chMt,
                fret_hand_mute: chFhm, accent: chAcc,
              });
            }
          }
        }
      }
      if (chordNotes.length && (chPm || chMt || chFhm || chAcc)) {
        for (let i = 0; i < chordNotes.length && i < cnElems.length; i++) {
          const cn = chordNotes[i], el = cnElems[i];
          if (chPm && getAttr(el, "palmMute") === null) cn.palm_mute = true;
          if (chMt && getAttr(el, "mute") === null) cn.mute = true;
          if (chFhm && getAttr(el, "fretHandMute") === null) cn.fret_hand_mute = true;
          if (chAcc && getAttr(el, "accent") === null) cn.accent = true;
        }
      }
      chordNotes.sort((a, b) => a.string - b.string);
      lvChords.push({ time: t, chord_id: cid, notes: chordNotes, high_density: chordHighDensity(c) });
    }
    lvChords.sort((a, b) => a.time - b.time);

    const lvAnchors = findAll(find(levelEl, "anchors"), "anchor")
      .map((a) => ({ time: num(a, "time"), fret: int(a, "fret"), width: int(a, "width", 4) }))
      .sort((a, b) => a.time - b.time);
    const lvHs = findAll(find(levelEl, "handShapes"), "handShape")
      .map((hs) => ({
        chord_id: int(hs, "chordId"), start_time: num(hs, "startTime"),
        end_time: num(hs, "endTime"), arpeggio: handShapeArp(hs),
      }))
      .sort((a, b) => a.start_time - b.start_time);
    return {
      notes: lvNotes, note_times: lvNotes.map((n) => n.time),
      chords: lvChords, chord_times: lvChords.map((c) => c.time),
      anchors: lvAnchors, anchor_times: lvAnchors.map((a) => a.time),
      hand_shapes: lvHs, hs_times: lvHs.map((h) => h.start_time),
    };
  };

  if (topOnly && nAuthored > 1 && phrasesEl && itersEl) {
    const keys = [...allLevels.keys()].sort((a, b) => a - b);
    const plist = findAll(phrasesEl, "phrase");
    const need = new Set();
    for (const it of findAll(itersEl, "phraseIteration")) {
      const pid = int(it, "phraseId");
      if (pid >= plist.length) continue;
      const i = upperBound(keys, int(plist[pid], "maxDifficulty"));
      if (i) need.add(keys[i - 1]);
    }
    if (need.size) {
      for (const k of [...allLevels.keys()]) if (!need.has(k)) allLevels.delete(k);
    }
  }

  const parsed = new Map();
  for (const [d, el] of allLevels) parsed.set(d, parseLevelFully(el));

  const sliceOf = (p, t0, t1) => {
    const s = (items, times) => items.slice(lowerBound(times, t0), lowerBound(times, t1));
    return [s(p.notes, p.note_times), s(p.chords, p.chord_times), s(p.anchors, p.anchor_times), s(p.hand_shapes, p.hs_times)];
  };

  let notes = [], chords = [], anchors = [], handShapes = [];
  const collect = (p, t0, t1) => {
    const [a, b, c, d] = sliceOf(p, t0, t1);
    notes = notes.concat(a); chords = chords.concat(b); anchors = anchors.concat(c); handShapes = handShapes.concat(d);
  };
  const bestLevelFallback = () => {
    let best = null, bestN = -1;
    for (const p of parsed.values()) {
      const n = p.notes.length + p.chords.length;
      if (n > bestN) { bestN = n; best = p; }
    }
    collect(best, 0, Infinity);
  };

  let phrases = null;
  if (nAuthored === 1) {
    collect(parsed.values().next().value, 0, Infinity);
  } else if (phrasesEl && itersEl && parsed.size) {
    const phraseList = findAll(phrasesEl, "phrase");
    const iterations = findAll(itersEl, "phraseIteration");
    let lastEvent = 0;
    for (const p of parsed.values()) {
      for (const n of p.notes) lastEvent = Math.max(lastEvent, n.time + (n.sustain || 0));
      if (p.chord_times.length) lastEvent = Math.max(lastEvent, p.chord_times[p.chord_times.length - 1]);
      if (p.anchor_times.length) lastEvent = Math.max(lastEvent, p.anchor_times[p.anchor_times.length - 1]);
      for (const h of p.hand_shapes) lastEvent = Math.max(lastEvent, h.end_time);
    }
    for (const it of iterations) lastEvent = Math.max(lastEvent, num(it, "time"));
    const songEnd = lastEvent + 1.0;

    phrases = [];
    for (let i = 0; i < iterations.length; i++) {
      const it = iterations[i];
      const pid = int(it, "phraseId");
      if (pid >= phraseList.length) continue;
      const maxDiff = int(phraseList[pid], "maxDifficulty");
      const tStart = num(it, "time");
      const tEnd = i + 1 < iterations.length ? num(iterations[i + 1], "time") : songEnd;
      const slices = new Map();
      for (const diff of [...parsed.keys()].sort((a, b) => a - b)) {
        if (diff > maxDiff) continue;
        slices.set(diff, sliceOf(parsed.get(diff), tStart, tEnd));
      }
      if (!slices.size) continue;
      phrases.push({ start_time: tStart, end_time: tEnd, max_difficulty: maxDiff });
      // flat max-mastery merge: the phrase's own tier, else the closest below
      const flatDiff = slices.has(maxDiff) ? maxDiff : Math.max(...slices.keys());
      const [a, b, c, d] = slices.get(flatDiff);
      notes = notes.concat(a); chords = chords.concat(b); anchors = anchors.concat(c); handShapes = handShapes.concat(d);
    }
    if (!phrases.length) { phrases = null; bestLevelFallback(); }
  } else if (parsed.size) {
    bestLevelFallback();
  }

  notes.sort((a, b) => a.time - b.time);
  chords.sort((a, b) => a.time - b.time);
  anchors.sort((a, b) => a.time - b.time);
  handShapes.sort((a, b) => a.start_time - b.start_time);

  let path_lead = false, path_rhythm = false, path_bass = false, bonus_arr = false, represent = 0;
  const props = find(root, "arrangementProperties");
  if (props) {
    path_lead = bool(props, "pathLead"); path_rhythm = bool(props, "pathRhythm");
    path_bass = bool(props, "pathBass"); bonus_arr = bool(props, "bonusArr");
    represent = int(props, "represent", 0);
  }
  return {
    name: arrName, tuning, capo, notes, chords, anchors, hand_shapes: handShapes,
    chord_templates: chordTemplates, phrases, tones: null,
    path_lead, path_rhythm, path_bass, bonus_arr, represent,
  };
}

// ── archive helpers: names around a Map<name, bytes> ────────────────────────
const ext = (n) => { const i = n.lastIndexOf("."); return i < 0 ? "" : n.slice(i).toLowerCase(); };
const stem = (n) => { const b = n.slice(n.lastIndexOf("/") + 1); const i = b.lastIndexOf("."); return (i < 0 ? b : b.slice(0, i)).toLowerCase(); };

const decodeText = (b) => new TextDecoder("utf-8", { fatal: false }).decode(b);

export function hasArrangementXml(files) {
  for (const name of files.keys()) {
    if (!name.toLowerCase().endsWith(".xml")) continue;
    let root;
    try { root = parseArchiveXml(files, name); } catch { continue; }
    if (root.tag !== "song") continue;
    const el = find(root, "arrangement");
    const low = el ? textOf(el).toLowerCase() : "";
    if (!["vocals", "showlights", "jvocals"].includes(low)) return true;
  }
  return false;
}

// Port of load_song (CDLC path: arrangement XMLs + manifest JSON).
export function loadSong(files, topOnly = true) {
  const song = {
    title: "", artist: "", album: "", year: 0, song_length: 0.0, offset: 0.0,
    beats: [], sections: [], arrangements: [],
  };
  const manifestNames = new Map();
  const manifestFlags = new Map();
  for (const name of files.keys()) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    let data;
    try { data = JSON.parse(decodeText(files.get(name))); } catch { continue; }
    const entries = data.Entries || {};
    for (const v of Object.values(entries)) {
      const attrs = v.Attributes || {};
      const arrName = attrs.ArrangementName || "";
      if (arrName && !["Vocals", "ShowLights", "JVocals"].includes(arrName)) {
        const key = stem(name);
        manifestNames.set(key, arrName);
        const props = attrs.ArrangementProperties || {};
        const prop = (k) => { const v2 = props[k]; const n = parseInt(v2, 10); return Number.isNaN(n) ? 0 : n; };
        manifestFlags.set(key, {
          path_lead: !!prop("pathLead"), path_rhythm: !!prop("pathRhythm"),
          path_bass: !!prop("pathBass"), bonus_arr: !!prop("bonusArr"), represent: prop("represent"),
        });
      }
    }
  }

  let metadataLoaded = false;
  const xmlNames = [...files.keys()].filter((n) => n.toLowerCase().endsWith(".xml")).sort();
  for (const name of xmlNames) {
    let root;
    try { root = parseArchiveXml(files, name); } catch { continue; }
    if (root.tag !== "song") continue;
    const el = find(root, "arrangement");
    if (el && textOf(el)) {
      const low = textOf(el).toLowerCase().trim();
      if (["vocals", "showlights", "jvocals"].includes(low)) continue;
    }
    if (!metadataLoaded) {
      for (const [tag, attr] of [["title", "title"], ["artistName", "artist"], ["albumName", "album"]]) {
        const node = find(root, tag);
        if (node && textOf(node)) song[attr] = node.text.trim();
      }
      const yearEl = find(root, "albumYear");
      if (yearEl && textOf(yearEl)) { const y = parseInt(textOf(yearEl), 10); if (!Number.isNaN(y)) song.year = y; }
      const lenEl = find(root, "songLength");
      if (lenEl && textOf(lenEl)) song.song_length = parseFloat(textOf(lenEl));
      const offEl = find(root, "offset");
      if (offEl && textOf(offEl)) song.offset = parseFloat(textOf(offEl));
      const beatsEl = find(root, "ebeats");
      if (beatsEl) for (const eb of findAll(beatsEl, "ebeat")) song.beats.push({ time: num(eb, "time"), measure: int(eb, "measure", -1) });
      const secEl = find(root, "sections");
      if (secEl) for (const s of findAll(secEl, "section")) {
        song.sections.push({ name: getAttr(s, "name", ""), number: int(s, "number"), time: num(s, "startTime") });
      }
      metadataLoaded = true;
    }
    const arrangement = parseArrangement(root, topOnly);
    const flags = manifestFlags.get(stem(name));
    if (flags) Object.assign(arrangement, flags);
    const mname = manifestNames.get(stem(name));
    if (mname) arrangement.name = mname;
    else {
      const map = {
        "part real_guitar": "Lead", "part real_guitar_22": "Rhythm",
        "part real_bass": "Bass", "part real_guitar_bonus": "Bonus Lead",
        "part real_bass_22": "Bass 2",
      };
      const low = arrangement.name.toLowerCase().trim();
      if (low in map) arrangement.name = map[low];
      else if (!arrangement.name || low.startsWith("part ")) {
        const fname = stem(name);
        if (fname.includes("lead")) arrangement.name = "Lead";
        else if (fname.includes("rhythm")) arrangement.name = "Rhythm";
        else if (fname.includes("bass")) arrangement.name = "Bass";
        else if (fname.includes("combo")) arrangement.name = "Combo";
        else arrangement.name = stem(name);
      }
    }
    song.arrangements.push(arrangement);
  }
  const prio = { lead: 0, combo: 1, rhythm: 2, bass: 3 };
  song.arrangements.sort((a, b) => (prio[a.name.toLowerCase()] ?? 99) - (prio[b.name.toLowerCase()] ?? 99));
  if (!song.title || !song.artist) loadManifestMetadata(song, files);
  return song;
}

function loadManifestMetadata(song, files) {
  for (const name of files.keys()) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    let data;
    try { data = JSON.parse(decodeText(files.get(name))); } catch { continue; }
    const entries = data.Entries || data.entries || {};
    if (entries && Object.keys(entries).length) {
      for (const val of Object.values(entries)) {
        const attrs = val.Attributes || val.attributes || {};
        if (!song.title && attrs.SongName) song.title = attrs.SongName;
        if (!song.artist && attrs.ArtistName) song.artist = attrs.ArtistName;
        if (!song.album && attrs.AlbumName) song.album = attrs.AlbumName;
        if (!song.year && attrs.SongYear) song.year = parseInt(attrs.SongYear, 10) || 0;
        if (!song.song_length && attrs.SongLength) song.song_length = parseFloat(attrs.SongLength) || 0;
        if (song.title && song.artist) return;
      }
    }
    const attrs = data.Attributes || data.attributes || {};
    if (attrs && Object.keys(attrs).length) {
      if (!song.title && attrs.SongName) song.title = attrs.SongName;
      if (!song.artist && attrs.ArtistName) song.artist = attrs.ArtistName;
      if (!song.album && attrs.AlbumName) song.album = attrs.AlbumName;
      if (!song.year && attrs.SongYear) song.year = parseInt(attrs.SongYear, 10) || 0;
      if (!song.song_length && attrs.SongLength) song.song_length = parseFloat(attrs.SongLength) || 0;
      if (song.title && song.artist) return;
    }
  }
}
