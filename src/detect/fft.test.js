import { describe, expect, it } from "vitest";
import { FFT } from "./fft.js";

it("matches a naive DFT", () => {
  const n = 64, f = new FFT(n), x = Array.from({ length: n }, () => Math.random() - 0.5);
  x.forEach((v, i) => { f.re[i] = v; f.im[i] = 0; });
  f.run();
  for (let k = 0; k < n; k++){
    let re = 0, im = 0;
    for (let j = 0; j < n; j++){ re += x[j] * Math.cos(2*Math.PI*k*j/n); im -= x[j] * Math.sin(2*Math.PI*k*j/n); }
    expect(f.re[k]).toBeCloseTo(re, 9);
    expect(f.im[k]).toBeCloseTo(im, 9);
  }
});
