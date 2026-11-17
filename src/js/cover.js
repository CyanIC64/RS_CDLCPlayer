// Minimal DDS decoder for album art (DXT1/DXT5, plus uncompressed).
// Browsers have no DDS decoder; the cover art in a charting project folder is
// DXT1 or DXT5 in practice, and either is ~60 lines of block maths.

export function decodeDds(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "DDS ") {
    throw new Error("not a DDS file");
  }
  const height = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const fourCC = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]);
  const bitCount = dv.getUint32(88, true);
  const data = bytes.subarray(128);

  const rgba = new Uint8Array(width * height * 4);
  if (fourCC === "DXT1" || fourCC === "DXT5") {
    decodeBlocks(data, width, height, rgba, fourCC === "DXT5");
    return { width, height, rgba };
  }
  if (!fourCC.trim() && (bitCount === 24 || bitCount === 32)) {
    const rMask = dv.getUint32(92, true), gMask = dv.getUint32(96, true);
    const bMask = dv.getUint32(100, true), aMask = dv.getUint32(104, true);
    const shift = (m) => (m ? 31 - Math.clz32(m) : 0);
    const scale = (m) => (m ? 255 / (m >>> shift(m)) : 0);
    const step = bitCount / 8;
    const rd = (v, m) => Math.round(((v & m) >>> shift(m)) * scale(m));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * step;
        const v = dv.getUint32(o, true);
        const q = (y * width + x) * 4;
        rgba[q] = rd(v, rMask);
        rgba[q + 1] = rd(v, gMask);
        rgba[q + 2] = rd(v, bMask);
        rgba[q + 3] = aMask ? rd(v, aMask) : 255;
      }
    }
    return { width, height, rgba };
  }
  throw new Error(`unsupported DDS format ${JSON.stringify(fourCC || bitCount)}`);
}

function decodeBlocks(data, width, height, rgba, hasAlpha) {
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const blockBytes = hasAlpha ? 16 : 8;
  const pal = new Uint8Array(16);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let p = (by * bw + bx) * blockBytes;
      let alphas = null;
      if (hasAlpha) {
        alphas = decodeAlphaBlock(data, p);
        p += 8;
      }
      decodeColorBlock(data, p, pal);
      for (let y = 0; y < 4; y++) {
        const py = by * 4 + y;
        if (py >= height) break;
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          if (px >= width) break;
          const idx = (y * 4 + x);
          const ci = (data[p + 4 + (idx >> 2)] >> ((idx & 3) * 2)) & 3;
          const q = (py * width + px) * 4;
          rgba[q] = pal[ci * 4];
          rgba[q + 1] = pal[ci * 4 + 1];
          rgba[q + 2] = pal[ci * 4 + 2];
          rgba[q + 3] = alphas ? alphas[idx] : pal[ci * 4 + 3];
        }
      }
    }
  }
}

function rgb565(v) {
  const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

function decodeColorBlock(data, p, pal) {
  const c0 = data[p] | (data[p + 1] << 8);
  const c1 = data[p + 2] | (data[p + 3] << 8);
  const a = rgb565(c0), b = rgb565(c1);
  pal.set([a[0], a[1], a[2], 255, b[0], b[1], b[2], 255], 0);
  if (c0 > c1) {
    for (let i = 0; i < 3; i++) {
      pal[8 + i] = Math.round((2 * a[i] + b[i]) / 3);
      pal[12 + i] = Math.round((a[i] + 2 * b[i]) / 3);
    }
    pal[11] = 255; pal[15] = 255;
  } else {
    for (let i = 0; i < 3; i++) pal[8 + i] = Math.round((a[i] + b[i]) / 2);
    pal[11] = 255;
    pal[12] = pal[13] = pal[14] = 0;
    pal[15] = 0; // transparent
  }
}

function decodeAlphaBlock(data, p) {
  const a0 = data[p], a1 = data[p + 1];
  const table = new Uint8Array(8);
  table[0] = a0; table[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) table[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
  } else {
    for (let i = 1; i < 5; i++) table[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
    table[6] = 0; table[7] = 255;
  }
  const out = new Uint8Array(16);
  let bits = 0, nbits = 0, bi = p + 2;
  for (let i = 0; i < 16; i++) {
    while (nbits < 3) { bits |= data[bi++] << nbits; nbits += 8; }
    out[i] = table[bits & 7];
    bits >>= 3; nbits -= 3;
  }
  return out;
}

// Browser only: decode the art and hand back a data URL for an <img>.
export function ddsToDataUrl(bytes, mime = "image/jpeg", quality = 0.88) {
  const { width, height, rgba } = decodeDds(bytes);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL(mime, quality);
}
