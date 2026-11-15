// Minimal ZIP reader for .feedpak files (stored + deflate), browser-only.
// Central directory first, then only the entries asked for are inflated, so a
// 25 MB feedpak does not unpack its audio until the stem is actually needed.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const u16 = (dv, o) => dv.getUint16(o, true);
const u32 = (dv, o) => dv.getUint32(o, true);
const utf8 = new TextDecoder("utf-8", { fatal: false });

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter();
  const r = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  const write = (async () => {
    try { await w.write(bytes); await w.close(); return null; } catch (e) { return e; }
  })();
  let readErr = null;
  try {
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } catch (e) { readErr = e; }
  const writeErr = await write;
  if (readErr) throw readErr;
  if (writeErr) throw writeErr;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export class Zip {
  constructor(bytes) {
    this.bytes = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.entries = new Map();
    this._readCentralDirectory();
  }

  _readCentralDirectory() {
    const len = this.bytes.length;
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
      if (u32(this.dv, i) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("not a zip file (no central directory)");
    const count = u16(this.dv, eocd + 10);
    const cdOffset = u32(this.dv, eocd + 16);
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (u32(this.dv, p) !== SIG_CENTRAL) throw new Error("corrupt zip central directory");
      const method = u16(this.dv, p + 10);
      const compSize = u32(this.dv, p + 20);
      const size = u32(this.dv, p + 24);
      const nameLen = u16(this.dv, p + 28);
      const extraLen = u16(this.dv, p + 30);
      const commentLen = u16(this.dv, p + 32);
      const localOffset = u32(this.dv, p + 42);
      const name = utf8.decode(this.bytes.subarray(p + 46, p + 46 + nameLen));
      this.entries.set(name, { method, compSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  get names() { return [...this.entries.keys()]; }

  has(name) { return this.entries.has(name); }

  async read(name) {
    const e = this.entries.get(name);
    if (!e) return null;
    const dv = this.dv;
    if (u32(dv, e.localOffset) !== SIG_LOCAL) throw new Error("corrupt zip local header: " + name);
    const nameLen = u16(dv, e.localOffset + 26);
    const extraLen = u16(dv, e.localOffset + 28);
    const start = e.localOffset + 30 + nameLen + extraLen;
    const raw = this.bytes.subarray(start, start + e.compSize);
    if (e.method === 0) return raw;
    if (e.method === 8) {
      const out = await inflateRaw(raw);
      if (e.size && out.length !== e.size) throw new Error(`zip entry ${name}: ${out.length} of ${e.size} bytes`);
      return out;
    }
    throw new Error(`zip entry ${name}: unsupported compression ${e.method}`);
  }
}
