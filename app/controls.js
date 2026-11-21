"use strict";
/* ── controls ───────────────────────────────────────────────────────────── */
function setPlayIcon(on){
  $("icPlay").style.display = on ? "none" : "block";
  $("icPause").style.display = on ? "block" : "none";
  $("bPlay").title = on ? "Pause (Space)" : "Play (Space)";
  $("bPlay").classList.toggle("on", on);
}

$("bPlay").onclick = togglePlay;
$("bRestart").onclick = () => { seek(0); };
$("bPrev").onclick = () => {
  const s = sectionAt(S.time - 0.25);
  seek(s ? s.start : 0);
};
$("bNext").onclick = () => {
  const s = sectionAt(S.time + 0.05);
  if (s && s.idx + 1 < S.sections.length) seek(S.sections[s.idx+1].time);
  else seek(S.duration - 0.05);
};
/* The loop button loops the section the song is in (the sections of the seek
   bar). If bars are selected on the difficulty bars, it switches that loop off. */
$("bLoop").onclick = (e) => {
  if (S.loopSel){ loopSel.clear(); return; }
  S.loop = !S.loop;
  $("bLoop").classList.toggle("on", S.loop);
  const s = sectionAt(S.time);
  if (S.loop && s){ S.loopA = s.start; S.loopB = s.end; } else S.loopB = 0;
};
$("bCfg").onclick = () =>
  $("cfg").classList.toggle("show");

$("vMaster").oninput = (e) => {
  S.master = (+e.target.value)/100;
  $("lMaster").textContent = e.target.value;
  if (!S.muted && A.gain) A.gain.gain.value = S.master;
  savePrefs();
};
$("bMute").onclick = () => {
  S.muted = !S.muted;
  $("bMute").classList.toggle("on", S.muted);
  if (A.gain) A.gain.gain.value = S.muted ? 0 : S.master;
  savePrefs();
};
$("vClick").oninput = (e) => {
  S.clickLevel = (+e.target.value)/100;
  $("lClick").textContent = e.target.value;
  if (A.gainClick) A.gainClick.gain.value = S.clickLevel;
  savePrefs();
};
/* song speed: the label follows the thumb, the speed changes when it is let go */
$("vSpeed").oninput = (e) => { $("lSpeed").textContent = e.target.value + "%"; };
$("vSpeed").onchange = (e) => { setSongSpeed((+e.target.value)/100); };
$("bSpeed").onclick = () => {
  $("vSpeed").value = 100;
  $("lSpeed").textContent = "100%";
  setSongSpeed(1);
};
$("vSynth").oninput = (e) => {
  S.synthLevel = (+e.target.value)/100;
  $("lSynth").textContent = e.target.value;
  synth.setLevel(S.synthLevel);
  savePrefs();
};
$("bSynth").onclick = () => {
  S.synthOn = !S.synthOn;
  $("bSynth").classList.toggle("on", S.synthOn);
  if (S.synthOn) synth.sync(); else synth.kill();
  savePrefs();
};
$("bClick").onclick = () => {
  S.clickOn = !S.clickOn;
  $("bClick").classList.toggle("on", S.clickOn);
  if (S.clickOn) syncBeats();
  savePrefs();
};

/* every option is remembered for the next run */
{
  const bind = (id, key) => { $(id).onchange = (e) => { S[key] = e.target.checked; savePrefs(); }; };
  bind("fCells", "showCells"); bind("fNums", "showNums"); bind("fLabels", "showLabels");
  bind("fLyrics", "showLyrics"); bind("fPan", "autoPan"); bind("fFingers", "showFingers"); bind("fInvert", "invert"); bind("fLefty", "lefty");
  bind("fChord", "showChord"); bind("fDiag", "showDiagram"); bind("fHit", "showHit"); bind("fFx", "fx");
  $("fAuto").onchange = (e) => {
    S.autoScale = e.target.checked; S.dynScale = 1; AR.ceil = 1; resize(); autoLabel(); savePrefs();
  };
  $("fSpeed").oninput = (e) => { S.speed = (+e.target.value)/100; updGeom(); savePrefs(); };
  $("fCam").oninput = (e) => {
    S.camRate = (+e.target.value)/100;
    $("rvCam").textContent = e.target.value + "%";
    savePrefs();
  };
  $("fScale").onchange = (e) => { S.rscale = +e.target.value || 1; resize(); savePrefs(); };
}

