// The converter, run in a Web Worker so the page keeps drawing while a song is
// opened. Everything here is pure computation - unzip a pack, parse the chart,
// repackage a project's .wem audio - none of it needs the page.
//
// Bundled by build.mjs together with vendor/ww2ogg.bundle.js (which sets
// globalThis.WW2OGG) into web/converter.worker.js.
//
// Messages in:   { id, name, bytes }          a .feedpak / .sloppak; bytes: ArrayBuffer (transferred)
//                { id, name, entries, jsonSet } a pack's own files (unpacked folder, arrangement JSON)
// Messages out:  { id, stage }                 a progress line for the page
//                { id, ok: true, result }      see openFeedpak / openJsonSet / openXmlSet
//                { id, ok: false, error }
//                { id, name, entries: [{name, bytes}] }   raw XML (+ .wem, .dds)
import { convertXmlSet } from "./js/convert.js";
import { convertFeedpak, convertFeedpakFiles } from "./js/feedpak.js";
import { decodeDds } from "./js/cover.js";
import { clearXmlCache } from "./js/xml.js";

function convertWem(bytes) {
  const W = globalThis.WW2OGG;
  if (!W) throw new Error("the audio decoder is not loaded");
  for (const variant of ["aoTuV_603", "standard"]) {
    try {
      const { ogg } = W.convertWwiseRiffToOgg(bytes, {
        codebooks: W.getPackedCodebooks(variant), sourceName: "audio.wem",
      });
      return ogg;
    } catch (e) {
      if (variant === "standard") throw e;       // aoTuV first: the standard set decodes to noise
    }
  }
}

/* Cover art as a JPEG Blob when the worker can draw (OffscreenCanvas), else the
   raw pixels for the page to draw. */
async function coverFromDds(data) {
  const { width, height, rgba } = decodeDds(data);
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const c = new OffscreenCanvas(width, height);
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      return { blob: await c.convertToBlob({ type: "image/jpeg", quality: 0.9 }) };
    } catch (e) { /* fall through to raw pixels */ }
  }
  return { width, height, rgba };
}

/* Raw XML: the chart from the XML files; a .wem among the files is converted
   to Ogg, a .dds is drawn as the cover. Other audio and pictures stay with the
   page, which can use them as they are. */
async function openXmlSet(entries, name, stage, transfer) {
  const { payload } = await convertXmlSet(entries, { name, onProgress: stage });
  let cover = null, ogg = null;
  const dds = entries.find((e) => /\.dds$/i.test(e.name));
  if (dds) {
    try { cover = await coverFromDds(new Uint8Array(dds.bytes)); if (cover.rgba) transfer.push(cover.rgba.buffer); }
    catch (e) { cover = null; }
  }
  const wem = entries.find((e) => /\.wem$/i.test(e.name));
  if (wem) {
    stage("Converting the audio…");
    const o = convertWem(new Uint8Array(wem.bytes));
    ogg = o.buffer.byteLength === o.byteLength ? o.buffer : o.slice().buffer;
    transfer.push(ogg);
  }
  if (cover) payload.meta.cover = true;
  clearXmlCache();
  return { kind: "xml", payload, cover, ogg };
}

/* a pack's own files, dropped loose or as its folder (see convertFeedpakFiles) */
async function openJsonSet(entries, name, stage) {
  const { payload, coverBlob, stems } = await convertFeedpakFiles(entries, { name, onProgress: stage });
  return { kind: "feedpak", payload, cover: coverBlob ? { blob: coverBlob } : null, stems };
}

async function openFeedpak(bytes, name, stage) {
  stage("Opening the feedpak…");
  const { payload, coverBlob, stems } = await convertFeedpak(bytes, { name, onProgress: stage });
  return { kind: "feedpak", payload, cover: coverBlob ? { blob: coverBlob } : null, stems };
}

self.onmessage = async (ev) => {
  if (ev.data && ev.data.ping) { self.postMessage({ pong: true }); return; }   // the page checks the worker runs
  const { id, name, bytes, entries, jsonSet } = ev.data || {};
  const stage = (text) => self.postMessage({ id, stage: String(text) });
  try {
    const transfer = [];
    const u8 = entries ? null : new Uint8Array(bytes);
    const result = entries && jsonSet ? await openJsonSet(entries, name, stage)
      : entries ? await openXmlSet(entries, name, stage, transfer)
      : await openFeedpak(u8, name, stage);
    /* The chart goes back as JSON text, not as an object: the page parses 2-3 MB
       of JSON in ~20 ms, but rebuilding the same object graph from a structured
       clone took ~90 ms on the page's thread - a visible hitch. */
    result.payloadJson = JSON.stringify(result.payload);
    delete result.payload;
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String((e && e.message) || e) });
  }
};
