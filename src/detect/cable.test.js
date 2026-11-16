/* Gravações reais do Real Tone Cable (botão "Record 5 s" do afinador), em src/test-data. */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McLeodDetector } from "./mpm.js";
import { hzToMidi, midiToHz } from "./notes.js";
import { buildTargets, Verifier, probe } from "./verify.js";

const Q = 128;
let Proc;
beforeAll(async () => {
  globalThis.sampleRate = 48000; globalThis.currentTime = 0;
  globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage: null }; } };
  globalThis.registerProcessor = (_, C) => { Proc = C; };
  await import("./processor.entry.js");
});

/* a gravação pelo processor verdadeiro, a medir a presença de `midis`; devolve onsets e frames */
function process({ x }, midis){
  const p = new Proc(), onsets = [], frames = [];
  p.port.onmessage({ data: { type: "config", window: 2048, hop: 512, minFreq: 70, maxFreq: 1400, long: 8192 } });
  p.port.onmessage({ data: { type: "expect", freqs: [...new Set(midis.flatMap((m) => probe(midiToHz(m))))] } });
  p.port.postMessage = (m) => (m.type === "onset" ? onsets : frames).push(m);
  for (let k = 0; (k + 1) * Q <= x.length; k++){
    globalThis.currentTime = k * Q / 48000;
    p.process([[x.subarray(k * Q, (k + 1) * Q)]]);
  }
  return { onsets, frames };
}

/* os acordes `chord` nos instantes `times`, verificados contra o que a gravação deu */
function verify({ onsets, frames }, chord, times){
  const chart = times.flatMap((t) => chord.map((m) => ({ t, m, n: { f: 0 } })));
  const v = new Verifier(buildTargets(chart, (e) => e.m), { long: 8192 / 48000 });
  for (const o of onsets) v.onset(o.time, o.energy);
  for (const f of frames) v.frame(f.time, f.freq, f.clarity, f.freqs, f.presence, f.timeL);
  v.update(99);
  return v.targets.map((g) => g.result);
}

function readWav(name){
  const buf = readFileSync(fileURLToPath(new URL("../test-data/" + name, import.meta.url)));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sr = dv.getUint32(24, true), n = dv.getUint32(40, true) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = dv.getInt16(44 + i * 2, true) / 32768;
  return { sr, x };
}

/* as notas que o MPM ouve de forma estável (4 frames seguidos), pela ordem em que aparecem */
function stableNotes({ sr, x }, N = 2048, hop = 512){
  const det = new McLeodDetector(N, sr, 70, 1400), out = { freq: 0, clarity: 0 };
  const notes = [];
  let last = -1, run = 0;
  for (let p = 0; p + N <= x.length; p += hop){
    const fr = x.subarray(p, p + N);
    let rms = 0; for (const s of fr) rms += s * s;
    rms = Math.sqrt(rms / N);
    const m = rms > 0.01 && det.detect(fr, out) && out.clarity >= 0.9 ? Math.round(hzToMidi(out.freq)) : -1;
    run = m === last ? run + 1 : 1; last = m;
    if (m >= 0 && run === 4 && notes[notes.length - 1] !== m) notes.push(m);
  }
  return notes;
}

describe("Real Tone Cable recordings", () => {
  it("g3-open-cable.wav: the open strings E2, A2, D3, G3 struck in turn", () => {
    // entre cordas, quando uma é abafada, ouve-se por instantes o Mi grave que ainda soa:
    // basta que as quatro apareçam por ordem, e o G3 nunca como D3
    const got = stableNotes(readWav("g3-open-cable.wav"));
    let k = 0;
    for (const m of got) if (m === [40, 45, 50, 55][k]) k++;
    expect(k, String(got)).toBe(4);
    expect(got.filter((m) => ![40, 45, 50, 55].includes(m)), String(got)).toEqual([]);
  });

  it("onsets: each string struck in g3-open-cable.wav is heard", () => {
    const { onsets } = process(readWav("g3-open-cable.wav"), []);
    for (const t of [1.81, 2.73, 3.59, 4.37])                       // where the envelope jumps
      expect(onsets.some((o) => Math.abs(o.time - t) < 0.05), "onset near " + t + ": " + onsets.map((o) => o.time.toFixed(2))).toBe(true);
  });

  /* Power chords pelo cabo: E5 (E2 B2 E3) tocado uma vez, G5 (G2 D3 G3) duas.
     O ataque sobe de forma gradual (~5 dB por 20 ms), e o E2 chega quase sem
     fundamental: o E5 passa com 2 das 3 notas. */
  const E5 = [40, 47, 52], G5 = [43, 50, 55];
  it("chord-E5.wav is an E5 and not a G5", () => {
    const r = process(readWav("chord-E5.wav"), [...E5, ...G5]);
    expect(verify(r, E5, [2.30])).toEqual([true]);
    expect(verify(r, G5, [2.30])).toEqual([false]);
  });
  it("chord-G5.wav is a G5 twice and never an E5", () => {
    const r = process(readWav("chord-G5.wav"), [...E5, ...G5]);
    expect(verify(r, G5, [2.11, 4.55])).toEqual([true, true]);
    expect(verify(r, E5, [2.11, 4.55])).toEqual([false, false]);
  });
});
