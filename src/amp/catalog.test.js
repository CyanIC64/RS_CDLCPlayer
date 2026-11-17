import { describe, expect, it } from "vitest";
import { FX, MODELS, CABS, GROUPS, makePedal, boardFromRig, asBoard, emptyBoard } from "./catalog.js";

describe("catalog", () => {
  it("has a kind of effect, a menu group and in-range defaults for every model", () => {
    for (const [id, m] of Object.entries(MODELS)) {
      expect(FX[m.fx], id).toBeTruthy();
      expect(GROUPS, id).toContain(m.group);
      expect(m.color, id).toMatch(/^#[0-9a-f]{6}$/i);
      for (const [k, v] of Object.entries(m.params)) {
        const kn = FX[m.fx].knobs.find((x) => x.k === k);
        expect(kn, `${id}.${k}`).toBeTruthy();
        expect(v).toBeGreaterThanOrEqual(kn.min);
        expect(v).toBeLessThanOrEqual(kn.max);
      }
    }
  });
  it("makes a pedal with every knob set, clamped", () => {
    const p = makePedal("delay", { time: 5000, mix: "0.2" });
    expect(Object.keys(p.params).sort()).toEqual(["feedback", "mix", "time", "tone"]);
    expect(p.params.time).toBe(1000);
    expect(p.params.mix).toBe(0.2);
    expect(p.on).toBe(true);
    expect(makePedal("nope")).toBeNull();
  });
  it("turns an old rig (no board) into a board", () => {
    const b = boardFromRig({ amp: "Amp_CA100", total: 0.9, low: 0.6, comp: 1, mod: 0.4, reverb: 0.3 });
    expect(b.amp.name).toBe("CA100");
    expect(b.amp.gain).toBe(0.9);
    expect(b.cab).toBe("4x12m");
    expect(b.pre.map((p) => p.model)).toEqual(["comp"]);
    expect(b.loop.map((p) => p.model)).toEqual(["chorus", "room"]);
    expect(CABS[b.cab]).toBeTruthy();
  });
  it("takes a board as it is", () => {
    const b = emptyBoard();
    expect(asBoard(b)).toBe(b);
    expect(asBoard({ board: b })).toBe(b);
    expect(asBoard(null, { bass: true }).cab).toBe("bass");
  });
});
