/* global PROCESSOR_SOURCE */   // injetado pelo build.mjs (define)
import { Verifier, buildTargets, DEFAULTS, probe } from "./verify.js";
import { freqToNote, midiToHz } from "./notes.js";

export { Verifier, buildTargets, DEFAULTS, probe, freqToNote, midiToHz };

const loaded = new WeakSet();

/** Os nomes dos dispositivos só aparecem depois de o utilizador dar permissão. */
export async function listInputs(){
  const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
  probe.getTracks().forEach((t) => t.stop());
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
}

export const findCable = (list) => list.find((d) => /rocksmith|real\s*tone/i.test(d.label));

export async function connect(ctx, deviceId, onMessage){
  if (!loaded.has(ctx)){
    const url = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: "text/javascript" }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    loaded.add(ctx);
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,   // ESSENCIAL
    channelCount: 1,
  }});
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "playsong-pitch", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    channelCount: 1, channelCountMode: "explicit",
  });
  let recDone = null;
  node.port.onmessage = (e) => {
    if (e.data.type === "rec"){ if (recDone) recDone(e.data); recDone = null; return; }
    onMessage(e.data);
  };
  // A saída do worklet fica em silêncio; ligar ao destination só garante que o grafo o processa.
  src.connect(node).connect(ctx.destination);

  let lastKey = "";
  return {
    stream,
    config(c){ node.port.postMessage({ type: "config", ...c }); },
    expect(freqs){
      const key = freqs.join(",");
      if (key !== lastKey){ lastKey = key; node.port.postMessage({ type: "expect", freqs }); }
    },
    /** Grava `seconds` de sinal cru; devolve {data: Float32Array, sampleRate}. */
    record(seconds){
      return new Promise((resolve) => { recDone = resolve; node.port.postMessage({ type: "record", seconds }); });
    },
    close(){
      node.port.onmessage = null;
      src.disconnect(); node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export const PRESETS = {
  guitar: { window: 2048, hop: 512,  minFreq: 70, maxFreq: 1400, long: 8192 },
  bass:   { window: 4096, hop: 1024, minFreq: 28, maxFreq: 500,  long: 16384 },
};
