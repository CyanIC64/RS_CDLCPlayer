// Minimal XML tree shared by the browser and Node paths.
//
// The browser path uses DOMParser (fast, native); Node gets a small parser for
// the same machine-generated arrangement XML. Both produce identical node objects:
//   { tag, attrs: {name: value}, children: [node], text: string }

export function elementFromDom(el) {
  xmlStats.count = (xmlStats.count || 0) + 1;
  const attrs = {};
  for (const a of el.attributes) attrs[a.name] = a.value;
  const children = [];
  let text = "";
  for (const c of el.childNodes) {
    if (c.nodeType === 1) children.push(elementFromDom(c));
    else if (c.nodeType === 3 || c.nodeType === 4) text += c.nodeValue;
  }
  return { tag: el.tagName, attrs, children, text };
}

export const xmlStats = { parses: 0, elements: 0, domMs: 0, convertMs: 0 };

// The scanner below is ~10x faster than Chromium's DOMParser on the 7-11 MB
// arrangement XMLs CDLC ships, so it is tried first; DOMParser stays as the
// fallback for anything the scanner refuses.
export function parseXml(text) {
  const t0 = performance.now();
  try {
    const root = parseXmlLite(text);
    xmlStats.parses++;
    xmlStats.domMs += performance.now() - t0;
    return root;
  } catch (e) {
    if (typeof DOMParser === "undefined") throw e;
    const doc = new DOMParser().parseFromString(text.replace(/^\uFEFF/, ""), "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    if (err) throw new Error("xml parse error: " + err.textContent.slice(0, 200));
    if (!doc.documentElement) throw new Error("xml parse error: no root element");
    const t1 = performance.now();
    const root = elementFromDom(doc.documentElement);
    const t2 = performance.now();
    xmlStats.parses++;
    xmlStats.domMs += t1 - t0;
    xmlStats.convertMs += t2 - t1;
    xmlStats.elements += xmlStats.count;
    return root;
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function unescapeXml(s) {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === "#") {
      const code = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[g] ?? m;
  });
}

const TAG_RE = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseXmlLite(text) {
  const body = text.replace(/^\uFEFF/, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const root = { tag: "#doc", attrs: {}, children: [], text: "" };
  const stack = [root];
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(body))) {
    if (m.index > last) {
      const t = body.slice(last, m.index);
      if (t.trim()) stack[stack.length - 1].text += unescapeXml(t);
    }
    last = TAG_RE.lastIndex;
    const [, closing, tag, attrText, selfClose] = m;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    ATTR_RE.lastIndex = 0;
    let a;
    while ((a = ATTR_RE.exec(attrText))) attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? "");
    const node = { tag, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  if (stack.length !== 1) throw new Error("xml parse error: unclosed element");
  const top = root.children.find((c) => c.tag !== "#comment");
  if (!top) throw new Error("xml parse error: no root element");
  return top;
}

// ── tiny element helpers (mirroring ElementTree's find/findall/get) ──────────
export function find(el, tag) {
  return el ? el.children.find((c) => c.tag === tag) || null : null;
}
export function findAll(el, tag) {
  return el ? el.children.filter((c) => c.tag === tag) : [];
}
export function getAttr(el, name, dflt = null) {
  if (!el) return dflt;
  const v = el.attrs[name];
  return v === undefined ? dflt : v;
}
export function textOf(el) {
  return el ? el.text.trim() : "";
}

// ── per-archive XML tree cache (song.py's xml_cache) ────────────────────────
// One conversion reads each arrangement XML several times (to find the
// arrangements, for metadata, for the notes, for tones, for lyrics) and the
// parse is the expensive part. Cleared by the caller when the conversion ends
// so the DOMs do not stay alive.
const archiveCache = new Map();

export function parseArchiveXml(files, name) {
  const hit = archiveCache.get(name);
  if (hit) return hit;
  const root = parseXml(new TextDecoder("utf-8", { fatal: false }).decode(files.get(name)));
  archiveCache.set(name, root);
  return root;
}

export function clearXmlCache() {
  archiveCache.clear();
}
