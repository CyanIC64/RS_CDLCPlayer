// Gives the gear library's amps and pedals the face of the real gear they are
// modelled on: its enclosure, colours, knobs, sliders and switches, each wired to
// a setting of the pedalboard (src/amp/gear/*/<Key>.json, "face"). With the CSV of
// the "Rocksmith 2014 / Real World" sheet, it also adds the real gear the sheet
// lists for each piece ("alt").
//
//   node amp/gear-faces.mjs [sheet.csv]
//
// Then node build.mjs (or node amp/make-gear.mjs) gathers the files again.
//
// A face:
//   { look:  compact | mxr | wide | round | wedge | wah | tall | rack      (a pedal's enclosure)
//            head                                                           (an amp; theme says which)
//     theme, color, ink, knob,   the colours, and the style of its knobs
//     title, after,              what is printed on it, and the gear it is modelled on
//     bands,                     a graphic EQ's frequencies (Hz)
//     controls: [ { type: knob | slider | switch | treadle, label, param,
//                   min, max,    the part of the setting's range the control sweeps
//                   invert,      turning it up lowers the setting (a SENSITIVITY on a threshold)
//                   options: [[label, value], ...]  a switch's positions
//                   size: "s" | "l" } ] }
// A control's param is one of the pedal's settings (catalog.js FX, with the extra
// ones), or the amp's (AMP_PARAMS; "master" is the page's amp volume).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pretty } from "./make-gear.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const GEAR = path.join(here, "gear");

const K = (label, param, o = {}) => ({ type: "knob", label, param, ...o });
const SL = (label, param, o = {}) => ({ type: "slider", label, param, ...o });
const SW = (label, param, options, o = {}) => ({ type: "switch", label, param, options, ...o });
const TR = (label, param, o = {}) => ({ type: "treadle", label, param, ...o });

/* ── pedals and racks ─────────────────────────────────────────────────────── */
const compact = (color, title, after, controls, o = {}) => ({ look: "compact", color, knob: "boss", title, after, controls, ...o });
const mxr = (color, title, after, controls, o = {}) => ({ look: "mxr", color, knob: "mxr", title, after, controls, ...o });
const wide = (color, title, after, controls, o = {}) => ({ look: "wide", color, knob: "chrome", title, after, controls, ...o });
const rack = (title, after, controls, o = {}) => ({ look: "rack", color: "#26292d", ink: "#d9dde2", knob: "rack", title, after, controls, ...o });

const GE7 = [100, 200, 400, 800, 1600, 3200, 6400];
/* the bands Rocksmith's 8-band EQs name their knobs by */
const EQ8 = [50, 100, 200, 400, 800, 1600, 3200, 6400];
const BASS_EQ8 = [30, 75, 185, 460, 1100, 2700, 6800, 16000];
const bandSliders = (bands) => bands.map((f, i) => SL(f < 1000 ? String(f) : f / 1000 + "k", "g" + i));
const rackTime = (title, after) => rack(title, after, [K("TIME", "time"), K("FEEDBACK", "feedback"), K("MIX", "mix"), K("HI CUT", "tone")]);
const rackVerb = (title, after) => rack(title, after, [K("MIX", "mix"), K("TONE", "tone")]);
const rackMod = (title, after) => rack(title, after, [K("RATE", "rate"), K("DEPTH", "depth"), K("FEEDBACK", "feedback")]);
const rackDrive = (title, after) => rack(title, after, [K("DRIVE", "gain"), K("TONE", "tone"), K("LEVEL", "level")]);
/* Rocksmith's studio EQ: five bands, each with its gain and its frequency */
const S = { size: "s" };
const Q2 = [["WIDE", 0.7], ["NARROW", 2]];
const PARAM5 = [K("BASS", "bass"), K("FREQ", "bassFreq", S), K("LO MID", "lomid"), K("FREQ", "lomidFreq", S), K("MID", "mid"), K("FREQ", "midFreq", S),
                K("HI MID", "himid"), K("FREQ", "himidFreq", S), K("TREBLE", "treble"), K("FREQ", "trebleFreq", S), K("LEVEL", "level")];

export const PEDALS = {
  /* dynamics */
  Pedal_Compression:   mxr("#c8202a", "COMPRESSION", "MXR Dyna Comp", [K("OUTPUT", "level"), K("SENSITIVITY", "threshold", { invert: true })]),
  Pedal_Swole:         compact("#2e5fa8", "SWOLE", "Aphex Punch Factory", [K("DRIVE", "threshold", { invert: true }), K("OUTPUT", "level")]),
  Pedal_Limiter:       compact("#4b6f96", "LIMITER", "Boss LM-2", [K("LEVEL", "level"), K("RELEASE", "release"), K("THRESHOLD", "threshold")]),
  Bass_Pedal_MBComp:   compact("#1f2328", "BASS COMP", "Multi-band bass compressor",
                         [K("THRESH", "threshold"), K("RATIO", "ratio"), K("FILTER", "split", { size: "s" }), K("ATTACK", "attack", { size: "s" }),
                          K("RATE", "release", { size: "s", invert: true }), K("LEVEL", "level")], { ink: "#e7c44a" }),
  Rack_StudioCompressor: rack("STUDIO COMPRESSOR", "dbx 160", [K("THRESHOLD", "threshold"), K("COMPRESSION", "ratio"), K("OUTPUT GAIN", "level")]),
  Rack_StudioComp:     rack("STUDIO COMP", "FET studio compressor",
                         [K("INPUT", "threshold", { invert: true }), K("OUTPUT", "level"), K("ATTACK", "attack"), K("RELEASE", "release"),
                          SW("RATIO", "ratio", [["4", 4], ["8", 8], ["12", 12], ["20", 20]])]),
  /* drives */
  Pedal_Distortion:    compact("#f07f1d", "STANDARD DISTORTION", "Boss DS-1", [K("TONE", "tone"), K("LEVEL", "level"), K("DIST", "gain")]),
  Pedal_MetalDistortion: compact("#1c1c1c", "ALLOY DISTORTION", "Boss HM-2", [K("LEVEL", "level"), K("LOW", "bass"), K("HIGH", "treble"), K("DISTORTION", "gain")], { ink: "#f2742b" }),
  Pedal_ShredZone:     compact("#3a3d40", "SHRED ZONE", "Boss MT-2 Metal Zone",
                         [K("LEVEL", "level", { size: "s" }), K("HIGH", "treble", { size: "s" }), K("LOW", "bass", { size: "s" }), K("DIST", "gain", { size: "s" }), K("MIDDLE", "mid", { size: "s" })], { ink: "#e8423a" }),
  Pedal_LineDrive:     compact("#e9a024", "LINE DRIVE", "Boss OS-2", [K("LEVEL", "level"), K("TONE", "tone"), K("DRIVE", "gain")]),
  Pedal_GermaniumDrive: { look: "tall", color: "#1b1b1b", ink: "#f4f4f4", knob: "mxr", title: "GERMANIUM DRIVE", after: "ProCo RAT / Chandler Germanium Drive",
                         controls: [K("DISTORTION", "gain"), K("FILTER", "tone", { invert: true }), K("VOLUME", "level")] },
  Pedal_CustomDrive:   mxr("#e8e4d8", "CUSTOM DRIVE", "Fulltone OCD", [K("VOLUME", "level"), K("DRIVE", "gain"), K("TONE", "tone"),
                         SW("MODE", "treble", [["LP", 0], ["HP", 4]])], { ink: "#222", knob: "chicken" }),
  Pedal_CaptFuzzle:    { look: "wedge", color: "#7a5a32", ink: "#f1e3c2", knob: "cream", title: "CAPTAIN FUZZLE", after: "Gibson Maestro FZ-1A Fuzz-Tone",
                         controls: [K("VOLUME", "level"), K("ATTACK", "gain")] },
  Pedal_BuzzToo:       wide("#d8d6cf", "BUZZ 2", "Electro-Harmonix Big Muff", [K("VOLUME", "level"), K("TONE", "tone"), K("SUSTAIN", "gain")], { ink: "#b3141c", knob: "chrome" }),
  Pedal_BuzzOne:       wide("#35404b", "BUZZ 1", "Univox Super-Fuzz", [K("VOLUME", "level"), K("EXPANDER", "gain"),
                         SW("TONE", "mid", [["NORM", 0], ["SCOOP", -8]])], { ink: "#f2f2f2", knob: "mxr" }),
  Pedal_FuzzWasHe:     { look: "round", color: "#b5232c", ink: "#f5f5f5", knob: "chicken", title: "FUZZ WAS HE", after: "Fuzz Face (sheet: Boss FZ-3 / Tone Bender)",
                         controls: [K("VOLUME", "level"), K("FUZZ", "gain")] },
  Pedal_RangeBooster:  { look: "wedge", color: "#9a9ea3", ink: "#1b1b1b", knob: "chrome", title: "RANGE BOOSTER", after: "Dallas Rangemaster",
                         controls: [K("BOOST", "gain", { size: "l" })] },
  Rack_StudioBoost:    rack("STUDIO BOOST", "Studio booster", [K("BOOST", "gain"), K("TONE", "tone"), K("LEVEL", "level")]),
  Rack_StudioDist:     rackDrive("STUDIO DISTORTION", "Rack distortion"),
  Rack_StudioFuzz:     rackDrive("STUDIO FUZZ", "Rack fuzz"),
  Rack_StudioOD:       rackDrive("STUDIO OVERDRIVE", "Rack overdrive"),
  Pedal_AcousticEmulator: compact("#a8743c", "ACOUSTIC EMULATOR", "Rockman Acoustic Guitar pedal",
                         [K("BASS", "bass"), K("MID", "mid"), K("TREBLE", "treble"), K("LEVEL", "level")]),
  /* filters and wahs */
  Pedal_BobFilter:     { look: "wide", color: "#1d1d1d", ink: "#e9e2d0", knob: "chrome", wood: true, title: "ANALOG FILTER", after: "Moogerfooger MF-105M MuRF / EHX",
                         controls: [K("ENVELOPE", "sensitivity"), K("CUTOFF", "baseFrequency"), K("RESONANCE", "resonance")] },
  Pedal_AutoFilter:    wide("#c9ced3", "AUTO FILTER", "Musitronics Mu-Tron III", [K("GAIN", "sensitivity"), K("PEAK", "resonance"),
                         SW("RANGE", "baseFrequency", [["LO", 0.15], ["HI", 0.55]])], { ink: "#1f3d8a" }),
  Pedal_USWah:         { look: "wah", color: "#1a1a1a", ink: "#e9e9e9", title: "US WAH", after: "Dunlop Cry Baby", controls: [TR("WAH", "baseFrequency")] },
  Pedal_ModernWah:     { look: "wah", color: "#202326", ink: "#e9e9e9", title: "MODERN WAH", after: "Cry Baby style wah",
                         controls: [TR("WAH", "baseFrequency"), K("Q", "resonance", { size: "s" })] },
  Pedal_UKWah:         { look: "wah", color: "#2b2b2b", ink: "#e9e9e9", chrome: true, title: "UK WAH", after: "Vox V847", controls: [TR("WAH", "baseFrequency")] },
  Rack_StudioWah:      rack("STUDIO WAH", "Rack auto-wah", [K("SENS", "sensitivity"), K("FREQ", "baseFrequency"), K("Q", "resonance")]),
  Rack_SynthFilter:    rack("SYNTH FILTER", "Formant filter", [K("SENS", "sensitivity"), K("CUTOFF", "baseFrequency"), K("RESONANCE", "resonance")]),
  /* EQ */
  Pedal_EQ5:           { look: "tall", color: "#151515", ink: "#e9e9e9", knob: "mxr", title: "5 BAND EQ", after: "Mesa/Boogie Five-Band Graphic EQ",
                         bands: [80, 240, 750, 2200, 6600], controls: [...bandSliders([80, 240, 750, 2200, 6600]), K("LEVEL", "level", { size: "s" })] },
  Pedal_EQ8:           { look: "tall", color: "#e6e6e2", ink: "#1b1b1b", knob: "mxr", title: "8 BAND EQ", after: "Guyatone 8 band graphic equalizer",
                         bands: EQ8, controls: [...bandSliders(EQ8), SL("LEVEL", "level")] },
  Bass_Pedal_BassEQ8:  { look: "tall", color: "#1d2733", ink: "#e9eef3", knob: "mxr", title: "BASS EQ 8", after: "8 band bass graphic EQ (MXR M288 style)",
                         bands: BASS_EQ8, controls: [...bandSliders(BASS_EQ8), SL("LEVEL", "level")] },
  Rack_StudioGraphicEQ: rack("STUDIO EQ", "5 band parametric EQ (as the song's tone sets it)", PARAM5),
  Rack_StudioEQ:       rack("STUDIO EQ", "4 band parametric EQ (as the song's tone sets it)",
                         [K("BASS", "bass"), K("FREQ", "bassFreq", S), K("LO MID", "lomid"), K("FREQ", "lomidFreq", S), SW("Q", "lomidQ", Q2),
                          K("HI MID", "himid"), K("FREQ", "himidFreq", S), SW("Q", "himidQ", Q2), K("TREBLE", "treble"), K("FREQ", "trebleFreq", S), K("LEVEL", "level")]),
  Rack_StudioParametricEQ: rack("STUDIO PARAMETRIC EQ", "GML 8200 Parametric EQ", PARAM5),
  /* modulation */
  Pedal_Chorus:        compact("#6fb8e0", "CHORUS", "Boss CE-2", [K("RATE", "rate"), K("DEPTH", "depth")]),
  Pedal_Chorus20:      wide("#5d7d99", "CHORUS 2.0", "Fulltone Deja Vibe / Roland CE-1", [K("INTENSITY", "depth"), K("RATE", "rate")], { ink: "#f2f2f2" }),
  Rack_StudioChorus:   rack("STUDIO CHORUS", "Boss RCE-10 Chorus Ensemble",
                         [K("RATE", "rate"), K("DEPTH", "depth"), K("DELAY", "manual", S), K("MIX", "mix"),
                          K("LO CUT", "loCut", S), K("HI CUT", "hiCut", S), K("STEREO", "stereo", S)]),
  Rack_StudioModChorus: rackMod("STUDIO MOD CHORUS", "Rack chorus"),
  Pedal_BakedRotatoe:  wide("#5b1f24", "BAKED ROTATOE", "Leslie rotary speaker / Boss RT-20",
                         [SW("SPEED", "rate", [["SLOW", 0.8], ["FAST", 6.5]]), K("DEPTH", "depth"), K("DRIVE", "feedback")], { ink: "#f0d9a0" }),
  Pedal_OmniMod:       { look: "tall", color: "#1d1d1d", ink: "#f2f2f2", knob: "chrome", title: "OMNI MOD", after: "Univox Uni-Vibe",
                         controls: [K("SPEED", "rate"), K("INTENSITY", "depth")] },
  Pedal_ClassicFlanger: compact("#6d4fa0", "CLASSIC FLANGER", "Boss BF-2", [K("MANUAL", "manual"), K("DEPTH", "depth"), K("RATE", "rate"), K("RES", "feedback")]),
  Pedal_80sFlanger:    mxr("#262626", "80'S FLANGER", "MXR M117R Flanger", [K("MANUAL", "manual"), K("WIDTH", "depth"), K("SPEED", "rate"), K("REGEN", "feedback")], { ink: "#e9e9e9" }),
  Pedal_VintageFlanger: wide("#cfd2d4", "VINTAGE FLANGER", "Electro-Harmonix Electric Mistress", [K("RATE", "rate"), K("RANGE", "depth"), K("COLOR", "feedback")], { ink: "#2b3f8a" }),
  Pedal_ModernFlanger: { look: "wide", color: "#1d1d1d", ink: "#e9e2d0", knob: "chrome", wood: true, title: "MODERN FLANGE", after: "Moog Minifooger MF Flange",
                         controls: [K("RATE", "rate"), K("DEPTH", "depth"), K("FEEDBACK", "feedback"), K("MANUAL", "manual")] },
  Rack_StudioFlanger:  rack("STUDIO FLANGER", "Rack flanger", [K("MANUAL", "manual"), K("RATE", "rate"), K("DEPTH", "depth"), K("FEEDBACK", "feedback")]),
  Rack_StudioModFlange: rack("STUDIO MOD FLANGE", "Rack flanger", [K("MANUAL", "manual"), K("RATE", "rate"), K("DEPTH", "depth"), K("FEEDBACK", "feedback")]),
  Pedal_Phaser:        mxr("#f07b1e", "PHASER 363", "MXR Phase 90", [K("SPEED", "rate", { size: "l" })], { ink: "#1b1b1b" }),
  Pedal_ShaverPhaser:  compact("#2a7b6a", "SHAVER PHASER", "Boss PH-1 / EHX Small Stone", [K("RATE", "rate"), K("DEPTH", "depth"),
                         SW("COLOR", "feedback", [["OFF", 0.3], ["ON", 0.75]])]),
  Pedal_AmpVibe:       { look: "tall", color: "#e7dcc2", ink: "#2a2416", knob: "cream", title: "AMP VIBE", after: "Origin Effects Magma57 Amp Vibrato",
                         controls: [K("SPEED", "rate"), K("INTENSITY", "depth")] },
  Rack_StereoPhaser:   rackMod("STEREO PHASER", "Rack phaser"),
  Rack_StudioModPhase: rackMod("STUDIO MOD PHASE", "Rack phaser"),
  Rack_StudioPhaser:   rackMod("STUDIO PHASER", "Rack phaser"),
  Rack_StudioVibrato:  rackMod("STUDIO VIBRATO", "Rack vibe"),
  Pedal_Tremolo:       wide("#9aa0a6", "TREMOLO", "Colorsound Tremolo", [K("SPEED", "rate"), K("DEPTH", "intensity")], { ink: "#1b1b1b", knob: "mxr" }),
  Pedal_AmpTrem:       mxr("#2b2b2b", "AMP TREM", "Fulltone Supa-Trem", [K("SPEED", "rate"), K("DEPTH", "intensity")], { ink: "#efe6cf", knob: "chicken" }),
  Pedal_MultiTrem:     compact("#2f8f55", "MULTI-TREM", "Boss TR-2", [K("RATE", "rate"), K("DEPTH", "intensity")]),
  Rack_StudioTremolo:  rack("STUDIO TREMOLO", "Opto tremolo", [K("RATE", "rate"), K("DEPTH", "intensity")]),
  /* pitch */
  Pedal_Octavius:      compact("#3a8fd0", "OCTAVIUS", "Boss OC-2 Octave", [K("OCT", "mix"), K("DIRECT", "dry")]),
  Pedal_OctaveUp:      mxr("#c4c6c8", "OCTAVE UP!", "Roger Mayer Octavia / Foxrox Octron", [K("OCTAVE", "mix"), K("DIRECT", "dry")], { ink: "#1b1b1b" }),
  Pedal_MultiPitch:    { look: "wah", color: "#b7222b", ink: "#f5f5f5", title: "MULTIPITCH", after: "DigiTech Whammy / Boss PS-2",
                         controls: [TR("PITCH", "mix"), K("DRY", "dry", { size: "s" })] },
  Rack_StudioPitch:    rack("STUDIO PITCH", "Pitch shifter", [K("PITCH", "mix"), K("DRY", "dry")]),
  /* delays */
  Pedal_AnalogueDelay: wide("#b9bcc0", "ANALOG DELAY", "Electro-Harmonix Memory Man / Moog MF-104",
                         [K("BLEND", "mix"), K("FEEDBACK", "feedback"), K("DELAY", "time", { min: 30, max: 550 }), K("TONE", "tone", { size: "s" })], { ink: "#1b1b1b" }),
  Pedal_ModDelay:      compact("#6e7378", "MOD DELAY", "Ibanez DML10", [K("DELAY TIME", "time"), K("FEEDBACK", "feedback"), K("LEVEL", "mix")]),
  Pedal_NPNDelay:      compact("#c2364a", "CLASSIC NPN DELAY", "Boss DM-2", [K("REPEAT RATE", "time", { min: 20, max: 300 }), K("ECHO", "mix"), K("INTENSITY", "feedback")]),
  Pedal_OilCanEcho:    wide("#2f3238", "OIL CAN ECHO", "Tel-Ray / Morley oil can delay", [K("SUSTAIN", "feedback"), K("DELAY", "time"), K("VOLUME", "mix"), K("TONE", "tone")], { ink: "#e7d9a8", knob: "chicken" }),
  Pedal_NoFiEcho:      compact("#3b3f44", "NO-FI ECHO", "Ibanez DE7 (Lo-Fi echo)", [K("DELAY", "time"), K("REPEAT", "feedback"), K("LEVEL", "mix"), K("LO-FI", "tone", { invert: true })]),
  Pedal_ValveEcho:     wide("#d9cfb4", "VALVE ECHO", "Binson Echorec / Maestro Echoplex", [K("ECHO DELAY", "time"), K("REPEATS", "feedback"), K("ECHO VOLUME", "mix"), K("TONE", "tone")], { ink: "#3a2a16", knob: "chicken" }),
  Pedal_CosmicEcho:    wide("#1f2b4a", "COSMONAUT ECHO", "Eventide Space (Blackhole) / Memory Man", [K("DELAY", "time"), K("FEEDBACK", "feedback"), K("BLEND", "mix"), K("TONE", "tone")], { ink: "#cfe0ff" }),
  Rack_TapeEcho:       { look: "rack", color: "#2f3d33", ink: "#efe6cf", knob: "chicken", title: "TAPE ECHO", after: "Roland Space Echo RE-150",
                         controls: [K("REPEAT RATE", "time", { min: 60, max: 650 }), K("INTENSITY", "feedback"), K("ECHO VOLUME", "mix"), K("TREBLE", "tone")] },
  Rack_StudioDelay:    rackTime("STUDIO DELAY", "TC Electronic 2290"),
  Rack_StudioTapDelay: rackTime("STUDIO TAP DELAY", "Rack tap delay"),
  Rack_StudioTapeDelay: rackTime("STUDIO TAPE DELAY", "Rack tape echo"),
  /* reverbs */
  Pedal_DigitalVerb:   compact("#3f6f8f", "DIGITAL VERB", "Boss RV-2", [K("E.LEVEL", "mix"), K("TONE", "tone")]),
  Pedal_PlateVerb:     mxr("#ececec", "PLATE REVERB", "Catalinbread Talisman", [K("LEVEL", "mix"), K("TONE", "tone")], { ink: "#1b1b1b" }),
  Pedal_SpringReverb:  mxr("#c8cbcf", "SPRING REVERB", "Electro-Harmonix Holy Grail", [K("REVERB", "mix", { size: "l" })], { ink: "#1b1b1b", knob: "chrome" }),
  Pedal_TubeSpring:    { look: "wide", color: "#181818", ink: "#d9d9d9", knob: "skirt", tolex: "brown", title: "TUBE SPRING REVERB", after: "Fender '63 Reverb",
                         controls: [K("MIXER", "mix", { scale: 10 }), K("TONE", "tone", { scale: 10 })] },
  Rack_StudioChamber:  rack("STUDIO CHAMBER REVERB", "Echo chamber",
                         [K("MIX", "mix"), K("TONE", "tone"), K("TIME", "decay"), K("DEPTH", "predelay")]),
  Rack_StudioHallReverb: rackVerb("STUDIO HALL REVERB", "Boss RRV-10 (hall)"),
  Rack_StudioPlate:    rackVerb("STUDIO PLATE", "Plate reverb"),
  Rack_StudioPlateReverb: rackVerb("STUDIO PLATE REVERB", "EMT plate / Boss RRV-10 (plate)"),
  Rack_StudioReverb:   rackVerb("STUDIO REVERB", "Spring reverb"),
  Rack_StudioRoomReverb: rackVerb("STUDIO ROOM REVERB", "Room reverb"),
  Rack_StudioVerb:     rackVerb("STUDIO VERB", "Digital reverb"),
};

/* ── amps: a theme each (the look of its panel) and the controls of the real head ─ */
const M = K("MASTER", "master");
const head = (theme, controls, o = {}) => ({ look: "head", theme, controls: controls.map((c) => (c.type === "knob" && !/Freq$/.test(c.param) ? { ...c, scale: 10 } : c)), ...o });
const BRIGHT = SW("BRIGHT", "bright", [["OFF", 0], ["ON", 6]]);
const T = {
  blackface: (mid = true, reverb = true) => head("blackface", [BRIGHT, K("VOLUME", "gain"), K("TREBLE", "treble"), ...(mid ? [K("MIDDLE", "mid")] : []), K("BASS", "bass"), ...(reverb ? [K("REVERB", "reverb")] : [])]),
  tweed:     () => head("tweed", [K("PRESENCE", "presence"), K("MIDDLE", "mid"), K("BASS", "bass"), K("TREBLE", "treble"), K("VOLUME", "gain"), K("BRIGHT", "bright")]),
  plexi:     () => head("plexi", [K("PRESENCE", "presence"), K("BASS", "bass"), K("MIDDLE", "mid"), K("TREBLE", "treble"), K("VOLUME I", "gain"), K("VOLUME II", "bright")]),
  jcm:       () => head("plexi", [K("PRESENCE", "presence"), K("BASS", "bass"), K("MIDDLE", "mid"), K("TREBLE", "treble"), M, K("PRE-AMP", "gain")]),
  vox:       () => head("vox", [K("VOLUME", "gain"), K("TREBLE", "treble"), K("BASS", "bass"), K("CUT", "presence", { invert: true }), M]),
  mark:      () => head("mesa", [K("VOLUME", "gain"), K("TREBLE", "treble"), K("BASS", "bass"), K("MIDDLE", "mid"), M, K("PRESENCE", "presence"),
                                 SW("DEEP", "depth", [["OFF", 0], ["PULL", 0.5]]),
                                 ...[80, 240, 750, 2200, 6600].map((f, i) => SL(f < 1000 ? String(f) : f / 1000 + "K", "eq" + i))]),
  rect:      () => head("rect", [K("GAIN", "gain"), K("TREBLE", "treble"), K("MID", "mid"), K("BASS", "bass"), K("PRESENCE", "presence"), M]),
  orange:    (reverb = false) => head("orange", [M, K("TREBLE", "treble"), K("MIDDLE", "mid"), K("BASS", "bass"), K("GAIN", "gain"), ...(reverb ? [K("REVERB", "reverb")] : [])]),
  jc:        () => head("jc", [BRIGHT, K("VOLUME", "gain"), K("TREBLE", "treble"), K("MIDDLE", "mid"), K("BASS", "bass"), K("REVERB", "reverb")]),
  hiwatt:    () => head("hiwatt", [K("NORMAL", "gain"), K("BRILLIANCE", "bright"), K("BASS", "bass"), K("TREBLE", "treble"), K("MIDDLE", "mid"), K("PRESENCE", "presence"), M]),
  highgain:  (deep = "") => head("highgain", [K("GAIN", "gain"), K("BASS", "bass"), K("MIDDLE", "mid"), K("TREBLE", "treble"), K("PRESENCE", "presence"),
                                 ...(deep ? [K(deep, "depth")] : []), M]),
  svt:       () => head("bass", [K("GAIN", "gain"), SW("ULTRA LO", "depth", [["OFF", 0], ["ON", 0.7]]), K("BASS", "bass"), K("MIDRANGE", "mid"),
                                 SW("ULTRA HI", "bright", [["OFF", 0], ["ON", 6]]), K("TREBLE", "treble"), M]),
  bass:      () => head("bass", [K("GAIN", "gain"), K("BASS", "bass"), K("MID", "mid"), K("TREBLE", "treble"), K("DEEP", "depth"), K("BRIGHT", "bright"), M]),
};
const THEME_OF_VOICE = { generic: () => T.highgain(), tweed: T.tweed, american: () => T.blackface(), plexi: T.plexi, jcm: T.jcm, vox: T.vox,
                         orange: () => T.orange(), rectifier: T.rect, mark: T.mark, highgain: () => T.highgain(), german: () => T.highgain("DEPTH"),
                         jazz: T.jc, bass: T.bass, bassdi: T.bass, di: T.bass };

export const AMPS = {
  Amp_FenderTwinReverb: T.blackface(), Amp_FenderSuperReverb: T.blackface(), Amp_FenderVibroverb: T.blackface(false),
  Amp_FenderDeluxeReverb: T.blackface(false), Amp_FenderPrinceton: T.blackface(false),
  Amp_FenderProJunior: head("blackface", [K("VOLUME", "gain"), K("TONE", "treble"), M]),
  Amp_FenderChamp: head("tweed", [K("VOLUME", "gain")]),
  Amp_FenderChampion600: head("blackface", [K("VOLUME", "gain"), K("TONE", "treble")]),
  Amp_FenderSupersonic: head("blackface", [K("GAIN", "gain"), K("TREBLE", "treble"), K("BASS", "bass"), K("MIDDLE", "mid"), M, K("REVERB", "reverb")]),
  Amp_FenderVibroking: head("blackface", [K("VOLUME", "gain"), K("TREBLE", "treble"), K("BASS", "bass"), K("MID", "mid"), K("DWELL", "reverb"), K("FAT", "depth")]),
  Amp_FenderMH500: T.highgain(),
  Amp_FenderBassman300: T.svt(),
  Amp_MarshallJCM800: T.jcm(), Amp_MarshallJCM900: T.jcm(), Amp_MarshallDSL100H: T.jcm(), Amp_MarshallDSL15H: T.jcm(),
  Amp_MarshallJVM: T.jcm(), Amp_MarshallJVM410H: T.jcm(), Amp_MarshallSlash: T.jcm(), Amp_MarshallSlashGold: T.jcm(),
  Amp_MarshallSilverJubilee: head("silver", [K("PRESENCE", "presence"), K("BASS", "bass"), K("MIDDLE", "mid"), K("TREBLE", "treble"), M, K("INPUT GAIN", "gain")]),
  Amp_VoxAC30: T.vox(), Amp_VoxAC30Blue: T.vox(),
  Amp_MesaDualRectifier: T.rect(), Amp_MesaTripleRectifier: T.rect(), Amp_MesaTripleCrown: T.rect(), Amp_CA100: T.rect(), Amp_HG500: T.rect(),
  Amp_MesaCaliforniaTweed: T.tweed(), Amp_MesaCleanMKIII: T.mark(),
  Amp_OrangeRockerverb: T.orange(true), Amp_OrangeThunderverb: T.orange(),
  Amp_OrangeTinyTerror: head("orange", [M, K("TONE", "treble"), K("GAIN", "gain")]),
  Amp_OrangeDualTerror: head("orange", [M, K("TONE", "treble"), K("GAIN", "gain")]),
  Amp_OrangeAD200: head("orange", [K("GAIN", "gain"), K("BASS", "bass"), K("MIDDLE", "mid"), K("TREBLE", "treble"), M]),
  Amp_RolandJC120: T.jc(), Amp_CS90: T.jc(), Amp_CS120: T.jc(), Amp_AT120: T.jc(),
  Amp_Hiwatt: T.hiwatt(),
  Amp_Peavey5150: head("highgain", [K("PRE GAIN", "gain"), K("LOW", "bass"), K("MID", "mid"), K("HIGH", "treble"), K("POST GAIN", "master"),
                                    K("RESONANCE", "depth"), K("PRESENCE", "presence")]),
  Amp_DiezelVH4: T.highgain("DEEP"), Amp_EnglE650: T.highgain("DEPTH"), Amp_EnglPowerball: T.highgain("DEPTH"),
  Amp_AmpegSVTVR: T.svt(), Amp_Ampeg: T.svt(),
  /* its tone has a parametric EQ: a low and a high band and a sweepable middle, each with its frequency */
  Bass_Amp_BT880B: head("bass", [K("GAIN", "gain"), K("BASS", "bass"), K("LO", "lo"), K("LO FREQ", "loFreq", S), K("MID", "mid"), K("MID FREQ", "midFreq", S),
                                  K("HI", "hi"), K("HI FREQ", "hiFreq", S), K("TREBLE", "treble"), M]),
  Amp_EN30: head("orange", [K("GAIN", "gain"), K("BASS", "bass"), K("MIDDLE", "mid"), K("TREBLE", "treble"), K("PRESENCE", "presence"),
                            SW("BRIGHT", "bright", [["OFF", 0], ["ON", 6]]), M]),
  Amp_AmpegB15: head("bass", [K("VOLUME", "gain"), K("BASS", "bass"), K("TREBLE", "treble")]),
  DI_Amp_BassDriver: head("di", [K("LEVEL", "master"), K("TREBLE", "treble"), K("PRESENCE", "presence"), K("DRIVE", "gain"), K("BASS", "bass")]),
  DI_Amp_TubePre: head("di", [K("GAIN", "gain"), K("BASS", "bass"), K("MID", "mid"), K("TREBLE", "treble"), M]),
};
AMPS.Amp_Peavey5150II = AMPS.Amp_Peavey5150;

/* ── the sheet: "Rocksmith 2014 / Real World" ────────────────────────────── */
/* its names for the pieces, as Rocksmith shows them, and the library's keys */
const SHEET_KEYS = {
  "Dynamics - Compression": "Pedal_Compression", "Studio Compressor": "Rack_StudioCompressor", "SWOLE": "Pedal_Swole",
  "Dynamics - Limiter": "Pedal_Limiter", "Analog Delay 10-1000ms": "Pedal_AnalogueDelay", "Mod Delay 10-1000ms": "Pedal_ModDelay",
  "Classic NPN Delay": "Pedal_NPNDelay", "Tape Echo": "Rack_TapeEcho", "Oil Can Echo": "Pedal_OilCanEcho", "Studio Delay": "Rack_StudioDelay",
  "No-Fi Echo": "Pedal_NoFiEcho", "Valve Echo": "Pedal_ValveEcho", "Line Drive": "Pedal_LineDrive", "Standard Distortion": "Pedal_Distortion",
  "Alloy Distortion": "Pedal_MetalDistortion", "Shred Zone": "Pedal_ShredZone", "Germanium Drive": "Pedal_GermaniumDrive",
  "Custom Drive": "Pedal_CustomDrive", "Acoustic Emulator": "Pedal_AcousticEmulator", "Range Booster": "Pedal_RangeBooster",
  "Captain Fuzzle": "Pedal_CaptFuzzle", "Buzz 2": "Pedal_BuzzToo", "Buzz 1": "Pedal_BuzzOne", "Fuzz Was He": "Pedal_FuzzWasHe",
  "Analog Filter": "Pedal_BobFilter", "Noise Gate": "Pedal_NoiseGate", "5 Band EQ": "Pedal_EQ5", "Studio Parametric EQ": "Rack_StudioParametricEQ",
  "8 Band EQ": "Pedal_EQ8", "Auto Filter": "Pedal_AutoFilter", "Baked Rotatoe": "Pedal_BakedRotatoe", "Chorus 2.0": "Pedal_Chorus20",
  "Studio Chorus": "Rack_StudioChorus", "Chorus": "Pedal_Chorus", "Modern Flange": "Pedal_ModernFlanger", "Vintage Flanger": "Pedal_VintageFlanger",
  "80's Flanger": "Pedal_80sFlanger", "Classic Flanger": "Pedal_ClassicFlanger", "Shaver Phaser": "Pedal_ShaverPhaser", "Phaser - 363": "Pedal_Phaser",
  "Omni Mod (Universal Vibe)": "Pedal_OmniMod", "OctaveUp!": "Pedal_OctaveUp", "Octavius": "Pedal_Octavius", "MultiPitch": "Pedal_MultiPitch",
  "Tremolo": "Pedal_Tremolo", "Amp Trem": "Pedal_AmpTrem", "Multi-Trem": "Pedal_MultiTrem", "Amp Vibe": "Pedal_AmpVibe",
  "Plate Reverb": "Pedal_PlateVerb", "Studio Hall Reverb": "Rack_StudioHallReverb", "Spring Reverb": "Pedal_SpringReverb",
  "Digital Verb": "Pedal_DigitalVerb", "Studio Plate Reverb": "Rack_StudioPlateReverb", "Tube Spring Reverb": "Pedal_TubeSpring",
  "Cosmonaut Echo": "Pedal_CosmicEcho", "Studio Chamber Reverb": "Rack_StudioChamber", "Bit Crusher": "Pedal_BitCruncher",
  "BTQ-45": "Amp_BT45", "Cali-85": "Amp_CA85", "Cali- 100": "Amp_CA100", "AMTW-22": "Amp_TW22", "Marshall JCM 800": "Amp_MarshallJCM800",
  "The EN-30": "Amp_EN30", "CL-SS 90": "Amp_CS90", "Marshall 1962 \"BluesBreaker\"": "Amp_Marshall1962Bluesbreaker",
};

/** a CSV's rows (quoted fields may hold commas and line breaks) */
function csv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const one = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** the sheet's real gear for each library key: ["1972 MXR DynaComp", ...] */
export function sheetAlternatives(text) {
  const out = {};
  for (const r of csv(text)) {
    if (!/^-/.test(r[0] || "")) continue;                          // "-Amp-", "-DRIVE-": Rocksmith's gear ("[...]" rows are the Zoom's own)
    const key = SHEET_KEYS[one(r[1])];
    if (!key) continue;
    const alt = [r[4], r[5], r[6]].map(one).filter((s) => s && s !== "-");
    if (alt.length) out[key] = alt;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sheet = process.argv[2] ? sheetAlternatives(fs.readFileSync(process.argv[2], "utf8")) : {};
  let faces = 0, alts = 0;
  for (const sub of ["amps", "pedals"]) {
    const dir = path.join(GEAR, sub);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const file = path.join(dir, f), e = JSON.parse(fs.readFileSync(file, "utf8"));
      const face = sub === "pedals" ? PEDALS[e.key] : AMPS[e.key] || (THEME_OF_VOICE[e.voice] || THEME_OF_VOICE.generic)();
      if (face) { e.face = face; faces++; }
      if (sheet[e.key]) { e.alt = sheet[e.key]; alts++; }
      fs.writeFileSync(file, pretty(e) + "\n");
    }
  }
  console.log(`gear faces: ${faces} written, ${alts} with the sheet's real gear`);
  for (const k of [...Object.keys(PEDALS), ...Object.keys(AMPS)]) {
    const sub = k.startsWith("Rack_") || /Pedal_/.test(k) ? "pedals" : "amps";
    if (!fs.existsSync(path.join(GEAR, sub, k + ".json"))) console.warn(`no gear/${sub}/${k}.json`);
  }
}
