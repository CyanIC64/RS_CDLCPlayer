"use strict";
/* ── lyrics ──────────────────────────────────────────────────────────────────
   Two lines at a time. In the line being sung the syllables already sung go
   grey, the current one is blue and the rest are white; the line still to
   come is light grey and a line that is over goes dark.                     */
let lyrPair = null;
function lyrBuild(el, line){
  el.textContent = "";
  el._spans = [];
  if (!line) return;
  for (const sy of line.syl){
    const sp = document.createElement("span");
    sp.textContent = sy[2];
    el.appendChild(sp); el._spans.push(sp);
  }
}
function lyrPaint(el, line, t){
  if (!line) return;
  const state = t < line.t - 0.02 ? "next" : t > line.end + 0.12 ? "done" : "live";
  if (el._state !== state){ el._state = state; el.className = "ln " + state; }
  if (state !== "live") return;
  let cur = -1;
  for (let i = 0; i < line.syl.length; i++) if (line.syl[i][0] <= t + 0.02) cur = i;
  for (let i = 0; i < el._spans.length; i++){
    const c = i < cur ? "sung" : i === cur ? "now" : "";
    if (el._spans[i]._c !== c){ el._spans[i]._c = c; el._spans[i].className = c; }
  }
}
function updateLyrics(){
  const box = $("lyr");
  if (!box) return;
  const hide = () => { if (lyrPair !== null){ box.style.display = "none"; lyrPair = null; } };
  if (!S.showLyrics || !S.lyrPairs.length) return hide();
  /* lyrics ride the same clock as the notes, so they take the sync offset too */
  const t = S.time - S.offMs/1000;
  const Pp = S.lyrPairs;
  let lo = 0, hi = Pp.length - 1, idx = -1;
  while (lo <= hi){ const m = (lo + hi) >> 1; if (Pp[m].show <= t){ idx = m; lo = m + 1; } else hi = m - 1; }
  if (idx < 0) return hide();
  const p = Pp[idx];
  if (t > p.gone) return hide();                   // nothing sung for a while
  const A = $("lyrA"), B = $("lyrB");
  if (lyrPair !== p){
    /* A new pair of lines takes over the two rows. The rows still carry the
       colour of the lines they just held - often the white of a line being
       sung - and a colour change is animated, so without care the new text
       would be seen fading from that white to its own grey: a flash. The
       animation is switched off for this one change. */
    lyrPair = p;
    A.style.transition = B.style.transition = "none";
    lyrBuild(A, p.a); lyrBuild(B, p.b);
    A._state = B._state = "";
    A.className = B.className = "ln next";
    lyrPaint(A, p.a, t); lyrPaint(B, p.b, t);
    box.style.display = "block";
    void box.offsetWidth;                           // apply it now, before the animation is back
    A.style.transition = B.style.transition = "";
  }
  box.style.opacity = (clamp(Math.min((t - p.show)/0.3, (p.gone - t)/0.6), 0, 1)*S.vis).toFixed(3);
  lyrPaint(A, p.a, t); lyrPaint(B, p.b, t);
}

/* corner read-out: section, and the tone in force with its raw key */
let hudSecIdx = -2, hudToneKey, hudToneUntil = 0;
function updateHud(){
  const s = sectionAt(S.time);
  const idx = s ? s.idx : -1;
  if (idx !== hudSecIdx){
    hudSecIdx = idx;
    if (secEls[secCur]) secEls[secCur].classList.remove("cur");
    secCur = idx;
    if (secEls[secCur]) secEls[secCur].classList.add("cur");
    $("hudSecRow").style.display = s ? "" : "none";
    if (s) $("hudSec").textContent =
      secLabel(s.name) || "—";
  }

  const T = S.tones, row = $("hudToneRow"), tc = chartTime();
  let key = T.base || "";
  for (let i = 0; i < T.changes.length && T.changes[i].t <= tc; i++) key = T.changes[i].name;
  if (key !== hudToneKey){
    const first = hudToneKey === undefined;
    hudToneKey = key;
    pedalboard.tone(key);
    row.style.display = key ? "" : "none";
    if (key){
      const nm = T.names[key] || { raw:key, real:"" };
      $("hudTone").textContent = nm.real || nm.raw;
      $("hudRaw").textContent = nm.raw;
      const kEl = $("hudKind");
      kEl.textContent = nm.kind ? KIND_LABEL[nm.kind].toUpperCase() : "";
      kEl.className = "tkind " + (nm.kind || "");
      $("hudToneK").textContent = first ? "TONE" : "TONE SWITCH";
      row.classList.add("flash");
      hudToneUntil = performance.now() + 3500;
    }
  } else if (hudToneUntil && performance.now() > hudToneUntil){
    hudToneUntil = 0; row.classList.remove("flash");
  }
}

