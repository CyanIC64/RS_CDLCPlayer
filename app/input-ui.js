"use strict";
/* ── the cable icon in the control bar ─────────────────────────────────────
   Shown while the Rocksmith cable is plugged in (or any input is being
   listened to). Until the page has been allowed the microphone once, the
   browser lists its inputs without names, so the cable cannot be told apart:
   the icon then shows a "?" and a click asks for the permission. */
const CABLE_RE = /rocksmith|real\s*tone/i;
const CABLE = { present:false, unknown:false, label:"", lostUntil:0, glow:-1 };

async function cableScan(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  let ins = [];
  try { ins = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); } catch (e) {}
  const cab = ins.find(d => CABLE_RE.test(d.label));
  CABLE.present = !!cab;
  CABLE.label = cab ? cab.label : "";
  CABLE.unknown = ins.length > 0 && ins.every(d => !d.label);
  cableIcon();
}

function cableIcon(){
  const b = inEl("bCable");
  const live = !!IN.link, lost = !live && performance.now() < CABLE.lostUntil;
  const unk = !live && !lost && !CABLE.present && CABLE.unknown;
  b.hidden = !(live || lost || CABLE.present || unk);
  b.classList.toggle("live", live);
  b.classList.toggle("lost", lost);
  b.classList.toggle("unk", unk);
  if (!live){ b.style.filter = ""; CABLE.glow = -1; }
  const dev = IN.devices.find(d => d.deviceId === S.inDevice);
  const name = (live && dev && dev.label) || CABLE.label || "the guitar input";
  b.title = live ? "Listening to " + name + " - click to stop (G)"
          : lost ? "The cable was unplugged"
          : unk  ? "Guitar input - click to look for the Rocksmith cable (G)"
          :        name + " is plugged in - click to listen (G)";
}

/* a green glow that follows the input level while listening */
function cableGlow(peak){
  const db = 20*Math.log10(peak + 1e-9);
  const g = Math.round(clamp((db + 50)/40, 0, 1)*20)/20;    // -50 dBFS .. -10, in 5 % steps
  if (g === CABLE.glow) return;
  CABLE.glow = g;
  inEl("bCable").style.filter = g > 0 ? "drop-shadow(0 0 " + (1 + g*5).toFixed(1) + "px rgba(63,191,111," + (0.35 + 0.65*g).toFixed(2) + "))" : "";
}

inEl("bCable").onclick = () => {
  if (IN.busy) return;
  if (IN.link) inputStop(); else inputStart();
};

/* the level meter and the note heard, painted from frame() while the options are open */
function inputPaint(dt){
  if (!IN.link) return;
  IN.peak = Math.max(IN.level, IN.peak * Math.exp(-dt/0.3));
  IN.level = 0;
  cableGlow(IN.peak);
  inputScorePaint();
  if (!inEl("cfg").classList.contains("show")) return;
  const db = 20*Math.log10(IN.peak + 1e-9);
  const bar = inEl("inLevel");
  bar.style.width = (clamp((db + 60)/60, 0, 1)*100).toFixed(1) + "%";       // -60 dBFS .. 0
  bar.classList.toggle("hot", IN.peak > 0.7);
  const m = IN.last, a = currentArr();
  let txt = "—";
  if (m && m.freq > 0){
    const n = IN.kit.freqToNote(m.freq, (a && a.centOffset) || 0);
    const c = Math.round(n.cents);
    txt = n.name + n.octave + "  " + (c > 0 ? "+" : "") + c + "¢  ·  " + m.freq.toFixed(1) + " Hz";
  }
  if (txt !== IN.note){ IN.note = txt; inEl("inNote").textContent = txt; }
}

/* switched on last time: come back on at the first click or key press (the
   browser will not run audio before one) - but not on G, which switches it itself */
function inputRestore(){
  if (!S.inOn) return;
  inputMsg("The guitar input comes back on at the first click or key press.");
  const once = (e) => {
    if (e.type === "keydown" && (e.key === "g" || e.key === "G")) return;
    window.removeEventListener("pointerdown", once, true);
    window.removeEventListener("keydown", once, true);
    inputStart();
  };
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("keydown", once, true);
}

inEl("fInOn").onchange = (e) => {
  if (IN.busy){ inputSync(); return; }                    // still connecting: let it finish
  if (e.target.checked) inputStart(); else inputStop();
};
inEl("fAmpOn").onchange = (e) => {
  S.ampOn = e.target.checked; savePrefs();
  if (S.ampOn && !IN.link && !IN.busy) inputStart();      // the amp needs the input; it follows when it is up
  else ampSync();
};
inEl("vAmp").oninput = (e) => {
  S.ampLevel = (+e.target.value)/100; savePrefs();
  inEl("rvAmp").textContent = e.target.value + "%";
  if (AMP.amp) AMP.amp.setLevel(S.ampLevel);
};
inEl("fInScore").onchange = (e) => {
  S.inScore = e.target.checked; savePrefs();
  if (S.inScore) inputSeek(); else tabMarksAll();
};
inEl("fInLat").onchange = (e) => inputSetLatency(+e.target.value || 0);
inEl("bInCal").onclick = () => calStart();
inEl("sumClose").onclick = () => sumShow(false);
inEl("sumAgain").onclick = () => { sumShow(false); seek(0); if (!A.playing) togglePlay(); };
inEl("bInSug").onclick = () => { const v = inputSuggestedLatency(); if (v !== null) inputSetLatency(v); };
inEl("fInDev").onchange = async (e) => {
  S.inDevice = e.target.value; savePrefs();
  if (IN.link){ ampClose(); IN.link.close(); IN.link = null; await inputStart(); }
};
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener){
  navigator.mediaDevices.addEventListener("devicechange", async () => {
    cableScan();
    if (!IN.kit) return;                                  // never switched on: nothing to update
    IN.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
    inputFillDevices();
    const here = IN.devices.some(d => d.deviceId === S.inDevice) || !!IN.kit.findCable(IN.devices);
    if (IN.link && !IN.devices.some(d => d.deviceId === S.inDevice)) inputLost();
    else if (!IN.link && S.inOn && !IN.busy && here) inputStart();      // plugged back in
  });
}

