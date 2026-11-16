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

/* uma corda dedilhada: harmónicos que decaem, os agudos mais depressa */
function string(hz, t0, gain = 0.25){
  const amps = [1, 0.6, 0.4, 0.25, 0.15];
  return (t) => {
    const d = t - t0;
    if (d < 0 || d > 3) return 0;
    let s = 0;
    for (let h = 0; h < amps.length; h++)
      s += amps[h] * Math.exp(-d * (1.5 + h)) * Math.sin(2 * Math.PI * hz * (h + 1) * d);
    return gain * s * Math.min(1, d / 0.002);
  };
}

/**
 * Toca `played` (eventos {t, midi} ou {t, chord:[midi]}) e verifica contra `chart`.
 * Cada corda abafa a anterior da mesma "mão" quando `mute` está ligado.
 */
function run(chart, played, { mute = true, preset = { window: 2048, hop: 512, minFreq: 70, maxFreq: 1400 }, noise = 0.002 } = {}){
  const v = new Verifier(buildTargets(chart, (e) => e.m));
  const p = new Proc();
  p.port.onmessage({ data: { type: "config", ...preset } });
  p.port.postMessage = (m) => {
    if (m.type === "onset") v.onset(m.time, m.energy);
    else v.frame(m.time, m.freq, m.clarity, m.freqs, m.presence);
  };
  const voices = [];
  for (const x of played){
    const ms = x.chord || [x.midi];
    if (mute) for (const vc of voices) if (!vc.end) vc.end = x.t;
    for (const m of ms) voices.push({ f: string(midiToHz(m), x.t), end: 0 });
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
  const E5 = [40, 47, 52], A5 = [45, 52, 57], G = [43, 47, 50, 55, 59, 67];
  const chordChart = (cs) => cs.flatMap((c, i) => c.map((m) => ev(1 + i * 0.6, m)));

  it("hits chords played right", () => {
    const cs = [E5, A5, G, E5];
    const v = run(chordChart(cs), cs.map((c, i) => ({ t: 1 + i * 0.6 + 0.01, chord: c })));
    expect(v.stats.hit).toBe(4);
  });
  /* Uma nota sozinha onde se espera um acorde ainda passa quando os harmónicos dela
     caem nas outras notas (G2 cobre G3, D3 e G4 de um acorde de Sol). Fica para a
     fase 4: o veto do vizinho com uma janela Goertzel mais longa. */
  it.todo("misses a single G2 when a full G chord is expected (phase 4)");
  /* O mesmo para acordes graves vizinhos: um G5 (G2 D3 G3) ainda passa por E5
     (E2 B2 E3), porque a 23 Hz de resolução E2/G2 e B2/D3 se misturam. */
  it.todo("misses a G5 when an E5 is expected (phase 4)");
});
