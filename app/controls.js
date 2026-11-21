"use strict";
/* ── controls ───────────────────────────────────────────────────────────── */
function setPlayIcon(on){
  document.getElementById("icPlay").style.display = on ? "none" : "block";
  document.getElementById("icPause").style.display = on ? "block" : "none";
  document.getElementById("bPlay").title = on ? "Pause (Space)" : "Play (Space)";
  document.getElementById("bPlay").classList.toggle("on", on);
}

document.getElementById("bPlay").onclick = togglePlay;
document.getElementById("bRestart").onclick = () => { seek(0); };
document.getElementById("bPrev").onclick = () => {
  const s = sectionAt(S.time - 0.25);
  seek(s ? s.start : 0);
};
document.getElementById("bNext").onclick = () => {
  const s = sectionAt(S.time + 0.05);
  if (s && s.idx + 1 < S.sections.length) seek(S.sections[s.idx+1].time);
  else seek(S.duration - 0.05);
};
/* The loop button loops the section the song is in (the sections of the seek
   bar). If bars are selected on the difficulty bars, it switches that loop off. */
document.getElementById("bLoop").onclick = (e) => {
  if (S.loopSel){ loopSel.clear(); return; }
  S.loop = !S.loop;
  document.getElementById("bLoop").classList.toggle("on", S.loop);
  const s = sectionAt(S.time);
  if (S.loop && s){ S.loopA = s.start; S.loopB = s.end; } else S.loopB = 0;
};
document.getElementById("bCfg").onclick = () =>
  document.getElementById("cfg").classList.toggle("show");

document.getElementById("vMaster").oninput = (e) => {
  S.master = (+e.target.value)/100;
  document.getElementById("lMaster").textContent = e.target.value;
  if (!S.muted && A.gain) A.gain.gain.value = S.master;
  savePrefs();
};
document.getElementById("bMute").onclick = () => {
  S.muted = !S.muted;
  document.getElementById("bMute").classList.toggle("on", S.muted);
  if (A.gain) A.gain.gain.value = S.muted ? 0 : S.master;
  savePrefs();
};
document.getElementById("vClick").oninput = (e) => {
  S.clickLevel = (+e.target.value)/100;
  document.getElementById("lClick").textContent = e.target.value;
  if (A.gainClick) A.gainClick.gain.value = S.clickLevel;
  savePrefs();
};
/* song speed: the label follows the thumb, the speed changes when it is let go */
document.getElementById("vSpeed").oninput = (e) => { document.getElementById("lSpeed").textContent = e.target.value + "%"; };
document.getElementById("vSpeed").onchange = (e) => { setSongSpeed((+e.target.value)/100); };
document.getElementById("bSpeed").onclick = () => {
  document.getElementById("vSpeed").value = 100;
  document.getElementById("lSpeed").textContent = "100%";
  setSongSpeed(1);
};
document.getElementById("vSynth").oninput = (e) => {
  S.synthLevel = (+e.target.value)/100;
  document.getElementById("lSynth").textContent = e.target.value;
  synth.setLevel(S.synthLevel);
  savePrefs();
};
document.getElementById("bSynth").onclick = () => {
  S.synthOn = !S.synthOn;
  document.getElementById("bSynth").classList.toggle("on", S.synthOn);
  if (S.synthOn) synth.sync(); else synth.kill();
  savePrefs();
};
document.getElementById("bClick").onclick = () => {
  S.clickOn = !S.clickOn;
  document.getElementById("bClick").classList.toggle("on", S.clickOn);
  if (S.clickOn) syncBeats();
  savePrefs();
};

/* every option is remembered for the next run */
{
  const bind = (id, key) => { document.getElementById(id).onchange = (e) => { S[key] = e.target.checked; savePrefs(); }; };
  bind("fCells", "showCells"); bind("fNums", "showNums"); bind("fLabels", "showLabels");
  bind("fLyrics", "showLyrics"); bind("fPan", "autoPan"); bind("fFingers", "showFingers"); bind("fInvert", "invert"); bind("fLefty", "lefty");
  bind("fChord", "showChord"); bind("fDiag", "showDiagram"); bind("fHit", "showHit"); bind("fFx", "fx");
  document.getElementById("fAuto").onchange = (e) => {
    S.autoScale = e.target.checked; S.dynScale = 1; AR.ceil = 1; resize(); autoLabel(); savePrefs();
  };
  document.getElementById("fSpeed").oninput = (e) => { S.speed = (+e.target.value)/100; updGeom(); savePrefs(); };
  document.getElementById("fCam").oninput = (e) => {
    S.camRate = (+e.target.value)/100;
    document.getElementById("rvCam").textContent = e.target.value + "%";
    savePrefs();
  };
  document.getElementById("fScale").onchange = (e) => { S.rscale = +e.target.value || 1; resize(); savePrefs(); };
}

