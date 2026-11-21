"use strict";
/* ── amp: the guitar through the song's tone ─────────────────────────────────
   web/amp.js (window.AmpKit) is a pedalboard: gate, the pedals before the amp,
   the amp (preamp, tone stack, cabinet) and its effects loop, with Tuna.js's
   effects. Each tone has a board, made by the converter from the tone's gear
   in the manifest; the pedalboard panel (P) shows the board of the tone in
   force and the player can change it - kept per song and tone in this browser.
   One chain per tone; the song's tone switches crossfade between them. Loaded
   the first time it is needed. Best heard on headphones: through speakers the
   guitar and the song can feed back into a microphone. */
const ampKey = (key) => key || "(default)";

/* a tone of the song, from any of its arrangements */
function toneDef(key){
  if (S.tones.names[key]) return S.tones.names[key];
  for (const a of S.arrs || []){ const nm = a.tones && a.tones.names && a.tones.names[key]; if (nm) return nm; }
  return null;
}
/* a tone is named by its key or its name: always the key */
const toneCanon = (key) => { const nm = toneDef(key || ""); return (nm && nm.raw) || key || ""; };
/* a tone's name without the song's title in front ("Song - Clean" -> "Clean") */
function toneShort(name){
  const title = (S.meta && S.meta.title) || "";
  const m = title && name.startsWith(title) ? name.slice(title.length).replace(/^\s*[-:–—]\s*/, "") : "";
  return m || name;
}
/* every tone of the song, all arrangements together, each once */
function songTones(){
  const out = new Map();
  for (const a of S.arrs || []){
    for (const nm of Object.values((a.tones && a.tones.names) || {})){
      const key = nm.raw;
      if (!key) continue;
      const t = out.get(key) || { key, raw: key, label: toneShort(nm.real || nm.raw), kind: nm.kind || "", arrs: [] };
      if (a.name && !t.arrs.includes(a.name)) t.arrs.push(a.name);
      out.set(key, t);
    }
  }
  return [...out.values()];
}

/* The player's boards, kept in this browser per song ("artist - title") and
   tone. Writes are gathered for a moment, so turning a knob does not write
   localStorage on every step. */
class RigStore {
  static KEY = "playsong.rigs";
  static songId(){ return ((S.meta && S.meta.artist) || "") + " - " + ((S.meta && S.meta.title) || ""); }

  constructor(){
    this.pending = new Map();       // tone key -> board (or null: forget it), written a moment later
    this.timer = 0;
  }
  read(){
    try { return JSON.parse(localStorage.getItem(RigStore.KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  /* the player's board for a tone of this song, or null */
  saved(key){
    if (this.pending.has(ampKey(key))) return this.pending.get(ampKey(key));
    const song = this.read()[RigStore.songId()];
    return (song && song[ampKey(key)]) || null;
  }
  store(key, board){
    this.pending.set(ampKey(key), board ? JSON.parse(JSON.stringify(board)) : null);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const all = this.read(), id = RigStore.songId(), song = all[id] || {};
      for (const [k, b] of this.pending){ if (b) song[k] = b; else delete song[k]; }
      this.pending.clear();
      if (Object.keys(song).length) all[id] = song; else delete all[id];
      try { localStorage.setItem(RigStore.KEY, JSON.stringify(all)); } catch (e) {}
    }, 300);
  }
}
const rigs = new RigStore();

/* the amp simulator the guitar input is played through, and its panel (P) */
class Pedalboard {
  constructor(){
    this.kit = null;                // window.AmpKit, once loaded
    this.amp = null;                // the running chain
    this.busy = false;
    this.key = null;                // the tone the amp plays
    this.boards = new Map();        // tone key -> its board (amp, cabinet, pedals), as played this session
    this.edited = new Set();        // tone keys the player changed on the pedalboard
    this.ui = null; this.uiKey = "";// the pedalboard panel (P) and the tone it shows
    this.uiFollow = true;           // ...the tone in force, or one the player picked
    this.seen = { live: undefined, amp: undefined, song: undefined };   // what the open panel was last drawn for
    inEl("bRig").onclick = () => this.toggle();
  }

  async loadKit(){
    if (!window.AmpKit) await loadScript("web/amp.js");
    this.kit = window.AmpKit;
  }

  /* the board of a tone: the player's, else the song's (its gear through the gear
     library, or what the converter made of it), else a plain amp */
  board(key){
    key = toneCanon(key);
    if (this.boards.has(key)) return this.boards.get(key);
    const kit = this.kit, nm = toneDef(key);
    const bass = nm && nm.rig ? !!nm.rig.bass || (!!S.tones.names[key] && S.nStr === 4) : S.nStr === 4;
    const saved = rigs.saved(key);
    let b;
    if (saved) b = kit.asBoard(saved, { bass });
    else if (nm && nm.rig && nm.rig.gear) b = kit.boardFromGear(nm.rig.gear, { bass, kind: nm.kind || "" });
    else if (nm && nm.rig) b = nm.rig.board ? kit.asBoard(JSON.parse(JSON.stringify(nm.rig.board))) : kit.boardFromRig({ ...nm.rig, bass: nm.rig.bass || bass });
    else b = kit.emptyBoard(bass);
    if (bass && !saved && !b.amp.bassAmp){ b.amp.bassAmp = true; b.cab = "bass"; }
    this.boards.set(key, b);
    if (saved) this.edited.add(key); else this.edited.delete(key);
    return b;
  }
  /* the amp on or off, as the option and the guitar input say */
  async sync(){
    if (!S.ampOn || !guitarInput.link){ this.close(); this.paint(); return; }
    if (this.amp || this.busy) return;
    this.busy = true;
    try {
      await this.loadKit();
      if (!S.ampOn || !guitarInput.link || !guitarInput.link.source) return;
      this.amp = await this.kit.create(A.ctx, guitarInput.link.source);
      this.amp.setLevel(S.ampLevel);
      this.key = null;
      this.tone(hudToneKey || S.tones.base || "");
    } catch (e) {
      guitarInput.msg("Could not start the amp: " + ((e && e.message) || e));
      S.ampOn = false; savePrefs(); inEl("fAmpOn").checked = false;
    } finally { this.busy = false; this.paint(); }
  }
  close(){
    if (this.amp) this.amp.close();
    this.amp = null; this.key = null;
  }
  /* a new song or arrangement: its tones are other rigs */
  reset(){
    if (this.amp) this.amp.reset();
    this.key = null;
    this.boards.clear(); this.edited.clear();
    this.seen.song = null;                        // the open pedalboard shows the new tones
  }
  /* the song switched tone */
  tone(key){
    key = key || "";
    if (!this.amp){ this.paint(); return; }
    if (key === this.key) return;
    this.key = key;
    this.amp.use(ampKey(toneCanon(key)), this.board(key));
    this.paint();
  }
  setLevel(v){ if (this.amp) this.amp.setLevel(v); }

  /* ── the pedalboard panel (P) ── */
  liveKey(){
    return toneCanon((hudToneKey !== undefined ? hudToneKey : S.tones.base) || "");
  }
  info(key){
    const nm = toneDef(key), live = this.liveKey();
    const kindOf = (k) => (k ? " (" + KIND_LABEL[k] + ")" : "");
    return { title: nm ? (nm.real || nm.raw) + kindOf(nm.kind) : "plain amp (the song has no tone)",
             edited: this.edited.has(key), key, follow: this.uiFollow,
             tones: songTones().map((t) => ({ ...t, inForce: t.key === live, edited: this.edited.has(t.key) || !!rigs.saved(t.key) })),
             note: !this.amp ? (S.ampOn ? "waiting for the guitar input" : "amp off: A to hear it")
                 : key !== live ? "not the tone in force: heard when the song gets to it" : "" };
  }
  markEdited(){
    const key = this.uiKey;
    rigs.store(key, this.board(key));
    if (!this.edited.has(key)){ this.edited.add(key); if (this.ui) this.ui.setEdited(true); }
  }
  get open(){ return !!(this.ui && this.ui.open); }
  toggle(){ return this.show(!this.open); }
  async show(on){
    if (!on){ if (this.ui) this.ui.hide(); return; }
    try { await this.loadKit(); }
    catch (e) { guitarInput.msg("Could not load the pedalboard: " + ((e && e.message) || e)); return; }
    if (!this.ui) this.ui = this.kit.mountBoard({
      getMaster: () => S.ampLevel,
      onMaster: (v) => {
        S.ampLevel = v; savePrefs();
        inEl("vAmp").value = Math.round(v * 100); inEl("rvAmp").textContent = Math.round(v * 100) + "%";
        this.setLevel(v);
      },
      onKnob: (id, k, v) => { if (this.amp) this.amp.set(ampKey(this.uiKey), id, k, v); this.markEdited(); },
      onToggle: (id, on) => { if (this.amp) this.amp.toggle(ampKey(this.uiKey), id, on); this.markEdited(); },
      onChange: (board) => { if (this.amp) this.amp.rebuild(ampKey(this.uiKey), board); this.markEdited(); },
      onReset: () => {
        const key = this.uiKey;
        rigs.store(key, null);
        this.boards.delete(key);
        const fresh = this.board(key);
        this.edited.delete(key);
        if (this.amp) this.amp.rebuild(ampKey(key), fresh);
        this.ui.update(fresh, this.info(key));
      },
      /* a tone of the tone bar, or "" to follow the song again */
      onPick: (key) => {
        this.uiFollow = !key;
        this.uiKey = key ? toneCanon(key) : this.liveKey();
        this.seen.live = this.liveKey();
        this.ui.update(this.board(this.uiKey), this.info(this.uiKey));
      },
      onClose: () => { inEl("bRig").textContent = "Open"; },
    });
    if (this.uiFollow || !toneDef(this.uiKey)){ this.uiFollow = true; this.uiKey = this.liveKey(); }
    this.seen.live = this.liveKey(); this.seen.amp = !!this.amp; this.seen.song = RigStore.songId();
    this.ui.show(this.board(this.uiKey), this.info(this.uiKey));
    inEl("bRig").textContent = "Close";
  }
  /* the open panel follows the tone in force, and the amp coming and going */
  follow(){
    if (!this.ui || !this.ui.open || !this.kit) return;
    const live = this.liveKey(), song = RigStore.songId(), seen = this.seen;
    if (live === seen.live && seen.amp === !!this.amp && seen.song === song) return;
    if (seen.song !== song || !toneDef(this.uiKey)) this.uiFollow = true;   // another song: back to following
    seen.live = live; seen.amp = !!this.amp; seen.song = song;
    if (this.uiFollow) this.uiKey = live;
    this.ui.update(this.board(this.uiKey), this.info(this.uiKey));
  }

  /* the amp's line in the options */
  paint(){
    this.follow();
    const el = inEl("ampNow");
    if (!this.amp){ el.textContent = S.ampOn && !guitarInput.link ? "waiting for the guitar input" : "—"; return; }
    const nm = S.tones.names[this.key || ""];
    el.textContent = nm ? toneLabel(this.key) : "plain amp (the song has no tone)";
  }
}
const pedalboard = new Pedalboard();

/* the guitar input's controls, after it was switched on or off */
function inputSync(){
  inEl("fInOn").checked = !!guitarInput.link || guitarInput.busy;
  inEl("fInDev").disabled = guitarInput.busy;
  if (!guitarInput.link){ inEl("inLevel").style.width = "0"; inEl("inNote").textContent = "—"; guitarInput.note = ""; }
  guitarInput.hudPaint();
  cable.icon();
  pedalboard.paint();
}
