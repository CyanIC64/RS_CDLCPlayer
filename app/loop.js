"use strict";
/* ── looping a stretch of bars ───────────────────────────────────────────────
   The difficulty bars are the loop selector:
     press and hold on the bars, drag across the ones you want, let go
         -> those bars light up and loop, starting two seconds before them
     a plain click on the bars while a selection is up
         -> jump to the start of the nearest selected bar (again two seconds early)
     a plain click on the bars with nothing selected -> seek there
     a click anywhere else on the highway -> the selection is cleared
   A press counts as "hold" once it has lasted a quarter of a second or moved
   on to another bar.                                                         */
const SEL = { i0:-1, i1:-1, drag:null };
const GREY_NOTE = "#8d959e";                       // a note outside the loop
const HOLD_MS = 250;
function selRange(){
  const d = SEL.drag;
  if (d && (d.moved || performance.now() - d.t0 >= HOLD_MS)) return [Math.min(d.a, d.b), Math.max(d.a, d.b)];
  return SEL.i0 >= 0 && SEL.i1 < S.phrases.length ? [SEL.i0, SEL.i1] : null;
}
function loopStartAt(audioT){                      // go there with a run-up, playing
  seek(Math.max(0, audioT - LOOP_LEAD));
  if (!S.playing){ play(); setPlayIcon(true); }
}
function setLoopBars(i0, i1){
  const ph = S.phrases, off = S.offMs/1000;
  SEL.i0 = i0; SEL.i1 = i1;
  S.loop = true; S.loopSel = true;
  S.loopA = Math.max(0, ph[i0].t0 + off); S.loopB = ph[i1].t1 + off;
  document.getElementById("bLoop").classList.add("on");
  loopStartAt(S.loopA);
}
function clearLoopBars(){
  if (SEL.i0 < 0 && !S.loopSel) return;
  SEL.i0 = SEL.i1 = -1;
  if (S.loopSel){ S.loop = false; S.loopSel = false; S.loopB = 0; document.getElementById("bLoop").classList.remove("on"); }
}
(function(){
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const inBars = (x, y) => S.phrases.length > 0 && y >= BARS.top - 8 && y <= BARS.top + BARS.h + 14
                           && x >= BARS.x0 - 3 && x <= BARS.x1 + 3;
  const barAt = (x) => {                            // the bar under x, or the nearest one
    const ph = S.phrases, D = S.duration || 1;
    const tc = clamp((x - BARS.x0)/(BARS.x1 - BARS.x0), 0, 1)*D - S.offMs/1000;
    let i = 0;
    while (i < ph.length - 1 && ph[i].t1 <= tc) i++;
    return i;
  };
  cv.addEventListener("pointermove", (e) => {
    const [x, y] = pos(e), d = SEL.drag;
    if (d){
      const i = barAt(x);
      if (i !== d.b){ d.b = i; d.moved = true; }
      return;
    }
    cv.style.cursor = inBars(x, y) ? "pointer" : "default";
  });
  cv.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const [x, y] = pos(e);
    if (!inBars(x, y)){ clearLoopBars(); return; }  // a click off the bars lets the loop go
    const i = barAt(x);
    SEL.drag = { a:i, b:i, t0:performance.now(), moved:false, x };
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  });
  const finish = (e, cancelled) => {
    const d = SEL.drag;
    if (!d) return;
    SEL.drag = null;
    if (cancelled) return;
    const held = d.moved || performance.now() - d.t0 >= HOLD_MS;
    const ph = S.phrases, off = S.offMs/1000;
    if (held) setLoopBars(Math.min(d.a, d.b), Math.max(d.a, d.b));
    else if (SEL.i0 >= 0) loopStartAt(ph[clamp(d.a, SEL.i0, SEL.i1)].t0 + off);   // nearest selected bar
    else seek(clamp((d.x - BARS.x0)/(BARS.x1 - BARS.x0), 0, 1)*(S.duration || 0));
  };
  cv.addEventListener("pointerup", (e) => finish(e, false));
  cv.addEventListener("pointercancel", (e) => finish(e, true));
})();

