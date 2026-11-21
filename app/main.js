"use strict";
/* ── sync offset ─────────────────────────────────────────────────────────── */
$("fOffset").onchange = (e) =>
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

/* the keyboard: one key, one action (letters in either case) */
const KEYS = {
  "m": () => $("bMute").click(),
  "c": () => $("bClick").click(),
  "n": () => $("bSynth").click(),
  "t": () => $("bTab").click(),
  "g": () => $("fInOn").click(),
  "a": () => $("fAmpOn").click(),
  "u": () => tuner.toggle(),
  "p": () => pedalboard.toggle(),
  "l": () => $("bLoop").click(),
  "r": () => seek(0),
  "o": () => $("cfg").classList.toggle("show"),
  "Escape": () => {
    if (tuner.open) tuner.show(false);
    else if (guitarInput.summaryOpen) guitarInput.showSummary(false);
  },
  "ArrowLeft": (e) => seek(S.time - (e.shiftKey ? 5 : 1)),
  "ArrowRight": (e) => seek(S.time + (e.shiftKey ? 5 : 1)),
  "[": () => { const s = sectionAt(S.time - 0.25); seek(s ? (s.start > S.time - 0.6 ? (sectionAt(s.start - 0.1) || s).start : s.start) : 0); },
  "]": () => { const s = sectionAt(S.time + 0.05); if (s && s.idx+1 < S.sections.length) seek(S.sections[s.idx+1].time); },
  ",": () => applyOffset(S.offMs - 1),
  ".": () => applyOffset(S.offMs + 1),
};
for (let i = 0; i < 6; i++)                        // 1-6: the arrangements
  KEYS[String(i + 1)] = () => { if (i < S.arrs.length){ selectArrangement(i); $("fArr").value = i; } };

window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "SELECT" || (e.target.tagName === "INPUT" && e.target.type !== "range")) return;
  const k = e.key;
  if (e.target.tagName === "INPUT" && k.startsWith("Arrow")) return;   // the arrows belong to a focused slider
  if (k === " "){ e.preventDefault(); togglePlay(); return; }
  if (unlockAudio()) return;
  const act = KEYS[k.length === 1 ? k.toLowerCase() : k];
  if (act) act(e);
});

/* go */
resize();
boot().catch(err => {
  notice("Could not start: " + err.message);
  console.error(err);
});
