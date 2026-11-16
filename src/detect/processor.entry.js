/* AudioWorkletProcessor "playsong-pitch". O build.mjs transforma este ficheiro numa string,
   e a página carrega-o a partir de um Blob (addModule não aceita file://). */
import { McLeodDetector } from "./mpm.js";
import { FFT } from "./fft.js";

const RMS_GATE = 0.01, MIN_CLARITY = 0.8;
/* O onset mede a energia da diferença entre amostras (x[n] − x[n−1]), que pesa os
   harmónicos agudos do ataque. Com a energia simples, uma nota tocada sobre outra
   que ainda soa alto (ou um acorde mais pequeno depois de um maior) não chegava ao
   dobro do envelope e o ataque perdia-se. */
const ONSET_GATE = 1e-6;        // energia média mínima (da diferença) por bloco de 128 amostras
const ONSET_RATIO = 2.0;        // o bloco tem de ter o dobro do envelope de pico
const ONSET_DECAY = 0.985;      // decaimento do envelope por bloco (~50 % em 120 ms)
const ONSET_HOLD = 0.05;        // s: um onset no máximo a cada 50 ms

class PitchProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.configure({ window: 2048, hop: 512, minFreq: 70, maxFreq: 1400 });
    this.freqs = new Float64Array(0);      // frequências pedidas pela página (presença)
    this.env = 0;
    this.xp = 0;
    this.lastOnset = -1;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "config") this.configure(m);
      else if (m.type === "expect") this.freqs = Float64Array.from(m.freqs);
      else if (m.type === "record"){ this.rec = new Float32Array(Math.round(m.seconds * sampleRate)); this.recPos = 0; }
    };
  }

  /* Duas janelas sobre o mesmo anel de amostras:
     - a curta (`window`), para o MPM: responde depressa;
     - a longa (`long`, 4× a curta), para a presença das notas esperadas. Com 2048
       amostras a resolução é de ~23 Hz e o lóbulo de uma nota cobre as vizinhas
       (Mi2 e Fá2 distam 5 Hz); com 8192 os harmónicos 2 e 3 já se separam do
       meio tom ao lado, o que permite o veto do vizinho nos acordes. */
  configure({ window, hop, minFreq, maxFreq, long }){
    const L = long || window * 4;
    this.N = window; this.L = L; this.mask = L - 1; this.hop = hop;
    this.ring = new Float32Array(L);
    this.frame = new Float32Array(window);
    this.hannL = new Float32Array(L);
    for (let i = 0; i < L; i++) this.hannL[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1));
    this.fft = new FFT(L);
    this.det = new McLeodDetector(window, sampleRate, minFreq, maxFreq);
    this.res = { freq: 0, clarity: 0 };
    this.pos = 0; this.since = 0;
  }

  process(inputs){
    const x = inputs[0] && inputs[0][0];             // o cabo é mono
    if (!x) return true;

    let e = 0;
    for (let i = 0; i < x.length; i++){
      const s = x[i], d = s - this.xp;
      this.xp = s;
      e += d * d;
      this.ring[this.pos] = s;
      this.pos = (this.pos + 1) & this.mask;
    }
    e /= x.length;

    // gravação do sinal cru (diagnóstico: um WAV do cabo para os testes)
    if (this.rec){
      const k = Math.min(x.length, this.rec.length - this.recPos);
      this.rec.set(k === x.length ? x : x.subarray(0, k), this.recPos);
      this.recPos += k;
      if (this.recPos >= this.rec.length){
        this.port.postMessage({ type: "rec", data: this.rec, sampleRate }, [this.rec.buffer]);
        this.rec = null;
      }
    }

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
    const { N, L, mask, ring, frame } = this;
    let sum = 0;
    for (let i = 0, j = this.pos - N; i < N; i++, j++){
      const v = ring[j & mask];
      frame[i] = v; sum += v * v;
    }
    const rms = Math.sqrt(sum / N);

    let freq = 0, clarity = 0;
    if (rms > RMS_GATE && this.det.detect(frame, this.res) && this.res.clarity >= MIN_CLARITY){
      freq = this.res.freq; clarity = this.res.clarity;
    }

    // presença em cada frequência pedida: a fração da energia da janela longa que
    // está nela, interpolando entre os dois bins vizinhos (peso 1 − distância). É
    // estreita de propósito: o meio tom ao lado, nos graves a pouco mais de um bin,
    // quase não entra (cerca de 0,67 para um seno puro sobre um bin)
    const F = this.freqs, presence = new Float32Array(F.length);
    if (F.length){
      const { fft, hannL } = this, { re, im } = fft;
      let sumL = 0;
      for (let i = 0, j = this.pos; i < L; i++, j++){
        const v = ring[j & mask];
        sumL += v * v;
        re[i] = v * hannL[i]; im[i] = 0;
      }
      if (Math.sqrt(sumL / L) > RMS_GATE / 2){
        fft.run();
        const H = L >> 1;
        let total = 0;
        for (let k = 1; k < H; k++){ const p = re[k] * re[k] + im[k] * im[k]; re[k] = p; total += p; }
        if (total > 0){
          for (let q = 0; q < F.length; q++){
            const bf = F[q] * L / sampleRate, k0 = Math.floor(bf), w = bf - k0;
            if (k0 < 1 || k0 + 1 >= H) continue;
            presence[q] = ((1 - w) * re[k0] + w * re[k0 + 1]) / total;
          }
        }
      }
    }

    this.port.postMessage({
      type: "frame",
      time: endTime - N / 2 / sampleRate,              // centro da janela curta
      timeL: endTime - L / 2 / sampleRate,             // centro da janela longa (presença)
      freq, clarity, rms,
      freqs: F, presence,
    });
  }
}

registerProcessor("playsong-pitch", PitchProcessor);
