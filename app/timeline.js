"use strict";
/* ── formatting ──────────────────────────────────────────────────────────── */
function fmt(t){
  t = Math.max(0, t || 0);
  const m = Math.floor(t/60), s = Math.floor(t%60);
  return m + ":" + String(s).padStart(2, "0");
}
function paintClock(){
  document.getElementById("tcur").textContent = fmt(S.time);
  document.getElementById("tdur").textContent = fmt(S.duration);
}

/* ── timeline ────────────────────────────────────────────────────────────── */
const SECCOL = {riff:"#2c5b93", verse:"#3f7fbe", prechorus:"#5b4b9e", chorus:"#6b4bb0",
                solo:"#a8842c", intro:"#39434d", outro:"#39434d", bridge:"#2f7d78"};
function secColor(name){
  const k = (name || "").toLowerCase();
  for (const key in SECCOL) if (k.includes(key)) return SECCOL[key];
  let h = 0; for (let i = 0; i < k.length; i++) h = (h*31 + k.charCodeAt(i)) | 0;
  return "hsl(" + (Math.abs(h) % 360) + " 30% 36%)";
}

let secEls = [], secCur = -1;
function renderTimeline(){
  const box = document.getElementById("tlsec");
  box.innerHTML = "";
  secEls = []; secCur = -1; hudSecIdx = -2;
  const D = S.duration || (S.beats.length ? S.beats[S.beats.length-1].time + 2 : 1);
  const secs = S.sections.length ? S.sections : [];
  const off = S.offMs/1000;
  for (let i = 0; i < secs.length; i++){
    const t0 = Math.max(0, secs[i].time + off), t1 = (i+1 < secs.length) ? secs[i+1].time + off : D;
    if (t1 <= t0) continue;
    const el = document.createElement("div");
    el.className = "s";
    el.style.left = (100*t0/D) + "%";
    el.style.width = (100*(t1-t0)/D) + "%";
    el.style.background = secColor(secs[i].name);
    const sp = document.createElement("span");
    sp.textContent = secLabel(secs[i].name);
    el.appendChild(sp);
    box.appendChild(el);
    secEls[i] = el;
  }
  if (!secs.length){
    const el = document.createElement("div");
    el.className = "s gap"; el.style.left = "0%"; el.style.width = "100%";
    el.innerHTML = "<span style='color:#4a5560'>no sections in this chart</span>";
    box.appendChild(el);
  }
  /* where the tone switches */
  const tb = document.getElementById("tltone");
  tb.innerHTML = "";
  for (const c of S.tones.changes){
    const x = (c.t + off)/D;
    if (x < 0 || x > 1) continue;
    const el = document.createElement("div");
    const nm = S.tones.names[c.name];
    el.className = "tn" + (nm && nm.kind ? " " + nm.kind : ""); el.style.left = (100*x) + "%";
    tb.appendChild(el);
  }
  fitTimeline();
}
/* the tone in force at chart time tc: its key, or "" */
function toneKeyAt(tc){
  let key = S.tones.base || "";
  for (const c of S.tones.changes){ if (c.t > tc) break; key = c.name; }
  return key;
}
function toneLabel(key){
  const nm = S.tones.names[key];
  if (!nm) return key;
  return (nm.real || nm.raw) + (nm.kind ? " (" + KIND_LABEL[nm.kind] + ")" : "");
}
const KIND_LABEL = { clean:"clean", crunch:"crunch", distortion:"distortion" };
const secLabel = (name) => String(name || "").replace(/[_-]+/g, " ").trim();
/* a section too narrow for its name shows no name at all (hover tells it) */
function fitTimeline(){
  for (const el of secEls){
    if (!el || !el.firstChild) continue;
    el.classList.remove("tight");
    if (el.firstChild.offsetWidth > el.clientWidth - 8) el.classList.add("tight");
  }
}
{ let tm = 0; window.addEventListener("resize", () => { clearTimeout(tm); tm = setTimeout(fitTimeline, 120); }); }

function sectionAt(t){
  const s = S.sections;
  if (!s.length) return null;
  const off = S.offMs/1000;                       // t, start and end are audio times
  let idx = 0;
  for (let i = 0; i < s.length; i++) if (s[i].time + off <= t + 0.001) idx = i;
  return { idx, start: Math.max(0, s[idx].time + off),
           end: (idx+1 < s.length) ? s[idx+1].time + off : S.duration, name: s[idx].name };
}

/* -- timeline -------------------------------------------------------------- */
function updateHeadPct(){
  const tl = document.getElementById("tl");
  const D = S.duration || 1;
  const x = Math.round(clamp(S.time/D, 0, 1) * tl.clientWidth);
  document.getElementById("tlhead").style.transform = "translateX(" + x + "px)";
  document.getElementById("tlplayed").style.width = x + "px";
}

/* scrub */
(function(){
  const tl = document.getElementById("tl"), hint = document.getElementById("tlhint");
  let drag = false;
  const seekTo = (e) => {
    const r = tl.getBoundingClientRect();
    seek(clamp((e.clientX - r.left)/r.width, 0, 1) * (S.duration || 0));
  };
  tl.addEventListener("pointerdown", (e) => { drag = true; tl.setPointerCapture(e.pointerId); seekTo(e); });
  tl.addEventListener("pointermove", (e) => {
    const r = tl.getBoundingClientRect();
    const f = clamp((e.clientX - r.left)/r.width, 0, 1);
    const tt = f * (S.duration || 0), sec = sectionAt(tt);
    hint.style.display = "block";
    hint.style.left = clamp(e.clientX, 60, window.innerWidth - 60) + "px";
    hint.style.top = (r.top - 7) + "px";
    hint.innerHTML = "<b></b><span></span>";
    hint.firstChild.textContent = fmt(tt);
    const tone = S.tones.changes.length ? toneLabel(toneKeyAt(tt - S.offMs/1000)) : "";
    hint.lastChild.textContent = [sec ? secLabel(sec.name) : "", tone].filter(Boolean).join("  ·  ");
    if (drag) seekTo(e);
  });
  tl.addEventListener("pointerup", () => { drag = false; });
  tl.addEventListener("pointerleave", () => { hint.style.display = "none"; drag = false; });
})();

