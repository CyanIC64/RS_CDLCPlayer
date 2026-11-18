// The pedalboard's parts: the effects the amp simulator can build (web/amp.js,
// sounds from Tuna.js), the models offered in the "+" menu, the cabinets - and
// how a Rocksmith tone's gear (Tones[].GearList) becomes a board.
//
// No audio and no DOM here: the converter (src/js/rig.js) builds a board for
// every tone with it, and the page and its tests read the same tables.
//
// A board, in the order of Rocksmith's tone designer - pre, amp, loop, cabinet, rack:
//   { pre:  [ {id, model, on, params} ],                               pedals before the amp (PrePedal1..)
//     amp:  { name, voice, bassAmp, on, gain, bass, mid, treble, presence },  gain 0..1, EQ in dB
//     loop: [ {id, model, on, params} ],                               the amp's effects loop, before the
//                                                                      cabinet (PostPedal1.., LoopPedal1..)
//     cab: "4x12", mic: "57_Cone", cabOn,                              a CABS id, a MICS id
//     rack: [ {id, model, on, params} ] }                              studio effects after the cabinet (Rack1..)

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

/* settings the generic pedals do not show, for the controls of real gear (gear/*.json "face"):
   a Metal Zone's EQ, a Dyna Comp's output, a flanger's manual, a graphic EQ's sliders */
const dBk = (k, label) => ({ k, label, min:-12, max:12, step:0.5, def:0, unit:"dB" });
FX.Overdrive.extra  = [dBk("bass", "BASS"), dBk("mid", "MID"), dBk("treble", "TREBLE")];
FX.Compressor.extra = [dBk("level", "LEVEL")];
FX.Chorus.extra     = [{ k:"manual", label:"MANUAL", min:0.5, max:15, step:0.1, def:4.5, unit:"ms" }];
FX.EQ.extra         = Array.from({ length: 10 }, (_, i) => dBk("g" + i, "BAND " + (i + 1)));
for (const f of Object.values(FX)) f.extra = f.extra || [];
/** every setting of an effect: its knobs, then the extra ones */
export const paramsOf = (fx) => (FX[fx] ? [...FX[fx].knobs, ...FX[fx].extra] : []);

/* the bands of a graphic EQ with no face of its own (a 7-band pedal's) */
export const EQ_BANDS = [100, 200, 400, 800, 1600, 3200, 6400];

/* the knobs of the amp head (the master volume is the page's amp volume) */
export const AMP_KNOBS = [
  { k:"gain",     label:"GAIN",     min:0, max:1, step:0.01, def:0.3 },
  { k:"bass",     label:"BASS",     min:-12, max:12, step:0.5, def:0, unit:"dB" },
  { k:"mid",      label:"MIDDLE",   min:-12, max:12, step:0.5, def:0, unit:"dB" },
  { k:"treble",   label:"TREBLE",   min:-12, max:12, step:0.5, def:0, unit:"dB" },
  { k:"presence", label:"PRESENCE", min:-12, max:12, step:0.5, def:0, unit:"dB" },
];
/* what some real heads have besides (their faces show them): a bright switch, a depth
   (resonance) knob, the amp's own reverb, and a graphic EQ (a Mark series' five sliders) */
export const AMP_EXTRA = [
  { k:"bright", label:"BRIGHT", min:0, max:9, step:0.5, def:0, unit:"dB" },
  { k:"depth",  label:"DEPTH",  min:0, max:1, step:0.01, def:0 },
  { k:"reverb", label:"REVERB", min:0, max:1, step:0.01, def:0 },
  ...[80, 240, 750, 2200, 6600].map((f, i) => ({ k:"eq" + i, label: f < 1000 ? String(f) : f / 1000 + "K", min:-12, max:12, step:0.5, def:0, unit:"dB", hz:f })),
];
export const AMP_PARAMS = [...AMP_KNOBS, ...AMP_EXTRA];

/* the pedals of the "+" menu. `tuna` holds settings the knobs do not show. */
export const MODELS = {
  od:      { name:"Tube Drive",   group:"Drive",      fx:"Overdrive", color:"#3f9a54", tuna:{ algorithm:0 }, params:{ gain:0.45, tone:0.55, level:0.6 } },
  boost:   { name:"Warm Boost",   group:"Drive",      fx:"Overdrive", color:"#c9c2b0", tuna:{ algorithm:4 }, params:{ gain:0.2, tone:0.6, level:0.7 } },
  dist:    { name:"Distortion",   group:"Drive",      fx:"Overdrive", color:"#e07b28", tuna:{ algorithm:3 }, params:{ gain:0.6, tone:0.5, level:0.5 } },
  metal:   { name:"Metal",        group:"Drive",      fx:"Overdrive", color:"#2b2e33", tuna:{ algorithm:0 }, params:{ gain:0.9, tone:0.45, level:0.45 } },
  fuzz:    { name:"Fuzz",         group:"Drive",      fx:"Overdrive", color:"#8a8f99", tuna:{ algorithm:2 }, params:{ gain:0.7, tone:0.45, level:0.5 } },
  comp:    { name:"Compressor",   group:"Dynamics",   fx:"Compressor",color:"#2f6fc0", params:{} },
  chorus:  { name:"Chorus",       group:"Modulation", fx:"Chorus",    color:"#6fb8d9", params:{} },
  flanger: { name:"Flanger",      group:"Modulation", fx:"Chorus",    color:"#9b5fc0", params:{ rate:0.4, depth:0.8, feedback:0.75, manual:2 } },
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

/* cabinets: an impulse response each (src/amp/ir), and a make-up gain that
   brings them to about the same loudness (measured with the generic voice) */
export const CABS = {
  "1x12":    { name:"1x12 Open back (American)",  ir:"c1x12",   gain:2.6 },
  "2x12":    { name:"2x12 Open back (British)",   ir:"c2x12",   gain:1.7 },
  "4x12":    { name:"4x12 Vintage (British)",     ir:"c4x12",   gain:0.8 },
  "4x12j":   { name:"4x12 Lead (British, 80s)",   ir:"c4x12j",  gain:0.76 },
  "4x12o":   { name:"4x12 Closed (English)",      ir:"c4x12o",  gain:13.7 },
  "4x12m":   { name:"4x12 Modern (American)",     ir:"c4x12m",  gain:0.39 },
  "4x12g":   { name:"4x12 Modern (German)",       ir:"c4x12g",  gain:0.89 },
  "4x12t":   { name:"4x12 Classic",               ir:"tuna",    gain:1.6 },
  "bass":    { name:"4x10 Tweed / Bass",          ir:"cbass",   gain:4.6 },
  "none":    { name:"No cabinet (DI)",            ir:"",        gain:0.22 },
};

/* microphones on the cabinet (the end of a Rocksmith cabinet key: "_57_Cone"):
   how much brighter (hi, dB at 3.5 kHz) and fuller (lo, dB at 150 Hz) each makes it */
export const MIC_TYPES = { "57": { hi: 0, lo: 0 }, Ribbon: { hi: -2.5, lo: 1.5 }, Condenser: { hi: 1.5, lo: 0.5 }, Tube: { hi: -0.5, lo: 1.5 } };
export const MIC_POS = { Cone: 1.5, Edge: -1.5, OffAxis: -3 };
export const MICS = Object.keys(MIC_TYPES).flatMap((t) => Object.keys(MIC_POS).map((p) => `${t}_${p}`));
export function micTilt(mic){
  const [t, p] = String(mic || "").split("_");
  const T = MIC_TYPES[t], P = MIC_POS[p];
  return T && P !== undefined ? { hi: T.hi + P, lo: T.lo } : { hi: 0, lo: 0 };
}

/* amp voices: what kind of amp the head is. drive: the range the GAIN knob
   sweeps (0..1 of the preamp's clipping); tight: Hz cut before the clipping
   (more = tighter lows); mid: [Hz, dB, Q] the voice's own midrange; bright and
   low: dB shelves at 2.5 kHz and 100 Hz; fizz: Hz the speaker rolls off from;
   cab: the cabinet it usually drives; level: make-up, so that voices sound about
   as loud as each other (measured, like the cabinets' gains). */
export const VOICES = {
  generic:  { name:"Generic",                 drive:[0, 1],       tight:70,  mid:[750, 0, 0.7],   bright:0,   low:0,    fizz:9000,  cab:"2x12", level:1 },
  tweed:    { name:"Tweed (50s American)",    drive:[0.05, 0.72], tight:60,  mid:[700, 1.5, 0.7], bright:0.5, low:1,    fizz:6500,  cab:"1x12", level:1.0 },
  american: { name:"American clean",          drive:[0.02, 0.45], tight:60,  mid:[500, -4, 0.7],  bright:2.5, low:1.5,  fizz:8500,  cab:"1x12", level:1.6 },
  plexi:    { name:"British vintage (Plexi)", drive:[0.08, 0.8],  tight:90,  mid:[900, 2.5, 0.8], bright:1.5, low:0,    fizz:7000,  cab:"4x12", level:1.15 },
  jcm:      { name:"British lead (JCM)",      drive:[0.15, 0.92], tight:110, mid:[800, 3, 0.9],   bright:1,   low:-0.5, fizz:7000,  cab:"4x12j", level:1.8 },
  vox:      { name:"British chime (AC)",      drive:[0.05, 0.75], tight:85,  mid:[1200, 3, 0.7],  bright:3,   low:-1,   fizz:7500,  cab:"2x12", level:1.2 },
  orange:   { name:"English (Orange)",        drive:[0.12, 0.92], tight:90,  mid:[600, 2.5, 0.8], bright:-1,  low:1.5,  fizz:6000,  cab:"4x12o", level:1.0 },
  rectifier:{ name:"Rectified (Mesa Rect.)",  drive:[0.12, 1],    tight:130, mid:[750, -4, 0.7],  bright:1,   low:2,    fizz:6500,  cab:"4x12m", level:2.2 },
  mark:     { name:"Californian lead (Mark)", drive:[0.1, 0.95],  tight:150, mid:[650, 1.5, 0.8], bright:1.5, low:-1,   fizz:7000,  cab:"4x12m", level:2.1 },
  highgain: { name:"Modern high gain",        drive:[0.15, 1],    tight:150, mid:[700, -2, 0.8],  bright:0.5, low:1,    fizz:6000,  cab:"4x12m", level:2.4 },
  german:   { name:"German (Diezel, ENGL)",   drive:[0.12, 1],    tight:140, mid:[850, 1, 0.8],   bright:1,   low:1,    fizz:6500,  cab:"4x12g", level:2.0 },
  jazz:     { name:"Solid-state clean (JC)",  drive:[0, 0.2],     tight:50,  mid:[600, -1, 0.7],  bright:2,   low:0,    fizz:9500,  cab:"2x12", level:3.2 },
  bass:     { name:"Bass tube",               drive:[0.02, 0.5],  tight:25,  mid:[500, 1, 0.7],   bright:0,   low:2,    fizz:5000,  cab:"bass", level:4, bass:true },
  bassdi:   { name:"Bass DI",                 drive:[0, 0.15],    tight:25,  mid:[800, 0, 0.7],   bright:0,   low:0,    fizz:12000, cab:"none", level:6, bass:true },
  di:       { name:"Direct (DI)",             drive:[0, 0.1],     tight:40,  mid:[800, 0, 0.7],   bright:0,   low:0,    fizz:12000, cab:"none", level:3 },
};
export const voiceOf = (id) => VOICES[id] || VOICES.generic;
/* the knob position that gives the preamp `t` (0..1) on a voice, and back */
export const driveOf = (voice, gain) => { const [a, b] = voiceOf(voice).drive; return a + (b - a) * clamp(gain, 0, 1); };
export const gainFor = (voice, t) => { const [a, b] = voiceOf(voice).drive; return b === a ? 0 : clamp((t - a) / (b - a), 0, 1); };

import { gearEntry, applyKnobs, cabOfGear } from "./gear.js";
export { modelOfGear, cabOfGear, describeGear, gearEntry, applyKnobs, faceOf, LIBRARY } from "./gear.js";

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
  /* the extra settings only when given (the defaults leave the sound as it is) */
  for (const kn of FX[m.fx].extra) {
    const v = Number(params[kn.k] ?? m.params[kn.k]);
    if (Number.isFinite(v)) p[kn.k] = r3(clamp(v, kn.min, kn.max));
  }
  return { id: id || newId(model), model, on: true, params: p };
}
export function emptyBoard(bass = false) {
  return { amp: { name: bass ? "Bass amp" : "Amp", bassAmp: !!bass, on: true, voice: bass ? "bass" : "generic",
                  gain: 0.3, bass: 0, mid: 0, treble: 0, presence: 0 },
           cab: bass ? "bass" : "2x12", mic: "", cabOn: true, pre: [], loop: [], rack: [] };
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
    if (ampE.real) board.amp.real = ampE.real;
    if (VOICES[ampE.voice]) board.amp.voice = ampE.voice;
    const p = applyKnobs(ampE, ampG.KnobValues);
    for (const kn of AMP_PARAMS) if (Number.isFinite(p[kn.k])) board.amp[kn.k] = r3(p[kn.k]);
  }
  const cabG = gl.Cabinet && typeof gl.Cabinet === "object" ? gl.Cabinet : null;
  const cabE = cabG ? gearEntry("Cabinet", cabG) : null;
  /* the cabinet's own entry; with none, one that suits the amp and the kind of tone */
  board.cab = cabE && CABS[cabE.cab] ? cabE.cab
            : ampE && CABS[ampE.cab] ? ampE.cab
            : ampE && VOICES[ampE.voice] ? VOICES[ampE.voice].cab
            : cabOfGear("", ampE ? ampE.key : "", { bass, kind });
  if (cabE) { board.cabGear = cabG.Key; if (cabE.real) board.cabReal = cabE.real; }
  const mic = /_((?:57|Ribbon|Condenser|Tube)_(?:Cone|Edge|OffAxis))$/i.exec((cabG && cabG.Key) || "");
  board.mic = mic ? mic[1] : (cabE && cabE.mic) || "";

  const slots = Object.keys(gl).filter((s) => s !== "Amp" && s !== "Cabinet" && gl[s] && typeof gl[s] === "object");
  slots.sort((a, b) => ORDER(a) - ORDER(b));
  for (const s of slots) {
    const g = gl[s], e = gearEntry(s, g);
    if (!e || !MODELS[e.model]) continue;
    const pedal = makePedal(e.model, applyKnobs(e, g.KnobValues), s.toLowerCase());
    pedal.gear = e.key;
    if (e.real) pedal.real = e.real;
    (/^PrePedal/i.test(s) ? board.pre : /^Rack/i.test(s) ? board.rack : board.loop).push(pedal);
  }
  /* the author's label wins over the amp's knob, unless a drive pedal before the amp gives the dirt */
  /* (in the preamp's terms: a clean voice has little to give, a high-gain one never gets quite clean) */
  const range = KIND_GAIN[kind];
  if (range && !board.pre.some((p) => MODELS[p.model].fx === "Overdrive")) {
    const v = board.amp.voice, t = clamp(driveOf(v, board.amp.gain), range[0], range[1]);
    board.amp.gain = r3(gainFor(v, t));
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
  if (r.reverb > 0) board.rack.push(makePedal("room", { mix: r.reverb }));
  return board;
}

/* a board made before the rack: its loop ran after the cabinet, so it is the rack now */
function sections(b) {
  if (!Array.isArray(b.rack)) { b.rack = b.loop; b.loop = []; }
  if (b.cabOn === undefined) b.cabOn = true;
  return b;
}

/** whatever the page holds for a tone, as a board */
export function asBoard(x, { bass = false } = {}) {
  if (x && x.amp && typeof x.amp === "object" && Array.isArray(x.pre) && Array.isArray(x.loop)) return sections(x);
  if (x && x.board) return sections(x.board);
  if (x && typeof x === "object") return boardFromRig({ ...x, bass: x.bass || bass });
  return emptyBoard(bass);
}
