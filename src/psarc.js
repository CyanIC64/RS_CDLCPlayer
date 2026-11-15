// PSARC archive reader -- browser and Node, no dependencies.
//
// Direct port of psarc.py: header -> AES-256-CFB-decrypted TOC -> block table
// -> per-entry zlib streams. Inflating uses DecompressionStream('deflate'),
// which is the zlib wrapper Python's zlib.decompress expects.
//
// Random access works on any Uint8Array (in a browser: a File read through
// Blob.slice + arrayBuffer, so a 300 MB archive is never fully copied unless
// the caller wants that).

const MAGIC = 0x50534152; // "PSAR"
const BLOCK_SIZE_DEFAULT = 65536;
const ENTRY_SIZE = 30;

export const ARC_KEY = hexToBytes(
  "C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C",
);
export const ARC_IV = hexToBytes("E915AA018FEF71FC508132E4BB4CEB42");

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// ── AES-256 block encryption (CFB only ever needs the forward direction) ──────
const rotl8 = (v, n) => ((v << n) | (v >>> (8 - n))) & 0xff;
const SBOX = (() => {
  const mul = (a, b) => {
    let p = 0;
    for (let i = 0; i < 8; i++) {
      if (b & 1) p ^= a;
      const hi = a & 0x80;
      a = (a << 1) & 0xff;
      if (hi) a ^= 0x1b;
      b >>>= 1;
    }
    return p;
  };
  const pow = (a, n) => {
    let r = 1;
    while (n > 0) {
      if (n & 1) r = mul(r, a);
      a = mul(a, a);
      n >>>= 1;
    }
    return r;
  };
  const s = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    const inv = x === 0 ? 0 : pow(x, 254);
    s[x] = inv ^ rotl8(inv, 1) ^ rotl8(inv, 2) ^ rotl8(inv, 3) ^ rotl8(inv, 4) ^ 0x63;
  }
  return s;
})();
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];

// A T-table AES would be ~10x faster; this is plenty for a TOC (tens of KB).
function aes256Schedule(key) {
  const nk = 8, nr = 14, total = 4 * (nr + 1);
  const rk = new Uint8Array(16 * (nr + 1));
  rk.set(key, 0);
  for (let i = nk; i < total; i++) {
    let t0 = rk[4 * i - 4], t1 = rk[4 * i - 3], t2 = rk[4 * i - 2], t3 = rk[4 * i - 1];
    if (i % nk === 0) {
      const s0 = SBOX[t1] ^ RCON[i / nk - 1], s1 = SBOX[t2], s2 = SBOX[t3], s3 = SBOX[t0];
      t0 = s0; t1 = s1; t2 = s2; t3 = s3;
    } else if (i % nk === 4) {
      t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3];
    }
    rk[4 * i] = rk[4 * (i - nk)] ^ t0;
    rk[4 * i + 1] = rk[4 * (i - nk) + 1] ^ t1;
    rk[4 * i + 2] = rk[4 * (i - nk) + 2] ^ t2;
    rk[4 * i + 3] = rk[4 * (i - nk) + 3] ^ t3;
  }
  return rk;
}

function encryptBlock(rk, block) {
  const s = Uint8Array.from(block);
  const addKey = (r) => { for (let i = 0; i < 16; i++) s[i] ^= rk[16 * r + i]; };
  const xtime = (x) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
  addKey(0);
  for (let r = 1; r <= 14; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    let t;
    t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t;
    t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = t;
    if (r !== 14) {
      for (let c = 0; c < 4; c++) {
        const i = 4 * c;
        const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
        const all = a0 ^ a1 ^ a2 ^ a3;
        s[i] = a0 ^ all ^ xtime(a0 ^ a1);
        s[i + 1] = a1 ^ all ^ xtime(a1 ^ a2);
        s[i + 2] = a2 ^ all ^ xtime(a2 ^ a3);
        s[i + 3] = a3 ^ all ^ xtime(a3 ^ a0);
      }
    }
    addKey(r);
  }
  return s;
}

// CFB-128 over one buffer: P_i = C_i ^ E(C_{i-1}).
export function cfbDecrypt(key, iv, ciphertext) {
  const rk = aes256Schedule(key);
  const out = new Uint8Array(ciphertext.length);
  let feedback = Uint8Array.from(iv);
  for (let off = 0; off < ciphertext.length; off += 16) {
    const stream = encryptBlock(rk, feedback);
    const n = Math.min(16, ciphertext.length - off);
    for (let i = 0; i < n; i++) out[off + i] = ciphertext[off + i] ^ stream[i];
    feedback = ciphertext.slice(off, off + 16);
  }
  return out;
}

// ── zlib helper ──────────────────────────────────────────────────────────────
// `expected` stops the inflate as soon as that many bytes are out. SNG bodies
// carry a 56-byte signature after the zlib stream and DecompressionStream
// rejects trailing bytes on close, so stopping at the known size sidesteps the
// footer entirely (and works for CDLC SNGs, which have no footer).
export async function inflateZlib(bytes, expected = 0) {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  let readErr = null;
  const writePromise = (async () => {
    try {
      await writer.write(bytes);
      await writer.close();
      return null;
    } catch (e) {
      return e;
    }
  })();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (expected && total >= expected) break;
    }
  } catch (e) {
    readErr = e;
  }

  const satisfied = Boolean(expected && total >= expected);
  // Closing/cancelling after an early stop raises the trailing-junk error;
  // that is expected and must not become an unhandled rejection.
  try { await reader.cancel(); } catch { /* expected when stopping early */ }
  try { await writer.abort(); } catch { /* expected when stopping early */ }
  const writeErr = await writePromise;
  if (!satisfied && readErr) throw readErr;
  if (!satisfied && writeErr) throw writeErr;

  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

const utf8 = new TextDecoder("utf-8", { fatal: false });

// ── the archive ──────────────────────────────────────────────────────────────
export class Psarc {
  /** @param {Uint8Array} bytes whole file in memory  */
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this._parseHeader();
  }

  static async fromBlob(blob) {
    return new Psarc(new Uint8Array(await blob.arrayBuffer()));
  }

  _parseHeader() {
    const v = this.view;
    if (v.getUint32(0, false) !== MAGIC) throw new Error("not a PSARC file");
    this.version = v.getUint32(4, false);
    this.compression = String.fromCharCode(...this.bytes.slice(8, 12));
    this.tocLength = v.getUint32(12, false);
    this.tocEntrySize = v.getUint32(16, false);
    this.tocEntries = v.getUint32(20, false);
    this.blockSize = v.getUint32(24, false) || BLOCK_SIZE_DEFAULT;
    this.archiveFlags = v.getUint32(28, false);

    if (this.tocEntrySize !== ENTRY_SIZE) {
      throw new Error(`unsupported PSARC TOC entry size ${this.tocEntrySize}`);
    }
    if (this.tocLength < 32 || this.tocEntries < 1) {
      throw new Error(`corrupt PSARC header (toc_length=${this.tocLength})`);
    }

    const regionSize = this.tocLength - 32;
    let region = this.bytes.subarray(32, 32 + regionSize);
    if (region.length !== regionSize) throw new Error("PSARC ends inside its TOC");
    if (this.archiveFlags === 4) region = cfbDecrypt(ARC_KEY, ARC_IV, region);

    const tocDataSize = this.tocEntrySize * this.tocEntries;
    this.entries = [];
    for (let i = 0; i < this.tocEntries; i++) {
      const off = i * ENTRY_SIZE;
      this.entries.push({
        zIndex: readUInt32BE(region, off + 16),
        length: readUInt40(region, off + 20),
        offset: readUInt40(region, off + 25),
      });
    }
    this.blockSizes = [];
    const bt = region.subarray(tocDataSize);
    for (let i = 0; i + 1 < bt.length; i += 2) {
      this.blockSizes.push((bt[i] << 8) | bt[i + 1]);
    }
    this._names = null;
    this._byName = null;
  }

  /** File names, in TOC order (entry 0 is the list itself). */
  async names() {
    if (this._names) return this._names;
    const raw = await this._entryBytes(0);
    const list = utf8.decode(raw).replace(/\r\n/g, "\n").trim().split("\n");
    this._names = list.map((s) => s.trim()).filter(Boolean);
    return this._names;
  }

  async read(name) {
    if (!this._byName) {
      const names = await this.names();
      this._byName = new Map();
      names.forEach((n, i) => this._byName.set(n, i + 1));
    }
    const idx = this._byName.get(name);
    if (idx === undefined) return null;
    return this._entryBytes(idx);
  }

  /** Read every entry matching a predicate over its name. */
  async readMatching(pred) {
    const names = await this.names();
    const out = new Map();
    for (let i = 0; i < names.length; i++) {
      if (!pred(names[i])) continue;
      out.set(names[i], await this._entryBytes(i + 1));
    }
    return out;
  }

  async _entryBytes(index) {
    const e = this.entries[index];
    if (!e) throw new Error(`PSARC entry ${index} does not exist`);
    const names = this._names || [];
    const name = names[index - 1] || `#${index}`;
    const out = new Uint8Array(e.length);
    let produced = 0;
    const nBlocks = Math.ceil(e.length / this.blockSize);
    let pos = e.offset;
    for (let b = 0; b < nBlocks; b++) {
      const bi = e.zIndex + b;
      if (bi >= this.blockSizes.length) {
        throw new Error(`PSARC block table has ${this.blockSizes.length} entries, block ${bi} is missing`);
      }
      const expected = Math.min(this.blockSize, e.length - produced);
      const size = this.blockSizes[bi] || this.blockSize;
      const raw = this.bytes.subarray(pos, pos + size);
      if (raw.length !== size) throw new Error(`PSARC data ends mid-entry (${name})`);
      pos += size;
      let data;
      if (size === expected) {
        data = raw;
      } else {
        try {
          data = await inflateZlib(raw);
        } catch {
          throw new Error(`PSARC block ${bi} of ${name} is not a valid zlib stream`);
        }
        if (data.length !== expected) {
          throw new Error(`PSARC block ${bi} produced ${data.length} bytes, expected ${expected}`);
        }
      }
      out.set(data, produced);
      produced += data.length;
    }
    return out;
  }
}

function readUInt32BE(buf, off) {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// 40-bit big-endian integer. Multiplication, not `<<`, because JS shifts are
// 32-bit and these fields can exceed 4 GB in theory (and shifts wrap at 2^31).
function readUInt40(buf, off) {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * 256 + buf[off + i];
  return v;
}
