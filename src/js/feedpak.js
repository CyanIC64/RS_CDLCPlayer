// .feedpak / .sloppak (the same format under its earlier name) -> the payload
// the page consumes, the same shape as an arrangement XML conversion.
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
  return packFrom(zip, m, name, onProgress);
}

/* The pack's own files dropped as they are: an unpacked .feedpak folder
   (manifest.yaml, arrangements/*.json, stems/*.ogg, lyrics.json, cover), or
   loose arrangement JSONs in the pack's wire format with their audio, lyrics
   and cover - then a manifest is made up from what is there.
   entries: [{ name (path, "/"-separated), bytes }] */
const AUDIO_RX = /\.(ogg|mp3|wav|flac|m4a|aac|opus|webm)$/i, IMAGE_RX = /\.(jpe?g|png|webp|gif|bmp)$/i;
export function isArrangementJson(text) {
  try {
    const w = JSON.parse(text);
    return !!w && typeof w === "object" && !Array.isArray(w) && (Array.isArray(w.notes) || Array.isArray(w.chords));
  } catch { return false; }
}
export async function convertFeedpakFiles(entries, { name = "song", onProgress = () => {} } = {}) {
  onProgress("Reading the arrangements…");
  const norm = (n) => String(n).split(/[\\/]/).filter(Boolean).join("/");
  const all = entries.map((e) => ({ name: norm(e.name), bytes: e.bytes instanceof Uint8Array ? e.bytes : new Uint8Array(e.bytes) }));
  const man = all.find((e) => /(^|\/)manifest\.ya?ml$/i.test(e.name));
  /* paths are taken relative to the manifest's folder (or to the common folder) */
  let root = "";
  if (man) root = man.name.includes("/") ? man.name.slice(0, man.name.lastIndexOf("/") + 1) : "";
  else {
    const dirs = all.map((e) => e.name.includes("/") ? e.name.split("/")[0] + "/" : "");
    if (dirs.length && dirs.every((d) => d && d === dirs[0])) root = dirs[0];
  }
  const files = new Map();
  for (const e of all) files.set(e.name.startsWith(root) ? e.name.slice(root.length) : e.name, e.bytes);
  const byBase = new Map();
  for (const k of files.keys()){ const b = k.split("/").pop().toLowerCase(); byBase.set(b, byBase.has(b) ? null : k); }
  /* a path in the manifest, or the one file of that name (files dropped loose, without their folders) */
  const find = (n) => files.has(norm(n)) ? norm(n) : (byBase.get(String(n).split("/").pop().toLowerCase()) || null);
  const src = { has: (n) => !!find(n), read: async (n) => files.get(find(n)) };

  let m;
  if (man) m = yaml.load(utf8.decode(man.bytes)) || {};
  else {
    /* no manifest: the arrangements are the JSONs that hold notes or chords */
    m = { title: "", artist: "", arrangements: [], stems: [] };
    const used = new Set();
    for (const [k, b] of files) {
      if (!/\.json$/i.test(k)) continue;
      const text = utf8.decode(b);
      if (!isArrangementJson(text)) {
        try { const d = JSON.parse(text); if (Array.isArray(d) && d.length && d[0] && "w" in d[0]) m.lyrics = k; } catch {}
        continue;
      }
      const w = JSON.parse(text);
      const stem = k.split("/").pop().replace(/\.json$/i, "");
      let id = stem.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "arr", i = 2;
      while (used.has(id)) id = `${id}${i++}`;
      used.add(id);
      const fromFile = stem.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const taken = (x) => m.arrangements.some((a) => a.name.toLowerCase() === String(x).toLowerCase());
      const nm = w.name && !taken(w.name) ? w.name : fromFile;        // two "Lead"s: the second goes by its file name
      m.arrangements.push({ id, name: nm, file: k, tuning: w.tuning || [0, 0, 0, 0, 0, 0], capo: w.capo || 0 });
    }
    if (!m.arrangements.length) throw new Error("no arrangement JSON among the files (a chart JSON holds \"notes\" or \"chords\")");
    const order = (a) => /lead/i.test(a.name) ? 0 : /rhythm/i.test(a.name) ? 1 : /bass/i.test(a.name) ? 2 : 3;
    m.arrangements.sort((a, b) => order(a) - order(b));
    /* audio: every file in a stems folder is a stem; otherwise the song's one audio file */
    const audio = [...files.keys()].filter((k) => AUDIO_RX.test(k) && !/preview/i.test(k));
    const stems = audio.filter((k) => /(^|\/)stems\//i.test(k));
    const pick = stems.length ? stems : audio.sort((a, b) => files.get(b).length - files.get(a).length).slice(0, 1);
    m.stems = pick.map((k) => ({ id: k.split("/").pop().replace(/\.[^.]+$/, ""), file: k }));
    const img = [...files.keys()].filter((k) => IMAGE_RX.test(k))
      .sort((a, b) => (/cover|album|art|folder/i.test(b) ? 1 : 0) - (/cover|album|art|folder/i.test(a) ? 1 : 0));
    if (img.length) m.cover = img[0];
  }
  if (!m.title) m.title = String(name).replace(/\.[^.]+$/, "");
  return packFrom(src, m, name, onProgress);
}

/* the payload from a manifest and a source of its files ({ has, read }) */
async function packFrom(zip, m, name, onProgress) {

  const arrangements = [];
  let firstWire = null;
  for (const a of m.arrangements || []) {
    if (!a || !a.file) continue;
    const wire = JSON.parse(utf8.decode(await zip.read(a.file)));
    if (!firstWire || (!(firstWire.beats || []).length && (wire.beats || []).length)) firstWire = wire;   // the beat grid and sections
    arrangements.push({
      id: a.id, name: a.name || a.id,
      tuning: a.tuning || [0, 0, 0, 0, 0, 0], capo: a.capo || 0,
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
    const type = /\.mp3$/i.test(s.file) ? "audio/mpeg" : /\.wav$/i.test(s.file) ? "audio/wav" : /\.flac$/i.test(s.file) ? "audio/flac" : "audio/ogg";
    stems.push({ id: s.id || s.file, blob: new Blob([raw], { type }) });
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
