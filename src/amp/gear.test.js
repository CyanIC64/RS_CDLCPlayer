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
    expect(e.knobs.Bright).toEqual({ param: "bright", from: [0, 1], to: [0, 6] });
    expect(applyKnobs(e, { Amp_EN30_Treble: 95, Amp_EN30_Gain: 66, Amp_EN30_Bright: 1 })).toEqual({ treble: 10.8, gain: 0.66, bright: 6 });
  });
  it("describes dB gear and a compressor rack", () => {
    const eq = describeGear("rack", "Rack_StudioGraphicEQ", { Treble: [-6, -6], Mid: [3, 3], BassFreq: [120, 120] });
    expect(eq.model).toBe("eq");
    expect(eq.knobs.Mid).toEqual({ param: "mid", from: [-12, 12], to: [-12, 12] });
    expect(eq.knobs.BassFreq).toEqual({ param: "bassFreq", from: [0, 20000], to: [0, 20000] });
    const c = describeGear("rack", "Rack_StudioCompressor", { Threshold: [-22.5, -22.5] }, { category: "Dynamics" });
    expect(applyKnobs(c, { Rack_StudioCompressor_Threshold: -22.5 })).toEqual({ threshold: -22.5 });
  });
  it("applies a song's whole EQ: five studio bands with their frequencies, a bass head's own bands", () => {
    /* the values of a real tone (No Need to Explain, bass) */
    const rack = LIBRARY.Rack_StudioGraphicEQ, K = (p, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}_${k}`, v]));
    expect(applyKnobs(rack, K("Rack_StudioGraphicEQ", { Treble: -6, MidFreq: 0.6, HiMid: 0, Bass: -4, TrebleFreq: 5.2,
      HiMidFreq: 1.8, LoMidFreq: 800, BassFreq: 120, Mid: 3, LoMid: 0 }))).toEqual({ bass: -4, bassFreq: 120, lomid: 0, lomidFreq: 800,
      mid: 3, midFreq: 600, himid: 0, himidFreq: 1800, treble: -6, trebleFreq: 5200 });
    const amp = applyKnobs(LIBRARY.Bass_Amp_BT880B, K("Bass_Amp_BT880B", { Treble: -6, Bass: 3, LoFreq: 130, Mid: 8, Lo: -3, Hi: -2, HiFreq: 3, MidFreq: 820 }));
    expect(amp).toEqual({ treble: -6, bass: 3, mid: 8, lo: -3, loFreq: 130, hi: -2, hiFreq: 3000, midFreq: 820 });
  });
  it("reads a graphic EQ by its knobs' frequencies, and a rack's rate in Hz", () => {
    /* Wherever I May Roam: an 8-band EQ in the loop, a chorus and a chamber in the rack */
    const gl = {
      Amp: { Key: "Amp_HG180", KnobValues: { Amp_HG180_Gain: 100 } },
      PostPedal1: { Key: "Pedal_EQ8", KnobValues: { Pedal_EQ8_50: 0, Pedal_EQ8_100: 1, Pedal_EQ8_200: -4, Pedal_EQ8_400: -2, Pedal_EQ8_800: -11,
                                                    Pedal_EQ8_1600: -3, Pedal_EQ8_3200: 1, Pedal_EQ8_6400: 5.5 } },
      PostPedal2: { Key: "Bass_Pedal_BassEQ8", KnobValues: { Bass_Pedal_BassEQ8_16000: -11, Bass_Pedal_BassEQ8_30: 1, Bass_Pedal_BassEQ8_185: 8 } },
      Rack1: { Key: "Rack_StudioChorus", KnobValues: { Rack_StudioChorus_Rate: 0.8, Rack_StudioChorus_Depth: 95, Rack_StudioChorus_Mix: 23,
               Rack_StudioChorus_Delay: 23, Rack_StudioChorus_LoFilter: 34, Rack_StudioChorus_HiFilter: 12, Rack_StudioChorus_Stereo: 46 } },
      Rack2: { Key: "Rack_StudioChamber", KnobValues: { Rack_StudioChamber_Mix: 45, Rack_StudioChamber_Tone: 32, Rack_StudioChamber_Time: 50,
               Rack_StudioChamber_Depth: 80 } },
      Rack3: { Key: "Rack_StudioEQ", KnobValues: { Rack_StudioEQ_LoMid: -2.5, Rack_StudioEQ_LoMidQ: 1, Rack_StudioEQ_HiMidQ: 0 } },
      PostPedal3: { Key: "Bass_Pedal_MBComp", KnobValues: { Bass_Pedal_MBComp_Filter: 280, Bass_Pedal_MBComp_Compress: 40, Bass_Pedal_MBComp_Rate: 83 } },
    };
    const b = boardFromGear(gl);
    expect(b.loop[0].bands).toEqual([50, 100, 200, 400, 800, 1600, 3200, 6400]);
    expect(b.loop[0].params).toMatchObject({ g0: 0, g1: 1, g2: -4, g4: -11, g7: 5.5 });
    expect(b.loop[1].model).toBe("eq");
    expect(b.loop[1].bands).toEqual([30, 75, 185, 460, 1100, 2700, 6800, 16000]);   // the library knows all eight
    expect(b.loop[1].params).toMatchObject({ g0: 1, g2: 8, g7: -11 });
    expect(b.rack[0].params).toMatchObject({ rate: 0.8, depth: 0.95, mix: 0.23, manual: 4.22, loCut: 133.288, hiCut: 17720, stereo: 0.46 });
    expect(b.rack[1].params).toMatchObject({ mix: 0.45, tone: 0.32, decay: 3.15, predelay: 64 });
    expect(b.rack[2].params).toMatchObject({ lomid: -2.5, lomidQ: 2, himidQ: 0.7 });
    expect(b.loop[2].params).toMatchObject({ split: 280, threshold: -26, release: 186.6 });
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
    expect(b.rack.map((p) => p.model)).toEqual(["eq"]);           // Rack1: after the cabinet
    expect(b.loop.map((p) => p.model)).toEqual(["comp"]);         // PostPedal1: the effects loop
    expect(b.rack[0].params).toMatchObject({ treble: -6, bass: -4, mid: 3 });
    expect(b.loop[0].params.threshold).toBe(-40);
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
