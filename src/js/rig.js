// What a tone sounds like, read from its gear in the manifest (Tones[].GearList):
// a kind for the read-out (clean / crunch / distortion) and a small "rig" -
// gain, EQ and effect amounts - that the page's amp simulator (web/amp.js)
// plays the guitar input through. A rough model of the gear, not a copy of it.
// The rig also carries a "board" - amp, cabinet and pedals, in order - that the
// page's pedalboard shows and plays (src/amp/catalog.js).

import { boardFromGear } from "../amp/catalog.js";

const DESCRIPTOR_RE = /^\$\[\d+\]\s*/;
const KIND_BY_DESCRIPTOR = [
  [/^(clean|acoustic)$/, "clean"],
  [/^(crunch|overdrive)$/, "crunch"],
  [/^(distortion|high gain|fuzz|metal)$/, "distortion"],
];

/* The knob's value as 0..1. Most knobs run 0..100. On gear whose EQ knobs go
   below zero (some bass amps and the studio racks) they are in dB, about
   -12..12, centred on 0.5. */
function unit(v, db = false) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (db || n < 0) return Math.min(1, Math.max(0, 0.5 + n / 24));
  return Math.min(1, Math.max(0, n / 100));
}
const inDb = (gear) => Object.values((gear && gear.KnobValues) || {}).some((v) => Number(v) < 0);

/* a knob of a piece of gear, by the end of its name ("Amp_CA100_Gain" -> Gain) */
function knob(gear, ...names) {
  const kv = (gear && gear.KnobValues) || {};
  for (const [k, v] of Object.entries(kv)) {
    const tail = k.slice(k.lastIndexOf("_") + 1).toLowerCase();
    if (names.includes(tail)) return Number(v);
  }
  return null;
}

const DRIVE_RE = /overdrive|distort|fuzz|drive|screamer|boost|metal|muff|grind|crunch|dist\d?|od\d/i;
const OCTAVE_RE = /octave|octaver|pitchshift|harmon/i;
const MOD_RE = /chorus|flang|phase|vibe|vibrato|trem|rotary|ensemble/i;
const DELAY_RE = /delay|echo/i;
const REVERB_RE = /reverb|verb|hall|room|plate|spring|cathedral|ambien/i;
const COMP_RE = /comp|limit|sustain/i;

const kindOfGain = (g) => (g < 0.35 ? "clean" : g < 0.72 ? "crunch" : "distortion");

export function descriptorKind(defn) {
  for (const d of (defn && defn.ToneDescriptors) || []) {
    if (typeof d !== "string") continue;
    const w = d.replace(DESCRIPTOR_RE, "").trim().toLowerCase();
    for (const [re, kind] of KIND_BY_DESCRIPTOR) if (re.test(w)) return kind;
  }
  return "";
}

/** @returns {{kind:string, rig:object}|null} */
export function toneRig(defn, { bass = false } = {}) {
  if (!defn || typeof defn !== "object") return null;
  const gl = defn.GearList && typeof defn.GearList === "object" ? defn.GearList : {};
  const gear = Object.entries(gl).filter(([, g]) => g && typeof g === "object" && (g.Key || g.PedalKey));
  const amp = gl.Amp && (gl.Amp.Key || gl.Amp.PedalKey) ? gl.Amp : null;

  const rig = {
    amp: amp ? amp.Key || amp.PedalKey : "",
    bass: !!bass || /^bass_/i.test((amp && amp.Key) || ""),
    gain: 0.4, drive: 0, octave: 0, comp: 0, mod: 0, delay: 0, reverb: 0,
    low: 0.5, mid: 0.5, high: 0.5, presence: 0.5,
    pedals: [],
  };
  if (amp) {
    const g = knob(amp, "gain", "drive", "overdrive", "preamp");
    if (g !== null) rig.gain = unit(g);
    const lo = knob(amp, "bass", "low", "lo"), mi = knob(amp, "mid", "middle"),
          hi = knob(amp, "treble", "high", "hi"), pr = knob(amp, "pres", "presence", "bright");
    const db = inDb(amp);
    if (lo !== null) rig.low = unit(lo, db);
    if (mi !== null) rig.mid = unit(mi, db);
    if (hi !== null) rig.high = unit(hi, db);
    if (pr !== null) rig.presence = unit(pr, db);
  }
  for (const [slot, g] of gear) {
    if (slot === "Amp" || slot === "Cabinet") continue;
    const key = g.Key || g.PedalKey || "";
    const what = `${key} ${g.Category || ""}`;
    rig.pedals.push(key);
    if (OCTAVE_RE.test(what)) {
      const m = knob(g, "mix", "level", "blend");
      rig.octave = Math.max(rig.octave, m === null ? 0.5 : unit(m));
    } else if (DRIVE_RE.test(what)) {
      const d = knob(g, "gain", "drive", "dist", "distortion", "fuzz", "sustain", "overdrive");
      rig.drive = Math.max(rig.drive, d === null ? 0.6 : unit(d));
    } else if (MOD_RE.test(what)) {
      const m = knob(g, "mix", "depth", "intensity", "level");
      rig.mod = Math.max(rig.mod, m === null ? 0.5 : unit(m));
    } else if (DELAY_RE.test(what)) {
      const m = knob(g, "mix", "level", "blend");
      rig.delay = Math.max(rig.delay, m === null ? 0.3 : unit(m));
    } else if (REVERB_RE.test(what)) {
      const m = knob(g, "mix", "level", "blend");
      rig.reverb = Math.max(rig.reverb, m === null ? 0.3 : unit(m));
    } else if (COMP_RE.test(what)) {
      rig.comp = 1;
    }
  }
  /* how hard the signal is driven in all: the amp's gain, pushed further by a drive pedal */
  const total = 1 - (1 - rig.gain) * (1 - rig.drive * 0.8);
  const fromGear = rig.bass && !rig.drive && rig.gain < 0.35 ? "clean" : kindOfGain(total);
  const kind = descriptorKind(defn) || fromGear;
  /* the simulator follows the label when the knobs disagree with it */
  rig.total = kind === "clean" ? Math.min(total, 0.3)
            : kind === "crunch" ? Math.min(Math.max(total, 0.4), 0.71)
            : Math.max(total, 0.75);
  for (const k of ["gain", "drive", "octave", "mod", "delay", "reverb", "low", "mid", "high", "presence", "total"]) {
    rig[k] = Math.round(rig[k] * 1000) / 1000;
  }
  rig.board = boardFromGear(gl, { bass: rig.bass, kind });
  /* the gear itself, so the page can build the board again with a newer gear library */
  rig.gear = {};
  for (const [slot, g] of gear) {
    rig.gear[slot] = { Key: g.Key || g.PedalKey, Type: g.Type || "", Category: g.Category || "", KnobValues: g.KnobValues || {} };
  }
  return { kind, rig };
}
