import { describe, expect, it } from "vitest";
import { McLeodDetector } from "./mpm.js";

const SR = 48000;
const pluck = (n, hz, amps = [1, 0.6, 0.4, 0.25, 0.15]) => Float32Array.from({ length: n }, (_, i) =>
  0.3 * amps.reduce((s, a, h) => s + a * Math.sin(2 * Math.PI * hz * (h + 1) * i / SR), 0));
const cents = (a, b) => 1200 * Math.log2(a / b);

describe("guitar preset", () => {
  const det = new McLeodDetector(2048, SR, 70, 1400), out = { freq: 0, clarity: 0 };
  it.each([["E2", 82.41], ["A2", 110], ["G3", 196], ["E4", 329.63], ["E6", 1318.51]])("%s", (_, hz) => {
    expect(det.detect(pluck(2048, hz), out)).toBe(true);
    expect(Math.abs(cents(out.freq, hz))).toBeLessThan(3);
  });
  it("silence → nothing", () => expect(det.detect(new Float32Array(2048), out)).toBe(false));
});

describe("bass preset", () => {
  const det = new McLeodDetector(4096, SR, 28, 500), out = { freq: 0, clarity: 0 };
  it.each([["B0 (drop)", 30.87], ["E1", 41.2], ["A1", 55], ["G2", 98]])("%s", (_, hz) => {
    expect(det.detect(pluck(4096, hz), out)).toBe(true);
    expect(Math.abs(cents(out.freq, hz))).toBeLessThan(5);
  });
});
