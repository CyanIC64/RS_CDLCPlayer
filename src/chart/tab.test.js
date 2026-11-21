import { describe, expect, it } from "vitest";
import { beatPos, tabValue, measures, tabEvents, xAt } from "./tab.js";

/* a beat grid at 120 bpm in 4/4: a downbeat (measure >= 0) every fourth beat */
const grid = (n) => Array.from({ length: n }, (_, i) => ({ time: i*0.5, measure: i % 4 ? -1 : i/4 + 1 }));

describe("beatPos", () => {
  it("counts beats on the grid, and two a second without one", () => {
    const B = grid(16);
    expect(beatPos(B, 0)).toBe(0);
    expect(beatPos(B, 1.25)).toBeCloseTo(2.5);
    expect(beatPos([], 3)).toBe(6);
  });
});

describe("tabValue", () => {
  it("rounds a length in beats to a note value", () => {
    expect(tabValue(1)[0]).toBe(1);                       // a quarter
    expect(tabValue(0.48)[0]).toBe(0.5);                  // an eighth
    expect(tabValue(1/3)).toEqual([1/3, 1, true, false]); // a triplet eighth
    expect(tabValue(1.5)[3]).toBe(true);                  // dotted
  });
});

describe("measures", () => {
  it("cuts the song into bars from downbeat to downbeat", () => {
    const bars = measures(grid(12), 5.5);
    expect(bars.map((b) => [b.t0, b.t1, b.num])).toEqual([[0, 2, 1], [2, 4, 2], [4, 6, 3]]);
  });
  it("adds a pick-up bar for notes before the first downbeat", () => {
    const B = grid(12).map((b) => ({ ...b, time: b.time + 1 }));
    const bars = measures(B, 6, 0.4);
    expect(bars[0].t0).toBeCloseTo(0.35);
    expect(bars[0]).toMatchObject({ t1: 1, num: 0 });
  });
  it("makes two-second bars without a beat grid", () => {
    expect(measures([], 5).length).toBe(3);
  });
});

describe("tabEvents", () => {
  it("groups notes by time and writes a repeated chord out", () => {
    const n = (t, s, f) => ({ t, s, f, sus: 0 });
    const notes = [n(1, 1, 3), n(1, 0, 3), n(2, 2, 5)];
    const chords = [{ t: 1, name: "G5", notes: [notes[0], notes[1]] }, { t: 3, name: "G5", rep: true, notes: [] }];
    const evs = tabEvents(notes, chords);
    expect(evs.map((e) => [e.t, e.notes.map((x) => x.s), e.name])).toEqual([[1, [0, 1], "G5"], [2, [2], ""], [3, [0, 1], ""]]);
    expect(evs[2].notes[0].t).toBe(3);
  });
});

describe("xAt", () => {
  it("interpolates between a bar's knots", () => {
    const b = { knots: [[0, 10], [1, 30], [2, 50]] };
    expect(xAt(b, -1)).toBe(10);
    expect(xAt(b, 0.5)).toBe(20);
    expect(xAt(b, 9)).toBe(50);
  });
});
