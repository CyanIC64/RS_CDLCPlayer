// SNG chart reader -- direct port of sng.py (official-DLC charts).
//
// Envelope: u32 magic, u32 version, 16-byte IV, AES-256-CTR payload, optional
// 56-byte signature footer. Payload: u32 little-endian inflated size, then a
// zlib stream. The AES-CTR part uses WebCrypto: the browser has the primitive
// natively, so no JS cipher is needed here.
import { inflateZlib } from "../psarc.js";

const PC_KEY = hex("CB648DF3D12A16BF71701414E69619EC171CCA5D2A142E3E59DE7ADDA18A3A30");
const MAC_KEY = hex("9821330E34B91F70D0A48CBD625993126970CEA09192C0E6CDA676CC9838289D");

function hex(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

// NoteMask bits (Types/Masks.fs)
const M_CHORD = 0x00000002, M_OPEN = 0x00000004, M_FRETHANDMUTE = 0x00000008;
const M_TREMOLO = 0x00000010, M_HARMONIC = 0x00000020, M_PALMMUTE = 0x00000040;
const M_SLAP = 0x00000080, M_PLUCK = 0x00000100, M_HAMMERON = 0x00000200;
const M_PULLOFF = 0x00000400, M_SLIDE = 0x00000800, M_BEND = 0x00001000;
const M_SUSTAIN = 0x00002000, M_TAP = 0x00004000, M_PINCHHARMONIC = 0x00008000;
const M_VIBRATO = 0x00010000, M_MUTE = 0x00020000, M_IGNORE = 0x00040000;
const M_HIGHDENSITY = 0x00200000, M_UNPITCHEDSLIDE = 0x00400000;
const M_ACCENT = 0x04000000, M_CHORDNOTES = 0x01000000, M_PARENT = 0x08000000;
const M_ARPEGGIO = 0x20000000, M_CHORDPANEL = 0x80000000;

const utf8 = new TextDecoder("utf-8", { fatal: false });
const latin1 = new TextDecoder("latin1");

export async function decryptSng(data, platform = "pc") {
  if (data.length < 32) throw new Error("SNG file too small");
  const iv = data.slice(8, 24);
  const keyBytes = platform === "mac" ? MAC_KEY : PC_KEY;
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CTR", false, ["decrypt"]);
  const dec = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CTR", counter: iv, length: 128 }, key, data.slice(24)),
  );
  const want = dec[0] | (dec[1] << 8) | (dec[2] << 16) | (dec[3] << 24);
  // Official DLC puts a 56-byte RSA signature after the zlib stream, and both
  // Chromium and Node reject those trailing bytes ("junk after compressed
  // data"). Toolkit CDLC SNGs have no footer, so try the payload as-is first.
  let out;
  try {
    out = await inflateZlib(dec.slice(4), want);
  } catch {
    out = await inflateZlib(dec.slice(4, dec.length - 56), want);
  }
  if (want && out.length !== want) {
    throw new Error(`SNG size mismatch: header says ${want}, inflated ${out.length}`);
  }
  return out;
}

/* Is this chart file signed - an official song from the store?
   Official chart files end with a 56-byte signature after their compressed
   data. Custom-song tools cannot make one: DLC Builder writes 56 zero bytes in
   its place, the Custom Song Toolkit writes none. Checked on 200 official and
   127 custom songs, the rule held for every one:
     - the last 56 bytes are not all zero, and
     - the compressed data ends exactly where those 56 bytes begin (its Adler-32
       checksum sits right before them and matches the data).
   Not tamper-proof - a good-faith filter, not a lock. */
export async function sngIsSigned(data, platform = "pc") {
  if (data.length < 24 + 4 + 56 + 8) return false;
  const tail = data.subarray(data.length - 56);
  if (tail.every((b) => b === 0)) return false;
  const iv = data.slice(8, 24);
  const keyBytes = platform === "mac" ? MAC_KEY : PC_KEY;
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CTR", false, ["decrypt"]);
  const dec = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CTR", counter: iv, length: 128 }, key, data.slice(24)),
  );
  const want = dec[0] | (dec[1] << 8) | (dec[2] << 16) | (dec[3] << 24);
  let out;
  try { out = await inflateZlib(dec.slice(4, dec.length - 56), want); } catch { return false; }
  if (!want || out.length !== want) return false;
  let a = 1, b = 0;
  for (let i = 0; i < out.length; i++){ a = (a + out[i]) % 65521; b = (b + a) % 65521; }
  const adler = ((b << 16) | a) >>> 0;
  const e = dec.length - 56;
  const stored = ((dec[e - 4] << 24) | (dec[e - 3] << 16) | (dec[e - 2] << 8) | dec[e - 1]) >>> 0;
  return adler === stored;
}

class R {
  constructor(bytes) { this.b = bytes; this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.p = 0; }
  i8() { return this.dv.getInt8(this.p++); }
  u8() { return this.dv.getUint8(this.p++); }
  i16() { const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
  u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  i32() { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
  u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
  skip(n) { this.p += n; }
  s(n) {
    const raw = this.b.subarray(this.p, this.p + n);
    this.p += n;
    const z = raw.indexOf(0);
    const cut = z >= 0 ? raw.subarray(0, z) : raw;
    try { return utf8.decode(cut); } catch { return latin1.decode(cut); }
  }
  arr(fn) { const n = this.i32(); const out = []; for (let i = 0; i < n; i++) out.push(fn(this)); return out; }
}

const beat = (r) => ({ Time: r.f32(), Measure: r.i16(), Beat: r.i16(), PhraseIteration: r.i32(), Mask: r.i32() });

const phrase = (r) => {
  const Solo = r.i8(), Disparity = r.i8(), Ignore = r.i8();
  r.skip(1);
  return { Solo, Disparity, Ignore, MaxDifficulty: r.i32(), IterationCount: r.i32(), Name: r.s(32) };
};

const chordTemplate = (r) => ({
  Mask: r.u32(),
  Frets: [r.i8(), r.i8(), r.i8(), r.i8(), r.i8(), r.i8()],
  Fingers: [r.i8(), r.i8(), r.i8(), r.i8(), r.i8(), r.i8()],
  Notes: [r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32()],
  Name: r.s(32),
});

const bendValue = (r) => { const Time = r.f32(), Step = r.f32(); r.skip(4); return { Time, Step }; };
const bendData32 = (r) => ({ BendValues: Array.from({ length: 32 }, () => bendValue(r)), UsedCount: r.i32() });
const chordNotes = (r) => ({
  Mask: [r.u32(), r.u32(), r.u32(), r.u32(), r.u32(), r.u32()],
  BendData: Array.from({ length: 6 }, () => bendData32(r)),
  SlideTo: [r.i8(), r.i8(), r.i8(), r.i8(), r.i8(), r.i8()],
  SlideUnpitchTo: [r.i8(), r.i8(), r.i8(), r.i8(), r.i8(), r.i8()],
  Vibrato: [r.i16(), r.i16(), r.i16(), r.i16(), r.i16(), r.i16()],
});
const vocal = (r) => ({ Time: r.f32(), Note: r.i32(), Length: r.f32(), Lyric: r.s(48) });
const symHeader = (r) => Array.from({ length: 8 }, () => r.i32());
const symTexture = (r) => {
  const Font = r.s(128), FontPathLength = r.i32();
  r.skip(4);
  return { Font, FontPathLength, Width: r.i32(), Height: r.i32() };
};
const rect = (r) => [r.f32(), r.f32(), r.f32(), r.f32()];
const symDef = (r) => ({ Symbol: r.s(12), Outer: rect(r), Inner: rect(r) });
const phraseIter = (r) => ({
  PhraseId: r.i32(), StartTime: r.f32(), EndTime: r.f32(),
  Difficulty: [r.i32(), r.i32(), r.i32()],
});
const phraseExtra = (r) => {
  const d = { PhraseId: r.i32(), Difficulty: r.i32(), Empty: r.i32(), LevelJump: r.i8(), Redundant: r.i16() };
  r.skip(1);
  return d;
};
const nld = (r) => ({ LevelBreak: r.i32(), NLDPhrases: r.arr((x) => x.i32()) });
const action = (r) => ({ Time: r.f32(), ActionName: r.s(256) });
const event = (r) => ({ Time: r.f32(), Name: r.s(256) });
const tone = (r) => ({ Time: r.f32(), ToneId: r.i32() });
const dna = (r) => ({ Time: r.f32(), DnaId: r.i32() });
const section = (r) => ({
  Name: r.s(32), Number: r.i32(), StartTime: r.f32(), EndTime: r.f32(),
  StartPhraseIterationId: r.i32(), EndPhraseIterationId: r.i32(),
  StringMask: Array.from({ length: 36 }, () => r.i8()),
});
const anchor = (r) => {
  const StartTime = r.f32(), EndTime = r.f32(), FirstNoteTime = r.f32(), LastNoteTime = r.f32();
  const FretId = r.i8();
  r.skip(3);
  return { StartTime, EndTime, FirstNoteTime, LastNoteTime, FretId, Width: r.i32(), PhraseIterationId: r.i32() };
};
const anchorExt = (r) => { const BeatTime = r.f32(), FretId = r.i8(); r.skip(7); return { BeatTime, FretId }; };
const fingerprint = (r) => ({
  ChordId: r.i32(), StartTime: r.f32(), EndTime: r.f32(),
  FirstNoteTime: r.f32(), LastNoteTime: r.f32(),
});
const note = (r) => {
  const d = {
    Mask: r.u32(), Flags: r.u32(), Hash: r.u32(), Time: r.f32(),
    StringIndex: r.i8(), Fret: r.i8(), AnchorFret: r.i8(), AnchorWidth: r.i8(),
    ChordId: r.i32(), ChordNotesId: r.i32(), PhraseId: r.i32(), PhraseIterationId: r.i32(),
    FingerPrintId: [r.i16(), r.i16()],
    NextIterNote: r.i16(), PrevIterNote: r.i16(), ParentPrevNote: r.i16(),
    SlideTo: r.i8(), SlideUnpitchTo: r.i8(), LeftHand: r.i8(), Tap: r.i8(),
    PickDirection: r.i8(), Slap: r.i8(), Pluck: r.i8(),
    Vibrato: r.i16(), Sustain: r.f32(), MaxBend: r.f32(),
  };
  d.BendData = r.arr(bendValue);
  return d;
};
const level = (r) => ({
  Difficulty: r.i32(),
  Anchors: r.arr(anchor),
  AnchorExtensions: r.arr(anchorExt),
  HandShapes: r.arr(fingerprint),
  Arpeggios: r.arr(fingerprint),
  Notes: r.arr(note),
  AvgNotesPerIter: r.arr((x) => x.f32()),
  NotesInIterExclIgnored: r.arr((x) => x.i32()),
  NotesInIterAll: r.arr((x) => x.i32()),
});
const metadata = (r) => {
  const d = {
    MaxScore: r.f64(), MaxNotesAndChords: r.f64(), MaxNotesAndChordsReal: r.f64(),
    PointsPerNote: r.f64(), FirstBeatLength: r.f32(), StartTime: r.f32(),
    CapoFretId: r.i8(), LastConversionDateTime: r.s(32), Part: r.i16(),
    SongLength: r.f32(), Tuning: r.arr((x) => x.i16()),
  };
  r.f32();
  d.FirstNoteTime = r.f32();
  d.MaxDifficulty = r.i32();
  return d;
};

export async function readSng(bytes, platform = "pc") {
  const body = await decryptSng(bytes, platform);
  const r = new R(body);
  const out = {};
  out.Beats = r.arr(beat);
  out.Phrases = r.arr(phrase);
  out.Chords = r.arr(chordTemplate);
  out.ChordNotes = r.arr(chordNotes);
  out.Vocals = r.arr(vocal);
  if (out.Vocals.length) {
    out.SymbolsHeaders = r.arr(symHeader);
    out.SymbolsTextures = r.arr(symTexture);
    out.SymbolDefinitions = r.arr(symDef);
  }
  out.PhraseIterations = r.arr(phraseIter);
  out.PhraseExtraInfo = r.arr(phraseExtra);
  out.NewLinkedDifficulties = r.arr(nld);
  out.Actions = r.arr(action);
  out.Events = r.arr(event);
  out.Tones = r.arr(tone);
  out.DNAs = r.arr(dna);
  out.Sections = r.arr(section);
  out.Levels = r.arr(level);
  out.MetaData = metadata(r);
  if (r.p !== body.length) {
    throw new Error(`SNG parse desync: consumed ${r.p} of ${body.length} bytes`);
  }
  return out;
}

// ── SNG record -> arrangement (port of sng_to_arrangement) ───────────────────
const slide = (v) => (v !== null && v !== undefined && v >= 0 ? v : -1);

function sngNote(n) {
  const m = n.Mask;
  return {
    time: n.Time, string: n.StringIndex, fret: n.Fret,
    sustain: n.Sustain > 0 ? n.Sustain : 0.0,
    slide_to: slide(n.SlideTo), slide_unpitch_to: slide(n.SlideUnpitchTo),
    bend: n.MaxBend || 0.0,
    hammer_on: !!(m & M_HAMMERON), pull_off: !!(m & M_PULLOFF),
    harmonic: !!(m & M_HARMONIC), harmonic_pinch: !!(m & M_PINCHHARMONIC),
    palm_mute: !!(m & M_PALMMUTE), mute: !!(m & M_MUTE),
    vibrato: !!n.Vibrato, tremolo: !!(m & M_TREMOLO), accent: !!(m & M_ACCENT),
    link_next: !!(m & M_PARENT), tap: n.Tap > 0, fret_hand_mute: false,
    pluck: !!(m & M_PLUCK), slap: !!(m & M_SLAP), right_hand: -1,
    pick_direction: n.PickDirection > 0 ? n.PickDirection : -1,
    ignore: !!(m & M_IGNORE),
  };
}

function sngChord(n, sng) {
  const m = n.Mask;
  const cid = n.ChordId;
  const tmpl = cid >= 0 && cid < sng.Chords.length ? sng.Chords[cid] : null;
  const cnId = n.ChordNotesId;
  const cn = m & M_CHORDNOTES && cnId >= 0 && cnId < sng.ChordNotes.length ? sng.ChordNotes[cnId] : null;
  const pPm = !!(m & M_PALMMUTE), pFhm = !!(m & M_FRETHANDMUTE), pAcc = !!(m & M_ACCENT);
  const notes = [];
  if (tmpl) {
    for (let s = 0; s < 6; s++) {
      const fret = tmpl.Frets[s];
      if (fret === null || fret < 0) continue;
      if (cn) {
        const sm = cn.Mask[s];
        const bd = cn.BendData[s];
        let bend = 0.0;
        for (let i = 0; i < bd.UsedCount; i++) bend = Math.max(bend, bd.BendValues[i].Step);
        notes.push({
          time: n.Time, string: s, fret,
          sustain: n.Sustain > 0 ? n.Sustain : 0.0,
          slide_to: slide(cn.SlideTo[s]), slide_unpitch_to: slide(cn.SlideUnpitchTo[s]),
          bend,
          hammer_on: !!(sm & M_HAMMERON), pull_off: !!(sm & M_PULLOFF),
          harmonic: !!(sm & M_HARMONIC), harmonic_pinch: !!(sm & M_PINCHHARMONIC),
          palm_mute: !!(sm & M_PALMMUTE) || pPm, mute: !!(sm & M_MUTE),
          vibrato: !!(sm & M_VIBRATO) || !!cn.Vibrato[s], tremolo: !!(sm & M_TREMOLO),
          accent: !!(sm & M_ACCENT) || pAcc, link_next: !!(sm & M_PARENT),
          fret_hand_mute: pFhm, pluck: !!(sm & M_PLUCK), slap: !!(sm & M_SLAP),
          ignore: !!(sm & M_IGNORE), tap: false,
        });
      } else {
        notes.push({
          time: n.Time, string: s, fret,
          sustain: n.Sustain > 0 ? n.Sustain : 0.0,
          palm_mute: pPm, fret_hand_mute: pFhm, accent: pAcc,
          ignore: !!(m & M_IGNORE),
        });
      }
    }
  }
  return { time: n.Time, chord_id: cid, high_density: !!(m & M_HIGHDENSITY), notes };
}

function prepLevel(sng, lv) {
  const notes = [], chords = [];
  for (const n of lv.Notes) {
    if (n.ChordId !== -1) chords.push(sngChord(n, sng));
    else notes.push(sngNote(n));
  }
  notes.sort((a, b) => a.time - b.time);
  chords.sort((a, b) => a.time - b.time);
  const anchors = lv.Anchors
    .map((a) => ({ time: a.StartTime, fret: a.FretId, width: a.Width }))
    .sort((a, b) => a.time - b.time);
  const hs = [
    ...lv.HandShapes.map((h) => ({ chord_id: h.ChordId, start_time: h.StartTime, end_time: h.EndTime, arpeggio: false })),
    ...lv.Arpeggios.map((h) => ({ chord_id: h.ChordId, start_time: h.StartTime, end_time: h.EndTime, arpeggio: true })),
  ].sort((a, b) => a.start_time - b.start_time);
  return {
    notes, nt: notes.map((x) => x.time),
    chords, ct: chords.map((x) => x.time),
    anchors, at: anchors.map((x) => x.time),
    hs, ht: hs.map((x) => x.start_time),
  };
}

function lowerBound(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}
const sliceRange = (items, times, t0, t1) => items.slice(lowerBound(times, t0), lowerBound(times, t1));

export function sngToArrangement(sng, name) {
  const levels = sng.Levels;
  let notes = [], chords = [], anchors = [], handShapes = [];
  if (levels.length) {
    const prepared = new Map();
    const by = new Map(levels.map((lv) => [lv.Difficulty, lv]));
    const tier = (diff) => {
      if (!by.has(diff)) {
        const below = [...by.keys()].filter((d) => d <= diff);
        if (!below.length) return null;
        diff = Math.max(...below);
      }
      if (!prepared.has(diff)) prepared.set(diff, prepLevel(sng, by.get(diff)));
      return prepared.get(diff);
    };
    const phrases = sng.Phrases;
    const iters = sng.PhraseIterations;
    let usedMerge = false;
    for (const it of iters) {
      const pid = it.PhraseId;
      if (!(pid >= 0 && pid < phrases.length)) continue;
      const t = tier(phrases[pid].MaxDifficulty);
      if (!t) continue;
      const t0 = it.StartTime, t1 = it.EndTime;
      if (t1 <= t0) continue;
      notes = notes.concat(sliceRange(t.notes, t.nt, t0, t1));
      chords = chords.concat(sliceRange(t.chords, t.ct, t0, t1));
      anchors = anchors.concat(sliceRange(t.anchors, t.at, t0, t1));
      handShapes = handShapes.concat(sliceRange(t.hs, t.ht, t0, t1));
      usedMerge = true;
    }
    if (!usedMerge) {
      const best = prepLevel(sng, levels.reduce((a, b) => (b.Notes.length > a.Notes.length ? b : a)));
      notes = best.notes; chords = best.chords; anchors = best.anchors; handShapes = best.hs;
    }
  }
  notes.sort((a, b) => a.time - b.time);
  chords.sort((a, b) => a.time - b.time);
  anchors.sort((a, b) => a.time - b.time);
  handShapes.sort((a, b) => a.start_time - b.start_time);

  const templates = sng.Chords.map((c) => ({
    name: c.Name, display_name: c.Name, arpeggio: !!(c.Mask & 0x1),
    fingers: [...c.Fingers], frets: [...c.Frets],
  }));
  const md = sng.MetaData;
  return {
    name,
    tuning: md.Tuning && md.Tuning.length ? [...md.Tuning] : [0, 0, 0, 0, 0, 0],
    capo: md.CapoFretId && md.CapoFretId > 0 ? md.CapoFretId : 0,
    notes, chords, anchors, hand_shapes: handShapes,
    chord_templates: templates, phrases: null, tones: null,
    // tone switches as the chart has them (ToneId 0..3 = the manifest's Tone_A..Tone_D);
    // used when the package has no arrangement XML to read them from
    sng_tones: (sng.Tones || []).map((t) => ({ t: Math.round(t.Time * 1000) / 1000, id: t.ToneId })),
    path_lead: false, path_rhythm: false, path_bass: false, bonus_arr: false, represent: 0,
  };
}
