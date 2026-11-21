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
const GREY_NOTE = "#8d959e";                       // a note outside the loop

class LoopSelection {
  static HOLD_MS = 250;

  constructor(){
    this.i0 = -1; this.i1 = -1;                    // the bars selected (indices of S.phrases)
    this.drag = null;                              // a press on the bars: { a, b, t0, moved, x }
    this.listen();
  }

  /* the bars lit up: the ones being dragged across, or the selection */
  range(){
    const d = this.drag;
    if (d && (d.moved || performance.now() - d.t0 >= LoopSelection.HOLD_MS)) return [Math.min(d.a, d.b), Math.max(d.a, d.b)];
    return this.i0 >= 0 && this.i1 < S.phrases.length ? [this.i0, this.i1] : null;
  }
  startAt(audioT){                                 // go there with a run-up, playing
    seek(Math.max(0, audioT - LOOP_LEAD));
    if (!S.playing){ play(); setPlayIcon(true); }
  }
  set(i0, i1){
    const ph = S.phrases, off = S.offMs/1000;
    this.i0 = i0; this.i1 = i1;
    S.loop = true; S.loopSel = true;
    S.loopA = Math.max(0, ph[i0].t0 + off); S.loopB = ph[i1].t1 + off;
    $("bLoop").classList.add("on");
    this.startAt(S.loopA);
  }
  clear(){
    if (this.i0 < 0 && !S.loopSel) return;
    this.i0 = this.i1 = -1;
    if (S.loopSel){ S.loop = false; S.loopSel = false; S.loopB = 0; $("bLoop").classList.remove("on"); }
  }
  /* a new song: nothing selected, no loop */
  reset(){
    this.i0 = this.i1 = -1; this.drag = null;
    S.loop = false; S.loopSel = false; S.loopB = 0;
    $("bLoop").classList.remove("on");
  }
  /* the note offset moved the chart: the selected bars move with it */
  follow(){
    if (S.loopSel && this.i0 >= 0 && S.phrases[this.i1]){
      S.loopA = Math.max(0, S.phrases[this.i0].t0 + S.offMs/1000); S.loopB = S.phrases[this.i1].t1 + S.offMs/1000;
    }
  }

  listen(){
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const inBars = (x, y) => S.phrases.length > 0 && y >= BARS.top - 8 && y <= BARS.top + BARS.h + 14
                             && x >= BARS.x0 - 3 && x <= BARS.x1 + 3;
    const barAt = (x) => {                          // the bar under x, or the nearest one
      const ph = S.phrases, D = S.duration || 1;
      const tc = clamp((x - BARS.x0)/(BARS.x1 - BARS.x0), 0, 1)*D - S.offMs/1000;
      let i = 0;
      while (i < ph.length - 1 && ph[i].t1 <= tc) i++;
      return i;
    };
    cv.addEventListener("pointermove", (e) => {
      const [x, y] = pos(e), d = this.drag;
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
      if (!inBars(x, y)){ this.clear(); return; }  // a click off the bars lets the loop go
      const i = barAt(x);
      this.drag = { a:i, b:i, t0:performance.now(), moved:false, x };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    const finish = (e, cancelled) => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      if (cancelled) return;
      const held = d.moved || performance.now() - d.t0 >= LoopSelection.HOLD_MS;
      const ph = S.phrases, off = S.offMs/1000;
      if (held) this.set(Math.min(d.a, d.b), Math.max(d.a, d.b));
      else if (this.i0 >= 0) this.startAt(ph[clamp(d.a, this.i0, this.i1)].t0 + off);   // nearest selected bar
      else seek(clamp((d.x - BARS.x0)/(BARS.x1 - BARS.x0), 0, 1)*(S.duration || 0));
    };
    cv.addEventListener("pointerup", (e) => finish(e, false));
    cv.addEventListener("pointercancel", (e) => finish(e, true));
  }
}
const loopSel = new LoopSelection();
