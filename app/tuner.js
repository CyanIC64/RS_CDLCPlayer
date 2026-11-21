"use strict";
/* ── tuner ─────────────────────────────────────────────────────────────────
   U opens it. The targets are the open strings of the arrangement on screen -
   its tuning and its cent offset; a capo stays where it is - or standard
   tuning when no song is open. The string closest to what is heard is the one
   being tuned, and a string held in tune for half a second gets a tick. */
class Tuner {
  static OK = 5;            // cents: in tune
  static HOLD = 0.5;        // seconds in tune before a string gets its tick
  static STICK = 150;       // cents: another string must be this much closer to take over

  constructor(){
    this.open = false;
    this.hist = [];         // the last five pitch readings (0: no pitch)
    this.needle = 0;
    this.cur = -1;          // the string being tuned
    this.okSince = 0;
    this.done = new Set();  // strings tuned
    this.key = "";          // the targets the string buttons were built for
    this.quiet = 0;         // seconds without a pitch
    this.lock = -1;         // a string clicked: tune only that one
    $("tuRec").onclick = () => this.record();
    $("bTuner").onclick = () => this.toggle();
    $("tuClose").onclick = () => this.show(false);
  }

  /* the open strings of the arrangement on screen */
  targets(){
    const a = currentArr(), open = S.nStr === 4 ? OPEN_BASS : OPEN_GTR;
    const tun = (a && a.tuning) || [], cent = (a && +a.centOffset) || 0;
    return open.map((m, i) => {
      const midi = m + (+tun[i] || 0);
      return { midi, hz: 440*Math.pow(2, (midi - 69)/12 + cent/1200),
               name: NOTE_NAMES[((midi % 12) + 12) % 12], oct: Math.floor(midi/12) - 1 };
    });
  }

  show(on){
    this.open = on;
    $("tuner").classList.toggle("show", on);
    if (!on) return;
    this.hist.length = 0; this.key = ""; this.cur = -1; this.okSince = 0; this.quiet = 0;
    if (!guitarInput.link && !guitarInput.busy) guitarInput.start();                  // a tuner needs the guitar
  }
  toggle(){ this.show(!this.open); }

  /* a pitch reading from the guitar input (Hz, 0 when none) */
  feed(freq){
    if (!this.open) return;
    this.hist.push(freq);
    if (this.hist.length > 5) this.hist.shift();
  }

  buildStrings(T){
    const box = $("tuStrings");
    box.textContent = "";
    T.forEach((t, i) => {
      const s = document.createElement("span");
      s.textContent = t.name + t.oct;
      s.title = "Tune this string only (click again for automatic)";
      s.onclick = () => { this.lock = this.lock === i ? -1 : i; this.okSince = 0; this.paintLock(); };
      box.appendChild(s);
    });
    this.paintLock();
    const a = currentArr(), tt = tuningText(a || {});
    const cent = (a && +a.centOffset) || 0;
    $("tuTun").textContent = tt.name + (cent ? "  ·  " + (cent > 0 ? "+" : "") + Math.round(cent) + "¢" : "");
  }

  paintLock(){
    [...$("tuStrings").children].forEach((s, i) => s.classList.toggle("lock", i === this.lock));
  }

  paint(dt){
    if (!this.open) return;
    const el = $("tuner"), T = this.targets();
    const key = T.map(t => t.hz.toFixed(3)).join(",");
    if (key !== this.key){ this.key = key; this.done.clear(); this.lock = -1; this.buildStrings(T); }

    /* the median of the last five frames, when at least three of them had a pitch */
    const v = this.hist.filter(f => f > 0).sort((p, q) => p - q);
    const hz = v.length >= 3 ? v[v.length >> 1] : 0;
    this.quiet = hz ? 0 : this.quiet + dt;

    const msg = !guitarInput.link ? (guitarInput.busy ? "Connecting…" : "Switch on the guitar input (G) to tune.")
              : hz || this.quiet < 0.6 ? "" : "Play an open string.";
    $("tuMsg").textContent = msg;
    if (!hz){
      if (this.quiet >= 0.6){                                // silent for a while: clear the display
        el.classList.remove("ok", "far");
        $("tuNote").textContent = "—"; $("tuCents").textContent = ""; $("tuHz").textContent = "";
        $("tuNeedle").style.opacity = "0";
        this.okSince = 0;
        if (this.quiet >= 3) this.cur = -1;                  // the same string struck again soon stays chosen
        [...$("tuStrings").children].forEach((s, i) => { s.classList.remove("cur"); s.classList.toggle("done", this.done.has(i)); });
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
    if (this.lock >= 0 && this.lock < T.length) cur = this.lock;
    else if (this.cur >= 0 && this.cur < T.length && cur !== this.cur && dist(this.cur) - best < Tuner.STICK) cur = this.cur;
    const tgt = T[cur], cents = 1200*Math.log2(hz/tgt.hz);
    if (cur !== this.cur){ this.cur = cur; this.okSince = 0; }

    const ok = Math.abs(cents) <= Tuner.OK, far = Math.abs(cents) > 50;
    this.okSince = ok ? this.okSince + dt : 0;
    if (this.okSince >= Tuner.HOLD) this.done.add(cur);
    el.classList.toggle("ok", ok);
    el.classList.toggle("far", far);

    const a = currentArr(), n = guitarInput.kit.freqToNote(hz, (a && +a.centOffset) || 0);
    $("tuNote").innerHTML = "";
    $("tuNote").append(n.name, Object.assign(document.createElement("sub"), { textContent: n.octave }));
    const c = Math.round(cents);
    $("tuCents").textContent = (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c) + "¢";
    $("tuHz").textContent = hz.toFixed(1) + " Hz  →  " + tgt.name + tgt.oct + " " + tgt.hz.toFixed(1) + " Hz"
      + (far ? (cents < 0 ? "   ▲ tune up" : "   ▼ tune down") : "");

    const goal = clamp(cents, -50, 50);
    this.needle += (goal - this.needle)*Math.min(1, dt*14);
    const nd = $("tuNeedle");
    nd.style.left = (50 + this.needle) + "%";
    nd.style.opacity = "1";
    [...$("tuStrings").children].forEach((s, i) => {
      s.classList.toggle("cur", i === cur);
      s.classList.toggle("done", this.done.has(i));
    });
  }

  /* diagnosis: ten seconds of the raw input, saved as a 16-bit WAV, with what
     the tuner read meanwhile in the file name. Nothing leaves the computer. */
  async record(){
    const b = $("tuRec");
    if (!guitarInput.link || b.classList.contains("on")) return;
    b.classList.add("on"); b.textContent = "Recording…";
    const seen = new Map();
    const tick = setInterval(() => {
      const f = guitarInput.last && guitarInput.last.freq;
      if (f > 0){ const n = guitarInput.kit.freqToNote(f, 0); const k = n.name.replace(/[♯#]/, "s").replace("♭", "b") + n.octave; seen.set(k, (seen.get(k) || 0) + 1); }
    }, 50);
    try {
      const { data, sampleRate } = await guitarInput.link.record(10);
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
}
const tuner = new Tuner();
