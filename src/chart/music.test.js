import { describe, expect, it } from "vitest";
import { tuningText, chordLabel } from "./music.js";

describe("tuningText", () => {
  it("names standard, drop and open tunings", () => {
    expect(tuningText({ tuning: [0, 0, 0, 0, 0, 0] })).toEqual({ name: "E Standard", notes: "E A D G B E", capo: "" });
    expect(tuningText({ tuning: [-1, -1, -1, -1, -1, -1] }).name).toBe("E♭ Standard");
    expect(tuningText({ tuning: [-2, 0, 0, 0, 0, 0] }).name).toBe("Drop D");
    expect(tuningText({ tuning: [-2, 0, 0, 0, -2, -2] }).name).toBe("DADGAD");
    expect(tuningText({ tuning: [0, 0, 0, 0, 0, 3] }).name).toBe("Custom tuning");
  });
  it("reads a missing tuning as standard, and knows the bass and the capo", () => {
    expect(tuningText({}).name).toBe("E Standard");
    expect(tuningText({ tuning: [-2, 0, 0, 0] }, 4)).toEqual({ name: "Drop D", notes: "D A D G", capo: "" });
    expect(tuningText({ tuning: [] }, 6, 2).capo).toBe("Capo 2");
  });
});

describe("chordLabel", () => {
  it("prints flats and sharps", () => {
    expect(chordLabel(" Bb/F# ")).toBe("B♭/F♯");
    expect(chordLabel("Ebm7")).toBe("E♭m7");
    expect(chordLabel("Cmaj7b5")).toBe("Cmaj7b5");      // only a note name's b is a flat
    expect(chordLabel(null)).toBe("");
  });
});
