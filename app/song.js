"use strict";
/* ── data ────────────────────────────────────────────────────────────────── */
function currentArr(){ return S.arrs[S.arrIdx] || null; }

/* Does this note have a length worth drawing (a tail, a held frame)?
   Normally only past 0.06 s - shorter "sustains" are just how a plain note is
   written. But a quick slide, or one link of a chain of joined notes, can be
   shorter than that (a fast slide down and back is two notes of 0.059 s) and
   is all tail: leaving those out breaks the line in two. */
const SUS_MIN = 0.06, SUS_MIN_MOVING = 0.012;
function sustained(n){
  return n.sus > SUS_MIN || (n.sus > SUS_MIN_MOVING && (n.sl > 0 || n.slu > 0 || n.ln || n.linked));
}
function mkNote(n, t, ci){
  return { t:+t, t0:+t, ch:ci, s:n.s|0, f:n.f|0, sus:Math.max(0, +(n.sus||0)),
           ho:!!n.ho, po:!!n.po, sl:(n.sl|0) > 0 ? n.sl|0 : -1, slu:(n.slu|0) > 0 ? n.slu|0 : -1,
           bn:+(n.bn||0), hm:!!n.hm, hp:!!n.hp, pm:!!n.pm, mt:!!(n.mt || n.fhm),
           vb:!!n.vb, tr:!!n.tr, ac:!!n.ac, tp:!!n.tp, ln:!!n.ln,
           rep:false, linked:false, hide:false, lab:true };
}

/* the anchor in force at time t */
function anchorIdx(t){
  const A = S.anchors;
  let lo = 0, hi = A.length - 1, r = 0;
  while (lo <= hi){ const m = (lo + hi) >> 1; if (A[m].t <= t){ r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function handAt(t){                               // index of the hand shape holding at t, or -1
  const Hs = S.hands;
  let lo = 0, hi = Hs.length - 1, r = -1;
  while (lo <= hi){ const m = (lo + hi) >> 1; if (Hs[m].t <= t + 0.004){ r = m; lo = m + 1; } else hi = m - 1; }
  return (r >= 0 && t <= Hs[r].t1 + 0.004) ? r : -1;
}

function selectArrangement(i){
  S.arrIdx = clamp(i, 0, Math.max(0, S.arrs.length - 1));
  const a = currentArr();
  if (!a) return;
  const name = (a.name || "").toLowerCase();
  S.nStr = name.includes("bass") ? 4 : 6;
  S.capo = a.capo | 0;
  const tpl = a.templates || [];

  S.hands = (a.handshapes || []).map(h => ({ t:+h.start_time, t0:+h.start_time, t1:+h.end_time,
                                             e0:+h.end_time, arp:!!h.arp, id:h.chord_id|0 }))
            .filter(h => h.t1 > h.t).sort((p, q) => p.t - q.t);

  const all = [];
  for (const n of a.notes || []) all.push(mkNote(n, n.t, undefined));

  /* Chord events. The first chord of a hand shape is drawn in full; the same
     chord strummed again is the low "repeat the previous chord" frame, with
     no noteheads of its own. */
  S.chords = [];
  let prev = null;
  (a.chords || []).forEach((c, ci) => {
    const ns = (c.notes || []).map(cn => mkNote(cn, c.t, ci));
    const T = tpl[c.id];
    const ev = { t:+c.t, t0:+c.t, notes:ns, rep:false, sig:"", top:0,
                 name: T ? chordLabel(T.displayName || T.display_name || T.name) : "",
                 mute: ns.length > 0 && ns.every(n => n.mt),
                 pm: ns.length > 0 && ns.every(n => n.pm) };
    if (!ns.length){
      ev.rep = true;
      if (prev){ ev.mute = prev.mute; ev.pm = prev.pm; }
    } else {
      ev.sig = (c.id|0) + "|" + ns.map(n => n.s + ":" + n.f).sort().join(",");
      ev.top = Math.min.apply(null, ns.map(n => n.s));        // highest string on screen
      const plain = ns.every(n => n.sus < 0.25 && n.sl < 0 && n.slu < 0 && !n.bn);
      if (prev && prev.sig === ev.sig && plain){
        const h0 = handAt(prev.t), h1 = handAt(ev.t);
        ev.rep = (h1 >= 0) ? (h0 === h1 && ev.t - prev.t < 2.5) : (ev.t - prev.t < 0.6);
      }
      if (c.hd && prev) ev.rep = true;
      /* one fret number per distinct fret of the chord */
      const seen = new Set();
      for (const n of ns){
        n.hide = ev.rep;
        n.lab = n.f > 0 && !seen.has(n.f);
        seen.add(n.f);
        all.push(n);
      }
    }
    S.chords.push(ev);
    if (ns.length) prev = ev;
  });

  S.all = all.sort((p, q) => p.t - q.t || p.s - q.s);

  /* A note that continues the one before it on the same string (linkNext) has
     no head of its own - only its tail is drawn. */
  {
    const last = new Array(8).fill(null);
    for (const n of S.all){
      const p = last[n.s];
      if (p && p.ln && n.t <= p.t + p.sus + 0.06) n.linked = true;
      last[n.s] = n;
    }
  }

  /* A run of the same single note is one gesture: only its first event carries
     a fret number. */
  {
    let prevSig = null, prevT = -Infinity, start = 0;
    for (let i = 1; i <= S.all.length; i++){
      if (i < S.all.length && S.all[i].t === S.all[i-1].t) continue;   // same event
      const parts = [];
      let chord = false;
      for (let k = start; k < i; k++){
        const n = S.all[k];
        if (n.ch !== undefined) chord = true;
        parts.push(n.s + ":" + n.f);
      }
      const sig = parts.sort().join("|"), t0 = S.all[start].t;
      const isRep = !chord && prevSig !== null && sig === prevSig && (t0 - prevT) <= REPEAT_GAP;
      if (!chord) for (let k = start; k < i; k++){ S.all[k].rep = isRep; S.all[k].lab = !isRep && S.all[k].f > 0; }
      prevSig = chord ? null : sig; prevT = t0;
      start = i;
    }
  }

  S.maxSus = 0; S.fMin = 99; S.fMax = -1;
  for (const n of S.all){
    if (n.sus > S.maxSus) S.maxSus = n.sus;
    if (n.f > 0){ if (n.f < S.fMin) S.fMin = n.f; if (n.f > S.fMax) S.fMax = n.f; }
  }
  if (S.fMax < 0){ S.fMin = 1; S.fMax = 4; }

  /* anchors: where the fretting hand sits. Without them, park one 4-fret
     anchor on the lowest fret in use. */
  S.anchors = (a.anchors || []).map(x => ({ t:+x.time, t0:+x.time, fret: clamp(x.fret|0, 1, 24),
                                            width: clamp((x.width|0) || 4, 1, 24) }))
              .sort((p, q) => p.t - q.t);
  if (!S.anchors.length) S.anchors = [{ t:0, t0:0, fret: clamp(S.fMin, 1, 21), width:4 }];
  /* Which hand moves get a row of fret numbers on the floor. A busy passage
     would bury the lanes in numbers, so rows closer than 0.8 s to the one
     before are left out. This is decided here, once, for the whole chart: if
     it were decided per frame from "the next anchor onwards", the choice would
     flip every time an anchor passed the neck and the rows would flicker. */
  {
    let lastRow = -1e9;
    S.anchors.forEach((an, i) => {
      an.row = false;
      if (i === 0) return;
      const pv = S.anchors[i-1];
      if (an.fret === pv.fret && an.width === pv.width) return;
      if (an.t - lastRow < 0.8) return;
      lastRow = an.t; an.row = true;
    });
  }

  buildHolds(tpl);
  synth.build(a);
  guitarInput.configure();
  loopSel.clear();
  buildPhrases();
  if (!S.keepCam) S.camC = null;                  // a new chart cuts the camera, unless it should glide over
  S.tones = a.tones || { base:"", changes:[], names:{} };
  hudToneKey = undefined;
  ampReset();
  document.getElementById("hudArr").textContent = a.name || "—";
  showTuning(a);
  document.getElementById("bpm").textContent = S.bpm ? S.bpm.toFixed(1) : "—";
  applyOffset(S.offMs);
  tabView.invalidate();
}

/* The tuning of the arrangement on screen, for the song info: its usual name,
   the open strings from the lowest, and the capo if there is one. */
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const NAMED_TUNINGS = { "-2,0,0,0,-2,-2":"DADGAD", "-2,-2,0,0,0,-2":"Open G", "-2,0,0,-1,-2,-2":"Open D",
                        "0,2,2,1,0,0":"Open E", "0,0,2,2,2,0":"Open A" };
function tuningText(a){
  const open = S.nStr === 4 ? OPEN_BASS : OPEN_GTR;
  const t = open.map((_, i) => +((a.tuning || [])[i]) || 0);
  const nm = (i) => NOTE_NAMES[(((open[i] + t[i]) % 12) + 12) % 12];
  let name = NAMED_TUNINGS[t.join(",")] || "Custom tuning";
  if (t.every(v => v === t[0])) name = nm(0) + " Standard";
  else if (t[0] === t[1] - 2 && t.slice(1).every(v => v === t[1])) name = "Drop " + nm(0);
  return { name, notes: open.map((_, i) => nm(i)).join(" "), capo: S.capo > 0 ? "Capo " + S.capo : "" };
}
function showTuning(a){
  const el = document.getElementById("tuning"), T = tuningText(a);
  el.textContent = "";
  const b = document.createElement("b"); b.textContent = T.name; el.appendChild(b);
  el.appendChild(document.createTextNode("  ·  " + T.notes + (T.capo ? "  ·  " + T.capo : "")));
  el.title = "Tuning of the " + (a.name || "") + " arrangement, lowest string first";
}

/* chord names with proper accidentals: A♭ sus 4, F♯5 */
function chordLabel(s){
  return String(s || "").trim().replace(/(^|\/)([A-G])b/g, "$1$2♭").replace(/#/g, "♯");
}

/* What the fretting hand is holding, for the finger markers and the chord
   name at the neck. Every hand shape points at a chord template, and the
   template says which finger is on which string and fret (0 = thumb).
   The same shape coming straight back - nothing else played in between -
   is one hold: the markers and the name stay up instead of blinking.

   S.hits is every moment something is struck, for the note-hit light. */
const HOLD_GAP = 3.0;
const FING_IN = 0.30, FING_GAP = 0.60, FING_MOVE = 0.25, FING_Z = FW*1.1;
function buildHolds(tpl){
  const out = [];
  const played = (a, b) => {                        // is any note struck strictly between a and b?
    const i = lowerBound(S.all, "t", a + 0.03);
    return i < S.all.length && S.all[i].t < b - 0.03;
  };
  for (const h of S.hands){
    const T = tpl[h.id];
    if (!T) continue;
    const fr = T.frets || [], fg = T.fingers || [];
    const name = chordLabel(T.displayName || T.display_name || T.name);
    const by = new Map();                           // one marker per finger and fret; several strings = a barre
    for (let s = 0; s < fr.length && s < S.nStr; s++){
      if (!(fr[s] > 0) || !(fg[s] >= 0)) continue;
      const k = fg[s] + ":" + fr[s], m = by.get(k);
      if (m){ m.s0 = Math.min(m.s0, s); m.s1 = Math.max(m.s1, s); }
      else by.set(k, { g: fg[s] === 0 ? "T" : String(fg[s]), f: fr[s], s0:s, s1:s });
    }
    if (!by.size && !name) continue;
    const sig = name + "|" + fr.join(",") + "|" + fg.join(",");
    const p = out[out.length - 1];
    if (p && p.sig === sig && h.t - p.t1 <= HOLD_GAP && !played(p.t1, h.t)){ p.t1 = h.t1; continue; }
    let top = 0;
    while (top < fr.length - 1 && !(fr[top] >= 0)) top++;       // highest string of the shape on screen
    out.push({ t:h.t, t1:h.t1, sig, name, top, pills:[...by.values()], frets: fr.slice(0, S.nStr) });
  }
  /* How a hold's finger markers arrive. After a pause they fade in over
     FING_IN seconds. When the hold follows the previous one closely the
     markers already on the neck are reused: they slide to their new places
     (link), finishing as the new chord lands. */
  for (let i = 0; i < out.length; i++){
    const h = out[i], q = out[i-1];
    const gap = q ? h.t - q.t1 : 1e9;
    h.link = gap <= FING_GAP;
    h.in0 = h.link ? h.t - Math.min(FING_MOVE, Math.max(gap, 0.12)) : h.t - FING_IN;
    if (q && h.in0 <= q.in0) h.in0 = q.in0 + 0.001;
  }
  S.holds = out;

  /* a chord inside a hold of the same name: 1 = it starts the hold, 2 = the name is already up */
  for (const ev of S.chords){
    ev.hold = 0;
    if (!ev.name) continue;
    const h = out[lowerBound(out, "t", ev.t + 0.01) - 1];
    if (h && ev.t <= h.t1 + 0.01 && h.name === ev.name) ev.hold = ev.t > h.t + 0.02 ? 2 : 1;
  }

  const hs = new Set();
  for (const n of S.all) if (!n.linked) hs.add(n.t);
  for (const c of S.chords) hs.add(c.t);
  S.hits = [...hs].sort((p, q) => p - q);
}
/* 1 at the instant a note is struck, falling to 0 in an eighth of a second */
function hitFlash(t){
  const Hs = S.hits;
  let lo = 0, hi = Hs.length - 1, r = -1;
  while (lo <= hi){ const m = (lo + hi) >> 1; if (Hs[m] <= t){ r = m; lo = m + 1; } else hi = m - 1; }
  if (r < 0) return 0;
  const d = t - Hs[r];
  return d < 0.12 ? 1 - d/0.12 : 0;
}

/* The bars above the highway: one per phrase, as tall as the phrase is hard.
   A chart with dynamic difficulty carries its phrases; for the others the
   song is cut every four measures (and at every section), and how busy each
   slice is stands in for its difficulty. */
function buildPhrases(){
  const a = currentArr();
  S.phrases = []; S.phReal = false;
  if (!a) return;
  const src = (a.phrases || []).filter(p => +p.end_time > +p.start_time);
  if (src.length > 1){
    let mx = 1;
    for (const p of src) mx = Math.max(mx, p.max_difficulty|0);
    S.phrases = src.map(p => ({ t0:+p.start_time, t1:+p.end_time,
                                lv: (p.max_difficulty|0) > 0 ? 0.18 + 0.82*(p.max_difficulty|0)/mx : 0 }));
    S.phReal = true;
    return;
  }
  const D = S.duration || (S.all.length ? S.all[S.all.length-1].t + 4 : 0);
  if (D <= 0) return;
  const cuts = new Set([0]);
  const secT = S.sections.map(s => +s.time);
  let si = 0, cnt = 0;
  const downs = S.beats.filter(b => b.measure >= 0);
  if (downs.length > 4){
    for (const b of downs){
      let crossed = false;
      while (si < secT.length && secT[si] <= b.time + 0.02){ si++; crossed = true; }
      if (crossed){ cnt = 0; cuts.add(+b.time.toFixed(3)); }
      else if (++cnt % 4 === 0) cuts.add(+b.time.toFixed(3));
    }
  } else {
    for (let x = 8; x < D; x += 8) cuts.add(x);
    for (const x of secT) cuts.add(x);
  }
  const ts = [...cuts].filter(x => x >= 0 && x < D - 0.5).sort((p, q) => p - q);
  const ph = [];
  for (let i = 0; i < ts.length; i++){
    const t0 = ts[i], t1 = i + 1 < ts.length ? ts[i+1] : D;
    if (t1 - t0 < 0.4){ if (ph.length) ph[ph.length-1].t1 = t1; continue; }
    ph.push({ t0, t1, lv:0, w:0 });
  }
  /* weight of what is played in each slice: events per second, techniques extra */
  let pi = 0, lastT = -1;
  for (const n of S.all){
    while (pi < ph.length - 1 && n.t0 >= ph[pi].t1) pi++;
    if (n.t0 < ph[pi].t0) continue;
    ph[pi].w += (n.t0 === lastT ? 0.35 : 1)
              + ((n.ho || n.po || n.tp || n.bn || n.sl > 0 || n.hm || n.hp) ? 0.5 : 0);
    lastT = n.t0;
  }
  const dens = ph.map(p => p.w / (p.t1 - p.t0)).filter(x => x > 0).sort((p, q) => p - q);
  const ref = dens.length ? dens[Math.min(dens.length - 1, Math.floor(dens.length*0.92))] : 1;
  for (const p of ph){
    const d = p.w / (p.t1 - p.t0);
    p.lv = d > 0 ? 0.22 + 0.78*Math.min(1, d/ref) : 0;
  }
  S.phrases = ph;
}

/* The note offset moves the chart's whole clock against the audio: the highway
   is drawn at chart time = audio time - offset. Notes, anchors, hand shapes,
   beat lines, phrases, sections, tone switches and lyrics all read that one
   clock, so they stay locked to each other while the offset is dialled in. */
const chartTime = () => S.time - S.offMs/1000;
function applyOffset(ms){
  S.offMs = Math.round(ms);
  const badge = document.getElementById("syncoff");
  if (badge){
    badge.textContent = S.offMs ? (S.offMs > 0 ? "+" : "") + S.offMs + "ms" : "";
    badge.style.display = S.offMs ? "inline-block" : "none";
  }
  const inp = document.getElementById("fOffset");
  if (inp && +inp.value !== S.offMs) inp.value = S.offMs;
  renderTimeline();
  hudSecIdx = -2;
  if (S.clickOn) syncBeats();
  synth.kill(); synth.sync();
  loopSel.follow();
}

/* Lyric lines are shown two at a time: the pair stays up
   while both are sung, then the next pair replaces it. When nothing is sung
   for more than LYR_GAP seconds the lyrics go away as soon as the line is
   over, and the next pair comes up LYR_LEAD seconds before its first word. */
const LYR_GAP = 5.0, LYR_LEAD = 3.0;
function buildLyricPairs(){
  const L = S.lyrics, pairs = [];
  for (let i = 0; i < L.length; ){
    const p = { a: L[i], b: null, show: 0, end: 0, gone: Infinity };
    if (i + 1 < L.length && L[i+1].t - L[i].end <= LYR_GAP){ p.b = L[i+1]; i += 2; } else i += 1;
    p.end = (p.b || p.a).end;
    const q = pairs.length ? pairs[pairs.length-1] : null;
    if (!q || p.a.t - q.end > LYR_GAP){
      p.show = p.a.t - LYR_LEAD;
      if (q) q.gone = q.end + 1.0;                  // a silence follows: fade out right after the line
    } else p.show = Math.min(p.a.t - 0.05, q.end + 0.25);
    pairs.push(p);
  }
  if (pairs.length) pairs[pairs.length-1].gone = pairs[pairs.length-1].end + 1.0;
  S.lyrPairs = pairs;
}

function loadSongData(d){
  S.meta = d.meta || {};
  S.arrs = (d.arrangements || []).filter(a => (a.notes || []).length || (a.chords || []).length);
  S.beats = (d.beats || []).slice().sort((a,b) => a.time - b.time);
  S.sections = (d.sections || []).slice().sort((a,b) => a.time - b.time);
  S.stems = d.stems || [];
  S.lyrics = ((d.lyrics && d.lyrics.lines) || []).slice().sort((a, b) => a.t - b.t);
  /* Lyrics the server judged broken are not shown; the player is told once,
     where the lyrics would have been, and the notice then goes away. */
  const lerr = (d.lyrics && d.lyrics.error) || "";
  if (lerr && !loadSongData.told){
    loadSongData.told = true;
    S.lyrics = [];
    const el = document.getElementById("lyrErr");
    document.getElementById("lyrErrWhy").textContent =
      lerr.charAt(0).toUpperCase() + lerr.slice(1) + ". Lyrics are hidden - repair them with Sync lyrics.";
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 12000);
    console.warn("lyrics not shown:", lerr);
  } else if (lerr) S.lyrics = [];
  for (const ln of S.lyrics){
    if (!ln.syl || !ln.syl.length) ln.syl = [[ln.t, Math.max(0.2, (ln.end || ln.t + 2) - ln.t), ln.text]];
    if (!(ln.end > ln.t)) ln.end = ln.t + 2;
  }
  buildLyricPairs();
}

/* Start-up, in the order the user sees it:
     1. the server is already up, so the page and the saved settings load at once
     2. wait while the server opens the pack (a .psarc is converted first)
     3. read the chart and show the highway
     4. fetch and decode the audio - the slow part, done last
     5. play                                                              */
async function waitForPack(){
  for (;;){
    let st;
    try { st = await (await fetch("/api/status")).json(); }
    catch (e) { st = { stage:"starting", message:"Waiting for the Play Song server…" }; }
    if (st.stage === "ready" || st.stage === "empty") return st;
    if (st.stage === "error") throw new Error(st.error || "the pack could not be opened");
    busy(st.message || "Processing…");
    await new Promise(r => setTimeout(r, 400));
  }
}

let framesRunning = false, firstSong = true;

