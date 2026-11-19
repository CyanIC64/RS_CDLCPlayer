// Fills the gear library (src/amp/gear) from the RS-to-AT5p gear map
// (github.com/zagatozee/RS-to-AT5p, gear_mapping_reference.md): one JSON file
// per Rocksmith 2014 / Rocksmith+ amp, effect and cabinet enclosure it lists,
// saying what the piece really is ("real"), how the pedalboard plays it
// (amps: a voice of catalog.js; effects: a model; cabinets: an impulse) and,
// for an amp, which cabinet it drives.
//
//   node amp/gear-from-map.mjs <gear_mapping_reference.md> [rs_to_at5.py]
//
// rs_to_at5.py, when given, adds every cabinet key it knows (with its size).
// Files already in the library keep their knob maps and starting values;
// what the map says (real, voice, model, cab, family) is written over.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cabOfGear, cabBase, cabSize, modelOfGear } from "./gear.js";
import { VOICES } from "./catalog.js";
import { writeLibrary, pretty } from "./make-gear.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const GEAR = path.join(here, "gear");

/* ── amps: the voice, from the RS family and what the amp really is ─────── */
const VOICE_RULES = [
  [/^Bass_|SVT|SVX|Ampeg|B15|B750|Aguilar|Acoustic360|360Bass|Sunn|Bassman ?300|AD ?200/i, "bass"],
  [/BassDriver|Bass DI/i, "bassdi"],
  [/^DI_|Tube ?Pre/i, "di"],
  [/Rectifier|Triple Crown|Dual Terror(?!.)/i, "rectifier"],
  [/Mark ?(II|III|IV|V)|MKIII Lead|Lead MKIII|Modern Tube Lead|TA-?30|MesaBoogieMark|MesaLead/i, "mark"],
  [/American Clean|MesaClean|California Tweed|CaliforniaTweed/i, "american"],
  [/5150|Metal ?Lead ?V|SJ50|SLD|Soldano|Darrell|Randall|MH-?500|Metalhead|Powerball|E650|Engl|SilverPlate|Archon|Carvin|V3M|THD|Bi-?Valve|JetCity|JCA100/i, "highgain"],
  [/Diezel|VHandcraft|Bogner|German ?34|Ecstasy/i, "german"],
  [/Orange|Rocker ?Verb|Thunderverb|Tiny Terror|Dual Terror|AD ?30|OR[- ]?50|OR-?120|OR120|OR50|British Copper|^Amp_EN/i, "orange"],
  [/Vox|AC30|British Blue|DrZ ?Maz|MAZ ?18|Z ?Wreck/i, "vox"],
  [/JCM|Brit (8000|9000|Silver|100|L\.A\.)|DSL|Silver ?Jubilee|Slash|AFD|JVM|Satch|JCA20/i, "jcm"],
  [/JTM|JH Gold|Bluesbreaker|Plexi|Super Lead|S100|Red Pig|Major|Hiwatt|HiAmp|Vintage Metal Lead|JMP|^Amp_BT/i, "plexi"],
  [/Jazz ?Amp|JC-?120|Roland/i, "jazz"],
  [/Bassman|Tweed|57 Custom|Champ\b|57 Champ|Deluxe 57|Supro|Tube Vintage|^Amp_TW|Fender57/i, "tweed"],
  [/Deluxe Reverb|Twin|Princeton|Super Reverb|Vibro|Pro Junior|Super-?Sonic|Champion|Fender|^Amp_AT|^Amp_CS/i, "american"],
  [/^Amp_CA/i, "rectifier"], [/^Amp_HG/i, "highgain"], [/^Amp_GB/i, "german"],
];
/* the cabinet a real amp comes with, when its voice's usual one is not it */
const CAB_RULES = [
  [/Bassman(?! ?300)|Super Reverb|Super-Reverb/i, "bass"],            // tweed / blackface 4x10
  [/Twin|Jazz ?Amp|JC-?120|Vibro-?King|Vibroverb|Custom Twin/i, "2x12"],
  [/Deluxe|Princeton|Champ|Pro Junior|Super-?Sonic|Pro-Amp|Custom Pro/i, "1x12"],
  [/JCM ?800|Brit 8000|DSL|JVM|Satch|Brit 9000|JCM ?900/i, "4x12j"],
];
const cabFor = (key, real, voice) => (CAB_RULES.find(([re]) => re.test(real) || re.test(key)) || [null, VOICES[voice].cab])[1];
const voiceFor = (key, real) => (VOICE_RULES.find(([re]) => re.test(key) || re.test(real)) || [null, "generic"])[1];
/* the names the map gives as plain keys, said as people say them */
const REAL_FIX = { Amp_VoxAC30: "Vox AC30", Amp_VoxAC30Blue: "Vox AC30 (blue)" };

/* ── effects: the pedalboard model for each key the map lists ──────────── */
const EFFECT_MODEL = {
  Pedal_BuzzOne: "fuzz", Pedal_BuzzToo: "fuzz", Pedal_CaptFuzzle: "fuzz", Pedal_CustomDrive: "od", Pedal_Distortion: "dist",
  Pedal_FuzzWasHe: "fuzz", Pedal_GermaniumDrive: "fuzz", Pedal_LineDrive: "boost", Pedal_MetalDistortion: "metal",
  Pedal_RangeBooster: "boost", Pedal_ShredZone: "dist", Rack_StudioBoost: "boost", Rack_StudioDist: "dist", Rack_StudioFuzz: "fuzz",
  Pedal_AutoFilter: "wah", Pedal_BobFilter: "wah", Pedal_LoFiFilter: "", Pedal_ModernWah: "wah", Pedal_UKWah: "wah",
  Pedal_USWah: "wah", Rack_SynthFilter: "wah",
  Pedal_Chorus: "chorus", Pedal_Chorus20: "chorus",
  Pedal_80sFlanger: "flanger", Pedal_ClassicFlanger: "flanger", Pedal_ModernFlanger: "flanger", Pedal_VintageFlanger: "flanger",
  Pedal_Phaser: "phaser", Pedal_ShaverPhaser: "phaser", Rack_StereoPhaser: "phaser",
  Pedal_AmpTrem: "tremolo", Pedal_AmpVibe: "phaser", Pedal_MultiTrem: "tremolo", Pedal_Tremolo: "tremolo",
  Pedal_AnalogueDelay: "echo", Pedal_CosmicEcho: "echo", Pedal_ModDelay: "delay", Pedal_NPNDelay: "delay",
  Pedal_NoFiEcho: "echo", Pedal_OilCanEcho: "echo", Pedal_ValveEcho: "echo", Rack_StudioDelay: "delay",
  Rack_StudioTapDelay: "delay", Rack_StudioTapeDelay: "echo", Rack_TapeEcho: "echo",
  Pedal_DigitalVerb: "room", Pedal_PlateVerb: "plate", Pedal_SpringReverb: "room", Pedal_TubeSpring: "room",
  Rack_StudioChamber: "room", Rack_StudioChorus: "chorus", Rack_StudioComp: "comp", Rack_StudioCompressor: "comp",
  Rack_StudioEQ: "eq", Rack_StudioFlanger: "flanger", Rack_StudioGate: "", Rack_StudioGraphicEQ: "eq",
  Rack_StudioHallReverb: "plate", Rack_StudioModChorus: "chorus", Rack_StudioModFlange: "flanger", Rack_StudioModPhase: "phaser",
  Rack_StudioNoise: "", Rack_StudioOD: "od", Rack_StudioParametricEQ: "eq", Rack_StudioPhaser: "phaser",
  Rack_StudioPitch: "octave", Rack_StudioPlate: "plate", Rack_StudioPlateReverb: "plate", Rack_StudioReverb: "room",
  Rack_StudioRoomReverb: "room", Rack_StudioTremolo: "tremolo", Rack_StudioVerb: "room", Rack_StudioVibrato: "phaser",
  Rack_StudioWah: "wah",
  Pedal_Compression: "comp", Pedal_Limiter: "comp", Pedal_NoiseGate: "", Pedal_Swole: "comp",
  Pedal_EQ5: "eq", Pedal_EQ8: "eq", Pedal_MultiPitch: "octave", Pedal_OctaveUp: "octave",
  Pedal_BitCruncher: "", Pedal_AcousticEmulator: "eq", Pedal_BakedRotatoe: "chorus", Pedal_Octavius: "octave", Pedal_OmniMod: "chorus",
};
/* starting values that give a piece its own colour (its knobs, when the tone has them, win) */
const EFFECT_PARAMS = {
  Pedal_RangeBooster: { gain: 0.35, tone: 0.95 }, Pedal_LineDrive: { gain: 0.25, tone: 0.6 },
  Pedal_GermaniumDrive: { tone: 0.4 }, Pedal_FuzzWasHe: { tone: 0.55 }, Pedal_BuzzOne: { tone: 0.65, gain: 0.8 },
  Pedal_AnalogueDelay: { tone: 0.35 }, Pedal_NoFiEcho: { tone: 0.15 }, Pedal_OilCanEcho: { tone: 0.3 },
  Pedal_ValveEcho: { tone: 0.4 }, Pedal_CosmicEcho: { tone: 0.45, feedback: 0.4 },
  Pedal_Limiter: { ratio: 20, threshold: -12, attack: 2 }, Pedal_Swole: { ratio: 8, threshold: -30 },
  Pedal_SpringReverb: { tone: 0.55 }, Pedal_TubeSpring: { tone: 0.5 }, Rack_StudioHallReverb: { mix: 0.35 },
  Pedal_AmpVibe: { rate: 2, depth: 0.8, feedback: 0.3 }, Rack_StudioVibrato: { rate: 2, depth: 0.8, feedback: 0.3 },
  Pedal_AmpTrem: { rate: 4, intensity: 0.5 }, Pedal_BakedRotatoe: { rate: 5, depth: 0.9, feedback: 0.1 },
  Pedal_80sFlanger: { feedback: 0.85 }, Pedal_AcousticEmulator: { bass: -6, mid: -3, treble: 6 },
};

/* ── cabinets ───────────────────────────────────────────────────────────── */
const CAB_FAMILY = [
  [/^Cab_TW/i, "Fender tweed"], [/^Cab_CA/i, "Mesa/Boogie"], [/^Cab_CS/i, "Fender Custom Shop"], [/^Cab_AT/i, "Fender"],
  [/^Cab_BT/i, "Marshall"], [/^Cab_GB/i, "German (Bogner/Diezel)"], [/^Cab_HG/i, "High gain (Mesa/Peavey)"],
  [/^Cab_EN/i, "Orange"], [/^Cab_Marshall/i, "Marshall"], [/^Cab_Vox/i, "Vox"], [/^Cab_Fender/i, "Fender"],
  [/^Cab_Mesa/i, "Mesa/Boogie"], [/^Cab_Orange/i, "Orange"], [/^Bass_Cab_AT/i, "Ampeg (bass)"], [/^Bass_Cab_BT/i, "Marshall (bass)"],
  [/^Bass_Cab_GB/i, "German (bass)"], [/^Bass_Cab_CH/i, "Practice (bass)"], [/^Bass_Cab/i, "Bass"], [/^IBEX_Cab/i, "Mesa/Boogie"],
];

function tables(md) {
  /* every row "| `Key` | a | b |" with the headings above it */
  const rows = [];
  let h2 = "", h3 = "";
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("## ")) { h2 = line.slice(3).trim(); h3 = ""; continue; }
    if (line.startsWith("### ")) { h3 = line.slice(4).trim(); continue; }
    const m = /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!m) continue;
    rows.push({ h2, h3, key: m[1], cols: m[2].split("|").map((c) => c.trim().replace(/`/g, "")) });
  }
  return rows;
}

function cabinetKeys(py) {
  /* "Cab_X": "guid",  # 4x12 Something */
  const out = new Map();
  const re = /^\s+"((?:Bass_)?Cab_[A-Za-z0-9_]+|IBEX_Cab[A-Za-z0-9_]*)":\s*"[^"]*",?\s*(?:#\s*(.*))?$/gm;
  let m;
  while ((m = re.exec(py))) {
    const size = /(\d)x(\d+)/.exec(m[2] || "");
    const base = cabBase(m[1]);
    if (!out.has(base) || (size && !out.get(base))) out.set(base, size ? [Number(size[1]), Number(size[2])] : null);
  }
  return out;
}

function save(type, key, entry) {
  const dir = path.join(GEAR, { amp: "amps", cabinet: "cabinets", pedal: "pedals", rack: "pedals" }[type]);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, key.replace(/[^\w.-]+/g, "_") + ".json");
  let e = entry;
  if (fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(file, "utf8"));
    e = { ...old, ...entry, knobs: { ...(entry.knobs || {}), ...(old.knobs || {}) }, params: { ...(entry.params || {}), ...(old.params || {}) } };
    if (!Object.keys(e.knobs).length) delete e.knobs;
    if (type === "amp" || type === "cabinet") delete e.params;
  }
  fs.writeFileSync(file, pretty(e) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mdPath, pyPath] = process.argv.slice(2);
  if (!mdPath) { console.error("usage: node amp/gear-from-map.mjs <gear_mapping_reference.md> [rs_to_at5.py]"); process.exit(1); }
  const rows = tables(fs.readFileSync(mdPath, "utf8"));
  const SOURCE = "RS-to-AT5p gear map";
  let amps = 0, fx = 0, cabs = 0;

  /* amps: RS2014 rows say the real amp; RS+ rows say it with their family's brand */
  const real2014 = new Map();
  for (const r of rows.filter((r) => /^RS2014 Amplifiers/i.test(r.h2))) {
    const [name, model] = r.cols;
    real2014.set(r.key, REAL_FIX[r.key] || (/\s/.test(name) ? name : `Fender ${model}`));
  }
  const ampRows = new Map();
  for (const r of rows.filter((r) => /Amplifiers/i.test(r.h2))) if (!ampRows.has(r.key)) ampRows.set(r.key, r);
  for (const [key, r] of ampRows) {
    const brand = (/\(([^)]+)\)/.exec(r.h3) || [])[1] || "";
    const real = real2014.get(key) || (brand && !/^Other|DI/i.test(r.h3) ? `${r.cols[0]} (${brand})` : r.cols[0]);
    const voice = voiceFor(key, real);
    const bass = !!VOICES[voice].bass;
    save("amp", key, { key, type: "amp", name: key.replace(/^(DI_)?(Bass_)?Amp_/i, ""), real, family: r.h3 || "RS2014",
                       voice, bass, cab: bass ? VOICES[voice].cab : cabFor(key, real, voice), source: SOURCE });
    amps++;
  }

  /* effects */
  for (const r of rows.filter((r) => /^Effects/i.test(r.h2))) {
    const key = r.key, eq = r.cols[0] || "";
    const real = (/\(([^)]+)\)/.exec(eq) || [])[1] || eq;
    const model = key in EFFECT_MODEL ? EFFECT_MODEL[key] : modelOfGear(key, r.h3);
    save(/^Rack_/i.test(key) ? "rack" : "pedal", key, { key, type: /^Rack_/i.test(key) ? "rack" : "pedal",
         name: key.replace(/^(Pedal|Rack)_/i, ""), real, category: r.h3, model, params: EFFECT_PARAMS[key] || {}, source: SOURCE });
    fx++;
  }

  /* cabinets: every enclosure rs_to_at5.py knows, else the map's example keys */
  const enclosures = pyPath ? cabinetKeys(fs.readFileSync(pyPath, "utf8")) : new Map();
  for (const r of rows.filter((r) => /^Cabinets/i.test(r.h2))) {
    for (const k of r.cols.join(",").split(/[,\s]+/).filter((k) => /Cab/.test(k))) if (!enclosures.has(cabBase(k))) enclosures.set(cabBase(k), null);
  }
  for (const [key, size] of enclosures) {
    const fam = (CAB_FAMILY.find(([re]) => re.test(key)) || [null, ""])[1];
    const cab = cabOfGear(key, "", { size: cabSize(key) || size });
    const sz = cabSize(key) || size;              // the key says what the cabinet is; the comment, what AT5 plays
    const real = [sz ? `${sz[0]}x${sz[1]}` : "", fam].filter(Boolean).join(" ") || key;
    save("cabinet", key, { key, type: "cabinet", name: key.replace(/^(Bass_)?Cab_|^IBEX_Cab_?/i, "").replace(/_/g, " "),
                           real, bass: cab === "bass" && /^Bass_/i.test(key), cab, source: SOURCE });
    cabs++;
  }
  console.log(`gear map: ${amps} amps, ${fx} effects, ${cabs} cabinet enclosures`);
  console.log(`gear/library.js: ${writeLibrary()} pieces`);
}
