import { describe, expect, it } from "vitest";
import { buildTargets, Verifier } from "./verify.js";
import { midiToHz } from "./notes.js";

/* S.syn-like events: {t, n, m}; eventMidi is the identity on e.m here */
const note = (extra = {}) => ({ s: 0, f: 0, ho: false, po: false, tp: false, linked: false, mt: false, bn: 0, ...extra });
const ev = (t, m, extra) => ({ t, m, n: note(extra) });
const eventMidi = (e) => e.m;

/* feed a steady pitch for `dur` seconds starting at t0, one frame every 10 ms */
function feedPitch(v, t0, hz, dur = 0.1){
  for (let t = t0; t < t0 + dur; t += 0.01) v.frame(t, hz, 0.95, null, null);
}
/* feed chord frames whose presence covers the given note frequencies (and their harmonics) */
function feedChord(v, t0, freqs, playedHz, dur = 0.1){
  const presence = Float32Array.from(freqs, (f) => (playedHz.some((p) => [1, 2, 3].some((h) => Math.abs(p * h - f) < 1e-6)) ? 0.2 : 0));
  for (let t = t0; t < t0 + dur; t += 0.01) v.frame(t, 0, 0, freqs, presence);
}

describe("buildTargets", () => {
  it("groups events at the same time into a chord", () => {
    const g = buildTargets([ev(1, 40), ev(1, 47), ev(1, 52), ev(2, 45)], eventMidi);
    expect(g.map((x) => x.kind)).toEqual(["chord", "single"]);
    expect(g[0].notes).toHaveLength(3);
  });
  it("applies the cent offset to the target frequency", () => {
    const [g] = buildTargets([ev(1, 69)], eventMidi, -50);
    expect(g.notes[0].hz).toBeCloseTo(midiToHz(69, -50), 6);
  });
  it("marks muted and legato notes", () => {
    const g = buildTargets([ev(1, 40, { mt: true }), ev(2, 42, { ho: true })], eventMidi);
    expect(g[0].kind).toBe("muted");
    expect(g[1].legato).toBe(true);
  });
});

describe("Verifier", () => {
  const A2 = midiToHz(45);

  it("hits a single note played 30 ms late with the right pitch", () => {
    const v = new Verifier(buildTargets([ev(1, 45)], eventMidi));
    v.onset(1.03, 0.01);
    feedPitch(v, 1.04, A2);
    v.update(2);
    expect(v.targets[0].result).toBe(true);
    expect(v.targets[0].notes[0].n.hit).toBe(true);
    expect(v.stats).toMatchObject({ hit: 1, miss: 0, streak: 1 });
  });

  it("misses a note without an onset", () => {
    const v = new Verifier(buildTargets([ev(1, 45)], eventMidi));
    feedPitch(v, 1.0, A2);
    v.update(2);
    expect(v.targets[0].result).toBe(false);
  });

  it("misses a note a semitone off", () => {
    const v = new Verifier(buildTargets([ev(1, 45)], eventMidi));
    v.onset(1.0, 0.01);
    feedPitch(v, 1.01, midiToHz(46));
    v.update(2);
    expect(v.targets[0].result).toBe(false);
  });

  it("accepts a bent note up to the bend target", () => {
    const v = new Verifier(buildTargets([ev(1, 45, { bn: 2 })], eventMidi));
    v.onset(1.0, 0.01);
    feedPitch(v, 1.01, midiToHz(46.5));
    v.update(2);
    expect(v.targets[0].result).toBe(true);
  });

  it("hits a hammer-on without an onset", () => {
    const v = new Verifier(buildTargets([ev(1, 47, { ho: true })], eventMidi));
    feedPitch(v, 1.0, midiToHz(47));
    v.update(2);
    expect(v.targets[0].result).toBe(true);
  });

  it("hits a muted note on the onset alone", () => {
    const v = new Verifier(buildTargets([ev(1, 40, { mt: true })], eventMidi));
    v.onset(0.95, 0.01);
    v.update(2);
    expect(v.targets[0].result).toBe(true);
  });

  it("hits a chord with 4 of 6 notes present, misses with 3", () => {
    const midis = [40, 45, 50, 55, 59, 64];
    for (const [played, want] of [[4, true], [3, false]]){
      const v = new Verifier(buildTargets(midis.map((m) => ev(1, m)), eventMidi));
      const freqs = v.expected(1);
      const hz = v.targets[0].notes.map((x) => x.hz);
      v.onset(1.0, 0.01);
      feedChord(v, 1.01, freqs, hz.slice(0, played));
      v.update(2);
      expect(v.targets[0].result).toBe(want);
    }
  });

  it("does not resolve a target before its window has passed", () => {
    const v = new Verifier(buildTargets([ev(1, 45)], eventMidi));
    v.update(1.1);
    expect(v.targets[0].result).toBe(null);
  });

  it("seek reopens the targets after the new time", () => {
    const v = new Verifier(buildTargets([ev(1, 45), ev(2, 45)], eventMidi));
    v.update(3);
    expect(v.targets.map((g) => g.result)).toEqual([false, false]);
    v.seek(1.5);
    expect(v.targets.map((g) => g.result)).toEqual([false, null]);
  });
});
