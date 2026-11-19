// Tone extraction -- port of tones.py (definitions from the manifest JSON,
// in-song switches from the arrangement XML).
import { find, findAll, getAttr, textOf, parseArchiveXml } from "./xml.js";

const NON_TONE = new Set(["vocals", "showlights", "jvocals"]);
const tokens = (s) => new Set((s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
const stemOf = (n) => {
  const b = n.slice(n.lastIndexOf("/") + 1);
  const i = b.lastIndexOf(".");
  return (i < 0 ? b : b.slice(0, i)).toLowerCase();
};
const decodeText = (b) => new TextDecoder("utf-8", { fatal: false }).decode(b);

/* the manifest entry's Attributes for an arrangement, and the manifest's file name */
function manifestAttributes(jsonNames, files, arrName) {
  const target = (arrName || "").trim().toLowerCase();
  for (const name of jsonNames) {
    let data;
    try { data = JSON.parse(decodeText(files.get(name))); } catch { continue; }
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const entries = data.Entries;
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    for (const entry of Object.values(entries)) {
      if (!entry || typeof entry !== "object") continue;
      const attrs = entry.Attributes;
      if (!attrs || typeof attrs !== "object") continue;
      const raw = attrs.ArrangementName;
      const name2 = typeof raw === "string" ? raw.trim() : "";
      if (!name2 || name2.toLowerCase() !== target) continue;
      return { attrs, name };
    }
  }
  return null;
}

/* The tuning's offset from A440 in cents, per arrangement name, from the
   manifest (Attributes.CentOffset). A .sng carries no such field, so a packed
   song only has it here. */
export function manifestCentOffsets(files, arrNames) {
  const jsonNames = [...files.keys()].sort().filter((n) => n.toLowerCase().endsWith(".json"));
  const out = new Map();
  for (const arrName of arrNames) {
    const hit = manifestAttributes(jsonNames, files, arrName);
    const c = hit ? Number(hit.attrs.CentOffset) : NaN;
    if (Number.isFinite(c)) out.set(arrName, c);
  }
  return out;
}

function manifestToneData(jsonNames, files, arrName) {
  const hit = manifestAttributes(jsonNames, files, arrName);
  if (!hit) return { definitions: [], idName: new Map(), jsonStem: null };
  const { attrs, name } = hit;

  const definitions = [];
  const seen = new Set();
  const rawTones = Array.isArray(attrs.Tones) ? attrs.Tones : [];
  for (const tone of rawTones) {
    if (!tone || typeof tone !== "object") continue;
    const key = tone.Key;
    if (typeof key === "string" && key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    definitions.push(tone);
  }
  const idName = new Map();
  ["Tone_A", "Tone_B", "Tone_C", "Tone_D"].forEach((k, i) => {
    const v = attrs[k];
    if (typeof v === "string" && v) idName.set(i, v);
  });
  return { definitions, idName, jsonStem: stemOf(name) };
}

function xmlToneChanges(files, name, idName) {
  let root;
  try { root = parseArchiveXml(files, name); } catch { return { base: "", changes: [] }; }
  if (root.tag !== "song") return { base: "", changes: [] };
  let base = "";
  const tb = find(root, "tonebase");
  if (tb && textOf(tb)) base = textOf(tb);
  const changes = [];
  const tonesEl = find(root, "tones");
  if (tonesEl) {
    for (const t of findAll(tonesEl, "tone")) {
      const time = getAttr(t, "time");
      let name = getAttr(t, "name", "");
      const id = getAttr(t, "id", "");
      if ((!name || name === "N/A") && id) {
        const n = parseInt(id, 10);
        if (!Number.isNaN(n)) name = idName.get(n) ?? `Tone ${id}`;
      }
      if (time && name) {
        const tv = parseFloat(time);
        if (!Number.isFinite(tv)) continue;
        changes.push({ t: Math.round(tv * 1000) / 1000, name });
      }
    }
  }
  return { base, changes };
}

function extractOne(arrName, jsonNames, xmlNames, files, sngTones) {
  if (NON_TONE.has((arrName || "").trim().toLowerCase())) return null;
  const { definitions, idName, jsonStem } = manifestToneData(jsonNames, files, arrName);
  let xmlName = null;
  if (jsonStem) xmlName = xmlNames.find((n) => stemOf(n) === jsonStem) || null;
  if (!xmlName) {
    const target = tokens(arrName);
    if (target.size) {
      const candidates = [];
      for (const n of xmlNames) {
        const st = tokens(stemOf(n));
        const subset = [...target].every((t) => st.has(t));
        if (!subset) continue;
        let extra = 0;
        for (const t of st) if (!target.has(t)) extra++;
        candidates.push([extra, n]);
      }
      if (candidates.length) {
        const best = Math.min(...candidates.map((c) => c[0]));
        const tied = candidates.filter((c) => c[0] === best).map((c) => c[1]);
        if (tied.length === 1) xmlName = tied[0];
      }
    }
  }
  let base = "", changes = [];
  if (xmlName) ({ base, changes } = xmlToneChanges(files, xmlName, idName));
  if (!changes.length && Array.isArray(sngTones)) {
    for (const s of sngTones) {
      const name = idName.get(s.id);
      if (name && Number.isFinite(s.t)) changes.push({ t: s.t, name });
    }
  }
  if (!base && idName.has(0)) base = idName.get(0);
  if (!base && !changes.length && !definitions.length) return null;
  const result = {};
  if (base) result.base = base;
  if (changes.length) result.changes = changes.sort((a, b) => a.t - b.t);
  if (definitions.length) result.definitions = definitions;
  return result;
}

export function extractTonesForSong(files, arrNames, sngTones = new Map()) {
  const names = [...files.keys()].sort();
  const jsonNames = names.filter((n) => n.toLowerCase().endsWith(".json"));
  const xmlNames = names.filter((n) => n.toLowerCase().endsWith(".xml"));
  const out = new Map();
  for (const name of arrNames) {
    const block = extractOne(name, jsonNames, xmlNames, files, sngTones.get(name));
    if (block) out.set(name, block);
  }
  return out;
}
