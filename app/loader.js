"use strict";
/* ── where the song comes from ───────────────────────────────────────────────
   The page runs in two modes.

   Behind the Python server (server.py) it behaves as it always has: the song,
   the cover and the audio are fetched from the server, and a dropped file is
   uploaded and converted there.

   Opened as a plain file - or from any static host - there is nothing to ask.
   A dropped .psarc is then converted in this tab by the scripts in web/:
   the archive is decrypted and inflated, the chart is parsed, the song's audio is
   repackaged as Ogg and decoded by the browser. Nothing is uploaded, and the
   visitor's file never leaves their machine. */
const LOCAL = { payload: null, cover: "", audio: null, stems: null };
let SERVER = true;                      // decided in boot(), by probing /api/status

/* statics are loaded on demand, so the server-backed page pays nothing for them */
function loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("could not load " + src));
    document.head.appendChild(s);
  });
}
/* the in-page converter, loaded once and awaited by whoever needs it */
let staticsReady = null;
function loadStatics(){
  if (!staticsReady){
    staticsReady = (async () => {
      await loadScript("web/ww2ogg.bundle.js");
      await loadScript("web/converter.js");
    })();
  }
  return staticsReady;
}
async function probeServer(){
  window.__probe = { at: Date.now() };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("/api/status", { cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    window.__probe.status = res.status;
    if (!res.ok) { window.__probe.ok = false; return false; }
    JSON.parse(await res.text());       // a 404 page is not JSON
    window.__probe.ok = true;
    return true;
  } catch (e) {
    window.__probe.err = String(e && e.message || e);
    window.__probe.ok = false;
    return false;
  }
}

/* One probe, shared: a file can be dropped before boot() has finished asking,
   and both paths must agree on the answer. A failed first try is retried once,
   so a slow server start does not send the page down the no-server path. */
let serverProbe = null;
function serverAvailable(){
  if (!serverProbe){
    serverProbe = (async () => {
      if (await probeServer()) return true;
      await new Promise((r) => setTimeout(r, 250));
      return probeServer();
    })();
  }
  return serverProbe;
}

/* ── the archive -> playable song, in this tab ────────────────────────────────
   Returns the same payload shape the server's /api/song would have served, plus
   a cover data URL and an Ogg Blob for the audio. */
function convertWem(bytes){
  const W = window.WW2OGG;
  if (!W) throw new Error("the audio decoder is not loaded");
  for (const variant of ["aoTuV_603", "standard"]){
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
/* ── the converter in a Web Worker ────────────────────────────────────────────
   Converting a song is seconds of pure computation (decrypt, inflate, parse the
   chart, repackage the song's audio). In a Worker it runs beside the page, so the
   highway keeps drawing and the progress messages keep showing.

   The worker's code arrives as a string (web/converter.worker.js sets
   window.CDLC_WORKER_SOURCE) and is started from a Blob: a Worker cannot be
   loaded from a file:// URL, and the page must keep working when opened from
   disk. If a Worker cannot be started at all, or fails on a song, the song is
   converted in the page instead, as in V1. */
let convWorkerReady = null, convSeq = 0;
const convPending = new Map();
function startWorker(){
  if (!convWorkerReady){
    convWorkerReady = (async () => {
      if (typeof Worker === "undefined" || typeof Blob === "undefined") return null;
      await loadScript("web/converter.worker.js");
      const src = window.CDLC_WORKER_SOURCE;
      delete window.CDLC_WORKER_SOURCE;
      if (!src) return null;
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      let w;
      try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); return null; }
      const up = await new Promise((res) => {                 // does it really run here?
        const timer = setTimeout(() => res(false), 4000);
        w.onmessage = (ev) => { if (ev.data && ev.data.pong){ clearTimeout(timer); res(true); } };
        w.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); clearTimeout(timer); res(false); };
        w.postMessage({ ping: true });
      });
      URL.revokeObjectURL(url);
      if (!up){ w.terminate(); return null; }
      w.onmessage = (ev) => {
        const m = ev.data || {}, job = convPending.get(m.id);
        if (!job) return;
        if (m.stage !== undefined){ job.onStage(m.stage); return; }
        convPending.delete(m.id);
        if (m.ok) job.resolve(m.result); else job.reject(new Error(m.error));
      };
      w.onerror = (ev) => {                                   // the worker itself died
        if (ev && ev.preventDefault) ev.preventDefault();
        const err = new Error((ev && ev.message) || "the converter stopped");
        for (const job of convPending.values()) job.reject(err);
        convPending.clear();
        convWorkerReady = null;                               // a fresh one next time
        try { w.terminate(); } catch (e) {}
      };
      return w;
    })().catch(() => null);
  }
  return convWorkerReady;
}
async function openInWorker(w, file, onStage){
  const bytes = await file.arrayBuffer();
  const r = await new Promise((resolve, reject) => {
    const id = ++convSeq;
    convPending.set(id, { resolve, reject, onStage });
    w.postMessage({ id, name: file.name, bytes }, [bytes]);  // handed over, not copied
  });
  let cover = "";
  if (r.cover && r.cover.blob) cover = URL.createObjectURL(r.cover.blob);
  else if (r.cover && r.cover.rgba){
    const { width, height, rgba } = r.cover;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    cover = canvas.toDataURL("image/jpeg", 0.9);
  }
  return {
    payload: r.payloadJson ? JSON.parse(r.payloadJson) : r.payload, cover,
    audio: r.ogg ? new Blob([r.ogg], { type: "audio/ogg" }) : null,
    stems: r.stems ? new Map(r.stems.map((s) => [s.id, s.blob])) : null,
  };
}
async function openLocal(file, onStage){
  const w = await startWorker();
  if (w){
    try { return await openInWorker(w, file, onStage); }
    catch (e){
      if (/official song/i.test(e.message)) throw e;           // a refusal, not a failure: the page would refuse it too
      console.warn("converter worker failed, converting in the page instead:", e);
    }
  }
  await loadStatics();
  if (!window.CDLC || !window.WW2OGG) throw new Error("the in-page converter did not load (web/converter.js)");
  return /\.feedpak$/i.test(file.name) ? openLocalFeedpak(file, onStage) : openLocalPsarc(file, onStage);
}

/* ── raw arrangement XML ───────────────────────────────────────────────────────
   A song still in its project folder: an XML per arrangement, a vocals XML,
   the audio, the cover art. Dropped as files or as the folder. The chart is
   converted like a pack's; the audio and the picture are used as they are
   (a .wem is converted, a .dds is drawn). */
const AUDIO_RX = /\.(ogg|mp3|wav|flac|m4a|aac|opus|webm|wem)$/i, IMAGE_RX = /\.(jpe?g|png|webp|gif|bmp|dds)$/i;
const baseName = (f) => (f.relPath || f.name).split("/").pop();
function pickBest(list, rx, good){
  const c = list.filter((f) => rx.test(f.name) && !/preview/i.test(f.name));
  const score = (f) => {
    const b = baseName(f).replace(/\.[^.]+$/, "").toLowerCase();
    return (good.test(b) ? 2 : 0) - (b.startsWith("_") ? 2 : 0) + f.size/1e12;
  };
  c.sort((a, b) => score(b) - score(a));
  return c[0] || null;
}
function xmlSetName(list){
  const withDir = list.find((f) => f.relPath && f.relPath.split("/").filter(Boolean).length > 1);
  if (withDir) return withDir.relPath.split("/").filter(Boolean)[0];
  const x = list.find((f) => /\.xml$/i.test(f.name) && !/vocal/i.test(f.name)) || list.find((f) => /\.xml$/i.test(f.name));
  return x ? x.name : "song.xml";
}
async function openLocalXml(list, onStage){
  const name = xmlSetName(list);
  const xmls = list.filter((f) => /\.xml$/i.test(f.name));
  const audioF = pickBest(list, AUDIO_RX, /^(audio|song|guitar|original|mix|full|track)\b/);
  const imageF = pickBest(list, IMAGE_RX, /^(cover|album|art|folder|front)\b/);
  const send = xmls.slice();
  if (audioF && /\.wem$/i.test(audioF.name)) send.push(audioF);
  if (imageF && /\.dds$/i.test(imageF.name)) send.push(imageF);
  onStage("Reading " + name + "…");
  const entries = [];
  for (const f of send) entries.push({ name: f.relPath || f.name, bytes: await f.arrayBuffer() });

  let r = null;
  const w = await startWorker();
  if (w){
    try {
      r = await new Promise((resolve, reject) => {
        const id = ++convSeq;
        convPending.set(id, { resolve, reject, onStage });
        w.postMessage({ id, name, entries: entries.map((e) => ({ name: e.name, bytes: e.bytes.slice(0) })) });
      });
      r.payload = JSON.parse(r.payloadJson); delete r.payloadJson;
    } catch (e){
      if (/no arrangement|no \.xml/i.test(e.message)) throw e;
      console.warn("converter worker failed, converting in the page instead:", e);
      r = null;
    }
  }
  if (!r){
    await loadStatics();
    if (!window.CDLC || !window.CDLC.convertXmlSet) throw new Error("the in-page converter did not load (web/converter.js)");
    const { payload } = await window.CDLC.convertXmlSet(entries.map((e) => ({ name: e.name, bytes: new Uint8Array(e.bytes) })), { name, onProgress: onStage });
    r = { payload, cover: null, ogg: null };
    const dds = entries.find((e) => /\.dds$/i.test(e.name)), wem = entries.find((e) => /\.wem$/i.test(e.name));
    if (dds){ try { r.cover = window.CDLC.decodeDds(new Uint8Array(dds.bytes)); } catch (e) {} }
    if (wem){ onStage("Converting the audio…"); await new Promise((res) => setTimeout(res, 20)); r.ogg = convertWem(new Uint8Array(wem.bytes)); }
  }

  let cover = "";
  if (r.cover && r.cover.blob) cover = URL.createObjectURL(r.cover.blob);
  else if (r.cover && r.cover.rgba){
    const { width, height, rgba } = r.cover;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    cover = canvas.toDataURL("image/jpeg", 0.9);
  } else if (imageF && !/\.dds$/i.test(imageF.name)) cover = URL.createObjectURL(imageF);
  r.payload.meta.cover = !!cover;
  let audio = null;
  if (r.ogg) audio = new Blob([r.ogg], { type: "audio/ogg" });
  else if (audioF && !/\.wem$/i.test(audioF.name)) audio = audioF;      // a File is a Blob: decoded as it is
  return { payload: r.payload, cover, audio, stems: null };
}

/* a .feedpak is already converted: unzip, read the manifest, take its stems */
async function openLocalFeedpak(file, onStage){
  const bytes = new Uint8Array(await file.arrayBuffer());
  onStage("Opening the feedpak…");
  const { payload, coverBlob, stems } = await window.CDLC.convertFeedpak(bytes, {
    name: file.name, onProgress: onStage,
  });
  return {
    payload,
    cover: coverBlob ? URL.createObjectURL(coverBlob) : "",
    audio: null,
    stems: new Map(stems.map((s) => [s.id, s.blob])),
  };
}

async function openLocalPsarc(file, onStage){
  const bytes = new Uint8Array(await file.arrayBuffer());
  onStage("Reading the archive…");
  const { payload, psarc, names } = await window.CDLC.convertPsarc(bytes, {
    name: file.name,
    onProgress: (m) => onStage(m),
  });

  /* cover art: album art ships as DDS at several sizes; show the largest. */
  let cover = "";
  const dds = names.filter((n) => /\.dds$/i.test(n));
  if (dds.length){
    let best = null;
    for (const n of dds){
      const data = await psarc.read(n);
      if (!best || data.length > best.data.length) best = { n, data };
    }
    try {
      const { width, height, rgba } = window.CDLC.decodeDds(best.data);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      cover = canvas.toDataURL("image/jpeg", 0.9);
    } catch (e) { console.warn("cover art:", e); }
  }

  /* audio: the largest .wem is the song; the small one is a preview clip. */
  let audio = null;
  const wems = names.filter((n) => /\.wem$/i.test(n));
  if (wems.length){
    let best = null;
    for (const n of wems){
      const data = await psarc.read(n);
      if (!best || data.length > best.data.length) best = { n, data };
    }
    onStage("Converting the audio…");
    await new Promise((r) => setTimeout(r, 20));       // let the message paint before the heavy loop
    audio = new Blob([convertWem(best.data)], { type: "audio/ogg" });
  }
  return { payload, cover, audio, stems: null };
}

