// Small helpers the page shares: numbers, sorted-array search, time, colours.

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp  = (a, b, t) => a + (b - a)*t;
/* smoothstep on 0..1 */
export const sstep = (u) => { u = clamp(u, 0, 1); return u*u*(3 - 2*u); };

/* first index whose key is >= v, in an array sorted by that key */
export function lowerBound(arr, key, v){
  let lo = 0, hi = arr.length;
  while (lo < hi){ const m = (lo + hi) >> 1; if (arr[m][key] < v) lo = m + 1; else hi = m; }
  return lo;
}

/* seconds as m:ss */
export function fmt(t){
  t = Math.max(0, t || 0);
  const m = Math.floor(t/60), s = Math.floor(t%60);
  return m + ":" + String(s).padStart(2, "0");
}

/* "#rrggbb" -> [r, g, b], cached: the highway asks for the same few colours every frame */
const cache = new Map();
export function rgb(hex){
  let v = cache.get(hex);
  if (!v){ const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; cache.set(hex, v); }
  return v;
}
export function rgba(hex, a){ const c = rgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }
export function shade(hex, k){                       // k < 1 darkens
  const c = rgb(hex);
  return "rgb(" + Math.round(c[0]*k) + "," + Math.round(c[1]*k) + "," + Math.round(c[2]*k) + ")";
}
export function tint(hex, k){                        // mix toward white
  const c = rgb(hex);
  return "rgb(" + Math.round(c[0] + (255-c[0])*k) + "," + Math.round(c[1] + (255-c[1])*k) + ","
                + Math.round(c[2] + (255-c[2])*k) + ")";
}
