// Whole conversion: .psarc bytes -> the exact payload the page consumes
// (server.py WebPack.payload()), plus the audio bytes, all in the browser.
import { Psarc } from "../psarc.js";
import { decryptSng, sngIsSigned } from "./sng.js";
import { parseArchiveXml, clearXmlCache } from "./xml.js";
import {
  arrangementToWire, hasArrangementXml, loadSong, loadSongFromExtract,
} from "./song.js";
import { extractTonesForSong, manifestCentOffsets } from "./tones.js";
import { toneRig } from "./rig.js";

const r3 = (v) => Math.round(v * 1000) / 1000;

function arrId(name, used) {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "arr";
  let cand = base, i = 2;
  while (used.has(cand)) cand = `${base}${i++}`;
  used.add(cand);
  return cand;
}

// ── lyrics (psarc2feedpak._parse_lyrics + play_song._lyrics_from_tokens) ────
const decodeText = (b) => new TextDecoder("utf-8", { fatal: false }).decode(b);

// SNG vocals (sng_vocals.py) -- AES-CTR + zlib + 60-byte records.
async function parseVocalsSng(bytes, platform) {
  const body = await decryptSng(bytes, platform);
  const headerSkip = 16;
  if (body.length < headerSkip + 4) return [];
  for (let i = 0; i < headerSkip; i++) if (body[i] !== 0) return [];
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const count = dv.getUint32(headerSkip, true);
  if (!count || body.length < headerSkip + 4 + count * 60) return [];
  const out = [];
  let off = headerSkip + 4;
  for (let i = 0; i < count; i++) {
    const time = dv.getFloat32(off, true);
    const length = dv.getFloat32(off + 8, true);
    const raw = body.subarray(off + 12, off + 60);
    const z = raw.indexOf(0);
    const cut = z >= 0 ? raw.subarray(0, z) : raw;
    let lyric;
    try { lyric = new TextDecoder("utf-8", { fatal: true }).decode(cut); }
    catch { lyric = new TextDecoder("latin1").decode(cut); }
    out.push({ t: r3(time), d: r3(length), w: lyric });
    off += 60;
  }
  return out;
}

export async function parseLyrics(files) {
  const names = [...files.keys()].sort();
  for (const n of names) {
    if (!n.toLowerCase().endsWith(".xml")) continue;
      let root;
    try { root = parseArchiveXml(files, n); } catch { continue; }
    if (root.tag !== "vocals") continue;
    const toks = root.children
      .filter((c) => c.tag === "vocal")
      .map((v) => ({
        t: r3(parseFloat(v.attrs.time || "0")),
        d: r3(parseFloat(v.attrs.length || "0")),
        w: v.attrs.lyric || "",
      }));
    if (toks.length) return { tokens: toks, source: "xml" };
  }
  for (const n of names) {
    if (!n.toLowerCase().includes("vocals") || !n.toLowerCase().endsWith(".sng")) continue;
    const platform = /\/macos\//i.test(n) || /\/mac\//i.test(n) ? "mac" : "pc";
    try {
      const toks = await parseVocalsSng(files.get(n), platform);
      if (toks.length) return { tokens: toks, source: "sng" };
    } catch { /* try the next one */ }
  }
  return { tokens: [], source: "" };
}

function joinWords(parts) {
  let out = "", prevSyl = false;
  for (const [w, syl] of parts) {
    if (!out) out = w;
    else if (prevSyl) out += w;
    else out += " " + w;
    prevSyl = syl;
  }
  return out;
}

/* A pause this long between two sung words ends the line, even when the chart
   forgot to mark the line end: one line is never held on screen across an
   instrumental. */
export const LYRIC_LINE_GAP = 10.0;

export function lyricsFromTokens(tokens) {
  const lines = [];
  let cur = [], syl = [], start = null, last = 0, prevT = null;
  const flush = () => {
    if (cur.length) lines.push({ t: r3(start), end: r3(last), text: joinWords(cur), syl });
    cur = []; syl = []; start = null; last = 0;
  };
  for (const tok of tokens) {
    if (!tok || typeof tok !== "object") continue;
    let w = String(tok.w ?? "");
    const t = Number(tok.t || 0), d = Number(tok.d || 0);
    const eol = w.endsWith("+");
    if (eol) w = w.slice(0, -1);
    const cont = w.endsWith("-");
    if (cont) w = w.slice(0, -1);
    /* Some charts carry blank "words" (a space) as placeholders during an
       instrumental. They are not sung: they must neither start a line nor
       stretch it - one of them made a line of Through the Fire and Flames
       last 80 seconds and the whole lyric sheet was hidden as broken. */
    if (w.trim()) {
      if (cur.length && prevT !== null && t - prevT > LYRIC_LINE_GAP) flush();
      if (start === null) start = t;
      const glue = !cur.length || cur[cur.length - 1][1] ? "" : " ";
      cur.push([w, cont]);
      syl.push([r3(t), r3(d), glue + w]);
      last = Math.max(last, d > 0 ? t + d : t + 0.3);
      prevT = t;
    }
    if (eol) flush();
  }
  flush();
  return lines;
}

const isWide = (ch) => /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch);
function textWidth(s) { let n = 0; for (const ch of s) n += isWide(ch) ? 2 : 1; return n; }

export function lyricsProblem(lines) {
  for (const ln of lines) {
    const n = (ln.syl || []).length;
    if (n > 45) return lines.length === 1 ? `the lyrics have no line breaks (${n} words in one line)` : `one lyric line holds ${n} words`;
    const w = textWidth(ln.text || "");
    if (w > 110) return `one lyric line is ${w} characters wide`;
    if (n > 1 && (ln.end || 0) - (ln.t || 0) > 45) return `one lyric line lasts ${Math.trunc(ln.end - ln.t)} seconds`;
  }
  return "";
}

// ── tone read-out (play_song._tones_for_page) ───────────────────────────────
const DESCRIPTOR_RE = /^\$\[\d+\]\s*/;
function toneRealName(defn, title) {
  const words = [];
  for (const d of defn.ToneDescriptors || []) {
    if (typeof d !== "string") continue;
    const w = d.replace(DESCRIPTOR_RE, "").trim();
    if (w) words.push(w.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  if (!words.length) return "";
  let sep = defn.NameSeparator;
  sep = typeof sep === "string" && sep.trim() ? sep : " - ";
  return title ? `${title}${sep}${words.join(" ")}` : words.join(" ");
}

function tonesForPage(tones, title, { bass = false } = {}) {
  const out = { base: "", changes: [], names: {} };
  if (!tones || typeof tones !== "object") return out;
  const defs = (tones.definitions || []).filter((d) => d && typeof d === "object");
  for (const d of defs) {
    const key = d.Key || d.Name || "";
    if (typeof key !== "string" || !key) continue;
    const entry = { raw: key, real: toneRealName(d, title) };
    const r = toneRig(d, { bass });
    if (r) { entry.kind = r.kind; entry.rig = r.rig; }
    out.names[key] = entry;
    if (typeof d.Name === "string" && d.Name) if (!(d.Name in out.names)) out.names[d.Name] = entry;
  }
  if (typeof tones.base === "string" && tones.base.trim()) out.base = tones.base.trim();
  else if (defs.length === 1) out.base = defs[0].Key || "";
  for (const c of tones.changes || []) {
    if (!c || typeof c.name !== "string") continue;
    const tv = Number(c.t);
    if (!Number.isFinite(tv)) continue;
    out.changes.push({ t: r3(tv), name: c.name });
  }
  out.changes.sort((a, b) => a.t - b.t);
  return out;
}

export const OFFICIAL_SONG =
  "this is an official song from the game's store. Play Song only opens custom songs (CDLC) and .feedpak files";

// ── the payload ─────────────────────────────────────────────────────────────
export async function convertPsarc(bytes, { name = "song.psarc", onProgress = () => {} } = {}) {
  onProgress("Opening the archive…");
  const psarc = new Psarc(bytes);
  const names = await psarc.names();

  const wanted = names.filter((n) => /\.(xml|sng|json|hsan)$/i.test(n));
  const files = new Map();
  for (let i = 0; i < wanted.length; i++) {
    files.set(wanted[i], await psarc.read(wanted[i]));
    if ((i & 7) === 0) onProgress(`Reading the chart… ${Math.round((i / wanted.length) * 100)}%`);
  }
  const hasDds = names.some((n) => n.toLowerCase().endsWith(".dds"));

  /* Official songs are not opened - only custom songs and .feedpak files.
     A package built by a custom-song tool names that tool in toolkit.version;
     otherwise the chart files are checked for the store's signature. */
  onProgress("Checking the song…");
  if (!names.some((n) => /toolkit\.version$/i.test(n))) {
    const sngs = [...files.keys()].filter((n) => /\.sng$/i.test(n) && !/vocals/i.test(n));
    for (const n of sngs.slice(0, 3)) {
      if (await sngIsSigned(files.get(n), /macos|\/mac\//i.test(n) ? "mac" : "pc")) {
        throw new Error(OFFICIAL_SONG);
      }
    }
  }

  const payload = await buildPayload(files, { name, hasCover: hasDds, onProgress });
  return { payload, psarc, names, files };
}

/* Raw arrangement XML - a song as charting tools leave it in a project folder,
   not packed yet: one XML per arrangement, a vocals XML for the lyrics. The
   audio and the cover art are not handled here (see the page / the worker).
   entries: [{ name, bytes }] - only the .xml (and manifest .json) files matter. */
export async function convertXmlSet(entries, { name = "song", onProgress = () => {} } = {}) {
  onProgress("Reading the XML…");
  const files = new Map();
  for (const e of entries) {
    if (!/\.(xml|json)$/i.test(e.name)) continue;
    const base = e.name.split(/[\\/]/).join("/");
    let key = base, i = 2;
    while (files.has(key)) key = base.replace(/(\.[^.]+)$/, `_${i++}$1`);
    files.set(key, e.bytes instanceof Uint8Array ? e.bytes : new Uint8Array(e.bytes));
  }
  if (!files.size) throw new Error("no .xml file among the dropped files");
  if (!hasArrangementXml(files)) {
    throw new Error("no arrangement XML found - a chart XML has a <song> root (vocals alone cannot be played)");
  }
  const payload = await buildPayload(files, { name, hasCover: false, onProgress });
  if (!payload.meta.title) payload.meta.title = name.replace(/\.[^.]+$/, "");
  return { payload };
}

async function buildPayload(files, { name, hasCover, onProgress }) {
  onProgress("Parsing the arrangements…");
  const xmlMode = hasArrangementXml(files);
  const song = xmlMode ? loadSong(files, true) : await loadSongFromExtract(files);
  if (!song.arrangements.length) throw new Error("no playable arrangements found");

  onProgress("Reading tones and lyrics…");
  const sngTones = new Map(song.arrangements.filter((a) => a.sng_tones).map((a) => [a.name, a.sng_tones]));
  const tonesByArr = extractTonesForSong(files, song.arrangements.map((a) => a.name), sngTones);
  const centsByArr = manifestCentOffsets(files, song.arrangements.map((a) => a.name));
  const { tokens, source } = await parseLyrics(files);
  let lines = lyricsFromTokens(tokens);
  let lyricError = "";
  if (lines.length) {
    const problem = lyricsProblem(lines);
    if (problem) { lyricError = problem; lines = []; }
  } else if (tokens.length === 0 && source === "") {
    lines = [];
  }

  const used = new Set();
  clearXmlCache(); // the arrangement DOMs are no longer needed; let them go before the payload is built
  const arrs = [];
  let first = true;
  const wires = [];
  for (const arr of song.arrangements) {
    const aid = arrId(arr.name, used);
    arr.tones = tonesByArr.get(arr.name) || null;
    const wire = arrangementToWire(arr);
    if (first) {
      wire.beats = song.beats.map((b) => ({ time: r3(b.time), measure: b.measure }));
      wire.sections = song.sections.map((s) => ({ name: s.name, number: s.number, time: r3(s.time) }));
      first = false;
    }
    wires.push({ arr, aid, wire });
    arrs.push({
      id: aid,
      name: arr.name,
      tuning: arr.tuning,
      capo: arr.capo,
      // the arrangement XML's <centOffset> wins; a packed song (.sng) only has the manifest's
      centOffset: Number.isFinite(arr.cent_offset) ? arr.cent_offset : (centsByArr.get(arr.name) || 0),
      notes: wire.notes,
      chords: wire.chords,
      templates: wire.templates,
      anchors: wire.anchors,
      handshapes: wire.handshapes,
      phrases: (wire.phrases || []).map((p) => ({
        start_time: p.start_time, end_time: p.end_time, max_difficulty: p.max_difficulty,
      })),
      tones: tonesForPage(wire.tones, song.title || "", { bass: /bass/i.test(arr.name) }),
    });
  }

  const firstWire = wires[0].wire;
  const payload = {
    meta: {
      title: song.title || "",
      artist: song.artist || "",
      album: song.album || "",
      year: song.year || 0,
      author: "",
      duration: r3(song.song_length || 0),
      pack: name,
      converted: true,
      cover: !!hasCover,
      note_offset_ms: 0.0,
    },
    arrangements: arrs,
    beats: firstWire.beats || [],
    sections: firstWire.sections || [],
    lyrics: lyricError ? { lines: [], source, error: lyricError } : { lines, source },
    stems: [{ id: "full", file: "stems/full.wav" }],
  };
  return payload;
}

export { tonesForPage };
