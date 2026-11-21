"use strict";
/* ── audio ───────────────────────────────────────────────────────────────── */
const A = { ctx:null, buf:null, src:null, gain:null, gainClick:null, startAt:0, offset:0, playing:false };
/* the amp simulator the guitar input can be played through (see "amp" below) */
const AMP = { kit:null, amp:null, busy:false, key:null,
              boards:new Map(),     // tone key -> its board (amp, cabinet, pedals), as played this session
              edited:new Set(),     // tone keys the player changed on the pedalboard
              ui:null, uiKey:"",    // the pedalboard panel (P) and the tone it shows
              uiFollow:true };      // ...the tone in force, or one the player picked

function audioInit(){
  if (A.ctx) return;
  /* 48 kHz, the rate of the Rocksmith cable: the guitar input joins this same
     context (one clock for the song and the detected notes), and some browsers
     will not connect a microphone whose rate differs from the context's */
  A.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: "interactive" });
  A.gain = A.ctx.createGain();
  A.gainClick = A.ctx.createGain();
  A.gain.connect(A.ctx.destination);
  A.gainClick.connect(A.ctx.destination);
  A.gain.gain.value = S.muted ? 0 : S.master;
  A.gainClick.gain.value = S.clickLevel;
  A.ctx.onstatechange = () => { if (A.ctx.state === "running" && waitingForGesture){ waitingForGesture = false; idle(); } };
}
/* A browser will not let a page make sound before the first click or key
   press. Until then the song is "playing" on a stopped clock; any click or
   key lets it go. */
let waitingForGesture = false;
function unlockAudio(){
  if (A.ctx && A.ctx.state === "suspended" && S.playing){ A.ctx.resume(); return true; }
  return false;
}
window.addEventListener("pointerdown", unlockAudio, true);
function togglePlay(){
  if (unlockAudio()) return;
  S.playing ? pause() : play();
  setPlayIcon(S.playing);
}

/* A feedpak may carry several stems. One is played on its own; with none
   chosen they are summed here instead of by the server's ffmpeg mix. The mix is
   accumulated into two float arrays as each stem is decoded and then dropped,
   so a six-stem pack peaks at two decoded buffers rather than seven. */
async function loadStemAudio(stem){
  if (stem && LOCAL.stems.has(stem)){
    const raw = await LOCAL.stems.get(stem).arrayBuffer();
    return A.ctx.decodeAudioData(raw);
  }
  /* The full mix: every stem decoded in turn and added into one buffer. The
     adding is done a slice at a time with a pause between slices, so the page
     keeps drawing while six stems of a long song are summed. Only the mix and
     the stem being added are in memory at once. */
  const blobs = [...LOCAL.stems.values()];
  const SLICE = 1 << 20;                                       // samples per slice: a few ms of work
  const breathe = () => new Promise((r) => setTimeout(r, 0));
  let out = null;
  for (let i = 0; i < blobs.length; i++){
    busy(`Mixing the stems… ${i + 1}/${blobs.length}`);
    const buf = await A.ctx.decodeAudioData(await blobs[i].arrayBuffer());
    if (!out || buf.length > out.length){                      // first stem, or a longer one: (re)size the mix
      const bigger = A.ctx.createBuffer(2, buf.length, buf.sampleRate);
      if (out){
        for (let c = 0; c < 2; c++){ bigger.getChannelData(c).set(out.getChannelData(c)); await breathe(); }
      }
      out = bigger;
    }
    const L = out.getChannelData(0), R = out.getChannelData(1);
    const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
    const n = Math.min(out.length, buf.length);
    for (let k0 = 0; k0 < n; k0 += SLICE){
      const k1 = Math.min(n, k0 + SLICE);
      for (let k = k0; k < k1; k++){ L[k] += l[k]; R[k] += r[k]; }
      await breathe();
    }
  }
  return out;
}

async function loadAudio(stem){
  audioInit();
  const keep = A.offset;
  if (LOCAL.stems){
    A.buf = await loadStemAudio(stem);
  } else {
    let raw;
    A.silent = false;
    if (LOCAL.payload && !LOCAL.audio){
      /* a chart without audio (arrangement XML dropped on its own): a silent
         track as long as the chart, so the clock, the metronome and the synth run */
      const last = Math.max(S.duration || 0, ...S.arrs.map((a) => {
        const n = a.notes || [], c = a.chords || [];
        return Math.max(n.length ? n[n.length - 1].t || n[n.length - 1].time || 0 : 0, c.length ? c[c.length - 1].t || c[c.length - 1].time || 0 : 0);
      }));
      const sr = 8000;
      A.buf = A.ctx.createBuffer(1, Math.ceil((Math.max(10, last) + 3)*sr), sr);
      A.silent = true;
      slowForget();
      S.duration = Math.max(S.duration, A.buf.duration);
      A.offset = keep; A.playing = false;
      renderTimeline(); paintClock();
      return;
    }
    if (LOCAL.audio){
      raw = await LOCAL.audio.arrayBuffer();      // a fresh copy: decodeAudioData detaches its input
    } else {
      const url = "/audio" + (stem ? "?stem=" + encodeURIComponent(stem) : "");
      const res = await fetch(url);
      if (!res.ok) throw new Error("audio: " + res.status);
      raw = await res.arrayBuffer();
    }
    A.buf = await A.ctx.decodeAudioData(raw);
  }
  slowForget();
  S.duration = Math.max(S.duration, A.buf.duration);
  A.offset = keep;
  A.playing = false;
  renderTimeline(); paintClock();
}

/* ── song speed ──────────────────────────────────────────────────────────────
   At full speed the song is an AudioBuffer started on the audio clock, which
   is as exact as playback gets. Slowed down that way it would also drop in
   pitch, so below 100 % the same audio is played through an <audio> element,
   which the browser can slow down while keeping the pitch. The element gets a
   WAV made from the decoded buffer: in a WAV a time is an exact byte position,
   so a seek lands where it should whatever format the pack's audio was in.
   The highway then follows the element's clock. That clock is a little less
   precise than the audio clock, which matters less at practice speed.       */
const slow = () => S.rate < 0.999;
function wavBlob(buf){
  const ch = Math.min(2, buf.numberOfChannels), n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n*ch*2));
  const str = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); out.setUint32(4, 36 + n*ch*2, true); str(8, "WAVEfmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr*ch*2, true); out.setUint16(32, ch*2, true);
  out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n*ch*2, true);
  const d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
  const pcm = new Int16Array(out.buffer, 44);
  for (let i = 0, k = 0; i < n; i++)
    for (let c = 0; c < ch; c++){ const v = d[c][i]; pcm[k++] = v < -1 ? -32768 : v > 1 ? 32767 : Math.round(v*32767); }
  return new Blob([out.buffer], { type: "audio/wav" });
}
async function slowReady(){
  if (A.elUrl || !A.buf) return;
  busy("Preparing slowed playback…");
  await new Promise(r => setTimeout(r, 30));          // let the message show before the heavy part
  A.elUrl = URL.createObjectURL(wavBlob(A.buf));
  if (!A.el){
    A.el = new Audio();
    A.el.preservesPitch = true;
    A.ctx.createMediaElementSource(A.el).connect(A.gain);   // through the same volume and mute
    A.el.onended = () => { if (A.playing && A.mode === "el") songEnded(); };
  }
  A.el.src = A.elUrl;
  await new Promise(res => { A.el.onloadedmetadata = res; A.el.onerror = res; });
  idle();
}
function slowForget(){                                // new audio: the WAV made from the old one is stale
  if (A.el){ A.el.pause(); A.el.removeAttribute("src"); }
  if (A.elUrl){ URL.revokeObjectURL(A.elUrl); A.elUrl = null; }
}
async function setSongSpeed(r){
  r = clamp(r, 0.2, 1);
  if (Math.abs(r - S.rate) < 0.001) return;
  const was = A.playing, t = songTime();
  if (was) stopSources();
  S.rate = r; A.offset = t;
  if (slow()) await slowReady();
  if (was) startAt(t);
}

function songTime(){
  if (!A.playing || !A.ctx) return A.offset;
  if (A.mode === "el") return clamp(A.el.currentTime, 0, S.duration || 1e9);
  return clamp(A.ctx.currentTime - A.startAt + A.offset, 0, S.duration || 1e9);
}
function stopSources(){
  if (A.src){ A.src.onended = null; try { A.src.stop(); } catch(e){} A.src = null; }
  if (A.el) A.el.pause();
}
function songEnded(){
  if (S.loop) { startAt(Math.max(0, S.loopA - LOOP_LEAD)); }
  else { A.playing = false; S.playing = false; pump(); inputSummary(); }
}

function startAt(t){
  audioInit();
  if (!A.buf) return;
  stopSources();
  A.offset = clamp(t, 0, Math.max(0, S.duration - 0.02));
  if (slow() && A.elUrl){
    A.mode = "el";
    A.el.playbackRate = S.rate;
    A.el.currentTime = A.offset;
    A.el.play().catch(() => {});
  } else {
    A.mode = "buf";
    A.src = A.ctx.createBufferSource();
    A.src.buffer = A.buf;
    A.src.connect(A.gain);
    A.startAt = A.ctx.currentTime;
    A.src.start(0, A.offset);
    A.src.onended = () => { if (A.playing && A.mode === "buf") songEnded(); };
  }
  A.playing = true; S.playing = true;
  beatIdx = 0; syncBeats();
  synth.kill(); synth.sync();
}

function play(){
  audioInit();
  if (A.ctx.state === "suspended") A.ctx.resume();
  if (A.playing) return;
  const from = A.offset >= (S.duration - 0.05) ? 0 : A.offset;
  if (slow() && !A.elUrl){                            // slowed playback not prepared for this audio yet
    slowReady().then(() => { if (!A.playing){ startAt(from); pump(); setPlayIcon(true); } });
    return;
  }
  startAt(from);
  pump();
}
function pause(){
  if (!A.playing) return;
  A.offset = songTime(); A.playing = false; S.playing = false;
  stopSources();
  synth.kill();
  pump();
}
function seek(t){
  const was = A.playing;
  if (Math.abs(t - S.time) > 1.5) S.camC = null;      // a jump cuts the camera instead of gliding
  A.offset = clamp(t, 0, S.duration || 0);
  S.time = A.offset;
  if (was) startAt(A.offset); else { beatIdx = 0; syncBeats(); }
  inputSeek();
  paintClock();
}

/* ── metronome (scheduled ahead on the audio clock) ──────────────────────── */
let beatIdx = 0;
function syncBeats(){
  const off = S.offMs/1000;                       // the beat grid rides the chart clock
  beatIdx = 0; while (beatIdx < S.beats.length && S.beats[beatIdx].time + off < S.time - 0.05) beatIdx++;
}
function pump(){
  if (!S.clickOn || !A.ctx || A.playing === false) return;
  const now = songTime() - S.offMs/1000;
  for (let i = beatIdx; i < S.beats.length; i++){
    const b = S.beats[i];
    const dt = b.time - now;
    if (dt > 0.25*S.rate) break;
    if (dt < -0.06) continue;
    const when = A.ctx.currentTime + Math.max(0, dt)/S.rate;   // a chart second lasts 1/rate real seconds
    click(when, b.measure >= 0);
    beatIdx = i + 1;
  }
}
function click(when, down){
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = "square"; o.frequency.value = down ? 1568 : 1046;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(down ? 0.5 : 0.32, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
  o.connect(g); g.connect(A.gainClick);
  o.start(when); o.stop(when + 0.07);
}

