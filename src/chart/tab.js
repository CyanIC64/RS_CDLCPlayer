// The tab view's arithmetic: bars, beats and note values, and where a moment
// falls in a laid-out bar. The page (app/tabview.js) draws with these.
import { lowerBound } from "./util.js";

/* position in beats on the song's beat grid (fractional), so lengths can be
   read as note values; without a grid, two beats a second */
export function beatPos(beats, t){
  const B = beats;
  if (B.length < 2) return t*2;
  let i = lowerBound(B, "time", t + 1e-9) - 1;
  if (i < 0) i = 0;
  if (i > B.length - 2) i = B.length - 2;
  return i + (t - B[i].time)/Math.max(1e-3, B[i+1].time - B[i].time);
}

/* a length in beats rounded to a note value: [value, beams, triplet, dotted] */
export const TAB_VALUES = [
  [4, 0, false, false], [3, 0, false, true], [2, 0, false, false], [1.5, 0, false, true], [1, 0, false, false],
  [0.75, 1, false, true], [0.5, 1, false, false], [2/3, 1, true, false], [1/3, 1, true, false],
  [0.375, 2, false, true], [0.25, 2, false, false], [1/6, 2, true, false], [0.125, 3, false, false], [1/12, 3, true, false],
];
export function tabValue(beats){
  let best = TAB_VALUES[0], err = 1e9;
  for (const v of TAB_VALUES){
    const e = Math.abs(Math.log(Math.max(beats, 0.04)/v[0]));
    if (e < err){ err = e; best = v; }
  }
  return best;
}

/* the bars of the song: from one downbeat to the next (a beat with measure >= 0).
   lastT: when the last note ends; firstT: the first note, for a pick-up bar. */
export function measures(beats, lastT, firstT){
  const downs = beats.filter((b) => b.measure >= 0);
  const out = [];
  if (!downs.length){                                   // no beat grid: bars of two seconds
    for (let t = 0, n = 1; t < lastT; t += 2, n++) out.push({ t0:t, t1:t + 2, num:n });
    return out;
  }
  for (let i = 0; i < downs.length; i++){
    const t0 = downs[i].time;
    let t1 = i + 1 < downs.length ? downs[i+1].time : 0;
    if (i + 1 >= downs.length){
      const prev = i > 0 ? t0 - downs[i-1].time : 2;
      t1 = Math.max(t0 + prev, lastT + 0.05);
    }
    out.push({ t0, t1, num: downs[i].measure });
  }
  if (out.length && lastT > 0 && out[0].t0 > 0.05){     // notes before the first bar: a pick-up bar
    const firstNote = firstT !== undefined ? firstT : out[0].t0;
    if (firstNote < out[0].t0 - 0.02) out.unshift({ t0: Math.min(firstNote - 0.05, out[0].t0 - 0.5), t1: out[0].t0, num: out[0].num - 1 });
  }
  return out;
}

/* the events of an arrangement: every moment something is struck, with its
   notes (one per string, low string first) and the chord's name */
export function tabEvents(notes, chords){
  const byT = new Map();
  const add = (t, n) => {
    const k = Math.round(t*1000);
    let e = byT.get(k);
    if (!e){ e = { t, notes:[], name:"" }; byT.set(k, e); }
    if (!e.notes.some((m) => m.s === n.s)) e.notes.push(n);
  };
  for (const n of notes) add(n.t, n);
  let prev = null;
  for (const c of chords){
    if (c.notes.length){ prev = c; }
    else if (prev){                                      // "the same chord again", written without its notes
      for (const n of prev.notes) add(c.t, Object.assign({}, n, { t:c.t, sus:0, sl:-1, slu:-1, bn:0, vb:false, ho:false, po:false,
                                                                  linked:false, pm:c.pm || n.pm, mt:c.mute || n.mt }));
    }
    if (c.name && !c.rep){ const e = byT.get(Math.round(c.t*1000)); if (e) e.name = c.name; }
  }
  const evs = [...byT.values()].sort((a, b) => a.t - b.t);
  for (const e of evs) e.notes.sort((a, b) => a.s - b.s);
  return evs;
}

/* time -> x inside a laid-out bar: straight lines between its knots [[t, x], ...] */
export function xAt(b, t){
  const K = b.knots;
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++){
    if (t <= K[i][0]){ const [t0, x0] = K[i-1], [t1, x1] = K[i]; return t1 > t0 ? x0 + (x1 - x0)*(t - t0)/(t1 - t0) : x1; }
  }
  return K[K.length - 1][1];
}
