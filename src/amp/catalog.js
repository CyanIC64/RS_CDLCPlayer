// The pedalboard's parts: the effects the amp simulator can build (web/amp.js,
// sounds from Tuna.js), the models offered in the "+" menu, the cabinets - and
// how a Rocksmith tone's gear (Tones[].GearList) becomes a board.
//
// No audio and no DOM here: the converter (src/js/rig.js) builds a board for
// every tone with it, and the page and its tests read the same tables.
//
// A board:
//   { amp: { name, bassAmp, on, gain, bass, mid, treble, presence },   gain 0..1, EQ in dB
//     cab: "4x12",                                                     a CABS id
//     pre:  [ {id, model, on, params} ],                               pedals before the amp
//     loop: [ {id, model, on, params} ] }                              effects after it (racks, post pedals)

/* the knobs of each kind of effect; a model sets their starting values */
export const FX = {
  Overdrive:  { knobs: [ { k:"gain",  label:"DRIVE", min:0, max:1, step:0.01, def:0.5 },
                         { k:"tone",  label:"TONE",  min:0, max:1, step:0.01, def:0.5 },
                         { k:"level", label:"LEVEL", min:0, max:1, step:0.01, def:0.5 } ] },
  Compressor: { knobs: [ { k:"threshold", label:"THRESH", min:-60, max:0, step:0.5, def:-24, unit:"dB" },
                         { k:"ratio",     label:"RATIO",  min:1, max:20, step:0.1, def:4, unit:":1" },
                         { k:"attack",    label:"ATTACK", min:0, max:200, step:1, def:5, unit:"ms" },
                         { k:"release",   label:"RELEASE",min:10, max:1000, step:5, def:200, unit:"ms" } ] },
  Chorus:     { knobs: [ { k:"rate",     label:"RATE",  min:0.05, max:8, step:0.05, def:1.5, unit:"Hz" },
                         { k:"depth",    label:"DEPTH", min:0, max:1, step:0.01, def:0.7 },
                         { k:"feedback", label:"FDBK",  min:0, max:0.95, step:0.01, def:0.2 } ] },
  Phaser:     { knobs: [ { k:"rate",     label:"RATE",  min:0.05, max:8, step:0.05, def:0.6, unit:"Hz" },
                         { k:"depth",    label:"DEPTH", min:0, max:1, step:0.01, def:0.6 },
                         { k:"feedback", label:"RES",   min:0, max:0.95, step:0.01, def:0.5 } ] },
  Tremolo:    { knobs: [ { k:"rate",      label:"RATE",  min:0.1, max:11, step:0.1, def:5, unit:"Hz" },
                         { k:"intensity", label:"DEPTH", min:0, max:1, step:0.01, def:0.5 } ] },
  WahWah:     { knobs: [ { k:"sensitivity",  label:"SENS",  min:-1, max:1, step:0.01, def:0.2 },
                         { k:"baseFrequency",label:"FREQ",  min:0, max:1, step:0.01, def:0.3 },
                         { k:"resonance",    label:"Q",     min:1, max:60, step:0.5, def:15 } ] },
  Delay:      { knobs: [ { k:"time",     label:"TIME",   min:20, max:1000, step:5, def:360, unit:"ms" },
                         { k:"feedback", label:"REPEAT", min:0, max:0.9, step:0.01, def:0.35 },
                         { k:"mix",      label:"LEVEL",  min:0, max:1, step:0.01, def:0.35 },
                         { k:"tone",     label:"TONE",   min:0, max:1, step:0.01, def:0.6 } ] },
  Reverb:     { knobs: [ { k:"mix",  label:"LEVEL", min:0, max:1, step:0.01, def:0.3 },
                         { k:"tone", label:"TONE",  min:0, max:1, step:0.01, def:0.7 } ] },
  EQ:         { knobs: [ { k:"bass",   label:"BASS",   min:-12, max:12, step:0.5, def:0, unit:"dB" },
                         { k:"mid",    label:"MID",    min:-12, max:12, step:0.5, def:0, unit:"dB" },
                         { k:"treble", label:"TREBLE", min:-12, max:12, step:0.5, def:0, unit:"dB" },
                         { k:"level",  label:"LEVEL",  min:-12, max:12, step:0.5, def:0, unit:"dB" } ] },
  Octave:     { knobs: [ { k:"mix",  label:"OCTAVE", min:0, max:1, step:0.01, def:0.5 },
                         { k:"dry",  label:"DRY",    min:0, max:1, step:0.01, def:1 } ] },
};

/* the knobs of the amp head (the master volume is the page's amp volume) */
export const AMP_KNOBS = [
  { k:"gain",     label:"GAIN",     min:0, max:1, step:0.01, def:0.3 },
  { k:"bass",     label:"BASS",     min:-12, max:12, step:0.5, def:0, unit:"dB" },
  { k:"mid",      label:"MIDDLE",   min:-12, max:12, step:0.5, def:0, unit:"dB" },
  { k:"treble",   label:"TREBLE",   min:-12, max:12, step:0.5, def:0, unit:"dB" },
  { k:"presence", label:"PRESENCE", min:-12, max:12, step:0.5, def:0, unit:"dB" },
];

/* the pedals of the "+" menu. `tuna` holds settings the knobs do not show. */
export const MODELS = {
  od:      { name:"Tube Drive",   group:"Drive",      fx:"Overdrive", color:"#3f9a54", tuna:{ algorithm:0 }, params:{ gain:0.45, tone:0.55, level:0.6 } },
  boost:   { name:"Warm Boost",   group:"Drive",      fx:"Overdrive", color:"#c9c2b0", tuna:{ algorithm:4 }, params:{ gain:0.2, tone:0.6, level:0.7 } },
  dist:    { name:"Distortion",   group:"Drive",      fx:"Overdrive", color:"#e07b28", tuna:{ algorithm:3 }, params:{ gain:0.6, tone:0.5, level:0.5 } },
  metal:   { name:"Metal",        group:"Drive",      fx:"Overdrive", color:"#2b2e33", tuna:{ algorithm:0 }, params:{ gain:0.9, tone:0.45, level:0.45 } },
  fuzz:    { name:"Fuzz",         group:"Drive",      fx:"Overdrive", color:"#8a8f99", tuna:{ algorithm:2 }, params:{ gain:0.7, tone:0.45, level:0.5 } },
  comp:    { name:"Compressor",   group:"Dynamics",   fx:"Compressor",color:"#2f6fc0", params:{} },
  chorus:  { name:"Chorus",       group:"Modulation", fx:"Chorus",    color:"#6fb8d9", params:{} },
  flanger: { name:"Flanger",      group:"Modulation", fx:"Chorus",    color:"#9b5fc0", tuna:{ delay:0.002 }, params:{ rate:0.4, depth:0.8, feedback:0.75 } },
  phaser:  { name:"Phaser",       group:"Modulation", fx:"Phaser",    color:"#e0a020", params:{} },
  tremolo: { name:"Tremolo",      group:"Modulation", fx:"Tremolo",   color:"#e6cf45", params:{} },
  wah:     { name:"Auto Wah",     group:"Filter",     fx:"WahWah",    color:"#b13b3b", params:{} },
  eq:      { name:"EQ",           group:"Filter",     fx:"EQ",        color:"#d8dde3", params:{} },
  octave:  { name:"Octave Up",    group:"Pitch",      fx:"Octave",    color:"#5a6fd6", params:{} },
  delay:   { name:"Delay",        group:"Time",       fx:"Delay",     color:"#d7d9dc", params:{} },
  echo:    { name:"Tape Echo",    group:"Time",       fx:"Delay",     color:"#7a5a3a", params:{ time:420, feedback:0.45, mix:0.35, tone:0.3 } },
  room:    { name:"Room Reverb",  group:"Time",       fx:"Reverb",    color:"#3a7f8c", ir:"room",  params:{} },
  plate:   { name:"Plate Reverb", group:"Time",       fx:"Reverb",    color:"#26507a", ir:"plate", params:{ mix:0.35, tone:0.75 } },
};
export const GROUPS = ["Drive", "Dynamics", "Modulation", "Filter", "Pitch", "Time"];

/* cabinets: an impulse response each (src/amp/ir), and a make-up gain */
export const CABS = {
  "1x12":    { name:"1x12 Combo",      ir:"c1x12",   gain:1.0 },
  "2x12":    { name:"2x12 Combo",      ir:"c2x12",   gain:1.4 },
  "4x12":    { name:"4x12 Vintage",    ir:"c4x12",   gain:1.0 },
  "4x12m":   { name:"4x12 Modern",     ir:"c4x12m",  gain:0.8 },
  "4x12t":   { name:"4x12 Classic",    ir:"tuna",    gain:1.0 },
  "bass":    { name:"4x10 Bass",       ir:"cbass",   gain:1.6 },
};

import { gearEntry, applyKnobs, cabOfGear } from "./gear.js";
export { modelOfGear, cabOfGear, describeGear, gearEntry, applyKnobs } from "./gear.js";

/* ── helpers ──────────────────────────────────────────────────────────────── */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
let uid = 0;
export const newId = (model) => `${model}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

export function knobsOf(model) {
  const m = MODELS[model];
  return m ? FX[m.fx].knobs : [];
}
/** a pedal of `model` with its starting values, `params` on top */
export function makePedal(model, params = {}, id = "") {
  const m = MODELS[model];
  if (!m) return null;
  const p = {};
  for (const kn of FX[m.fx].knobs) {
    const v = Number(params[kn.k] ?? m.params[kn.k] ?? kn.def);
    p[kn.k] = r3(clamp(Number.isFinite(v) ? v : kn.def, kn.min, kn.max));
  }
  return { id: id || newId(model), model, on: true, params: p };
}
export function emptyBoard(bass = false) {
  return { amp: { name: bass ? "Bass amp" : "Amp", bassAmp: !!bass, on: true, gain: 0.3, bass: 0, mid: 0, treble: 0, presence: 0 },
           cab: bass ? "bass" : "2x12", pre: [], loop: [] };
}

/* ── from Rocksmith gear (through the gear library, gear.js) ─────────────── */
const KIND_GAIN = { clean: [0, 0.3], crunch: [0.4, 0.71], distortion: [0.75, 1] };
const ORDER = (s) => (/^PrePedal/i.test(s) ? 0 : /^LoopPedal/i.test(s) ? 1 : /^Rack/i.test(s) ? 2 : /^PostPedal/i.test(s) ? 3 : 4) * 100
                     + (parseInt(s.replace(/\D+/g, ""), 10) || 0);

/**
 * The board of a tone from its GearList.
 * @param {object} gl     Tones[].GearList
 * @param {object} opts   bass: a bass arrangement's tone; kind: clean | crunch | distortion (the
 *                        amp's gain follows it, as the author labelled the tone, unless a drive pedal does the work)
 */
export function boardFromGear(gl, { bass = false, kind = "" } = {}) {
  gl = gl && typeof gl === "object" ? gl : {};
  const ampG = gl.Amp && typeof gl.Amp === "object" ? gl.Amp : null;
  const ampE = ampG ? gearEntry("Amp", ampG) : null;
  bass = !!bass || !!(ampE && ampE.bass);
  const board = emptyBoard(bass);
  if (ampE) {
    board.amp.name = ampE.name || board.amp.name;
    board.amp.gear = ampE.key;
    const p = applyKnobs(ampE, ampG.KnobValues);
    for (const k of ["gain", "bass", "mid", "treble", "presence"]) if (Number.isFinite(p[k])) board.amp[k] = r3(p[k]);
  }
  const cabG = gl.Cabinet && typeof gl.Cabinet === "object" ? gl.Cabinet : null;
  const cabE = cabG ? gearEntry("Cabinet", cabG) : null;
  /* the cabinet's own entry; with none, one that suits the amp and the kind of tone */
  board.cab = cabE && CABS[cabE.cab] ? cabE.cab
            : ampE && CABS[ampE.cab] ? ampE.cab
            : cabOfGear("", ampE ? ampE.key : "", { bass, kind });

  const slots = Object.keys(gl).filter((s) => s !== "Amp" && s !== "Cabinet" && gl[s] && typeof gl[s] === "object");
  slots.sort((a, b) => ORDER(a) - ORDER(b));
  for (const s of slots) {
    const g = gl[s], e = gearEntry(s, g);
    if (!e || !MODELS[e.model]) continue;
    const pedal = makePedal(e.model, applyKnobs(e, g.KnobValues), s.toLowerCase());
    pedal.gear = e.key;
    (/^PrePedal/i.test(s) ? board.pre : board.loop).push(pedal);
  }
  /* the author's label wins over the amp's knob, unless a drive pedal before the amp gives the dirt */
  const range = KIND_GAIN[kind];
  if (range && !board.pre.some((p) => MODELS[p.model].fx === "Overdrive")) {
    board.amp.gain = r3(clamp(board.amp.gain, range[0], range[1]));
  }
  return board;
}

/* the amp head from the numbers rig.js read (0..1; 0.5 = flat) */
function ampFromRig(a, rig) {
  if (!rig) return a;
  const eq = (v) => (Number.isFinite(v) ? r3(clamp((v - 0.5) * 24, -12, 12)) : 0);
  a.gain = r3(clamp(Number.isFinite(rig.total) ? rig.total : Number.isFinite(rig.gain) ? rig.gain : 0.3, 0, 1));
  a.bass = eq(rig.low); a.mid = eq(rig.mid); a.treble = eq(rig.high); a.presence = eq(rig.presence);
  return a;
}

/**
 * A board for a rig without one (a song converted before boards existed):
 * the amp from its numbers, and a pedal for each effect amount it has.
 */
export function boardFromRig(rig) {
  const r = rig || {};
  const kind = r.total >= 0.72 ? "distortion" : r.total >= 0.35 ? "crunch" : "clean";
  const board = emptyBoard(!!r.bass);
  if (r.amp) board.amp.name = String(r.amp).replace(/^(bass_)?amp_/i, "");
  ampFromRig(board.amp, r);
  board.cab = cabOfGear("", r.amp || "", { bass: !!r.bass, kind });
  if (r.comp) board.pre.push(makePedal("comp"));
  if (r.octave > 0) board.pre.push(makePedal("octave", { mix: r.octave }));
  if (r.mod > 0) board.loop.push(makePedal("chorus", { depth: r.mod }));
  if (r.delay > 0) board.loop.push(makePedal("delay", { mix: r.delay }));
  if (r.reverb > 0) board.loop.push(makePedal("room", { mix: r.reverb }));
  return board;
}

/** whatever the page holds for a tone, as a board */
export function asBoard(x, { bass = false } = {}) {
  if (x && x.amp && typeof x.amp === "object" && Array.isArray(x.pre) && Array.isArray(x.loop)) return x;
  if (x && x.board) return x.board;
  if (x && typeof x === "object") return boardFromRig({ ...x, bass: x.bass || bass });
  return emptyBoard(bass);
}
