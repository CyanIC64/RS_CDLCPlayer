"use strict";
/* ── sync offset ─────────────────────────────────────────────────────────── */
document.getElementById("fOffset").onchange = (e) =>
  applyOffset(clamp(Math.round(+e.target.value || 0), -60000, 60000));
document.querySelectorAll("#cfg .nudge").forEach(b => {
  b.onclick = () => applyOffset(clamp(S.offMs + (+b.dataset.d), -60000, 60000));
});



window.addEventListener("wheel", (e) => {
  if (e.target.closest("#bar, #cfg")) return;
  e.preventDefault();
  S.zoom = clamp(S.zoom * (e.deltaY < 0 ? 1.06 : 0.94), 0.55, 3.0);
  savePrefs();
}, {passive:false});

window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "SELECT" || (e.target.tagName === "INPUT" && e.target.type !== "range")) return;
  const k = e.key;
  if (e.target.tagName === "INPUT" && k.startsWith("Arrow")) return;   // the arrows belong to a focused slider
  if (k === " "){ e.preventDefault(); togglePlay(); }
  else if (unlockAudio()) return;
  else if (k === "m" || k === "M"){ document.getElementById("bMute").click(); }
  else if (k === "c" || k === "C"){ document.getElementById("bClick").click(); }
  else if (k === "n" || k === "N"){ document.getElementById("bSynth").click(); }
  else if (k === "t" || k === "T"){ document.getElementById("bTab").click(); }
  else if (k === "g" || k === "G"){ document.getElementById("fInOn").click(); }
  else if (k === "a" || k === "A"){ document.getElementById("fAmpOn").click(); }
  else if (k === "u" || k === "U"){ tunerShow(!TU.open); }
  else if (k === "p" || k === "P"){ rigShow(!(AMP.ui && AMP.ui.open)); }
  else if (k === "Escape" && TU.open){ tunerShow(false); }
  else if (k === "Escape" && inEl("sum").classList.contains("show")){ sumShow(false); }
  else if (k === "ArrowLeft"){ seek(S.time - (e.shiftKey ? 5 : 1)); }
  else if (k === "ArrowRight"){ seek(S.time + (e.shiftKey ? 5 : 1)); }
  else if (k === "["){ const s = sectionAt(S.time - 0.25); seek(s ? (s.start > S.time - 0.6 ? (sectionAt(s.start - 0.1) || s).start : s.start) : 0); }
  else if (k === "]"){ const s = sectionAt(S.time + 0.05); if (s && s.idx+1 < S.sections.length) seek(S.sections[s.idx+1].time); }
  else if (k === "l" || k === "L"){ document.getElementById("bLoop").click(); }
  else if (k === "r" || k === "R"){ seek(0); }
  else if (k === "o" || k === "O"){ document.getElementById("cfg").classList.toggle("show"); }
  else if (k === ","){ applyOffset(S.offMs - 1); }
  else if (k === "."){ applyOffset(S.offMs + 1); }
  else if (k >= "1" && k <= "6"){
    const i = +k - 1;
    if (i < S.arrs.length){ selectArrangement(i); document.getElementById("fArr").value = i; }
  }
});

/* go */
resize();
boot().catch(err => {
  notice("Could not start: " + err.message);
  console.error(err);
});
