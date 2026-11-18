// The gear library: what each piece of Rocksmith gear (an amp, a cabinet, a
// pedal or a rack, by its key) is on the pedalboard, and how its knobs become
// the pedalboard's parameters. One JSON file per piece, in src/amp/gear/
// (amps/, cabinets/, pedals/), made by make-gear.mjs from .psarc files and
// meant to be edited by hand; build.mjs gathers them into gear/library.js.
//
// A piece the library does not have is described on the fly, by the same
// rules make-gear.mjs uses to write a new file.
//
//   { "key": "Pedal_OctaveUp", "type": "pedal", "name": "Octave Up", "category": "Pitch",
//     "model": "octave",                         a MODELS id of catalog.js ("" = not played)
//     "knobs": { "Mix":  { "param": "mix", "from": [0, 100], "to": [0, 1] },
//                "Tone": { "param": null, "from": [0, 100] } },
//     "params": {} }                             starting values the knobs do not set
//
//   amp:     { key, type: "amp", name, bass, cab, knobs }     knobs -> gain (0..1), bass/mid/treble/presence (dB);
//                                                              cab: for a tone with no cabinet ("" = by the kind of tone)
//   cabinet: { key, type: "cabinet", name, bass, cab }        cab: a CABS id of catalog.js
//
// A knob maps linearly from `from` to `to`, clamped; "curve": 2 bends it
// (more of the knob's travel for low values).

import LIBRARY from "./gear/library.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

/* the kind of effect each model is (kept here so this file needs nothing else) */
const MODEL_FX = {
  od: "Overdrive", boost: "Overdrive", dist: "Overdrive", metal: "Overdrive", fuzz: "Overdrive",
  comp: "Compressor", chorus: "Chorus", flanger: "Chorus", phaser: "Phaser", tremolo: "Tremolo",
  wah: "WahWah", eq: "EQ", octave: "Octave", delay: "Delay", echo: "Delay", room: "Reverb", plate: "Reverb",
};

const RE = {
  octave: /octave|octaver|pitchshift|harmon/i,
  wah: /wah/i,
  fuzz: /fuzz|muff/i,
  metal: /metal|highgain|hi_?gain|grind/i,
  boost: /boost|treble|clean_?boost/i,
  dist: /distort|dist\d?|rat\b|crunch/i,
  od: /overdrive|screamer|drive|od\d|tube/i,
  flanger: /flang|jet/i,
  chorus: /chorus|ensemble|ce\d|dimension/i,
  phaser: /phase|vibe|univibe/i,
  tremolo: /trem|rotary|leslie|pan\b/i,
  delay: /delay|echo/i,
  reverb: /reverb|verb|hall|room|plate|spring|cathedral|ambien/i,
  comp: /comp|limit|sustain|dynamics/i,
  eq: /eq\b|graphic|equal|parametric|filter/i,
};
/** which model a piece of gear is, from its key and category ("" = none) */
export function modelOfGear(key, category = "") {
  const what = `${key} ${category}`;
  if (RE.octave.test(what)) return "octave";
  if (RE.wah.test(what)) return "wah";
  if (RE.reverb.test(what)) return /plate|hall|cathedral/i.test(what) ? "plate" : "room";
  if (RE.delay.test(what)) return /tape|echo|analog/i.test(what) ? "echo" : "delay";
  if (RE.flanger.test(what)) return "flanger";
  if (RE.chorus.test(what)) return "chorus";
  if (RE.phaser.test(what)) return "phaser";
  if (RE.tremolo.test(what)) return "tremolo";
  if (RE.fuzz.test(what)) return "fuzz";
  if (RE.metal.test(what)) return "metal";
  if (RE.boost.test(what)) return "boost";
  if (RE.dist.test(what)) return "dist";
  if (RE.od.test(what)) return "od";
  if (RE.comp.test(what)) return "comp";
  if (RE.eq.test(what)) return "eq";
  return "";
}

/* the speakers in a cabinet key: "Cab_EN4120C" -> [4, 12], "Cab_TW410C" -> [4, 10] */
export function cabSize(cabKey){
  const m = /_[A-Za-z]+?0?([1-8])(12|10|15|8|6)0?C?(?:_|$)/.exec(cabKey || "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}
/** the cabinet for a cabinet key, by its family and size ("Cab_EN4120C" = English 4x12),
    else from the amp and the kind of tone */
export function cabOfGear(cabKey, ampKey, { bass = false, kind = "", size = null } = {}) {
  const k = cabKey || "";
  if (bass || /^bass_/i.test(k) || /^bass_/i.test(ampKey || "")) return "bass";
  const sz = size || cabSize(k);
  const n = sz ? sz[0] : 0, d = sz ? sz[1] : 0;
  if (k) {
    if (n === 4 && d === 10) return "bass";                        // tweed 4x10 (Bassman, Super Reverb)
    if (sz && n <= 1) return "1x12";                               // 1x6 .. 1x15 combos
    if (/_(EN|Orange)/i.test(k)) return n === 2 ? "2x12" : "4x12o";
    if (/_(GB|ENGL|Diezel|Bogner)/i.test(k)) return "4x12g";
    if (/_(CA|HG|Mesa|Peavey|IBEX)/i.test(k) || /^IBEX/i.test(k)) return n === 1 ? "1x12" : "4x12m";
    if (/_Marshall(JCM|DSL|JVM|1960TV)/i.test(k)) return "4x12j";
    if (/_(BT|Marshall)/i.test(k)) return n === 2 ? "2x12" : "4x12";
    if (/_(Vox|CS)/i.test(k) || n === 2 || n === 3) return "2x12";
    if (/_(TW|AT|Fender)/i.test(k)) return n >= 4 ? "4x12" : "1x12";
    if (n >= 4) return kind === "distortion" ? "4x12m" : "4x12";
  }
  return kind === "clean" ? "2x12" : kind === "crunch" ? "4x12" : kind === "distortion" ? "4x12m" : "2x12";
}
/** a cabinet key without its microphone: "Cab_CA412C_57_Edge" -> "Cab_CA412C" */
export const cabBase = (key) => String(key || "").replace(/_(57|Ribbon|Condenser|Tube)_(Cone|Edge|OffAxis)$/i, "");

/** a knob's short name: "Amp_CA100_Gain" of Amp_CA100 -> "Gain" */
export function knobName(gearKey, fullKey) {
  return fullKey.startsWith(gearKey + "_") ? fullKey.slice(gearKey.length + 1) : fullKey.slice(fullKey.lastIndexOf("_") + 1);
}

/* ── the rules for a new piece ─────────────────────────────────────────────
   For each parameter: the knob names that set it, first found wins, and the
   mapping given what the knob was seen holding (its lowest and highest). */
const PCT = (to) => ({ from: [0, 100], to });
const EQ = (db) => (db ? { from: [-12, 12], to: [-12, 12] } : PCT([-12, 12]));
const RULES = {
  amp: [
    ["gain",     ["gain", "drive", "overdrive", "preamp", "sensitivity"], () => PCT([0, 1])],
    ["bass",     ["bass", "low", "lo"],                    (s, db) => EQ(db)],
    ["mid",      ["mid", "middle"],                        (s, db) => EQ(db)],
    ["treble",   ["treble", "high", "hi"],                 (s, db) => EQ(db)],
    ["presence", ["pres", "presence", "bright"],           (s, db) => EQ(db)],
  ],
  Overdrive: [
    ["gain",  ["gain", "drive", "dist", "distortion", "fuzz", "sustain", "overdrive", "boost"], () => PCT([0, 1])],
    ["tone",  ["tone", "treble", "filter"],                () => PCT([0, 1])],
    ["level", ["level", "volume", "output", "vol"],        () => PCT([0, 1])],
  ],
  Compressor: [
    ["threshold", ["threshold", "thresh"],  (s) => (s[0] < 0 ? { from: [-60, 0], to: [-60, 0] } : PCT([-10, -50]))],
    ["ratio",     ["ratio"],                () => ({ from: [1, 20], to: [1, 20] })],
    ["attack",    ["attack"],               () => ({ from: [0, 200], to: [0, 200] })],
    ["release",   ["release"],              () => ({ from: [10, 1000], to: [10, 1000] })],
    ["threshold", ["compress", "sustain", "comp", "amount"], () => PCT([-10, -50])],
  ],
  Chorus: [
    ["rate",     ["rate", "speed"],                               () => ({ ...PCT([0.05, 8]), curve: 2 })],
    ["depth",    ["depth", "intensity", "width", "mix", "level"], () => PCT([0, 1])],
    ["feedback", ["feedback", "resonance", "regen", "res"],       () => PCT([0, 0.9])],
  ],
  Phaser: [
    ["rate",     ["rate", "speed"],                               () => ({ ...PCT([0.05, 8]), curve: 2 })],
    ["depth",    ["depth", "intensity", "width", "mix", "level"], () => PCT([0, 1])],
    ["feedback", ["feedback", "resonance", "regen", "res"],       () => PCT([0, 0.9])],
  ],
  Tremolo: [
    ["rate",      ["rate", "speed"],                               () => ({ ...PCT([0.1, 11]), curve: 2 })],
    ["intensity", ["depth", "intensity", "width", "mix", "level"], () => PCT([0, 1])],
  ],
  WahWah: [
    ["sensitivity", ["sensitivity", "sens", "range"], () => PCT([-1, 1])],
    ["resonance",   ["resonance", "q", "peak"],       () => PCT([1, 60])],
  ],
  Delay: [
    ["time",     ["time", "delay", "delaytime"],  (s) => (s[1] > 20 ? { from: [0, 1000], to: [0, 1000] } : PCT([0, 1000]))],
    ["feedback", ["feedback", "repeats", "regen"], () => PCT([0, 0.9])],
    ["mix",      ["mix", "level", "blend"],        () => PCT([0, 1])],
  ],
  Reverb: [
    ["mix", ["mix", "level", "blend", "verb"], () => PCT([0, 1])],
  ],
  EQ: [
    ["bass",   ["bass", "low", "lo"],                    (s, db) => EQ(db)],
    ["mid",    ["mid", "middle", "lomid", "himid"],      (s, db) => EQ(db)],
    ["treble", ["treble", "high", "hi"],                 (s, db) => EQ(db)],
  ],
  Octave: [
    ["mix", ["mix", "level", "blend", "octave"], () => PCT([0, 1])],
  ],
};

const TYPE_OF_SLOT = (slot, type) => {
  const t = String(type || "").toLowerCase();
  if (slot === "Amp" || t === "amps") return "amp";
  if (slot === "Cabinet" || t === "cabinets") return "cabinet";
  if (/^rack/i.test(slot) || t === "racks") return "rack";
  return "pedal";
};
const prettyName = (key) => key.replace(/^(bass_)?(amp|cab|pedal|rack)_/i, "").replace(/_/g, " ");

/**
 * A library entry for a piece of gear.
 * @param {string} type   amp | cabinet | pedal | rack
 * @param {string} key    the gear key ("Amp_CA100")
 * @param {object} seen   its knobs and the values they were seen holding: { Gain: [lo, hi], ... }
 */
export function describeGear(type, key, seen = {}, { category = "", model: forced } = {}) {
  const bass = /^bass_/i.test(key);
  const base = { key, type, name: prettyName(key) };
  if (category) base.category = category;
  if (type === "cabinet") return { ...base, bass, cab: cabOfGear(key, "", { bass }) };
  const model = type === "amp" ? "" : forced !== undefined ? forced : modelOfGear(key, category);
  const rules = type === "amp" ? RULES.amp : model ? RULES[MODEL_FX[model]] : [];
  const db = Object.values(seen).some((r) => r[0] < 0);
  const knobs = {};
  for (const [name, r] of Object.entries(seen)) knobs[name] = { param: null, from: r[0] < 0 ? [Math.min(-12, r[0]), Math.max(12, r[1])] : [0, Math.max(100, r[1])] };
  const taken = new Set();
  for (const [param, names, map] of rules) {
    if (taken.has(param)) continue;
    const name = names.map((n) => Object.keys(seen).find((k) => k.toLowerCase() === n)).find(Boolean);
    if (!name || knobs[name].param) continue;
    knobs[name] = { param, ...map(seen[name], db) };
    taken.add(param);
  }
  if (type === "amp") return { ...base, bass, cab: bass ? "bass" : "", knobs };
  return { ...base, model, knobs, params: {} };
}

/** the library's entry for a piece of gear in a tone, or one made for it now */
export function gearEntry(slot, g) {
  const key = (g && (g.Key || g.PedalKey)) || "";
  if (!key) return null;
  if (LIBRARY[key]) return LIBRARY[key];
  /* a cabinet is one enclosure with several microphone placements: the enclosure's file */
  if (TYPE_OF_SLOT(slot, g.Type) === "cabinet" && LIBRARY[cabBase(key)]) return LIBRARY[cabBase(key)];
  const seen = {};
  for (const [k, v] of Object.entries(g.KnobValues || {})) {
    const n = Number(v);
    if (Number.isFinite(n)) seen[knobName(key, k)] = [n, n];
  }
  return describeGear(TYPE_OF_SLOT(slot, g.Type), key, seen, { category: g.Category || "" });
}

/** a piece's knob values as pedalboard parameters, through its entry's knob map
    (a knob the entry does not list goes by the rules, for the entry's model) */
export function applyKnobs(entry, knobValues = {}) {
  const out = { ...(entry.params || {}) };
  const seen = {};
  for (const [k, v] of Object.entries(knobValues || {})) { const n = Number(v); if (Number.isFinite(n)) seen[knobName(entry.key, k)] = [n, n]; }
  const auto = entry.type === "cabinet" ? {} : describeGear(entry.type, entry.key, seen, { model: entry.model || "" }).knobs || {};
  const knobs = { ...auto, ...(entry.knobs || {}) };
  /* a parameter one of the entry's own knobs sets is not set again by a rule */
  const mine = new Set(Object.values(entry.knobs || {}).map((m) => m && m.param).filter(Boolean));
  for (const name of Object.keys(auto)) if (!(entry.knobs || {})[name] && mine.has(auto[name].param)) delete knobs[name];
  for (const [k, v] of Object.entries(knobValues || {})) {
    const m = knobs[knobName(entry.key, k)];
    const n = Number(v);
    if (!m || !m.param || !Number.isFinite(n) || !m.to) continue;
    const [f0, f1] = m.from || [0, 100], [t0, t1] = m.to;
    let t = f1 === f0 ? 0 : clamp((n - f0) / (f1 - f0), 0, 1);
    if (m.curve) t = Math.pow(t, m.curve);
    out[m.param] = r3(t0 + (t1 - t0) * t);
  }
  return out;
}

export { LIBRARY, TYPE_OF_SLOT };

/** how a piece of gear looks (its "face" in the library), or null */
export const faceOf = (key) => (key && LIBRARY[key] && LIBRARY[key].face) || null;
