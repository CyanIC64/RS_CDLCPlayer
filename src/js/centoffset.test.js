import { describe, expect, it } from "vitest";
import { parseXml } from "./xml.js";
import { parseArrangement } from "./song.js";
import { manifestCentOffsets } from "./tones.js";

const xml = (inner) => parseXml(`<?xml version="1.0"?><song><arrangement>Lead</arrangement>
  <tuning string0="-2" string1="0" string2="0" string3="0" string4="0" string5="0"/>${inner}</song>`);

describe("centOffset", () => {
  it("is read from the arrangement XML", () => {
    expect(parseArrangement(xml("<centOffset>-50.0</centOffset>")).cent_offset).toBe(-50);
  });
  it("is null when the XML has none", () => {
    expect(parseArrangement(xml("")).cent_offset).toBe(null);
  });
  it("is read from the manifest per arrangement name", () => {
    const manifest = { Entries: {
      a: { Attributes: { ArrangementName: "Lead", CentOffset: -31.77 } },
      b: { Attributes: { ArrangementName: "Bass", CentOffset: 0 } },
    } };
    const files = new Map([["manifests/song/song_lead.json", new TextEncoder().encode(JSON.stringify(manifest))]]);
    const got = manifestCentOffsets(files, ["Lead", "Bass", "Rhythm"]);
    expect(got.get("Lead")).toBeCloseTo(-31.77);
    expect(got.get("Bass")).toBe(0);
    expect(got.has("Rhythm")).toBe(false);
  });
});
