/* Gravações reais do Real Tone Cable (botão "Record 5 s" do afinador), em src/test-data. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McLeodDetector } from "./mpm.js";
import { hzToMidi } from "./notes.js";

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
});
