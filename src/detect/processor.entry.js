/* AudioWorkletProcessor "playsong-pitch". O build.mjs transforma este ficheiro numa string,
   e a página carrega-o a partir de um Blob (addModule não aceita file://). */
import { McLeodDetector } from "./mpm.js";

const RMS_GATE = 0.01, MIN_CLARITY = 0.8;
const ONSET_GATE = 1e-5;        // energia média mínima por bloco de 128 amostras
const ONSET_RATIO = 2.0;        // o bloco tem de ter o dobro do envelope de pico
const ONSET_DECAY = 0.985;      // decaimento do envelope por bloco (~50 % em 120 ms)
const ONSET_HOLD = 0.05;        // s: um onset no máximo a cada 50 ms

class PitchProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.configure({ window: 2048, hop: 512, minFreq: 70, maxFreq: 1400 });
    this.freqs = new Float64Array(0);      // frequências pedidas pela página (Goertzel)
    this.env = 0;
    this.lastOnset = -1;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "config") this.configure(m);
      else if (m.type === "expect") this.freqs = Float64Array.from(m.freqs);
    };
  }

  configure({ window, hop, minFreq, maxFreq }){
    this.N = window; this.mask = window - 1; this.hop = hop;
    this.ring = new Float32Array(window);
    this.frame = new Float32Array(window);
    this.win = new Float32Array(window);           // frame × Hann, para o Goertzel
    this.hann = new Float32Array(window);
    for (let i = 0; i < window; i++) this.hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (window - 1));
    this.det = new McLeodDetector(window, sampleRate, minFreq, maxFreq);
    this.res = { freq: 0, clarity: 0 };
    this.pos = 0; this.since = 0;
  }

  process(inputs){
    const x = inputs[0] && inputs[0][0];             // o cabo é mono
    if (!x) return true;

    let e = 0;
    for (let i = 0; i < x.length; i++){
      const s = x[i];
      e += s * s;
      this.ring[this.pos] = s;
      this.pos = (this.pos + 1) & this.mask;
    }
    e /= x.length;

    // onset: subida brusca de energia acima de um envelope de pico que decai
    if (e > ONSET_GATE && e > ONSET_RATIO * this.env && currentTime - this.lastOnset > ONSET_HOLD){
      this.lastOnset = currentTime;
      this.port.postMessage({ type: "onset", time: currentTime, energy: e });
    }
    this.env = Math.max(e, this.env * ONSET_DECAY);

    this.since += x.length;
    if (this.since >= this.hop){
      this.since -= this.hop;
      this.analyse(currentTime + x.length / sampleRate);
    }
    return true;
  }

  analyse(endTime){
    const { N, mask, ring, frame, win, hann } = this;
    let sum = 0, sumW = 0;
    for (let i = 0; i < N; i++){
      const s = ring[(this.pos + i) & mask];
      frame[i] = s; sum += s * s;
      const w = s * hann[i];
      win[i] = w; sumW += w * w;
    }
    const rms = Math.sqrt(sum / N);

    let freq = 0, clarity = 0;
    if (rms > RMS_GATE && this.det.detect(frame, this.res) && this.res.clarity >= MIN_CLARITY){
      freq = this.res.freq; clarity = this.res.clarity;
    }

    // presença em cada frequência pedida: a fração da energia da janela concentrada nela
    // (cerca de 1 para um seno puro exatamente nessa frequência)
    const F = this.freqs, presence = new Float32Array(F.length);
    if (rms > RMS_GATE && sumW > 0){
      for (let k = 0; k < F.length; k++){
        const c = 2 * Math.cos(2 * Math.PI * F[k] / sampleRate);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++){ const s0 = win[i] + c * s1 - s2; s2 = s1; s1 = s0; }
        presence[k] = 3 * (s1 * s1 + s2 * s2 - c * s1 * s2) / (N * sumW);
      }
    }

    this.port.postMessage({
      type: "frame",
      time: endTime - N / 2 / sampleRate,              // centro da janela
      freq, clarity, rms,
      freqs: F, presence,
    });
  }
}

registerProcessor("playsong-pitch", PitchProcessor);
