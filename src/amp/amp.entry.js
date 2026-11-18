// The guitar input played through the song's tones: a pedalboard in Web Audio,
// exposed to the page as window.AmpKit (built into web/amp.js).
//
//   input ─ gate ─ pre ─ amp (preamp, voice, tone stack) ─ loop ─ cabinet (+ mic) ─ rack ─ room ─ level ─ out
//
// What each tone holds - amp, cabinet and pedals, in order - is a "board"
// (src/amp/catalog.js): the converter makes one from the tone's gear, and the
// player can change it on the pedalboard (src/amp/board.ui.js). The effects
// are Tuna.js's (MIT, github.com/Theodeus/tuna); the cabinets and reverbs are
// impulse responses carried inside this script, so it also works from file://.
//
// One chain is built per tone (a song has a handful) and tone switches
// crossfade between them, so a switch never clicks. Knobs move in place;
// adding, removing or moving a pedal builds the chain again and crossfades.

import Tuna from "tunajs";
import { FX, MODELS, CABS, AMP_PARAMS, EQ_BANDS, paramsOf, faceOf, asBoard, emptyBoard, boardFromRig, voiceOf, driveOf, micTilt } from "./catalog.js";
import irTuna from "./ir/tuna_guitar.wav";
import ir1x12 from "./ir/cab_1x12.wav";
import ir2x12 from "./ir/cab_2x12.wav";
import ir4x12 from "./ir/cab_4x12.wav";
import ir4x12m from "./ir/cab_4x12_modern.wav";
import irBass from "./ir/cab_bass.wav";
import ir4x12j from "./ir/cab_4x12_jcm.wav";
import ir4x12o from "./ir/cab_4x12_orange.wav";
import ir4x12g from "./ir/cab_4x12_engl.wav";
import irRoom from "./ir/rev_room.wav";
import irPlate from "./ir/rev_short.wav";

export { FX, MODELS, CABS, GROUPS, AMP_KNOBS, AMP_EXTRA, AMP_PARAMS, VOICES, MICS, EQ_BANDS, LIBRARY, paramsOf, faceOf, makePedal, emptyBoard, boardFromRig, boardFromGear, asBoard, knobsOf } from "./catalog.js";
export { mountBoard } from "./board.ui.js";

const IR_BYTES = { tuna: irTuna, c1x12: ir1x12, c2x12: ir2x12, c4x12: ir4x12, c4x12m: ir4x12m, cbass: irBass,
                   c4x12j: ir4x12j, c4x12o: ir4x12o, c4x12g: ir4x12g,
                   room: irRoom, plate: irPlate };

/* noise gate: high gain makes the cable's hiss loud. An AudioWorklet loaded from
   a Blob, like the pitch detector, so it also works from file:// */
const GATE_SOURCE = `
class Gate extends AudioWorkletProcessor {
  constructor(){ super(); this.env = 0; this.g = 0; this.open = 0.0035; this.close = 0.0018; }
  static get parameterDescriptors(){ return []; }
  process(inputs, outputs){
    const x = inputs[0][0], y = outputs[0][0];
    if (!x){ return true; }
    const att = 0.02, rel = 0.0008, envA = 0.05, envR = 0.0015;
    for (let i = 0; i < x.length; i++){
      const a = Math.abs(x[i]);
      this.env += (a > this.env ? envA : envR) * (a - this.env);
      const want = this.env > this.open ? 1 : this.env < this.close ? 0 : (this.g > 0.5 ? 1 : 0);
      this.g += (want > this.g ? att : rel) * (want - this.g);
      y[i] = x[i] * this.g;
    }
    return true;
  }
}
registerProcessor("playsong-gate", Gate);`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dB = (v) => Math.pow(10, v / 20);
const SMOOTH = 0.02;

/* per AudioContext: the gate is loaded, Tuna is set up, the impulses decoded */
const perCtx = new WeakMap();
async function setup(ctx){
  let s = perCtx.get(ctx);
  if (s) return s;
  const url = URL.createObjectURL(new Blob([GATE_SOURCE], { type: "text/javascript" }));
  try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  const irs = {};
  await Promise.all(Object.entries(IR_BYTES).map(async ([k, bytes]) => {
    try { irs[k] = await ctx.decodeAudioData(bytes.slice().buffer); } catch (e) { irs[k] = null; }
  }));
  s = { tuna: new Tuna(ctx), irs };
  perCtx.set(ctx, s);
  return s;
}

/* Tuna's modulation runs in ScriptProcessors wired to the speakers: when a
   chain goes, they must be stopped and unplugged or they run forever */
function closeTuna(fx){
  if (!fx) return;
  const stop = (o) => {
    if (!o || typeof o !== "object") return;
    for (const v of Object.values(o)){
      if (!(v instanceof AudioNode)) continue;
      if ("onaudioprocess" in v) v.onaudioprocess = null;
      try { v.disconnect(); } catch (e) {}
    }
  };
  for (const sub of [fx.lfoL, fx.lfoR, fx.envelopeFollower]) stop(sub);
  stop(fx);
}

/* ── the parts ─────────────────────────────────────────────────────────────── */
function nodes(ctx){
  const all = [];
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; all.push(n); return n; };
  const bq = (type, f, gain = 0, q = 0.707) => {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.gain.value = gain; n.Q.value = q;
    all.push(n); return n;
  };
  const conv = (buf) => { const n = ctx.createConvolver(); n.buffer = buf || null; all.push(n); return n; };
  const ramp = (param, v) => param.setTargetAtTime(v, ctx.currentTime, SMOOTH);
  return { all, g, bq, conv, ramp };
}

/* every part sits between a dry and a wet path, so switching it off fades instead of clicking */
function part(ctx, build){
  const N = nodes(ctx);
  const input = N.g(1), output = N.g(1), dry = N.g(0), wet = N.g(1);
  input.connect(dry); dry.connect(output);
  const inner = build(N);
  input.connect(inner.input); inner.output.connect(wet); wet.connect(output);
  return {
    input, output,
    set: inner.set || (() => {}),
    on(v){ N.ramp(wet.gain, v ? 1 : 0); N.ramp(dry.gain, v ? 0 : 1); },
    close(){
      for (const n of N.all) try { n.disconnect(); } catch (e) {}
      if (inner.close) inner.close();
    },
  };
}

/* the curve amount of Tuna's soft clipper for a slope of `k` at the centre */
const curveFor = (k) => clamp(k / (k + 2), 0, 0.9999);

const BUILD = {
  Overdrive(ctx, S, model, p){
    return part(ctx, (N) => {
      const alg = (model.tuna && model.tuna.algorithm) || 0;
      const pre = N.g(1), od = new S.tuna.Overdrive({ drive: 1, outputGain: 0, curveAmount: 0.5, algorithmIndex: alg });
      const lp = N.bq("lowpass", 4000), post = N.g(1);
      /* the EQ some drives have after the clipping (a Metal Zone's, an HM-2's); flat unless set */
      const eLo = N.bq("lowshelf", 120), eMid = N.bq("peaking", 900, 0, 0.9), eHi = N.bq("highshelf", 3000);
      pre.connect(od.input); od.output.connect(lp); lp.connect(eLo); eLo.connect(eMid); eMid.connect(eHi); eHi.connect(post);
      const set = (k, v) => {
        if (k === "gain"){
          const k2 = 2 + 400 * v * v * v + 30 * v;
          N.ramp(pre.gain, alg === 0 ? 1 : 1 + 12 * v * v);
          od.curveAmount = alg === 0 ? curveFor(k2) : clamp(0.3 + 0.69 * v, 0, 0.99);
          p.gain = v; set("level", p.level);
        } else if (k === "tone"){ N.ramp(lp.frequency, 600 * Math.pow(2, v * 4.5)); }
        else if (k === "level"){ N.ramp(post.gain, dB(-24 + 30 * v) / (1 + 1.5 * p.gain)); p.level = v; }
        else if (k === "bass") N.ramp(eLo.gain, v);
        else if (k === "mid") N.ramp(eMid.gain, v);
        else if (k === "treble") N.ramp(eHi.gain, v);
      };
      for (const k of ["gain", "tone", "level", "bass", "mid", "treble"]) set(k, p[k]);
      return { input: pre, output: post, set, close: () => closeTuna(od) };
    });
  },
  Compressor(ctx, S, model, p){
    return part(ctx, (N) => {
      const c = new S.tuna.Compressor({ threshold: p.threshold, ratio: p.ratio, attack: p.attack, release: p.release,
                                        knee: 6, automakeup: true });
      const out = N.g(dB(p.level || 0));
      c.output.connect(out);
      const set = (k, v) => { if (k === "level") N.ramp(out.gain, dB(v)); else { c[k] = v; c.automakeup = true; } };
      return { input: c.input, output: out, set, close: () => closeTuna(c) };
    });
  },
  Chorus(ctx, S, model, p){
    return part(ctx, () => {
      const c = new S.tuna.Chorus({ rate: p.rate, depth: p.depth, feedback: p.feedback, delay: p.manual / 1000 });
      return { input: c.input, output: c.output, set: (k, v) => { if (k === "manual") c.delay = v / 1000; else c[k] = v; }, close: () => closeTuna(c) };
    });
  },
  Phaser(ctx, S, model, p){
    return part(ctx, () => {
      const c = new S.tuna.Phaser({ rate: p.rate, depth: p.depth, feedback: p.feedback, stereoPhase: 30, baseModulationFrequency: 700 });
      return { input: c.input, output: c.output, set: (k, v) => { c[k] = v; }, close: () => closeTuna(c) };
    });
  },
  Tremolo(ctx, S, model, p){
    return part(ctx, () => {
      const c = new S.tuna.Tremolo({ intensity: p.intensity, rate: p.rate, stereoPhase: 0 });
      return { input: c.input, output: c.output, set: (k, v) => { c[k] = v; }, close: () => closeTuna(c) };
    });
  },
  WahWah(ctx, S, model, p){
    return part(ctx, () => {
      const c = new S.tuna.WahWah({ automode: true, sensitivity: p.sensitivity, baseFrequency: p.baseFrequency,
                                    resonance: p.resonance, excursionOctaves: 3 });
      return { input: c.input, output: c.output, set: (k, v) => { c[k] = v; }, close: () => closeTuna(c) };
    });
  },
  Delay(ctx, S, model, p){
    return part(ctx, () => {
      const cut = (v) => 900 * Math.pow(2, v * 4.2);
      const c = new S.tuna.Delay({ delayTime: p.time, feedback: p.feedback, wetLevel: p.mix, dryLevel: 1, cutoff: cut(p.tone) });
      const set = (k, v) => {
        if (k === "time") c.delayTime = v;
        else if (k === "feedback") c.feedback = v;
        else if (k === "mix") c.wetLevel = v;
        else if (k === "tone") c.cutoff = cut(v);
      };
      return { input: c.input, output: c.output, set, close: () => closeTuna(c) };
    });
  },
  Reverb(ctx, S, model, p){
    return part(ctx, (N) => {
      const input = N.g(1), output = N.g(1), dry = N.g(1), hp = N.bq("highpass", 140), cv = N.conv(S.irs[model.ir || "room"]),
            lp = N.bq("lowpass", 6000), wet = N.g(0);
      input.connect(dry); dry.connect(output);
      input.connect(hp); hp.connect(cv); cv.connect(lp); lp.connect(wet); wet.connect(output);
      const set = (k, v) => {
        if (k === "mix") N.ramp(wet.gain, v * 0.9);
        else if (k === "tone") N.ramp(lp.frequency, 1500 * Math.pow(2, v * 3.3));
      };
      set("mix", p.mix); set("tone", p.tone);
      return { input, output, set };
    });
  },
  EQ(ctx, S, model, p){
    return part(ctx, (N) => {
      const lo = N.bq("lowshelf", 120), mid = N.bq("peaking", 800, 0, 0.8), hi = N.bq("highshelf", 3200), lvl = N.g(1);
      /* a graphic EQ's sliders (g0, g1...) at the bands of its face; flat unless set */
      const bands = (model.bands || EQ_BANDS).slice(0, 10).map((f, i, all) =>
        N.bq("peaking", f, 0, all.length > 7 ? 1.8 : 1.2));
      let at = lo;
      for (const n of [mid, hi, ...bands]){ at.connect(n); at = n; }
      at.connect(lvl);
      const set = (k, v) => {
        if (k === "bass") N.ramp(lo.gain, v);
        else if (k === "mid") N.ramp(mid.gain, v);
        else if (k === "treble") N.ramp(hi.gain, v);
        else if (k === "level") N.ramp(lvl.gain, dB(v));
        else if (/^g\d$/.test(k) && bands[+k[1]]) N.ramp(bands[+k[1]].gain, v);
      };
      for (const kn of paramsOf("EQ")) set(kn.k, p[kn.k]);
      return { input: lo, output: lvl, set };
    });
  },
  /* the analog octave-up: a full-wave rectifier, mixed with the dry signal */
  Octave(ctx, S, model, p){
    return part(ctx, (N) => {
      const input = N.g(1), output = N.g(1), dry = N.g(1), pre = N.bq("lowpass", 1400), hp = N.bq("highpass", 160), lvl = N.g(0);
      const rect = ctx.createWaveShaper(); N.all.push(rect);
      const n = 2048, c = new Float32Array(n);
      for (let i = 0; i < n; i++){ const x = (i / (n - 1)) * 2 - 1; c[i] = Math.abs(x) * 2 - 0.5; }
      rect.curve = c;
      input.connect(dry); dry.connect(output);
      input.connect(pre); pre.connect(rect); rect.connect(hp); hp.connect(lvl); lvl.connect(output);
      const set = (k, v) => { if (k === "mix") N.ramp(lvl.gain, v * 0.9); else if (k === "dry") N.ramp(dry.gain, v); };
      set("mix", p.mix); set("dry", p.dry);
      return { input, output, set };
    });
  },
};

/* the amp head: preamp (Tuna's soft clipper, tightened in the lows as high-gain
   amps are), the voice of the amp (its own mids, brightness and lows) and a tone
   stack. The cabinet is a part of its own, after the effects loop. */
function buildAmp(ctx, S, board){
  const a = board.amp, V = voiceOf(a.voice), bass = !!a.bassAmp || !!V.bass;
  return part(ctx, (N) => {
    const tight = N.bq("highpass", V.tight);
    const od = new S.tuna.Overdrive({ drive: 1, outputGain: 0, curveAmount: 0.5, algorithmIndex: 0 });
    const post = N.g(1);
    const vLow = N.bq("lowshelf", 100, V.low), vMid = N.bq("peaking", V.mid[0], V.mid[1], V.mid[2]),
          vBright = N.bq("highshelf", 2500, V.bright);
    const lo = N.bq("lowshelf", bass ? 90 : 140), mid = N.bq("peaking", bass ? 600 : 750, 0, 0.8),
          hi = N.bq("highshelf", bass ? 2500 : 3000), pres = N.bq("peaking", 4500, 0, 1);
    /* what some real heads add: a bright switch, a depth knob, a graphic EQ, a reverb (flat and dry unless set) */
    const brt = N.bq("highshelf", 2500), deep = N.bq("lowshelf", 90);
    const face = faceOf(a.gear);
    const geq = AMP_PARAMS.filter((kn) => kn.hz).map((kn, i) => N.bq("peaking", (face && face.bands && face.bands[i]) || kn.hz, 0, 1.1));
    const out = N.g(1), rvWet = N.g(0), rvHp = N.bq("highpass", 200), rv = N.conv(S.irs[bass ? "room" : "plate"]), rvLp = N.bq("lowpass", 5000);
    tight.connect(od.input); od.output.connect(post);
    post.connect(brt); brt.connect(vLow); vLow.connect(vMid); vMid.connect(vBright);
    let at = vBright;
    for (const n of [lo, mid, hi, ...geq, pres, deep]){ at.connect(n); at = n; }
    at.connect(out);
    at.connect(rvHp); rvHp.connect(rv); rv.connect(rvLp); rvLp.connect(rvWet); rvWet.connect(out);
    const set = (k, v) => {
      if (k === "gain"){
        const t = driveOf(a.voice, v);                      // the knob, through the voice's range
        od.curveAmount = curveFor(bass ? 0.2 + 8 * t * t : 0.2 + 260 * t * t * t + 20 * t);
        N.ramp(tight.frequency, bass ? V.tight : V.tight * (1 + 1.3 * t));
        N.ramp(post.gain, (V.level || 1) * 0.75 / (1 + 1.4 * t));
      }
      else if (k === "bass") N.ramp(lo.gain, v * 0.75);
      else if (k === "mid") N.ramp(mid.gain, v * 0.6);
      else if (k === "treble") N.ramp(hi.gain, v * 0.67);
      else if (k === "presence") N.ramp(pres.gain, v * 0.4);
      else if (k === "bright") N.ramp(brt.gain, v);
      else if (k === "depth") N.ramp(deep.gain, v * 9);
      else if (k === "reverb") N.ramp(rvWet.gain, v * 0.8);
      else if (/^eq\d$/.test(k) && geq[+k[2]]) N.ramp(geq[+k[2]].gain, v);
    };
    for (const kn of AMP_PARAMS) set(kn.k, Number(a[kn.k]) || 0);
    return { input: tight, output: out, set, close: () => closeTuna(od) };
  });
}

/* the cabinet: the speakers (an impulse response), the microphone on them, and
   the speakers' roll-off of the fizz the amp's voice leaves */
function buildCab(ctx, S, board){
  const a = board.amp, V = voiceOf(a.voice), bass = !!a.bassAmp || !!V.bass;
  const cab = CABS[board.cab] || CABS[bass ? "bass" : V.cab] || CABS["2x12"];
  const mic = micTilt(board.mic);
  return part(ctx, (N) => {
    const input = N.g(1);
    const cv = N.conv(cab.ir ? S.irs[cab.ir] : null), cabGain = N.g(cab.gain);
    const micLo = N.bq("lowshelf", 150, cv.buffer ? mic.lo : 0), micHi = N.bq("highshelf", 3500, cv.buffer ? mic.hi : 0);
    const fizz = N.bq("lowpass", cv.buffer ? V.fizz : 12000, 0, 0.6);
    if (cv.buffer){ input.connect(cv); cv.connect(cabGain); } else { input.connect(cabGain); }
    cabGain.connect(micLo); micLo.connect(micHi); micHi.connect(fizz);
    return { input, output: fizz };
  });
}

function buildChain(ctx, S, board){
  /* Tuna keeps its context in module globals: point them at this one before building */
  S.tuna = new Tuna(ctx);
  const input = ctx.createGain(), out = ctx.createGain();
  out.gain.value = 0;
  const units = new Map();
  let head = input;
  const add = (id, u, on) => {
    units.set(id, u);
    if (on === false) u.on(false);
    head.connect(u.input); head = u.output;
  };
  const pedal = (p) => {
    const m = MODELS[p.model], make = m && BUILD[m.fx];
    if (!make) return;
    const params = { ...p.params };
    for (const kn of paramsOf(m.fx)) if (!Number.isFinite(params[kn.k])) params[kn.k] = Number.isFinite(m.params[kn.k]) ? m.params[kn.k] : kn.def;
    const face = faceOf(p.gear);
    add(p.id, make(ctx, S, face && face.bands ? { ...m, bands: face.bands } : m, params), p.on);
  };
  /* the Rocksmith tone designer's chain: pre -> amp -> loop -> cabinet -> rack */
  for (const p of board.pre) pedal(p);
  add("amp", buildAmp(ctx, S, board), board.amp.on);
  for (const p of board.loop) pedal(p);
  add("cab", buildCab(ctx, S, board), board.cabOn);
  for (const p of board.rack || []) pedal(p);
  /* a little room, always: a dry amp in headphones sounds boxed in */
  const room = BUILD.Reverb(ctx, S, { ir: "room" }, { mix: 0.07, tone: 0.6 });
  head.connect(room.input); room.output.connect(out);
  return {
    input, out, units,
    close(){
      for (const u of units.values()) u.close();
      room.close();
      try { input.disconnect(); } catch (e) {}
      try { out.disconnect(); } catch (e) {}
    },
  };
}

export const DEFAULT_RIG = { bass:false, gain:0.25, drive:0, octave:0, comp:0, mod:0, delay:0, reverb:0.15,
                             low:0.5, mid:0.5, high:0.55, presence:0.5, total:0.25 };

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} source  the guitar input
 */
export async function create(ctx, source){
  const S = await setup(ctx);
  const gate = new AudioWorkletNode(ctx, "playsong-gate", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit",
  });
  const level = ctx.createGain();
  level.gain.value = 0;
  source.connect(gate);
  level.connect(ctx.destination);
  const chains = new Map();          // tone key -> chain
  let cur = null, curKey = null, vol = 0.7;

  const FADE = 0.03;
  const fadeIn = (ch) => {
    const now = ctx.currentTime;
    if (cur && cur !== ch) cur.out.gain.setTargetAtTime(0, now, FADE);
    ch.out.gain.cancelScheduledValues(now);
    ch.out.gain.setTargetAtTime(1, now, FADE);
    cur = ch;
  };
  const make = (board) => {
    const ch = buildChain(ctx, S, board);
    gate.connect(ch.input); ch.out.connect(level);
    return ch;
  };
  const retire = (ch) => {
    ch.out.gain.setTargetAtTime(0, ctx.currentTime, FADE);
    setTimeout(() => ch.close(), 300);
  };

  return {
    /** play through the board of the tone `key` (crossfades from the previous one).
        `board` may also be an older rig (gain, EQ and effect amounts). */
    use(key, board){
      key = key || "(default)";
      if (key === curKey && chains.has(key)) return;
      let ch = chains.get(key);
      if (!ch){ ch = make(asBoard(board)); chains.set(key, ch); }
      fadeIn(ch); curKey = key;
    },
    /** build the tone's chain again (a pedal added, removed or moved, another cabinet) */
    rebuild(key, board){
      key = key || "(default)";
      const old = chains.get(key);
      const ch = make(asBoard(board));
      chains.set(key, ch);
      if (key === curKey){ fadeIn(ch); }
      if (old) retire(old);
    },
    /** turn a knob of a pedal (or of "amp") of the tone `key` */
    set(key, id, param, value){
      const ch = chains.get(key || "(default)"), u = ch && ch.units.get(id);
      if (u) u.set(param, value);
    },
    /** switch a pedal (or "amp") on or off */
    toggle(key, id, on){
      const ch = chains.get(key || "(default)"), u = ch && ch.units.get(id);
      if (u) u.on(!!on);
    },
    /** forget the built chains (a new song or arrangement); the current one fades out */
    reset(){
      for (const ch of chains.values()) retire(ch);
      chains.clear(); cur = null; curKey = null;
    },
    setLevel(v){
      vol = clamp(v, 0, 1);
      level.gain.setTargetAtTime(vol, ctx.currentTime, 0.02);
    },
    close(){
      level.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => {
        for (const ch of chains.values()) ch.close();
        chains.clear();
        try { source.disconnect(gate); } catch (e) {}
        gate.disconnect(); level.disconnect();
      }, 120);
    },
  };
}

/* kept for pages that still ask for it */
export const fromRig = (rig) => boardFromRig(rig);
export const blankBoard = (bass) => emptyBoard(bass);
