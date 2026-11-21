"use strict";
/* ── automatic resolution ────────────────────────────────────────────────────
   A busy passage is hard on the graphics card, not on this code: glows, lit
   strings and translucent frames all add up to pixels filled many times over,
   on a canvas of several million. When the frame rate falls well under what
   the screen has been reaching, the canvas is drawn with fewer pixels (it is
   stretched to the same size, so only sharpness changes); when the rate has
   been at the top for a while, the pixels come back a step at a time.
   If a step up brings the slowness straight back, that level is left alone
   for half a minute, so the picture does not pump. */
const AR = { peak:0, low:0, high:0, ceil:1, ceilUntil:0, upAt:0 };
const AR_STEPS = [1, 0.85, 0.72, 0.6, 0.5];
function autoLabel(){
  const el = document.getElementById("rvAuto");
  if (el) el.textContent = S.autoScale && S.dynScale < 0.999 ? Math.round(S.dynScale*100) + "%" : "";
}
function autoResolution(span){
  if (!S.autoScale || !S.playing || document.hidden || S.fps < 4) { AR.low = AR.high = 0; return; }
  const now = performance.now();
  AR.peak = Math.max(AR.peak*0.999, Math.min(S.fps, 240));       // what this screen can reach
  if (AR.peak < 20) return;
  AR.low  = S.fps < AR.peak*0.80 ? AR.low + span : 0;
  AR.high = S.fps > AR.peak*0.95 ? AR.high + span : 0;
  const i = AR_STEPS.findIndex(v => v <= S.dynScale + 0.001);
  if (AR.low >= 1.0 && i < AR_STEPS.length - 1){
    if (now - AR.upAt < 4000){ AR.ceil = AR_STEPS[i + 1]; AR.ceilUntil = now + 30000; }   // the step up did not hold
    S.dynScale = AR_STEPS[i + 1]; AR.low = AR.high = 0;
    resize(); autoLabel();
  } else if (AR.high >= 4.0 && i > 0){
    if (now > AR.ceilUntil) AR.ceil = 1;
    if (AR_STEPS[i - 1] <= AR.ceil + 0.001){
      S.dynScale = AR_STEPS[i - 1]; AR.low = AR.high = 0; AR.upAt = now;
      resize(); autoLabel();
    }
  }
}

/* ── frame loop ─────────────────────────────────────────────────────────── */
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
const LOOP_LEAD = 2.0;              // seconds of run-up before a looped section

/* While a song is being opened the highway is drawn at half rate. The only
   motion then is a slow fade and a camera glide, which 30 frames a second
   carry smoothly, and every frame not drawn leaves CPU to the converter and
   the audio decoder - on a two-core machine that is the difference between a
   ~5 s and a ~9 s load. */
let loadSkip = 0;
function frame(now){
  if (opening && !S.playing && (++loadSkip & 1)){ requestAnimationFrame(frame); return; }
  const dt = Math.min(0.1, (now - last)/1000);
  last = now;

  S.time = songTime();
  if (S.vis !== S.visTo){
    const step = dt/0.42;
    S.vis = S.visTo > S.vis ? Math.min(S.visTo, S.vis + step) : Math.max(S.visTo, S.vis - step);
  }

  // loop section
  /* The loop restarts LOOP_LEAD seconds before the section, so there is time
     to get ready. The looped section stays the same until the player jumps
     somewhere else. */
  if (S.loop && S.playing && S.duration){
    if (!S.loopSel && (!S.loopB || S.time < S.loopA - LOOP_LEAD - 0.3 || S.time > S.loopB + 0.3)){
      const sec = sectionAt(S.time);
      if (sec){ S.loopA = sec.start; S.loopB = sec.end; }
    }
    if (S.loopB && S.time >= S.loopB - 0.02) seek(Math.max(0, S.loopA - LOOP_LEAD));
  }

  if (tabView.on) tabView.follow(); else draw(dt);
  paintClock();
  updateHeadPct();
  updateLyrics();
  updateHud();
  pump();
  synth.pump();
  inputPump();

  fpsAcc += dt; fpsN++;
  if (now - fpsT > 250){
    S.fps = fpsN / Math.max(0.001, fpsAcc);
    autoResolution((now - fpsT)/1000);
    document.getElementById("fps").textContent = Math.round(S.fps) + " FPS"
      + (S.autoScale && S.dynScale < 0.999 ? " · " + Math.round(S.dynScale*100) + "%" : "");
    fpsAcc = 0; fpsN = 0; fpsT = now;
  }
  inputPaint(dt);
  tuner.paint(dt);
  requestAnimationFrame(frame);
}

