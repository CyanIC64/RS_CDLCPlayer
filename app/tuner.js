"use strict";
/* ── tuner ─────────────────────────────────────────────────────────────────
   U opens it. The targets are the open strings of the arrangement on screen -
   its tuning and its cent offset; a capo stays where it is - or standard
   tuning when no song is open. The string closest to what is heard is the one
   being tuned, and a string held in tune for half a second gets a tick. */
const TU = { open:false, hist:[], needle:0, cur:-1, okSince:0, done:new Set(), key:"", quiet:0, lock:-1 };
const TU_OK = 5, TU_HOLD = 0.5;                            // cents, seconds
const TU_STICK = 150;      // cents: another string must be this much closer to take over

function tunerTargets(){
  const a = currentArr(), open = S.nStr === 4 ? OPEN_BASS : OPEN_GTR;
  const tun = (a && a.tuning) || [], cent = (a && +a.centOffset) || 0;
  return open.map((m, i) => {
    const midi = m + (+tun[i] || 0);
    return { midi, hz: 440*Math.pow(2, (midi - 69)/12 + cent/1200),
             name: NOTE_NAMES[((midi % 12) + 12) % 12], oct: Math.floor(midi/12) - 1 };
  });
}

function tunerShow(on){
  TU.open = on;
  inEl("tuner").classList.toggle("show", on);
  if (!on) return;
  TU.hist.length = 0; TU.key = ""; TU.cur = -1; TU.okSince = 0; TU.quiet = 0;
  if (!IN.link && !IN.busy) inputStart();                  // a tuner needs the guitar
}

function tunerStrings(T){
  const box = inEl("tuStrings");
  box.textContent = "";
  T.forEach((t, i) => {
    const s = document.createElement("span");
    s.textContent = t.name + t.oct;
    s.title = "Tune this string only (click again for automatic)";
    s.onclick = () => { TU.lock = TU.lock === i ? -1 : i; TU.okSince = 0; tunerLockPaint(); };
    box.appendChild(s);
  });
  tunerLockPaint();
  const a = currentArr(), tt = tuningText(a || {});
  const cent = (a && +a.centOffset) || 0;
  inEl("tuTun").textContent = tt.name + (cent ? "  ·  " + (cent > 0 ? "+" : "") + Math.round(cent) + "¢" : "");
}

function tunerLockPaint(){
  [...inEl("tuStrings").children].forEach((s, i) => s.classList.toggle("lock", i === TU.lock));
}

function tunerPaint(dt){
  if (!TU.open) return;
  const el = inEl("tuner"), T = tunerTargets();
  const key = T.map(t => t.hz.toFixed(3)).join(",");
  if (key !== TU.key){ TU.key = key; TU.done.clear(); TU.lock = -1; tunerStrings(T); }

  /* the median of the last five frames, when at least three of them had a pitch */
  const v = TU.hist.filter(f => f > 0).sort((p, q) => p - q);
  const hz = v.length >= 3 ? v[v.length >> 1] : 0;
  TU.quiet = hz ? 0 : TU.quiet + dt;

  const msg = !IN.link ? (IN.busy ? "Connecting…" : "Switch on the guitar input (G) to tune.")
            : hz || TU.quiet < 0.6 ? "" : "Play an open string.";
  inEl("tuMsg").textContent = msg;
  if (!hz){
    if (TU.quiet >= 0.6){                                  // silent for a while: clear the display
      el.classList.remove("ok", "far");
      inEl("tuNote").textContent = "—"; inEl("tuCents").textContent = ""; inEl("tuHz").textContent = "";
      inEl("tuNeedle").style.opacity = "0";
      TU.okSince = 0;
      if (TU.quiet >= 3) TU.cur = -1;                      // the same string struck again soon stays chosen
      [...inEl("tuStrings").children].forEach((s, i) => { s.classList.remove("cur"); s.classList.toggle("done", TU.done.has(i)); });
    }
    return;
  }

  /* the string being tuned: the one clicked, or else the one whose open note
     is closest. The string already shown stays until another is clearly
     closer, so a string tuned far down does not jump to its neighbour as soon
     as it passes the half-way point. */
  const dist = (i) => Math.abs(1200*Math.log2(hz/T[i].hz));
  let cur = 0, best = Infinity;
  T.forEach((t, i) => { const d = dist(i); if (d < best){ best = d; cur = i; } });
  if (TU.lock >= 0 && TU.lock < T.length) cur = TU.lock;
  else if (TU.cur >= 0 && TU.cur < T.length && cur !== TU.cur && dist(TU.cur) - best < TU_STICK) cur = TU.cur;
  const tgt = T[cur], cents = 1200*Math.log2(hz/tgt.hz);
  if (cur !== TU.cur){ TU.cur = cur; TU.okSince = 0; }

  const ok = Math.abs(cents) <= TU_OK, far = Math.abs(cents) > 50;
  TU.okSince = ok ? TU.okSince + dt : 0;
  if (TU.okSince >= TU_HOLD) TU.done.add(cur);
  el.classList.toggle("ok", ok);
  el.classList.toggle("far", far);

  const a = currentArr(), n = IN.kit.freqToNote(hz, (a && +a.centOffset) || 0);
  inEl("tuNote").innerHTML = "";
  inEl("tuNote").append(n.name, Object.assign(document.createElement("sub"), { textContent: n.octave }));
  const c = Math.round(cents);
  inEl("tuCents").textContent = (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c) + "¢";
  inEl("tuHz").textContent = hz.toFixed(1) + " Hz  →  " + tgt.name + tgt.oct + " " + tgt.hz.toFixed(1) + " Hz"
    + (far ? (cents < 0 ? "   ▲ tune up" : "   ▼ tune down") : "");

  const goal = clamp(cents, -50, 50);
  TU.needle += (goal - TU.needle)*Math.min(1, dt*14);
  const nd = inEl("tuNeedle");
  nd.style.left = (50 + TU.needle) + "%";
  nd.style.opacity = "1";
  [...inEl("tuStrings").children].forEach((s, i) => {
    s.classList.toggle("cur", i === cur);
    s.classList.toggle("done", TU.done.has(i));
  });
}

/* diagnosis: ten seconds of the raw input, saved as a 16-bit WAV, with what
   the tuner read meanwhile in the file name. Nothing leaves the computer. */
async function tunerRecord(){
  const b = inEl("tuRec");
  if (!IN.link || b.classList.contains("on")) return;
  b.classList.add("on"); b.textContent = "Recording…";
  const seen = new Map();
  const tick = setInterval(() => {
    const f = IN.last && IN.last.freq;
    if (f > 0){ const n = IN.kit.freqToNote(f, 0); const k = n.name.replace(/[♯#]/, "s").replace("♭", "b") + n.octave; seen.set(k, (seen.get(k) || 0) + 1); }
  }, 50);
  try {
    const { data, sampleRate } = await IN.link.record(10);
    const heard = [...seen].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k]) => k).join("-") || "silence";
    const wav = new ArrayBuffer(44 + data.length*2), v = new DataView(wav);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + data.length*2, true); str(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate*2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, data.length*2, true);
    for (let i = 0; i < data.length; i++) v.setInt16(44 + i*2, clamp(data[i], -1, 1)*32767, true);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    a.download = "playsong-input-" + heard + "-" + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "") + ".wav";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } finally {
    clearInterval(tick);
    b.classList.remove("on"); b.textContent = "Record 10 s";
  }
}
inEl("tuRec").onclick = () => tunerRecord();
inEl("bTuner").onclick = () => tunerShow(!TU.open);
inEl("bRig").onclick = () => rigShow(!(AMP.ui && AMP.ui.open));
inEl("tuClose").onclick = () => tunerShow(false);

