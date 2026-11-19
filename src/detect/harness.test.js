/* "Guitarra falsa": o processor verdadeiro (processor.entry.js) corre em Node, com
   um AudioWorkletProcessor de imitação, alimentado por cordas sintéticas. As
   mensagens vão para o Verifier como na página, por isso o teste cobre o
   caminho inteiro: onset, MPM, Goertzel, expect() e a decisão de acerto. */
import { beforeAll, describe, expect, it } from "vitest";
import { buildTargets, Verifier } from "./verify.js";
import { midiToHz } from "./notes.js";

const SR = 48000, Q = 128;
let Proc;

beforeAll(async () => {
  globalThis.sampleRate = SR;
  globalThis.currentTime = 0;
  globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage: null }; } };
  globalThis.registerProcessor = (_, C) => { Proc = C; };
  await import("./processor.entry.js");
});

const note = (extra = {}) => ({ s: 0, f: 0, ho: false, po: false, tp: false, linked: false, mt: false, bn: 0, ...extra });
const ev = (t, m, extra) => ({ t, m, n: note(extra) });

/* uma corda dedilhada: harmónicos que decaem, os agudos mais depressa.
   `to` (Hz) desliza ou dobra a nota até lá em `over` segundos; `pm` abafa-a. */
function string(hz, t0, { gain = 0.25, to = hz, over = 0.25, pm = false } = {}){
  const amps = pm ? [1, 0.35, 0.12] : [1, 0.6, 0.4, 0.25, 0.15], dec = pm ? 14 : 1.5;
  const phase = (d) => d < over ? hz * d + (to - hz) * d * d / (2 * over)
                                : hz * over + (to - hz) * over / 2 + to * (d - over);
  return (t) => {
    const d = t - t0;
    if (d < 0 || d > 3) return 0;
    const ph = 2 * Math.PI * phase(d);
    let s = 0;
    for (let h = 0; h < amps.length; h++) s += amps[h] * Math.exp(-d * (dec + h)) * Math.sin(ph * (h + 1));
    return gain * s * Math.min(1, d / 0.002);
  };
}

const GUITAR = { window: 2048, hop: 512, minFreq: 70, maxFreq: 1400, long: 8192 };

/**
 * Toca `played` (eventos {t, midi, to?, pm?} ou {t, chord:[midi]}) e verifica contra `chart`.
 * Cada corda abafa a anterior quando `mute` está ligado.
 */
function run(chart, played, { mute = true, preset = GUITAR, noise = 0.002 } = {}){
  const v = new Verifier(buildTargets(chart, (e) => e.m), { long: preset.long / SR });
  const p = new Proc();
  p.port.onmessage({ data: { type: "config", ...preset } });
  p.port.postMessage = (m) => {
    if (m.type === "onset") v.onset(m.time, m.energy);
    else v.frame(m.time, m.freq, m.clarity, m.freqs, m.presence, m.timeL);
  };
  const voices = [];
  for (const x of played){
    const ms = x.chord || [x.midi];
    if (mute) for (const vc of voices) if (!vc.end) vc.end = x.t;
    for (const m of ms) voices.push({ f: string(midiToHz(m), x.t, { to: x.to ? midiToHz(x.to) : midiToHz(m), pm: x.pm }), end: 0 });
  }
  const end = Math.max(...chart.map((e) => e.t)) + 1;
  const buf = new Float32Array(Q);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let k = 0; k * Q / SR < end; k++){
    const t0 = k * Q / SR;
    globalThis.currentTime = t0;
    for (let i = 0; i < Q; i++){
      const t = t0 + i / SR;
      let s = noise * rnd();
      for (const vc of voices){
        const a = vc.end && t > vc.end ? Math.exp(-(t - vc.end) / 0.01) : 1;
        if (a > 1e-4) s += a * vc.f(t);
      }
      buf[i] = s;
    }
    p.process([[buf]]);
    p.port.onmessage({ data: { type: "expect", freqs: v.expected(t0) } });
    v.update(t0 - 0.1);
  }
  v.update(end + 1);
  return v;
}

const MELODY = [40, 45, 47, 50, 52, 55, 57, 59, 62, 64, 67, 69, 71, 72, 74, 76];   // Mi2 … Mi5
const chartOf = (ms, dt = 0.3) => ms.map((m, i) => ev(1 + i * dt, m));

describe("fake guitar, single notes", () => {
  it("hits a melody played right, a little late", () => {
    const v = run(chartOf(MELODY), MELODY.map((m, i) => ({ t: 1 + i * 0.3 + 0.02, midi: m })));
    expect(v.stats.hit).toBeGreaterThanOrEqual(15);
    const lag = [...v.stats.lag].sort((a, b) => a - b)[v.stats.lag.length >> 1];
    expect(Math.abs(lag - 0.02)).toBeLessThan(0.02);
  });

  it.each([["one fret sharp", 1], ["one fret flat", -1]])("misses the melody played %s", (_, d) => {
    const v = run(chartOf(MELODY), MELODY.map((m, i) => ({ t: 1 + i * 0.3, midi: m + d })));
    expect(v.stats.hit).toBeLessThanOrEqual(1);
  });

  it("misses notes that are not played", () => {
    const played = MELODY.map((m, i) => ({ t: 1 + i * 0.3, midi: m })).filter((_, i) => i % 2 === 0);
    const v = run(chartOf(MELODY), played);
    expect(v.stats.miss).toBeGreaterThanOrEqual(8);
    expect(v.targets.filter((g, i) => i % 2 === 0 && g.result).length).toBeGreaterThanOrEqual(7);
  });

  it("hits notes played over a string left ringing", () => {
    const ms = [45, 50, 55, 59, 64, 69];
    const v = run(chartOf(ms, 0.25), ms.map((m, i) => ({ t: 1 + i * 0.25, midi: m })), { mute: false });
    expect(v.stats.hit).toBeGreaterThanOrEqual(5);
  });
});

describe("fake guitar, chords", () => {
  const E5 = [40, 47, 52], A5 = [45, 52, 57], G5 = [43, 50, 55], G = [43, 47, 50, 55, 59, 67];
  const Am = [45, 52, 57, 60, 64], A = [45, 52, 57, 61, 64], C = [48, 52, 55, 60, 64];
  const chordChart = (cs) => cs.flatMap((c, i) => c.map((m) => ev(1 + i * 0.6, m)));
  const play = (cs) => cs.map((c, i) => ({ t: 1 + i * 0.6 + 0.01, chord: c }));

  it("hits chords played right", () => {
    const cs = [E5, A5, G, E5, Am, A, C, G5];
    const v = run(chordChart(cs), play(cs));
    expect(v.targets.map((g) => g.result)).toEqual(cs.map(() => true));
  });
  it("misses a single G2 when a full G chord is expected", () => {
    const v = run(chordChart([G]), [{ t: 1, midi: 43 }]);
    expect(v.stats.hit).toBe(0);
  });
  it("misses a G5 when an E5 is expected", () => {
    const v = run(chordChart([E5]), play([G5]));
    expect(v.stats.hit).toBe(0);
  });
  it.each([
    ["A major for A minor (one finger a fret up)", Am, A],
    ["A minor for A major (one finger a fret down)", A, Am],
    ["G with the B2 a fret up", G, [43, 48, 50, 55, 59, 67]],
    ["C with the root a fret down", C, [47, 52, 55, 60, 64]],
  ])("misses %s", (_, want, got) => {
    const v = run(chordChart([want]), play([got]));
    expect(v.stats.hit).toBe(0);
  });
});

describe("fake guitar, techniques", () => {
  it("hits a slide from fret 5 to 7", () => {
    const v = run([ev(1, 45, { f: 5, sl: 7 })], [{ t: 1, midi: 45, to: 47 }]);
    expect(v.stats.hit).toBe(1);
  });
  it("misses a slide that starts a fret too high", () => {
    const v = run([ev(1, 45, { f: 5, sl: 7 })], [{ t: 1, midi: 49, to: 51 }]);
    expect(v.stats.hit).toBe(0);
  });
  it("hits a bend up a whole step", () => {
    const v = run([ev(1, 57, { bn: 1 })], [{ t: 1, midi: 57, to: 59 }]);
    expect(v.stats.hit).toBe(1);
  });
  it("hits a palm-muted note, and misses one on another string", () => {
    const chart = [ev(1, 40, { pm: true }), ev(1.5, 40, { pm: true })];
    const v = run(chart, [{ t: 1, midi: 40, pm: true }, { t: 1.5, midi: 47, pm: true }]);
    expect(v.targets.map((g) => g.result)).toEqual([true, false]);
  });
  it("hits a muted chord with only the attack", () => {
    const v = run([ev(1, 40, { mt: true }), ev(1, 45, { mt: true })], [{ t: 1, midi: 40, pm: true }]);
    expect(v.stats.hit).toBe(1);
  });
});

describe("fake bass", () => {
  const BASS = { window: 4096, hop: 1024, minFreq: 28, maxFreq: 500, long: 16384 };
  const LINE = [28, 31, 33, 35, 36, 38, 40, 43];                       // Mi1 … Sol2
  const chart = LINE.map((m, i) => ev(1 + i * 0.4, m));
  it("hits a bass line played right", () => {
    const v = run(chart, LINE.map((m, i) => ({ t: 1 + i * 0.4 + 0.02, midi: m })), { preset: BASS });
    expect(v.stats.hit).toBeGreaterThanOrEqual(7);
  });
  it("misses it a fret sharp", () => {
    const v = run(chart, LINE.map((m, i) => ({ t: 1 + i * 0.4, midi: m + 1 })), { preset: BASS });
    expect(v.stats.hit).toBeLessThanOrEqual(1);
  });
});

describe("worklet cost", () => {
  it("analyses a guitar frame with ~60 expected frequencies in well under a render quantum (2.7 ms)", () => {
    const p = new Proc();
    p.port.onmessage({ data: { type: "config", ...GUITAR } });
    p.port.postMessage = () => {};
    p.port.onmessage({ data: { type: "expect", freqs: Array.from({ length: 60 }, (_, i) => 80 + i * 13.7) } });
    const buf = Float32Array.from({ length: Q }, (_, i) => 0.2 * Math.sin(i / 3));
    for (let k = 0; k < 200; k++) p.process([[buf]]);                // aquecer
    const t0 = performance.now(), N = 400;
    for (let k = 0; k < N; k++) p.analyse(k);
    const ms = (performance.now() - t0) / N;
    console.log("analyse: " + ms.toFixed(3) + " ms");
    expect(ms).toBeLessThan(1.5);
  });
});

