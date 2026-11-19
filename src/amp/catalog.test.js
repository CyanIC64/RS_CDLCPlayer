import { describe, expect, it } from "vitest";
import { FX, MODELS, CABS, GROUPS, AMP_PARAMS, LIBRARY, paramsOf, makePedal, boardFromRig, asBoard, emptyBoard } from "./catalog.js";

describe("catalog", () => {
  it("has a kind of effect, a menu group and in-range defaults for every model", () => {
    for (const [id, m] of Object.entries(MODELS)) {
      expect(FX[m.fx], id).toBeTruthy();
      expect(GROUPS, id).toContain(m.group);
      expect(m.color, id).toMatch(/^#[0-9a-f]{6}$/i);
      for (const [k, v] of Object.entries(m.params)) {
        const kn = paramsOf(m.fx).find((x) => x.k === k);
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
    expect(b.loop.map((p) => p.model)).toEqual(["chorus"]);
    expect(b.rack.map((p) => p.model)).toEqual(["room"]);
    expect(CABS[b.cab]).toBeTruthy();
  });
  it("takes a board as it is", () => {
    const b = emptyBoard();
    expect(asBoard(b)).toBe(b);
    expect(asBoard({ board: b })).toBe(b);
    expect(asBoard(null, { bass: true }).cab).toBe("bass");
  });
});

describe("board sections (Rocksmith's tone designer)", () => {
  it("puts PrePedal in pre, PostPedal and LoopPedal in the loop, Rack after the cabinet", async () => {
    const { boardFromGear } = await import("./catalog.js");
    const b = boardFromGear({
      Rack2: { Key: "Rack_StudioHallReverb", KnobValues: {} }, PostPedal1: { Key: "Pedal_Chorus", KnobValues: {} },
      PrePedal1: { Key: "Pedal_Distortion", KnobValues: {} }, LoopPedal1: { Key: "Pedal_AnalogueDelay", KnobValues: {} },
      Rack1: { Key: "Rack_StudioCompressor", KnobValues: {} }, Amp: { Key: "Amp_MarshallJCM800", KnobValues: {} },
    });
    expect(b.pre.map((p) => p.model)).toEqual(["dist"]);
    expect(b.loop.map((p) => p.model)).toEqual(["echo", "chorus"]);
    expect(b.rack.map((p) => p.model)).toEqual(["comp", "plate"]);
    expect(b.cabOn).toBe(true);
  });
  it("reads a board saved before the rack: its loop ran after the cabinet, so it is the rack", () => {
    const old = { amp: { name: "X", gain: 0.5 }, cab: "4x12", pre: [], loop: [makePedal("room")] };
    const b = asBoard(old);
    expect(b.loop).toEqual([]);
    expect(b.rack.map((p) => p.model)).toEqual(["room"]);
    expect(asBoard(b)).toBe(b);
    expect(asBoard(b).rack.length).toBe(1);
  });
});

describe("faces of real gear", () => {
  const faced = Object.values(LIBRARY).filter((e) => e.face);
  it("gives most amps and pedals a face", () => {
    expect(faced.filter((e) => e.type === "amp").length).toBeGreaterThan(90);
    expect(faced.filter((e) => e.type !== "amp").length).toBeGreaterThan(70);
  });
  it("wires every control to a setting the sound has, in its range", () => {
    for (const e of faced) {
      const params = e.type === "amp" ? AMP_PARAMS : paramsOf(MODELS[e.model] && MODELS[e.model].fx);
      expect(e.face.controls.length, e.key).toBeGreaterThan(0);
      for (const c of e.face.controls) {
        expect(["knob", "slider", "switch", "treadle"], `${e.key} ${c.label}`).toContain(c.type);
        if (c.param === "master" && e.type === "amp") continue;
        const kn = params.find((x) => x.k === c.param);
        expect(kn, `${e.key} ${c.label} -> ${c.param}`).toBeTruthy();
        for (const [, v] of c.options || []) { expect(v).toBeGreaterThanOrEqual(kn.min); expect(v).toBeLessThanOrEqual(kn.max); }
        if (Number.isFinite(c.min)) expect(c.min).toBeGreaterThanOrEqual(kn.min);
        if (Number.isFinite(c.max)) expect(c.max).toBeLessThanOrEqual(kn.max);
      }
      if (e.face.bands) {
        expect(e.face.bands.length).toBeLessThanOrEqual(10);
        expect(e.face.controls.filter((c) => /^g\d$/.test(c.param)).length, e.key).toBe(e.face.bands.length);
      }
    }
  });
  it("makes a flanger with its manual (an extra setting) and leaves the others out", () => {
    expect(makePedal("flanger").params.manual).toBe(2);
    expect(makePedal("od").params.bass).toBeUndefined();
    expect(makePedal("od", { bass: 40 }).params.bass).toBe(12);
  });
});
