import { FFT } from "./fft.js";

/* McLeod Pitch Method (McLeod & Wyvill 2005), com a NSDF calculada via FFT:
     r(τ) = autocorrelação = IFFT(|FFT(x)|²)
     m(τ) = Σ x[j]² + x[j+τ]², obtido por uma recorrência O(n)
     n'(τ) = 2·r(τ) / m(τ)
   Os buffers são reservados no construtor: o detect() não aloca memória. */
export class McLeodDetector {
  constructor(size, sampleRate, minFreq = 70, maxFreq = 1400, k = 0.93){
    this.size = size;
    this.sampleRate = sampleRate;
    this.k = k;
    this.fft = new FFT(size * 2);                       // 2n para a autocorrelação linear
    this.maxTau = Math.min(Math.ceil(sampleRate / minFreq), (size / 2) | 0);
    this.minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
    this.nsdf = new Float64Array(this.maxTau + 2);
    this.cand = new Int32Array(64);
  }

  /** x: Float32Array com `size` amostras. Preenche out {freq, clarity}; devolve true se houver pitch. */
  detect(x, out){
    const { size: n, fft, nsdf, maxTau, minTau, cand } = this;
    const { re, im } = fft, N2 = fft.n;

    // r(τ): FFT → espectro de potência → FFT outra vez. Como a potência é real e par,
    // a segunda FFT dá a IFFT multiplicada por N2.
    for (let i = 0; i < n; i++){ re[i] = x[i]; im[i] = 0; }
    for (let i = n; i < N2; i++){ re[i] = 0; im[i] = 0; }
    fft.run();
    for (let i = 0; i < N2; i++){ re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    fft.run();

    // m(τ) por recorrência, e a NSDF
    let m = 0;
    for (let j = 0; j < n; j++) m += x[j] * x[j];
    m *= 2;
    for (let tau = 0; tau <= maxTau + 1; tau++){
      if (tau > 0){ const a = x[tau - 1], b = x[n - tau]; m -= a * a + b * b; }
      nsdf[tau] = m > 1e-12 ? (2 * re[tau] / N2) / m : 0;
    }

    // key maxima: o pico mais alto de cada lobo positivo
    let count = 0, tau = 1;
    while (tau <= maxTau && nsdf[tau] > 0) tau++;      // saltar o lobo de τ≈0
    let best = -1, bestVal = -Infinity;
    for (; tau <= maxTau; tau++){
      const v = nsdf[tau], prev = nsdf[tau - 1];
      if (prev <= 0 && v > 0){ best = -1; bestVal = -Infinity; }
      if (v > 0 && v > bestVal){ best = tau; bestVal = v; }
      if (prev > 0 && v <= 0 && best >= 0){
        if (count < cand.length) cand[count++] = best;
        best = -1;
      }
    }
    if (best >= 0 && count < cand.length) cand[count++] = best;
    if (!count) return false;

    // escolher o primeiro candidato ≥ k·máximo (evita erros de oitava para baixo)
    let highest = 0;
    for (let i = 0; i < count; i++) highest = Math.max(highest, nsdf[cand[i]]);
    const thr = this.k * highest;
    for (let i = 0; i < count; i++){
      const t = cand[i];
      if (t < minTau || nsdf[t] < thr) continue;
      const a = nsdf[t - 1], b = nsdf[t], c = nsdf[t + 1];   // interpolação parabólica
      const den = a - 2 * b + c;
      const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
      out.freq = this.sampleRate / (t + shift);
      out.clarity = b - 0.25 * (a - c) * shift;
      return true;
    }
    return false;
  }
}
