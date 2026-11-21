/* Gravações reais do Real Tone Cable, 2.º lote (botão "Record 10 s" do afinador),
   em src/test-data. Cada ficheiro tem o nome do que foi tocado. Os testes de um
   ficheiro que não esteja na pasta são saltados. */
import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { midiToHz } from "./notes.js";
import { buildTargets, Verifier, probe } from "./verify.js";

const Q = 128, SR = 48000, LONG = 8192 / SR;
let Proc;
beforeAll(async () => {
  globalThis.sampleRate = SR; globalThis.currentTime = 0;
  globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage: null }; } };
  globalThis.registerProcessor = (_, C) => { Proc = C; };
  await import("./processor.entry.js");
});

const path = (name) => fileURLToPath(new URL("../test-data/" + name, import.meta.url));
const have = (name) => existsSync(path(name));
function readWav(name){
  const buf = readFileSync(path(name));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(40, true) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = dv.getInt16(44 + i * 2, true) / 32768;
  return x;
}

/* the recording through the real processor, measuring the presence of `midis` */
function listen(name, midis){
  const x = readWav(name), p = new Proc(), onsets = [], frames = [];
  p.port.onmessage({ data: { type: "config", window: 2048, hop: 512, minFreq: 70, maxFreq: 1400, long: 8192 } });
  p.port.onmessage({ data: { type: "expect", freqs: [...new Set(midis.flatMap((m) => probe(midiToHz(m))))] } });
  p.port.postMessage = (m) => (m.type === "onset" ? onsets : frames).push(m);
  for (let k = 0; (k + 1) * Q <= x.length; k++){
    globalThis.currentTime = k * Q / SR;
    p.process([[x.subarray(k * Q, (k + 1) * Q)]]);
  }
  return { onsets, frames };
}
/* one time per strike: a strike's onset can fire twice, 50 ms apart */
const strikes = ({ onsets }) => {
  const t = [];
  for (const o of onsets) if (o.time > 0.05 && (!t.length || o.time - t[t.length - 1] > 0.15)) t.push(o.time);
  return t;
};
const note = (extra) => ({ s: 0, f: 1, ho: false, po: false, tp: false, linked: false, mt: false, pm: false, bn: 0, sl: -1, slu: -1, ...extra });
/* the chart: seq[i] (a chord, as MIDI numbers) at times[i]; the verdict of each */
function judge(r, seq, times, extra){
  const chart = times.flatMap((t, i) => seq[i % seq.length].map((m) => ({ t, m, n: note(extra) })));
  const v = new Verifier(buildTargets(chart, (e) => e.m), { long: LONG });
  for (const o of r.onsets) v.onset(o.time, o.energy);
  for (const f of r.frames) v.frame(f.time, f.freq, f.clarity, f.freqs, f.presence, f.timeL);
  v.update(99);
  return v.targets.map((g) => g.result);
}
const hits = (res) => res.filter(Boolean).length;

describe("Real Tone Cable, single notes from D2 to E6", () => {
  /* the note played, and what must not pass for it: a semitone either side and the octave */
  const NOTES = [
    ["note-E2-open.wav", 40], ["note-D2-drop.wav", 38], ["note-E3-6str-12.wav", 52], ["note-E3-4str-2.wav", 52],
    ["note-E5-1str-12.wav", 76], ["note-E6-1str-24.wav", 88], ["note-A2-soft_note-A2-loud.wav", 45],
  ];
  for (const [file, m] of NOTES){
    it.skipIf(!have(file))(`${file}: ${m}, not ${m - 1}, ${m + 1} or ${m + 12}`, () => {
      const r = listen(file, [m, m - 1, m + 1, m + 12]), t = strikes(r);
      expect(t.length).toBeGreaterThan(0);
      expect(judge(r, [[m]], t)).toEqual(t.map(() => true));
      for (const w of [m - 1, m + 1, m + 12]) expect(judge(r, [[w]], t), "as " + w).toEqual(t.map(() => false));
    });
  }
});

describe("Real Tone Cable, open chords", () => {
  const C = {
    E: [40, 47, 52, 56, 59, 64], Em: [40, 47, 52, 55, 59, 64], G: [43, 47, 50, 55, 59, 67],
    D: [50, 57, 62, 66], Dm: [50, 57, 62, 65], C: [48, 52, 55, 60, 64], Am: [45, 52, 57, 60, 64],
  };
  /* a major and a minor chord differ in one note a semitone apart: the third */
  const CASES = [
    ["chord-E.wav", "E", ["Em", "Am", "G"]],
    ["chord-Em.wav", "Em", ["E", "G", "Am", "C"]],
    ["chord-d.wav", "D", ["Dm", "G", "C", "Am"]],
    ["chord-g.wav", "G", ["Em", "C", "D", "E"]],
  ];
  for (const [file, played, others] of CASES){
    it.skipIf(!have(file))(`${file} is ${played}, not ${others.join(", ")}`, () => {
      const r = listen(file, Object.values(C).flat()), t = strikes(r);
      expect(t.length).toBeGreaterThan(1);
      expect(judge(r, [C[played]], t)).toEqual(t.map(() => true));
      for (const o of others) expect(judge(r, [C[o]], t), "as " + o).toEqual(t.map(() => false));
    });
  }
  /* chord-Am.wav: the B string rang open (B3 strong, no C4), so it was not an Am */
  it.skipIf(!have("chord-Am.wav"))("chord-Am.wav: a B string left open is not an Am", () => {
    const r = listen("chord-Am.wav", [...C.Am, 59, 61]);
    expect(hits(judge(r, [C.Am], strikes(r)))).toBe(0);
  });
});

describe("Real Tone Cable, techniques", () => {
  /* E5 chugged with palm mute, 25 strikes: dull, the E2 almost without its fundamental,
     and the B2 sharp at each attack */
  it.skipIf(!have("pm-E5-chug.wav"))("pm-E5-chug.wav: the chugs are E5, never G5", () => {
    const E5 = [40, 47, 52], G5 = [43, 50, 55];
    const r = listen("pm-E5-chug.wav", [...E5, ...G5]), t = strikes(r);
    expect(t.length).toBe(25);
    expect(hits(judge(r, [E5], t, { pm: true }))).toBeGreaterThanOrEqual(23);
    expect(hits(judge(r, [G5], t, { pm: true }))).toBe(0);
  });
  /* the open strings one by one, each left ringing: the later strikes rise only
     2.5-3x in the onset detector's difference energy, and the MPM hears no clear
     pitch under them; the notes pass on their presence */
  it.skipIf(!have("note-A2-open_to_note-E4-open.wav"))("arpeggio over ringing strings: each strike heard, the strings told apart", () => {
    const seq = [40, 45, 50, 55, 59, 64];
    const r = listen("note-A2-open_to_note-E4-open.wav", [...seq, ...seq.map((m) => m + 1)]), t = strikes(r);
    const at = [2.05, 2.59, 3.19, 3.81, 4.41, 4.98];
    expect(t.length).toBe(6);
    t.forEach((x, i) => expect(x).toBeCloseTo(at[i], 1));
    expect(hits(judge(r, seq.map((m) => [m]), t))).toBeGreaterThanOrEqual(5);
    expect(hits(judge(r, seq.map((m) => [m + 1]), t))).toBe(0);
  });
  it.skipIf(!have("bend-3str-7-full.wav"))("bend-3str-7-full.wav: D4 bent a tone", () => {
    const r = listen("bend-3str-7-full.wav", [62, 63, 67]), t = strikes(r);
    expect(judge(r, [[62]], t, { f: 7, bn: 1 })).toEqual(t.map(() => true));
    expect(hits(judge(r, [[67]], t, { f: 7 }))).toBe(0);
  });
  it.skipIf(!have("bend-2str-8-half.wav"))("bend-2str-8-half.wav: G4 bent a semitone, twice", () => {
    const r = listen("bend-2str-8-half.wav", [67, 68, 62]), t = strikes(r);
    expect(judge(r, [[67]], t, { f: 8, bn: 0.5 })).toEqual([true, true]);
    expect(hits(judge(r, [[62]], t, { f: 8 }))).toBe(0);
  });
  it.skipIf(!have("slide-4str-5-7.wav"))("slide-4str-5-7.wav: G3 sliding to A3", () => {
    const r = listen("slide-4str-5-7.wav", [55, 56]), t = strikes(r);
    expect(judge(r, [[55]], t, { f: 5, sl: 7 })).toEqual([true]);
    expect(judge(r, [[56]], t, { f: 5 })).toEqual([false]);
  });
});

describe("Real Tone Cable, no notes", () => {
  const times = Array.from({ length: 23 }, (_, i) => +(0.5 + i * 0.4).toFixed(2));
  const OPEN = [[40], [45], [50], [55], [64]];
  it.skipIf(!have("noise-idle.wav"))("noise-idle.wav: the cable plugged in, nothing played: no onset, no note", () => {
    const r = listen("noise-idle.wav", OPEN.flat());
    expect(r.onsets.length).toBe(0);
    for (const s of OPEN) expect(hits(judge(r, [s], times))).toBe(0);
  });
  it.skipIf(!have("noise-handling.wav"))("noise-handling.wav: hands on the strings, nothing struck: no single note passes", () => {
    const r = listen("noise-handling.wav", OPEN.flat());
    for (const s of OPEN) expect(hits(judge(r, [s], times)), "as " + s).toBe(0);
  });
});
