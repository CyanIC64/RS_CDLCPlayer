"use strict";
/* ── guitar input ────────────────────────────────────────────────────────────
   The guitar - through the Rocksmith Real Tone Cable, or any other audio
   input - is listened to by web/pitch.js: an AudioWorklet in the song's own
   AudioContext, so what it hears is timed on the same clock as the song. The
   script is only loaded when the input is first switched on. */
const inEl = (id) => document.getElementById(id);

class GuitarInput {
  constructor(){
    this.kit = null;          // window.PitchKit, once loaded
    this.link = null;         // the open input (worklet + stream)
    this.busy = false;        // connecting
    this.devices = [];        // the audio inputs
    this.level = 0; this.peak = 0;
    this.last = null;         // the last analysis frame
    this.note = "";           // the note shown in the options
    this.ver = null;          // the Verifier: the chart's notes and chords, judged
    this.dirty = true;        // the score line needs painting
    this.flash = null; this.flashTimer = 0;
    this.hud = "";
    this.byT = new Map();     // judged groups by time (ms)
    this.phr = null;          // per phrase: { n, done, hit }
  }

  msg(text){ inEl("inMsg").textContent = text; }

  async start(){
    if (this.busy || this.link) return;
    this.busy = true; inputSync();
    this.msg("Connecting…");
    try {
      audioInit();
      if (A.ctx.state === "suspended") A.ctx.resume();
      if (!window.PitchKit) await loadScript("web/pitch.js");
      this.kit = window.PitchKit;
      this.devices = await this.kit.listInputs();
      const dev = this.devices.find(d => d.deviceId === S.inDevice) || this.kit.findCable(this.devices) || this.devices[0];
      if (!dev) throw new Error("no audio input was found");
      S.inDevice = dev.deviceId;
      this.fillDevices();
      this.link = await this.kit.connect(A.ctx, S.inDevice, (m) => this.onMessage(m));
      const track = this.link.stream.getAudioTracks()[0];
      if (track) track.onended = () => this.lost();          // unplugged
      this.configure();
      S.inOn = true; savePrefs();
      this.msg("Listening to " + (dev.label || "the audio input") + ".");
      pedalboard.sync();
    } catch (e) {
      if (this.link){ this.link.close(); this.link = null; }
      S.inOn = false; savePrefs();
      this.msg(e && e.name === "NotAllowedError"
        ? "The browser did not allow the microphone. Allow it for this page, then switch on again."
        : "Could not open the input: " + ((e && e.message) || e));
    } finally {
      this.busy = false; inputSync();
      cable.scan();                                          // the inputs have names now
    }
  }

  stop(){
    if (calibration.active) calibration.end("Calibration stopped.");
    pedalboard.close();
    if (this.link) this.link.close();
    this.link = null; this.last = null; this.level = 0; this.peak = 0;
    S.inOn = false; savePrefs();
    inputSync();
    this.msg("Switched off.");
  }

  /* the input went away (cable unplugged): stop, but keep S.inOn so that it
     comes back by itself when the cable is plugged in again */
  lost(){
    if (!this.link) return;
    pedalboard.close();
    this.link.close(); this.link = null; this.last = null; this.peak = 0;
    cable.lostUntil = performance.now() + 4000;
    setTimeout(() => cable.icon(), 4100);
    inputSync();
    this.msg("The input was unplugged. It comes back when it is plugged in again.");
  }

  /* another input picked in the options: reconnect to it */
  async reconnect(){
    if (!this.link) return;
    pedalboard.close(); this.link.close(); this.link = null;
    await this.start();
  }

  /* switched on last time: come back on at the first click or key press (the
     browser will not run audio before one) - but not on G, which switches it itself */
  restore(){
    if (!S.inOn) return;
    this.msg("The guitar input comes back on at the first click or key press.");
    const once = (e) => {
      if (e.type === "keydown" && (e.key === "g" || e.key === "G")) return;
      window.removeEventListener("pointerdown", once, true);
      window.removeEventListener("keydown", once, true);
      this.start();
    };
    window.addEventListener("pointerdown", once, true);
    window.addEventListener("keydown", once, true);
  }

  /* the detector's settings follow the arrangement: a bass needs a longer window.
     The notes to check are made again from the synth's list (S.syn), which
     already holds every note and chord with its real pitch. */
  configure(){
    if (!this.link) return;
    const bass = S.nStr === 4, a = currentArr(), pre = bass ? this.kit.PRESETS.bass : this.kit.PRESETS.guitar;
    this.link.config(pre);
    for (const e of S.syn) e.n.hit = undefined;
    this.ver = S.syn.length ? new this.kit.Verifier(this.kit.buildTargets(S.syn, eventMidi, (a && +a.centOffset) || 0),
                                                    { window: bass ? 0.15 : 0.12, long: pre.long / A.ctx.sampleRate,
                                                      onResult: (g) => this.onResult(g) })
                            : null;
    if (this.ver) this.ver.seek(chartTime());
    this.link.expect([]);
    this.dirty = true;
    this.index();
  }

  /* the verdicts are read by time: the highway (a repeated chord's frame), the
     tab view and the phrase bars all look a note's group up here */
  index(){
    this.byT = new Map();
    if (this.ver) for (const g of this.ver.targets) this.byT.set(Math.round(g.t*1000), g);
    this.phraseStats(); this.markTabAll();
  }
  /* each phrase's notes and chords: how many, judged, hit */
  phraseStats(){
    const ph = S.phrases;
    this.phr = null;
    if (!this.ver || !ph.length) return;
    const st = ph.map(() => ({ n:0, done:0, hit:0 }));
    let i = 0;
    for (const g of this.ver.targets){
      while (i < ph.length - 1 && g.t >= ph[i].t1) i++;
      const s = st[i];
      s.n++;
      if (g.result !== null){ s.done++; if (g.result) s.hit++; }
    }
    this.phr = st;
  }
  /* the tab view's mark for a group: green when hit, dark and ringed in red when missed */
  markTab(g){
    if (!tabView.groups || !tabView.evs.length) return;
    const k = lowerBound(tabView.evs, "t", g.t - 0.002), e = tabView.evs[k];
    if (!e || Math.abs(e.t - g.t) > 0.002 || !tabView.groups[k]) return;
    const on = S.inScore && !!this.link;
    tabView.groups[k].classList.toggle("ok", on && g.result === true);
    tabView.groups[k].classList.toggle("bad", on && g.result === false);
  }
  markTabAll(){
    if (!tabView.groups) return;
    if (this.ver && S.inScore && this.link) for (const g of this.ver.targets) this.markTab(g);
    else for (const el of tabView.groups) if (el) el.classList.remove("ok", "bad");
  }

  /* the end of the song, played with the guitar input: the score, and the
     phrases most worth practising (a click goes there) */
  summary(){
    if (!(this.link && this.ver && S.inScore)) return;
    this.ver.update(1e9);                                    // the last notes, still waiting for their window to pass
    let hit = 0, miss = 0;
    for (const g of this.ver.targets){ if (g.result === true) hit++; else if (g.result === false) miss++; }
    if (!hit && !miss) return;
    const T = this.ver.targets.length, pct = hit/(hit + miss);
    inEl("sumSong").textContent = [inEl("title").textContent, currentArr() ? currentArr().name || "" : ""].filter((x) => x && x !== "—").join(" · ");
    const P = inEl("sumPct");
    P.textContent = Math.round(pct*100) + "%";
    P.style.color = "hsl(" + Math.round(pct*125) + ",80%,60%)";
    inEl("sumHit").textContent = hit;
    inEl("sumMiss").textContent = miss;
    inEl("sumBest").textContent = this.ver.stats.best;
    inEl("sumPlayed").textContent = Math.round(100*(hit + miss)/T) + "%";
    const box = inEl("sumWeak"), off = S.offMs/1000;
    box.textContent = "";
    const weak = (this.phr || []).map((s, i) => ({ s, i, p: s.done ? s.hit/s.done : 1 }))
      .filter((x) => x.s.done >= 3 && x.p < 0.9).sort((a, b) => a.p - b.p).slice(0, 3);
    for (const w of weak){
      const ph = S.phrases[w.i], sec = sectionAt(ph.t0 + off);
      const b = document.createElement("button");
      const l = document.createElement("span"), r = document.createElement("b");
      l.textContent = [sec && S.sections[sec.idx] ? secLabel(S.sections[sec.idx].name) : "", "phrase " + (w.i + 1)].filter(Boolean).join(" · ");
      r.textContent = Math.round(w.p*100) + "%  (" + w.s.hit + "/" + w.s.done + ")";
      b.append(l, r);
      b.title = "Go to this phrase";
      b.onclick = () => { this.showSummary(false); seek(Math.max(0, ph.t0 + off - 1)); };
      box.appendChild(b);
    }
    inEl("sumWeakH").hidden = !weak.length;
    this.showSummary(true);
  }
  showSummary(on){ inEl("sum").classList.toggle("show", !!on); }
  get summaryOpen(){ return inEl("sum").classList.contains("show"); }

  /* chart time of a moment on the audio clock. A chart second lasts 1/S.rate
     real seconds, and what the player plays answers what they heard
     S.inLatMs earlier (output + input latency). */
  chartTimeOf(ctxTime){
    const ago = A.ctx.currentTime - ctxTime + S.inLatMs/1000;
    return songTime() - ago * S.rate - S.offMs/1000;
  }

  onMessage(m){
    if (calibration.active) calibration.onMessage(m);
    if (m.type === "frame"){
      this.level = Math.max(this.level, m.rms);
      this.last = m;
      tuner.feed(m.freq);
    }
    if (!this.ver || !S.inScore || !A.playing || calibration.active) return;
    const t = this.chartTimeOf(m.time);
    if (m.type === "onset") this.ver.onset(t, m.energy);
    else this.ver.frame(t, m.freq, m.clarity, m.freqs, m.presence, t - (m.time - m.timeL) * S.rate);
  }

  /* every frame while the song plays: tell the worklet which frequencies to
     measure, and settle the notes whose window has passed. A detection reaches
     the page up to ~0.1 s after the moment it describes (half the analysis
     window plus a hop), so notes are only settled after that. */
  pump(){
    if (!this.ver || !this.link || !S.inScore || !A.playing || calibration.active) return;
    const now = chartTime() - S.inLatMs/1000 * S.rate;
    this.link.expect(this.ver.expected(now));
    this.ver.update(now - (S.nStr === 4 ? 0.15 : 0.1) * S.rate);
  }

  /* a note or chord was just judged: blink the counter and the hit light */
  onResult(g){
    this.dirty = true;
    g.at = performance.now();                                // when: the marks on the highway fade from here
    for (const x of g.notes) x.n.hitAt = g.at;
    this.markTab(g);
    this.phraseStats();
    this.flash = { ok: g.result, at: performance.now() };
    const el = inEl("hudHit");
    el.classList.remove("hit", "miss");
    void el.offsetWidth;                                     // restart the fade
    el.classList.add(g.result ? "hit" : "miss");
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove("hit", "miss"), 120);
  }

  seek(){
    if (this.ver){ this.ver.seek(S.time - S.offMs/1000); this.dirty = true; this.phraseStats(); this.markTabAll(); }
  }

  /* the level meter and the note heard, painted from frame() while the options are open */
  paint(dt){
    if (!this.link) return;
    this.peak = Math.max(this.level, this.peak * Math.exp(-dt/0.3));
    this.level = 0;
    cable.glow(this.peak);
    this.scorePaint();
    if (!inEl("cfg").classList.contains("show")) return;
    const db = 20*Math.log10(this.peak + 1e-9);
    const bar = inEl("inLevel");
    bar.style.width = (clamp((db + 60)/60, 0, 1)*100).toFixed(1) + "%";       // -60 dBFS .. 0
    bar.classList.toggle("hot", this.peak > 0.7);
    const m = this.last, a = currentArr();
    let txt = "—";
    if (m && m.freq > 0){
      const n = this.kit.freqToNote(m.freq, (a && a.centOffset) || 0);
      const c = Math.round(n.cents);
      txt = n.name + n.octave + "  " + (c > 0 ? "+" : "") + c + "¢  ·  " + m.freq.toFixed(1) + " Hz";
    }
    if (txt !== this.note){ this.note = txt; inEl("inNote").textContent = txt; }
  }

  /* the score line in the options, and the latency the hits suggest:
     the median distance of their attacks from the chart, once there are enough */
  scorePaint(){
    this.hudPaint();
    if (!this.dirty || !inEl("cfg").classList.contains("show")) return;
    this.dirty = false;
    const st = this.ver && this.ver.stats, n = st ? st.hit + st.miss : 0;
    inEl("inScore").textContent = !n ? "—"
      : st.hit + "/" + n + " · " + Math.round(100*st.hit/n) + "% · streak " + st.streak;
    const sug = this.suggestedLatency();
    inEl("inSugRow").hidden = sug === null;
    if (sug !== null) inEl("inSug").textContent = "Suggested: " + sug + " ms";
  }
  /* the HUD: notes and chords hit, out of all in the arrangement, counted over the
     current run through the song (a jump back clears the ones after it) */
  hudPaint(){
    const on = !!(this.link && this.ver && S.inScore);
    let txt = "";
    if (on){
      let hit = 0, done = 0;
      const T = this.ver.targets;
      for (const g of T) if (g.result !== null){ done++; if (g.result) hit++; }
      const st = this.ver.stats;
      txt = hit + " / " + T.length + "|" + (done ? Math.round(100*hit/done) + "% of " + done + " played" : "")
          + (st.streak > 1 ? " · streak " + st.streak : "");
    }
    if (txt === this.hud) return;
    this.hud = txt;
    inEl("hudHitRow").style.display = on ? "" : "none";
    if (on){ const [a, b] = txt.split("|"); inEl("hudHit").textContent = a; inEl("hudHitSub").textContent = b; }
  }
  suggestedLatency(){
    const L = this.ver && this.ver.stats.lag;
    if (!L || L.length < 8) return null;
    const m = [...L].sort((a, b) => a - b)[L.length >> 1];
    const ms = Math.round(clamp(S.inLatMs + m / S.rate * 1000, PREFS.inLatMs[0], PREFS.inLatMs[1]));
    return Math.abs(ms - S.inLatMs) >= 10 ? ms : null;
  }
  setLatency(ms){
    S.inLatMs = Math.round(clamp(ms, PREFS.inLatMs[0], PREFS.inLatMs[1]));
    inEl("fInLat").value = S.inLatMs;
    if (this.ver) this.ver.stats.lag.length = 0;             // measured with the old value
    this.dirty = true;
    savePrefs();
  }

  fillDevices(){
    const sel = inEl("fInDev");
    sel.textContent = "";
    for (const d of this.devices){
      const o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || ("Input " + (sel.options.length + 1));
      sel.appendChild(o);
    }
    if (!this.devices.length){
      const o = document.createElement("option"); o.value = ""; o.textContent = "no input found"; sel.appendChild(o);
    }
    sel.value = S.inDevice;
  }

  /* the inputs changed (a cable plugged in or out) */
  async devicesChanged(){
    cable.scan();
    if (!this.kit) return;                                   // never switched on: nothing to update
    this.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
    this.fillDevices();
    const here = this.devices.some(d => d.deviceId === S.inDevice) || !!this.kit.findCable(this.devices);
    if (this.link && !this.devices.some(d => d.deviceId === S.inDevice)) this.lost();
    else if (!this.link && S.inOn && !this.busy && here) this.start();      // plugged back in
  }
}
const guitarInput = new GuitarInput();

/* ── latency calibration ─────────────────────────────────────────────────
   Four count-in clicks, then eight more: the player strikes a string on each
   of the eight. The page hears each attack some time after its click - the
   click's way out to the ears plus the guitar's way in - and the median of
   those delays is the input latency. */
class Calibration {
  static N = 8;             // clicks to strike on
  static COUNT_IN = 4;
  static GAP = 0.6;         // seconds between clicks

  constructor(){ this.active = null; }      // while running: { clicks, onsets, timer }

  click(when, down){
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = "square"; o.frequency.value = down ? 1568 : 1046;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.35, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
    o.connect(g); g.connect(A.ctx.destination);
    o.start(when); o.stop(when + 0.07);
  }
  async start(){
    const { N, COUNT_IN, GAP } = Calibration;
    if (this.active){ this.end("Calibration stopped."); return; }
    if (!guitarInput.link) await guitarInput.start();
    if (!guitarInput.link) return;
    if (A.playing){ pause(); setPlayIcon(false); }
    const t0 = A.ctx.currentTime + 0.8, clicks = [];
    for (let i = 0; i < COUNT_IN + N; i++){
      const when = t0 + i * GAP;
      this.click(when, i === 0 || i === COUNT_IN);
      if (i >= COUNT_IN) clicks.push(when);
    }
    this.active = { clicks, onsets: [], timer: 0 };
    this.active.timer = setTimeout(() => this.finish(), (t0 + (COUNT_IN + N) * GAP + 0.5 - A.ctx.currentTime) * 1000);
    inEl("bInCal").classList.add("on"); inEl("bInCal").textContent = "Stop";
    guitarInput.msg("Listen to four clicks, then strike an open string on each of the next eight.");
  }
  onMessage(m){
    if (m.type === "onset") this.active.onsets.push(m.time);
  }
  finish(){
    const c = this.active, { N, GAP } = Calibration;
    if (!c) return;
    // each click takes the first attack from 50 ms before it to 100 ms before the next click
    const lags = [];
    for (const w of c.clicks){
      const o = c.onsets.find((t) => t > w - 0.05 && t < w + GAP - 0.1);
      if (o !== undefined) lags.push(o - w);
    }
    if (lags.length < 5){
      this.end("Heard " + lags.length + " of " + N + " strikes, which is not enough. Turn the guitar up a little and try again.");
      return;
    }
    lags.sort((a, b) => a - b);
    const q = lags.length >> 2, spread = Math.round((lags[lags.length - 1 - q] - lags[q]) * 1000);
    guitarInput.setLatency(lags[lags.length >> 1] * 1000);
    this.end("Input latency set to " + S.inLatMs + " ms (" + lags.length + " of " + N + " strikes heard, spread " + spread + " ms).");
  }
  end(text){
    if (this.active) clearTimeout(this.active.timer);
    this.active = null;
    inEl("bInCal").classList.remove("on"); inEl("bInCal").textContent = "Calibrate";
    guitarInput.msg(text);
  }
}
const calibration = new Calibration();
