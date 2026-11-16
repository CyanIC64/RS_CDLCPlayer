/* FFT complexa radix-2, in-place, sem alocações por chamada.
   Usada pelo MPM para calcular a autocorrelação em O(n log n). */
export class FFT {
  constructor(n){
    if (n & (n - 1)) throw new Error("FFT size must be a power of 2");
    this.n = n;
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++){
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++){
      this.cos[i] = Math.cos(2 * Math.PI * i / n);
      this.sin[i] = -Math.sin(2 * Math.PI * i / n);   // e^{-iθ}
    }
  }

  /** Transformada direta de this.re / this.im, no próprio lugar. */
  run(){
    const { n, re, im, rev, cos, sin } = this;
    for (let i = 0; i < n; i++){
      const j = rev[i];
      if (j > i){
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1){
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size){
        for (let k = 0; k < half; k++){
          const wr = cos[k * step], wi = sin[k * step];
          const a = start + k, b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr;        im[a] += ti;
        }
      }
    }
  }
}
