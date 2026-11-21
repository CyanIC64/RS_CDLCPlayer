"use strict";
/* ── settings ──────────────────────────────────────────────────────────────── */
const PREFS = { speed:[0.6, 2], zoom:[0.55, 3], camRate:[0.3, 2.5], master:[0, 1], clickLevel:[0, 1], synthLevel:[0, 1],
                rscale:[0.2, 1], autoScale:0, showCells:0, showNums:0, showLabels:0, showLyrics:0, autoPan:0,
                showFingers:0, invert:0, lefty:0, tabView:0, showChord:0, showDiagram:0, showHit:0, clickOn:0, synthOn:0, muted:0, fx:0,
                inOn:0, inDevice:0, inScore:0, inLatMs:[-50, 400], ampOn:0, ampLevel:[0, 1] };
/* kept in this browser: see Store (ui.js) */
let prefTimer = 0;
function savePrefs(){
  clearTimeout(prefTimer);
  prefTimer = setTimeout(() => {
    const o = {};
    for (const k in PREFS) o[k] = S[k];
    Store.write(Store.PREFS, o);
  }, 350);
}
async function loadPrefs(){
  const p = Store.read(Store.PREFS, {});
  for (const k in PREFS){
    if (typeof p[k] !== typeof S[k]) continue;
    S[k] = PREFS[k] ? clamp(p[k], PREFS[k][0], PREFS[k][1]) : p[k];
  }
  syncControls();
}
/* put every control where the state says it is */
function syncControls(){
  $("fSpeed").value = Math.round(S.speed*100);
  $("fCam").value = Math.round(S.camRate*100); $("rvCam").textContent = Math.round(S.camRate*100) + "%";
  $("fCells").checked = S.showCells; $("fNums").checked = S.showNums; $("fLabels").checked = S.showLabels;
  $("fLyrics").checked = S.showLyrics; $("fPan").checked = S.autoPan;
  $("fFingers").checked = S.showFingers; $("fInvert").checked = S.invert; $("fLefty").checked = S.lefty;
  if (typeof tabView !== "undefined" && S.tabView !== tabView.on) tabView.set(S.tabView); $("fAuto").checked = S.autoScale; $("fChord").checked = S.showChord; $("fDiag").checked = S.showDiagram; $("fHit").checked = S.showHit;
  $("fInScore").checked = S.inScore; $("fInLat").value = S.inLatMs;
  $("fAmpOn").checked = S.ampOn; $("vAmp").value = Math.round(S.ampLevel*100); $("rvAmp").textContent = Math.round(S.ampLevel*100) + "%";
  $("fFx").checked = S.fx;
  { const sc = $("fScale"); let best = sc.options[0].value;
    for (const o of sc.options) if (Math.abs(+o.value - S.rscale) < Math.abs(+best - S.rscale)) best = o.value;
    sc.value = best; S.rscale = +best; }
  $("vMaster").value = Math.round(S.master*100); $("lMaster").textContent = Math.round(S.master*100);
  $("vClick").value = Math.round(S.clickLevel*100); $("lClick").textContent = Math.round(S.clickLevel*100);
  $("bMute").classList.toggle("on", S.muted);
  $("bClick").classList.toggle("on", S.clickOn);
  $("vSynth").value = Math.round(S.synthLevel*100); $("lSynth").textContent = Math.round(S.synthLevel*100);
  $("bSynth").classList.toggle("on", S.synthOn);
  synth.setLevel(S.synthLevel);
  if (A.gain) A.gain.gain.value = S.muted ? 0 : S.master;
  if (A.gainClick) A.gainClick.gain.value = S.clickLevel;
  updGeom(); resize();
}
