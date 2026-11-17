import { describe, expect, it } from "vitest";
import { describeGear, applyKnobs, gearEntry, knobName, LIBRARY } from "./gear.js";
import { MODELS, CABS, VOICES, boardFromGear } from "./catalog.js";
import { pretty } from "./make-gear.mjs";

describe("gear library", () => {
  it("has a playable model or cabinet for every piece in it", () => {
    expect(Object.keys(LIBRARY).length).toBeGreaterThan(0);
    for (const [key, e] of Object.entries(LIBRARY)) {
      expect(e.key, key).toBe(key);
      expect(["amp", "cabinet", "pedal", "rack"], key).toContain(e.type);
      if (e.type === "cabinet") expect(CABS[e.cab], key).toBeTruthy();
      if (e.type === "pedal" || e.type === "rack") expect(e.model === "" || !!MODELS[e.model], key).toBe(true);
      for (const [name, m] of Object.entries(e.knobs || {})) {
        expect(Array.isArray(m.from), `${key}.${name}`).toBe(true);
        if (m.param) expect(Array.isArray(m.to), `${key}.${name}`).toBe(true);
      }
    }
  });
  it("names knobs by what follows the gear's key", () => {
    expect(knobName("Amp_CA100", "Amp_CA100_Pres")).toBe("Pres");
    expect(knobName("Rack_StudioGraphicEQ", "Rack_StudioGraphicEQ_LoMidFreq")).toBe("LoMidFreq");
    expect(knobName("X", "Other_Thing_Mix")).toBe("Mix");
  });
  it("describes an amp: 0..100 EQ knobs as dB, the first presence knob wins", () => {
    const e = describeGear("amp", "Amp_EN30", { Gain: [66, 66], Pres: [45, 45], Bright: [1, 1], Treble: [95, 95] });
    expect(e.knobs.Gain).toEqual({ param: "gain", from: [0, 100], to: [0, 1] });
    expect(e.knobs.Pres.param).toBe("presence");
    expect(e.knobs.Bright.param).toBeNull();
    expect(applyKnobs(e, { Amp_EN30_Treble: 95, Amp_EN30_Gain: 66 })).toEqual({ treble: 10.8, gain: 0.66 });
  });
  it("describes dB gear and a compressor rack", () => {
    const eq = describeGear("rack", "Rack_StudioGraphicEQ", { Treble: [-6, -6], Mid: [3, 3], BassFreq: [120, 120] });
    expect(eq.model).toBe("eq");
    expect(eq.knobs.Mid).toEqual({ param: "mid", from: [-12, 12], to: [-12, 12] });
    expect(eq.knobs.BassFreq.param).toBeNull();
    const c = describeGear("rack", "Rack_StudioCompressor", { Threshold: [-22.5, -22.5] }, { category: "Dynamics" });
    expect(applyKnobs(c, { Rack_StudioCompressor_Threshold: -22.5 })).toEqual({ threshold: -22.5 });
  });
  it("bends a knob with a curve and clamps it", () => {
    const e = { key: "P", knobs: { Rate: { param: "rate", from: [0, 100], to: [0, 8], curve: 2 } } };
    expect(applyKnobs(e, { P_Rate: 50 })).toEqual({ rate: 2 });
    expect(applyKnobs(e, { P_Rate: 500 })).toEqual({ rate: 8 });
  });
  it("uses the library's entry over the rules", () => {
    const key = Object.keys(LIBRARY).find((k) => LIBRARY[k].type === "cabinet");
    expect(gearEntry("Cabinet", { Key: key })).toBe(LIBRARY[key]);
    expect(gearEntry("PrePedal1", { Key: "Pedal_NotInTheLibrary_Chorus", KnobValues: {} }).model).toBe("chorus");
  });
  it("builds a board from the library: the bass tone of the sample song", () => {
    const b = boardFromGear({
      Rack1: { Key: "Rack_StudioGraphicEQ", KnobValues: { Rack_StudioGraphicEQ_Treble: -6, Rack_StudioGraphicEQ_Bass: -4, Rack_StudioGraphicEQ_Mid: 3 } },
      Amp: { Key: "Bass_Amp_BT880B", KnobValues: { Bass_Amp_BT880B_Gain: 1, Bass_Amp_BT880B_Treble: -6, Bass_Amp_BT880B_Mid: 8 } },
      Cabinet: { Key: "Bass_Cab_BT212BC_Tube_Cone" },
      PostPedal1: { Key: "Bass_Pedal_MBComp", KnobValues: { Bass_Pedal_MBComp_Compress: 75 } },
    }, { kind: "clean" });
    expect(b.amp).toMatchObject({ name: "BT880B", bassAmp: true, treble: -6, mid: 8 });
    expect(b.cab).toBe("bass");
    expect(b.loop.map((p) => p.model)).toEqual(["eq", "comp"]);
    expect(b.loop[0].params).toMatchObject({ treble: -6, bass: -4, mid: 3 });
    expect(b.loop[1].params.threshold).toBe(-40);
  });
  it("writes one line per knob", () => {
    const txt = pretty({ key: "K", knobs: { Mix: { param: "mix", from: [0, 100], to: [0, 1] } } });
    expect(txt).toContain('"Mix": { "param": "mix", "from": [0, 100], "to": [0, 1] }');
    expect(JSON.parse(txt).knobs.Mix.to).toEqual([0, 1]);
  });
});

describe("gear from the RS-to-AT5p map", () => {
  it("links an amp by its key to what it really is, its voice and its cabinet", () => {
    const b = boardFromGear({ Amp: { Key: "Amp_MarshallJCM800", KnobValues: { Amp_MarshallJCM800_Gain: 70, Amp_MarshallJCM800_Treble: 60 } } });
    expect(b.amp).toMatchObject({ voice: "jcm", real: "Marshall JCM 800", gain: 0.7, treble: 2.4 });
    expect(b.cab).toBe("4x12j");
    expect(boardFromGear({ Amp: { Key: "Amp_TW22", KnobValues: {} } }).amp.voice).toBe("tweed");
    expect(boardFromGear({ Amp: { Key: "Amp_CA100", KnobValues: {} } }).cab).toBe("4x12m");
  });
  it("links a cabinet key with its microphone to the enclosure, and keeps the microphone", () => {
    const b = boardFromGear({ Amp: { Key: "Amp_CA100", KnobValues: {} }, Cabinet: { Key: "Cab_EN4120C_Ribbon_Edge" } });
    expect(b.cab).toBe("4x12o");
    expect(b.mic).toBe("Ribbon_Edge");
    expect(b.cabGear).toBe("Cab_EN4120C_Ribbon_Edge");
    expect(gearEntry("Cabinet", { Key: "Cab_TW410C_57_Edge" }).key).toBe("Cab_TW410C");
  });
  it("gives a pedal its own colour, and the tone's knobs over it", () => {
    const b = boardFromGear({ Amp: { Key: "Amp_TW22", KnobValues: {} },
                              PrePedal1: { Key: "Pedal_RangeBooster", KnobValues: { Pedal_RangeBooster_Gain: 80 } } });
    expect(b.pre[0]).toMatchObject({ model: "boost", real: "Treble Booster" });
    expect(b.pre[0].params).toMatchObject({ gain: 0.8, tone: 0.95 });
  });
  it("turns the gain for the author's label in the voice's terms", () => {
    /* a Rectifier labelled clean: as clean as it gets, not the knob's 0.3 */
    const clean = boardFromGear({ Amp: { Key: "Amp_CA100", KnobValues: { Amp_CA100_Gain: 90 } } }, { kind: "clean" });
    expect(clean.amp.gain).toBeCloseTo((0.3 - 0.12) / 0.88, 2);
    /* a Deluxe Reverb labelled distortion: flat out */
    expect(boardFromGear({ Amp: { Key: "Amp_AT20", KnobValues: { Amp_AT20_Gain: 30 } } }, { kind: "distortion" }).amp.gain).toBe(1);
  });
  it("has an entry for every amp, effect and cabinet family of the map", () => {
    const types = Object.values(LIBRARY).reduce((n, e) => ({ ...n, [e.type]: (n[e.type] || 0) + 1 }), {});
    expect(types.amp).toBeGreaterThanOrEqual(100);
    expect((types.pedal || 0) + (types.rack || 0)).toBeGreaterThanOrEqual(87);
    expect(types.cabinet).toBeGreaterThanOrEqual(100);
    for (const e of Object.values(LIBRARY)) if (e.type === "amp" && e.source) expect(VOICES[e.voice], e.key).toBeTruthy();
  });
});
