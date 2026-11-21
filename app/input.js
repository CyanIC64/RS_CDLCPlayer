"use strict";
/* ── guitar input ────────────────────────────────────────────────────────────
   The guitar - through the Rocksmith Real Tone Cable, or any other audio
   input - is listened to by web/pitch.js: an AudioWorklet in the song's own
   AudioContext, so what it hears is timed on the same clock as the song. The
   script is only loaded when the input is first switched on. */
const IN = { kit:null, link:null, busy:false, devices:[], level:0, peak:0, last:null, note:"",
             ver:null, dirty:true, cal:null, flash:null, flashTimer:0, hud:"" };
const inEl = (id) => document.getElementById(id);
function inputMsg(text){ inEl("inMsg").textContent = text; }

async function inputStart(){
  if (IN.busy || IN.link) return;
  IN.busy = true; inputSync();
  inputMsg("Connecting…");
  try {
    audioInit();
    if (A.ctx.state === "suspended") A.ctx.resume();
    if (!window.PitchKit) await loadScript("web/pitch.js");
    IN.kit = window.PitchKit;
    IN.devices = await IN.kit.listInputs();
    const dev = IN.devices.find(d => d.deviceId === S.inDevice) || IN.kit.findCable(IN.devices) || IN.devices[0];
    if (!dev) throw new Error("no audio input was found");
    S.inDevice = dev.deviceId;
    inputFillDevices();
    IN.link = await IN.kit.connect(A.ctx, S.inDevice, inputMessage);
    const track = IN.link.stream.getAudioTracks()[0];
    if (track) track.onended = () => inputLost();          // unplugged
    inputConfigure();
    S.inOn = true; savePrefs();
    inputMsg("Listening to " + (dev.label || "the audio input") + ".");
    ampSync();
  } catch (e) {
    if (IN.link){ IN.link.close(); IN.link = null; }
    S.inOn = false; savePrefs();
    inputMsg(e && e.name === "NotAllowedError"
      ? "The browser did not allow the microphone. Allow it for this page, then switch on again."
      : "Could not open the input: " + ((e && e.message) || e));
  } finally {
    IN.busy = false; inputSync();
    cableScan();                                           // the inputs have names now
  }
}

function inputStop(){
  if (IN.cal) calEnd("Calibration stopped.");
  ampClose();
  if (IN.link) IN.link.close();
  IN.link = null; IN.last = null; IN.level = 0; IN.peak = 0;
  S.inOn = false; savePrefs();
  inputSync();
  inputMsg("Switched off.");
}

/* the input went away (cable unplugged): stop, but keep S.inOn so that it
   comes back by itself when the cable is plugged in again */
function inputLost(){
  if (!IN.link) return;
  ampClose();
  IN.link.close(); IN.link = null; IN.last = null; IN.peak = 0;
  CABLE.lostUntil = performance.now() + 4000;
  setTimeout(cableIcon, 4100);
  inputSync();
  inputMsg("The input was unplugged. It comes back when it is plugged in again.");
}

/* the detector's settings follow the arrangement: a bass needs a longer window.
   The notes to check are made again from the synth's list (S.syn), which
   already holds every note and chord with its real pitch. */
function inputConfigure(){
  if (!IN.link) return;
  const bass = S.nStr === 4, a = currentArr(), pre = bass ? IN.kit.PRESETS.bass : IN.kit.PRESETS.guitar;
  IN.link.config(pre);
  for (const e of S.syn) e.n.hit = undefined;
  IN.ver = S.syn.length ? new IN.kit.Verifier(IN.kit.buildTargets(S.syn, eventMidi, (a && +a.centOffset) || 0),
                                              { window: bass ? 0.15 : 0.12, long: pre.long / A.ctx.sampleRate, onResult: inputResult })
                        : null;
  if (IN.ver) IN.ver.seek(chartTime());
  IN.link.expect([]);
  IN.dirty = true;
  inputIndex();
}

/* the verdicts are read by time: the highway (a repeated chord's frame), the
   tab view and the phrase bars all look a note's group up here */
function inputIndex(){
  IN.byT = new Map();
  if (IN.ver) for (const g of IN.ver.targets) IN.byT.set(Math.round(g.t*1000), g);
  inputPhraseStats(); tabMarksAll();
}
/* each phrase's notes and chords: how many, judged, hit */
function inputPhraseStats(){
  const ph = S.phrases;
  IN.phr = null;
  if (!IN.ver || !ph.length) return;
  const st = ph.map(() => ({ n:0, done:0, hit:0 }));
  let i = 0;
  for (const g of IN.ver.targets){
    while (i < ph.length - 1 && g.t >= ph[i].t1) i++;
    const s = st[i];
    s.n++;
    if (g.result !== null){ s.done++; if (g.result) s.hit++; }
  }
  IN.phr = st;
}
/* the tab view's mark for a group: green when hit, dark and ringed in red when missed */
function tabMark(g){
  if (!TAB.groups || !TAB.evs.length) return;
  const k = lowerBound(TAB.evs, "t", g.t - 0.002), e = TAB.evs[k];
  if (!e || Math.abs(e.t - g.t) > 0.002 || !TAB.groups[k]) return;
  const on = S.inScore && !!IN.link;
  TAB.groups[k].classList.toggle("ok", on && g.result === true);
  TAB.groups[k].classList.toggle("bad", on && g.result === false);
}
function tabMarksAll(){
  if (!TAB.groups) return;
  if (IN.ver && S.inScore && IN.link) for (const g of IN.ver.targets) tabMark(g);
  else for (const el of TAB.groups) if (el) el.classList.remove("ok", "bad");
}

/* the end of the song, played with the guitar input: the score, and the
   phrases most worth practising (a click goes there) */
function inputSummary(){
  if (!(IN.link && IN.ver && S.inScore)) return;
  IN.ver.update(1e9);                                      // the last notes, still waiting for their window to pass
  let hit = 0, miss = 0;
  for (const g of IN.ver.targets){ if (g.result === true) hit++; else if (g.result === false) miss++; }
  if (!hit && !miss) return;
  const T = IN.ver.targets.length, pct = hit/(hit + miss);
  inEl("sumSong").textContent = [inEl("title").textContent, currentArr() ? currentArr().name || "" : ""].filter((x) => x && x !== "—").join(" · ");
  const P = inEl("sumPct");
  P.textContent = Math.round(pct*100) + "%";
  P.style.color = "hsl(" + Math.round(pct*125) + ",80%,60%)";
  inEl("sumHit").textContent = hit;
  inEl("sumMiss").textContent = miss;
  inEl("sumBest").textContent = IN.ver.stats.best;
  inEl("sumPlayed").textContent = Math.round(100*(hit + miss)/T) + "%";
  const box = inEl("sumWeak"), off = S.offMs/1000;
  box.textContent = "";
  const weak = (IN.phr || []).map((s, i) => ({ s, i, p: s.done ? s.hit/s.done : 1 }))
    .filter((x) => x.s.done >= 3 && x.p < 0.9).sort((a, b) => a.p - b.p).slice(0, 3);
  for (const w of weak){
    const ph = S.phrases[w.i], sec = sectionAt(ph.t0 + off);
    const b = document.createElement("button");
    const l = document.createElement("span"), r = document.createElement("b");
    l.textContent = [sec && S.sections[sec.idx] ? secLabel(S.sections[sec.idx].name) : "", "phrase " + (w.i + 1)].filter(Boolean).join(" · ");
    r.textContent = Math.round(w.p*100) + "%  (" + w.s.hit + "/" + w.s.done + ")";
    b.append(l, r);
    b.title = "Go to this phrase";
    b.onclick = () => { sumShow(false); seek(Math.max(0, ph.t0 + off - 1)); };
    box.appendChild(b);
  }
  inEl("sumWeakH").hidden = !weak.length;
  sumShow(true);
}
function sumShow(on){ inEl("sum").classList.toggle("show", !!on); }

/* chart time of a moment on the audio clock. A chart second lasts 1/S.rate
   real seconds, and what the player plays answers what they heard
   S.inLatMs earlier (output + input latency). */
function detChartTime(ctxTime){
  const ago = A.ctx.currentTime - ctxTime + S.inLatMs/1000;
  return songTime() - ago * S.rate - S.offMs/1000;
}

function inputMessage(m){
  if (IN.cal) calMessage(m);
  if (m.type === "frame"){
    IN.level = Math.max(IN.level, m.rms);
    IN.last = m;
    tuner.feed(m.freq);
  }
  if (!IN.ver || !S.inScore || !A.playing || IN.cal) return;
  const t = detChartTime(m.time);
  if (m.type === "onset") IN.ver.onset(t, m.energy);
  else IN.ver.frame(t, m.freq, m.clarity, m.freqs, m.presence, t - (m.time - m.timeL) * S.rate);
}

/* every frame while the song plays: tell the worklet which frequencies to
   measure, and settle the notes whose window has passed. A detection reaches
   the page up to ~0.1 s after the moment it describes (half the analysis
   window plus a hop), so notes are only settled after that. */
function inputPump(){
  if (!IN.ver || !IN.link || !S.inScore || !A.playing || IN.cal) return;
  const now = chartTime() - S.inLatMs/1000 * S.rate;
  IN.link.expect(IN.ver.expected(now));
  IN.ver.update(now - (S.nStr === 4 ? 0.15 : 0.1) * S.rate);
}

/* a note or chord was just judged: blink the counter and the hit light */
function inputResult(g){
  IN.dirty = true;
  g.at = performance.now();                                // when: the marks on the highway fade from here
  for (const x of g.notes) x.n.hitAt = g.at;
  tabMark(g);
  inputPhraseStats();
  IN.flash = { ok: g.result, at: performance.now() };
  const el = inEl("hudHit");
  el.classList.remove("hit", "miss");
  void el.offsetWidth;                                     // restart the fade
  el.classList.add(g.result ? "hit" : "miss");
  clearTimeout(IN.flashTimer);
  IN.flashTimer = setTimeout(() => el.classList.remove("hit", "miss"), 120);
}

function inputSeek(){
  if (IN.ver){ IN.ver.seek(S.time - S.offMs/1000); IN.dirty = true; inputPhraseStats(); tabMarksAll(); }
}

/* the score line in the options, and the latency the hits suggest:
   the median distance of their attacks from the chart, once there are enough */
function inputScorePaint(){
  inputHudPaint();
  if (!IN.dirty || !inEl("cfg").classList.contains("show")) return;
  IN.dirty = false;
  const st = IN.ver && IN.ver.stats, n = st ? st.hit + st.miss : 0;
  inEl("inScore").textContent = !n ? "—"
    : st.hit + "/" + n + " · " + Math.round(100*st.hit/n) + "% · streak " + st.streak;
  const sug = inputSuggestedLatency();
  inEl("inSugRow").hidden = sug === null;
  if (sug !== null) inEl("inSug").textContent = "Suggested: " + sug + " ms";
}
/* the HUD: notes and chords hit, out of all in the arrangement, counted over the
   current run through the song (a jump back clears the ones after it) */
function inputHudPaint(){
  const on = !!(IN.link && IN.ver && S.inScore);
  let txt = "";
  if (on){
    let hit = 0, done = 0;
    const T = IN.ver.targets;
    for (const g of T) if (g.result !== null){ done++; if (g.result) hit++; }
    const st = IN.ver.stats;
    txt = hit + " / " + T.length + "|" + (done ? Math.round(100*hit/done) + "% of " + done + " played" : "")
        + (st.streak > 1 ? " · streak " + st.streak : "");
  }
  if (txt === IN.hud) return;
  IN.hud = txt;
  inEl("hudHitRow").style.display = on ? "" : "none";
  if (on){ const [a, b] = txt.split("|"); inEl("hudHit").textContent = a; inEl("hudHitSub").textContent = b; }
}
function inputSuggestedLatency(){
  const L = IN.ver && IN.ver.stats.lag;
  if (!L || L.length < 8) return null;
  const m = [...L].sort((a, b) => a - b)[L.length >> 1];
  const ms = Math.round(clamp(S.inLatMs + m / S.rate * 1000, PREFS.inLatMs[0], PREFS.inLatMs[1]));
  return Math.abs(ms - S.inLatMs) >= 10 ? ms : null;
}
function inputSetLatency(ms){
  S.inLatMs = Math.round(clamp(ms, PREFS.inLatMs[0], PREFS.inLatMs[1]));
  inEl("fInLat").value = S.inLatMs;
  if (IN.ver) IN.ver.stats.lag.length = 0;               // measured with the old value
  IN.dirty = true;
  savePrefs();
}

/* ── latency calibration ─────────────────────────────────────────────────
   Four count-in clicks, then eight more: the player strikes a string on each
   of the eight. The page hears each attack some time after its click - the
   click's way out to the ears plus the guitar's way in - and the median of
   those delays is the input latency. */
const CAL_N = 8, CAL_IN = 4, CAL_GAP = 0.6;
function calClick(when, down){
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = "square"; o.frequency.value = down ? 1568 : 1046;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.35, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
  o.connect(g); g.connect(A.ctx.destination);
  o.start(when); o.stop(when + 0.07);
}
async function calStart(){
  if (IN.cal){ calEnd("Calibration stopped."); return; }
  if (!IN.link) await inputStart();
  if (!IN.link) return;
  if (A.playing){ pause(); setPlayIcon(false); }
  const t0 = A.ctx.currentTime + 0.8, clicks = [];
  for (let i = 0; i < CAL_IN + CAL_N; i++){
    const when = t0 + i * CAL_GAP;
    calClick(when, i === 0 || i === CAL_IN);
    if (i >= CAL_IN) clicks.push(when);
  }
  IN.cal = { clicks, onsets: [], timer: 0 };
  IN.cal.timer = setTimeout(calFinish, (t0 + (CAL_IN + CAL_N) * CAL_GAP + 0.5 - A.ctx.currentTime) * 1000);
  inEl("bInCal").classList.add("on"); inEl("bInCal").textContent = "Stop";
  inputMsg("Listen to four clicks, then strike an open string on each of the next eight.");
}
function calMessage(m){
  if (m.type === "onset") IN.cal.onsets.push(m.time);
}
function calFinish(){
  const c = IN.cal;
  if (!c) return;
  // each click takes the first attack from 50 ms before it to 100 ms before the next click
  const lags = [];
  for (const w of c.clicks){
    const o = c.onsets.find((t) => t > w - 0.05 && t < w + CAL_GAP - 0.1);
    if (o !== undefined) lags.push(o - w);
  }
  if (lags.length < 5){
    calEnd("Heard " + lags.length + " of " + CAL_N + " strikes, which is not enough. Turn the guitar up a little and try again.");
    return;
  }
  lags.sort((a, b) => a - b);
  const q = lags.length >> 2, spread = Math.round((lags[lags.length - 1 - q] - lags[q]) * 1000);
  inputSetLatency(lags[lags.length >> 1] * 1000);
  calEnd("Input latency set to " + S.inLatMs + " ms (" + lags.length + " of " + CAL_N + " strikes heard, spread " + spread + " ms).");
}
function calEnd(text){
  if (IN.cal) clearTimeout(IN.cal.timer);
  IN.cal = null;
  inEl("bInCal").classList.remove("on"); inEl("bInCal").textContent = "Calibrate";
  inputMsg(text);
}

function inputFillDevices(){
  const sel = inEl("fInDev");
  sel.textContent = "";
  for (const d of IN.devices){
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || ("Input " + (sel.options.length + 1));
    sel.appendChild(o);
  }
  if (!IN.devices.length){
    const o = document.createElement("option"); o.value = ""; o.textContent = "no input found"; sel.appendChild(o);
  }
  sel.value = S.inDevice;
}

