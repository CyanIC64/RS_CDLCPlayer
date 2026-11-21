"use strict";
/* ── the cable icon in the control bar ─────────────────────────────────────
   Shown while the Rocksmith cable is plugged in (or any input is being
   listened to). Until the page has been allowed the microphone once, the
   browser lists its inputs without names, so the cable cannot be told apart:
   the icon then shows a "?" and a click asks for the permission. */
class CableWatch {
  static NAME = /rocksmith|real\s*tone/i;

  constructor(){
    this.present = false;     // an input named like the cable is plugged in
    this.unknown = false;     // inputs without names: the cable cannot be told apart yet
    this.label = "";
    this.lostUntil = 0;       // just unplugged: the icon says so until then
    this.glowLevel = -1;
    $("bCable").onclick = () => {
      if (guitarInput.busy) return;
      if (guitarInput.link) guitarInput.stop(); else guitarInput.start();
    };
  }

  async scan(){
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    let ins = [];
    try { ins = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); } catch (e) {}
    const cab = ins.find(d => CableWatch.NAME.test(d.label));
    this.present = !!cab;
    this.label = cab ? cab.label : "";
    this.unknown = ins.length > 0 && ins.every(d => !d.label);
    this.icon();
  }

  icon(){
    const b = $("bCable");
    const live = !!guitarInput.link, lost = !live && performance.now() < this.lostUntil;
    const unk = !live && !lost && !this.present && this.unknown;
    b.hidden = !(live || lost || this.present || unk);
    b.classList.toggle("live", live);
    b.classList.toggle("lost", lost);
    b.classList.toggle("unk", unk);
    if (!live){ b.style.filter = ""; this.glowLevel = -1; }
    const dev = guitarInput.devices.find(d => d.deviceId === S.inDevice);
    const name = (live && dev && dev.label) || this.label || "the guitar input";
    b.title = live ? "Listening to " + name + " - click to stop (G)"
            : lost ? "The cable was unplugged"
            : unk  ? "Guitar input - click to look for the Rocksmith cable (G)"
            :        name + " is plugged in - click to listen (G)";
  }

  /* a green glow that follows the input level while listening */
  glow(peak){
    const db = 20*Math.log10(peak + 1e-9);
    const g = Math.round(clamp((db + 50)/40, 0, 1)*20)/20;  // -50 dBFS .. -10, in 5 % steps
    if (g === this.glowLevel) return;
    this.glowLevel = g;
    $("bCable").style.filter = g > 0 ? "drop-shadow(0 0 " + (1 + g*5).toFixed(1) + "px rgba(63,191,111," + (0.35 + 0.65*g).toFixed(2) + "))" : "";
  }
}
const cable = new CableWatch();

/* ── the guitar input's options ─────────────────────────────────────────── */
$("fInOn").onchange = (e) => {
  if (guitarInput.busy){ inputSync(); return; }           // still connecting: let it finish
  if (e.target.checked) guitarInput.start(); else guitarInput.stop();
};
$("fAmpOn").onchange = (e) => {
  S.ampOn = e.target.checked; savePrefs();
  if (S.ampOn && !guitarInput.link && !guitarInput.busy) guitarInput.start();   // the amp needs the input; it follows when it is up
  else pedalboard.sync();
};
$("vAmp").oninput = (e) => {
  S.ampLevel = (+e.target.value)/100; savePrefs();
  $("rvAmp").textContent = e.target.value + "%";
  pedalboard.setLevel(S.ampLevel);
};
$("fInScore").onchange = (e) => {
  S.inScore = e.target.checked; savePrefs();
  if (S.inScore) guitarInput.seek(); else guitarInput.markTabAll();
};
$("fInLat").onchange = (e) => guitarInput.setLatency(+e.target.value || 0);
$("bInCal").onclick = () => calibration.start();
$("sumClose").onclick = () => guitarInput.showSummary(false);
$("sumAgain").onclick = () => { guitarInput.showSummary(false); seek(0); if (!A.playing) togglePlay(); };
$("bInSug").onclick = () => { const v = guitarInput.suggestedLatency(); if (v !== null) guitarInput.setLatency(v); };
$("fInDev").onchange = async (e) => {
  S.inDevice = e.target.value; savePrefs();
  await guitarInput.reconnect();
};
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener){
  navigator.mediaDevices.addEventListener("devicechange", () => guitarInput.devicesChanged());
}
