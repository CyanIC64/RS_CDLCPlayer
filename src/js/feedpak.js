// .feedpak -> the same payload shape as a .psarc conversion.
//
// A feedpak is already converted: a zip with manifest.yaml, wire-format
// arrangement JSONs, Ogg stems, a cover image and (usually) lyrics tokens.
// Nothing here parses a chart, so this path is mostly unzip + reassembly.
import yaml from "../vendor/js-yaml.mjs";
import { Zip } from "./zip.js";
import { lyricsFromTokens, lyricsProblem, tonesForPage } from "./convert.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const utf8 = new TextDecoder("utf-8", { fatal: false });
const LYRIC_LINE_RE = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/;

/* the editable .lyrics.txt form, one `[mm:ss.cc] line` per row */
function lyricsFromText(text) {
  const out = [];
  for (const ln of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = LYRIC_LINE_RE.exec(ln);
    if (!m) continue;
    const txt = m[3].trim();
    if (txt) out.push({ t: r3(parseInt(m[1], 10) * 60 + parseFloat(m[2])), end: 0, text: txt, syl: [] });
  }
  for (let i = 0; i < out.length; i++) {
    const next = i + 1 < out.length ? out[i + 1].t : out[i].t + 4;
    out[i].end = r3(Math.min(next, out[i].t + 8));
  }
  return out;
}

export async function convertFeedpak(bytes, { name = "song.feedpak", onProgress = () => {} } = {}) {
  onProgress("Opening the feedpak…");
  const zip = new Zip(bytes);
  const manifestName = zip.has("manifest.yaml") ? "manifest.yaml" : (zip.has("manifest.yml") ? "manifest.yml" : null);
  if (!manifestName) throw new Error("not a .feedpak (no manifest.yaml inside)");
  const m = yaml.load(utf8.decode(await zip.read(manifestName))) || {};

  const arrangements = [];
  let firstWire = null;
  for (const a of m.arrangements || []) {
    if (!a || !a.file) continue;
    const wire = JSON.parse(utf8.decode(await zip.read(a.file)));
    if (!firstWire) firstWire = wire;
    arrangements.push({
      id: a.id, name: a.name || a.id,
      tuning: a.tuning || [0, 0, 0, 0, 0, 0], capo: a.capo || 0,
      centOffset: Number(a.cent_offset ?? a.centOffset) || 0,
      notes: wire.notes || [], chords: wire.chords || [],
      templates: wire.templates || [], anchors: wire.anchors || [],
      handshapes: wire.handshapes || [],
      phrases: (wire.phrases || []).map((p) => ({
        start_time: p.start_time, end_time: p.end_time, max_difficulty: p.max_difficulty,
      })),
      tones: tonesForPage(wire.tones, m.title || ""),
    });
  }
  if (!arrangements.length) throw new Error("the feedpak has no arrangements");

  let lyrics = { lines: [], source: m.lyrics_source || "" };
  if (m.lyrics && zip.has(m.lyrics)) {
    const text = utf8.decode(await zip.read(m.lyrics));
    let lines = [];
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data) && data.length && data[0] && typeof data[0] === "object" && "w" in data[0]) {
        lines = lyricsFromTokens(data);
      } else {
        lines = lyricsFromText(text);
      }
    } catch {
      lines = lyricsFromText(text);
    }
    const problem = lines.length ? lyricsProblem(lines) : "";
    lyrics = problem ? { lines: [], source: lyrics.source, error: problem } : { lines, source: lyrics.source };
  }

  let coverBlob = null;
  if (m.cover && zip.has(m.cover)) {
    const raw = await zip.read(m.cover);
    coverBlob = new Blob([raw], { type: /\.png$/i.test(m.cover) ? "image/png" : "image/jpeg" });
  }

  const stems = [];
  for (const s of m.stems || []) {
    if (!s || !s.file || !zip.has(s.file)) continue;
    onProgress("Reading " + s.file + "…");
    const raw = await zip.read(s.file);
    stems.push({ id: s.id || s.file, blob: new Blob([raw], { type: "audio/ogg" }) });
  }

  const payload = {
    meta: {
      title: m.title || "", artist: m.artist || "", album: m.album || "",
      year: m.year || 0, author: m.author || "",
      duration: r3(Number(m.duration) || 0), pack: name, converted: false,
      cover: Boolean(coverBlob), note_offset_ms: Number(m.note_offset_ms) || 0,
    },
    arrangements,
    beats: (firstWire && firstWire.beats) || [],
    sections: (firstWire && firstWire.sections) || [],
    lyrics,
    stems: (m.stems || []).filter((s) => s && s.file).map((s) => ({ id: s.id, file: s.file })),
  };
  return { payload, coverBlob, stems };
}
