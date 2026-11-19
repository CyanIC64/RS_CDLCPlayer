import { describe, expect, it } from "vitest";
import { toneRig } from "./rig.js";

const tone = (gear, descriptors = []) => ({ Key: "t", ToneDescriptors: descriptors, GearList: gear });
const amp = (key, knobs) => ({ Key: key, KnobValues: knobs });

describe("toneRig", () => {
  it("calls a high-gain amp a distortion tone", () => {
    const r = toneRig(tone({ Amp: amp("Amp_CA100", { Amp_CA100_Gain: 100, Amp_CA100_Treble: 90 }) }));
    expect(r.kind).toBe("distortion");
    expect(r.rig.gain).toBe(1);
    expect(r.rig.high).toBe(0.9);
  });
  it("calls a mid-gain amp with an octave pedal a crunch tone", () => {
    const r = toneRig(tone({
      Amp: amp("Amp_EN30", { Amp_EN30_Gain: 66 }),
      PrePedal1: { Key: "Pedal_OctaveUp", Category: "Pitch", KnobValues: { Pedal_OctaveUp_Mix: 66 } },
    }, ["$[35751]MULTI-EFFECT"]));
    expect(r.kind).toBe("crunch");
    expect(r.rig.octave).toBe(0.66);
  });
  it("calls a low-gain amp clean, and a drive pedal pushes it up", () => {
    const clean = { Amp: amp("Amp_TW40", { Amp_TW40_Gain: 20 }) };
    expect(toneRig(tone(clean)).kind).toBe("clean");
    const pushed = { ...clean, PrePedal1: { Key: "Pedal_TubeDriver", KnobValues: { Pedal_TubeDriver_Drive: 90 } } };
    expect(toneRig(tone(pushed)).kind).not.toBe("clean");
  });
  it("follows the author's descriptor over the knobs", () => {
    const r = toneRig(tone({ Amp: amp("Amp_CA100", { Amp_CA100_Gain: 90 }) }, ["$[35720]CLEAN"]));
    expect(r.kind).toBe("clean");
    expect(r.rig.total).toBeLessThanOrEqual(0.3);
  });
  it("reads EQ knobs in dB on a bass amp", () => {
    const r = toneRig(tone({ Amp: amp("Bass_Amp_BT880B", { Bass_Amp_BT880B_Gain: 1, Bass_Amp_BT880B_Treble: -6, Bass_Amp_BT880B_Mid: 8 }) }), { bass: true });
    expect(r.kind).toBe("clean");
    expect(r.rig.bass).toBe(true);
    expect(r.rig.high).toBe(0.25);
    expect(r.rig.mid).toBeCloseTo(0.833, 2);
  });
});

describe("toneRig board", () => {
  const ca100 = amp("Amp_CA100", { Amp_CA100_Gain: 100, Amp_CA100_Bass: 60, Amp_CA100_Mid: 35, Amp_CA100_Treble: 90, Amp_CA100_Pres: 30 });
  it("puts racks after the amp and pre pedals before it, in slot order", () => {
    const { rig } = toneRig(tone({
      Rack1: { Key: "Rack_StudioCompressor", Category: "Dynamics",
               KnobValues: { Rack_StudioCompressor_Threshold: -22.5, Rack_StudioCompressor_Ratio: 2, Rack_StudioCompressor_Attack: 75, Rack_StudioCompressor_Release: 170 } },
      Amp: ca100,
      Cabinet: { Key: "Cab_HG2120C_Condenser_Cone" },
      PrePedal2: { Key: "Pedal_Chorus", KnobValues: { Pedal_Chorus_Rate: 50, Pedal_Chorus_Depth: 40 } },
      PrePedal1: { Key: "Pedal_OctaveUp", Category: "Pitch", KnobValues: { Pedal_OctaveUp_Mix: 66 } },
    }, ["$[35722]DISTORTION"]));
    const b = rig.board;
    expect(b.pre.map((p) => p.model)).toEqual(["octave", "chorus"]);
    expect(b.rack.map((p) => p.model)).toEqual(["comp"]);
    expect(b.rack[0].params).toMatchObject({ threshold: -22.5, ratio: 2, attack: 75, release: 170 });
    expect(b.pre[0].params.mix).toBe(0.66);
    expect(b.pre[1].params.depth).toBe(0.4);
    expect(b.pre.map((p) => p.id)).toEqual(["prepedal1", "prepedal2"]);
  });
  it("reads the amp head: name, gain and EQ in dB", () => {
    const { rig } = toneRig(tone({ Amp: ca100 }, ["$[35722]DISTORTION"]));
    expect(rig.board.amp).toMatchObject({ name: "CA100", gain: 1, bass: 2.4, mid: -3.6, treble: 9.6, presence: -4.8 });
  });
  it("picks the cabinet from its key, or from the kind of tone", () => {
    expect(toneRig(tone({ Amp: ca100, Cabinet: { Key: "Cab_EN212C_Ribbon_Cone" } })).rig.board.cab).toBe("2x12");
    expect(toneRig(tone({ Amp: ca100, Cabinet: { Key: "Cab_X412_Dyn" } }, ["$[1]DISTORTION"])).rig.board.cab).toBe("4x12");
    expect(toneRig(tone({ Amp: ca100 }, ["$[1]DISTORTION"])).rig.board.cab).toBe("4x12m");
    expect(toneRig(tone({ Amp: amp("Amp_TW40", { Amp_TW40_Gain: 10 }) })).rig.board.cab).toBe("bass");   // a 59 Bassman: its 4x10
    expect(toneRig(tone({ Amp: amp("Bass_Amp_BT880B", { Bass_Amp_BT880B_Gain: 1 }) }), { bass: true }).rig.board.cab).toBe("bass");
  });
  it("names drive pedals by family, and keeps the amp's own gain beside one", () => {
    const drive = (key) => toneRig(tone({ Amp: amp("Amp_TW40", { Amp_TW40_Gain: 20 }), PrePedal1: { Key: key, KnobValues: {} } })).rig.board;
    expect(drive("Pedal_TubeDriver").pre[0].model).toBe("od");
    expect(drive("Pedal_BigMuff").pre[0].model).toBe("fuzz");
    expect(drive("Pedal_MetalDistortion").pre[0].model).toBe("metal");
    expect(drive("Pedal_Distortion").pre[0].model).toBe("dist");
    expect(drive("Pedal_TubeDriver").amp.gain).toBe(0.2);
  });
  it("leaves out gear it cannot model", () => {
    const { rig } = toneRig(tone({ Amp: ca100, PrePedal1: { Key: "Pedal_Mystery", KnobValues: {} } }));
    expect(rig.board.pre).toEqual([]);
    expect(rig.pedals).toEqual(["Pedal_Mystery"]);
  });
});
