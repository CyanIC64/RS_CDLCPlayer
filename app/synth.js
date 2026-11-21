"use strict";
/* ── note synthesizer ────────────────────────────────────────────────────────
   Plays the chart itself: every note at the pitch its string, fret and the
   arrangement's tuning give it, on the audio clock, in step with the highway.
   A wrong fret or a note in the wrong place is easy to miss by eye and hard
   to miss by ear.

   The voice is a plucked string made from one oscillator with a string-like
   set of harmonics, a low-pass filter that closes as the note decays and a
   gain envelope. The chart's techniques are played where a pitch or an
   envelope can express them:
     sustain        rings for its length
     bend           pitch rises by the charted amount over the first part
     slide          pitch glides to the target fret over the last part
     vibrato        pitch wobble
     palm mute      short and dull
     fret-hand mute a pitchless thud
     hammer-on, pull-off, tap, linked note   soft attack
     harmonic       the string's harmonic at that fret; pinch: two octaves up
     tremolo        the note is re-struck quickly
     accent         louder                                                     */
const { OPEN_GTR, OPEN_BASS } = ChartKit;                                 // MIDI numbers of the open strings
const HARMONIC = { 12:12, 24:24, 7:19, 19:19, 5:24, 4:28, 9:28, 16:28, 3:31 };   // semitones above the open string
/* The pitch an event of S.syn really sounds at: a natural harmonic rings at its
   node's interval above the open string, a pinch harmonic two octaves up. Shared
   by the note synth and the note detection (web/pitch.js). */
function eventMidi(e){
  const n = e.n;
  if (n.hm && n.f > 0) return e.m - n.f + (HARMONIC[n.f] || 12);
  if (n.hp) return e.m + 24;
  return e.m;
}

class NoteSynth {
  constructor(){
    this.idx = 0;        // the next event of S.syn to schedule
    this.voices = [];    // what is ringing or scheduled
    this.wave = null; this.noise = null; this.out = null;
  }

  /* the pitch of every note of the arrangement, as events in time order */
  build(a){
    const open = S.nStr === 4 ? OPEN_BASS : OPEN_GTR, tun = a.tuning || [];
    /* a note on fret 0 sounds at the capo; every other fret is counted from the nut */
    const midiOf = (n) => (open[n.s] !== undefined ? open[n.s] : 64) + (+tun[n.s] || 0) + (n.f > 0 ? n.f : S.capo);
    /* a note without a sustain rings until the string is played again */
    const last = {};
    for (let i = S.all.length - 1; i >= 0; i--){
      const n = S.all[i], nx = last[n.s];
      n.ring = sustained(n) ? Math.max(n.sus, 0.03) : clamp(nx ? nx.t - n.t : 0.55, 0.10, n.pm ? 0.14 : 0.55);
      last[n.s] = n;
    }
    const ev = [];
    for (let i = 0; i < S.all.length; ){
      let j = i;
      while (j < S.all.length && S.all[j].t === S.all[i].t) j++;
      for (let q = i; q < j; q++) ev.push({ t:S.all[q].t, n:S.all[q], m:midiOf(S.all[q]), k:j - i, o:q - i });
      i = j;
    }
    /* a repeated chord that carries no notes of its own strums the chord before it */
    let prev = null;
    for (const c of S.chords){
      if (c.notes.length){ prev = c.notes; continue; }
      if (prev) prev.forEach((n, o) => ev.push({ t:c.t, m:midiOf(n), k:prev.length, o,
        n:{ f:n.f, s:n.s, pm:n.pm, mt:n.mt, ac:false, ring:0.22, sus:0, bn:0, sl:-1, slu:-1 } }));
    }
    S.syn = ev.sort((p, q) => p.t - q.t);
    this.idx = 0;
  }

  init(){
    if (this.out || !A.ctx) return;
    const c = A.ctx;
    this.out = c.createGain(); this.out.gain.value = S.synthLevel;
    const comp = c.createDynamicsCompressor();          // full chords must not clip
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
    this.out.connect(comp); comp.connect(c.destination);  // beside the song, so muting the song leaves the synth
    /* the harmonics of a string plucked about a fifth of the way along it */
    const N = 28, re = new Float32Array(N), im = new Float32Array(N);
    for (let h = 1; h < N; h++) im[h] = Math.sin(h*Math.PI*0.19)/Math.pow(h, 1.25);
    this.wave = c.createPeriodicWave(re, im);
    const nb = c.createBuffer(1, Math.floor(c.sampleRate*0.2), c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
    this.noise = nb;
  }

  voice(e, when){
    const c = A.ctx, n = e.n;
    const t0 = when + e.o*0.007;                        // a chord is strummed, low string first
    const soft = n.ho || n.po || n.tp || n.linked;
    const level = 0.30/Math.sqrt(e.k) * (n.ac ? 1.3 : 1) * (soft ? 0.72 : 1);
    const g = c.createGain();
    g.connect(this.out);

    if (n.mt){                                          // muted string: a short thud, no pitch
      const src = c.createBufferSource(); src.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
      bp.frequency.value = clamp(440*Math.pow(2, (e.m - 69)/12)*2, 160, 900);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(level*1.1, t0 + 0.002);
      g.gain.setTargetAtTime(0, t0 + 0.004, 0.022);
      src.connect(bp); bp.connect(g); src.start(t0); src.stop(t0 + 0.16);
      this.voices.push({ g, osc:src, end:t0 + 0.2 });
      return;
    }

    const midi = eventMidi(e), pure = !!((n.hm && n.f > 0) || n.hp);
    const f0 = 440*Math.pow(2, (midi - 69)/12);
    const dur = Math.max(0.08, n.ring || 0.3)/S.rate, tEnd = t0 + dur;   // longer when the song is slowed

    const osc = c.createOscillator();
    if (pure) osc.type = "triangle"; else osc.setPeriodicWave(this.wave);
    osc.frequency.value = f0;

    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(f0*(n.pm ? 2.2 : 9) + 400, 9000), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f0*(n.pm ? 1.2 : 2.2) + 200, 4000), t0 + (n.pm ? 0.05 : 0.35));

    /* low strings ring longer; a held note is not allowed to die before its end */
    let tau = n.pm ? 0.045 : clamp(1.6 - (midi - 40)*0.022, 0.45, 1.6);
    if (sustained(n)) tau = Math.max(tau, dur*0.9);
    const att = soft ? 0.010 : 0.003;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + att);
    g.gain.setTargetAtTime(0, t0 + att, tau);
    if (n.tr)                                           // tremolo picking: struck again and again
      for (let tt = t0 + 0.075; tt < tEnd - 0.02; tt += 0.075){
        g.gain.setValueAtTime(level*0.9, tt);
        g.gain.setTargetAtTime(0, tt + 0.002, 0.07);
      }
    g.gain.setTargetAtTime(0, tEnd, 0.03);

    const tgt = n.sl > 0 ? n.sl : n.slu > 0 ? n.slu : 0;
    if (n.bn > 0){                                      // the same shape the highway draws
      osc.detune.setValueAtTime(0, t0);
      osc.detune.linearRampToValueAtTime(n.bn*100, t0 + Math.max(0.08, dur*0.45));
    } else if (tgt && n.f > 0){
      osc.detune.setValueAtTime(0, t0 + dur*0.3);
      osc.detune.linearRampToValueAtTime((tgt - n.f)*100, tEnd);
    }
    let lfo = null;
    if (n.vb){
      lfo = c.createOscillator(); lfo.frequency.value = 5.5;
      const depth = c.createGain();
      depth.gain.setValueAtTime(0, t0 + 0.10); depth.gain.linearRampToValueAtTime(30, t0 + 0.28);   // cents
      lfo.connect(depth); depth.connect(osc.detune);
      lfo.start(t0); lfo.stop(tEnd + 0.25);
    }
    osc.connect(lp); lp.connect(g);
    osc.start(t0); osc.stop(tEnd + 0.25);
    this.voices.push({ g, osc, lfo, end:tEnd + 0.3 });
  }

  /* schedule what is about to be played - called every frame, like the metronome */
  pump(){
    if (!S.synthOn || !A.playing || !A.ctx || A.ctx.state !== "running" || !S.syn.length) return;
    this.init();
    const now = songTime() - S.offMs/1000, E = S.syn, ct = A.ctx.currentTime;
    while (this.idx < E.length){
      const e = E[this.idx], dt = e.t - now;
      if (dt > 0.25*S.rate) break;
      this.idx++;
      if (dt < -0.06) continue;                         // already past
      this.voice(e, ct + Math.max(0, dt)/S.rate);
    }
    if (this.voices.length > 48) this.voices = this.voices.filter(v => v.end > ct);
  }
  /* after a jump: carry on from the first note at the new position */
  sync(){
    this.idx = lowerBound(S.syn, "t", songTime() - S.offMs/1000 - 0.03);
  }
  /* silence what is ringing and cancel what was scheduled */
  kill(){
    if (!A.ctx || !this.voices.length) return;
    const ct = A.ctx.currentTime;
    for (const v of this.voices){
      try {
        v.g.gain.cancelScheduledValues(ct); v.g.gain.setTargetAtTime(0, ct, 0.012);
        v.osc.stop(ct + 0.08); if (v.lfo) v.lfo.stop(ct + 0.08);
      } catch (err) {}
    }
    this.voices = [];
  }

  setLevel(v){ if (this.out) this.out.gain.value = v; }
}
const synth = new NoteSynth();
