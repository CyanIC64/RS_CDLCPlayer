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
const RIGS_KEY = "playsong.rigs";
const ampKey = (key) => key || "(default)";
const rigSong = () => ((S.meta && S.meta.artist) || "") + " - " + ((S.meta && S.meta.title) || "");
function rigsRead(){
  try { return JSON.parse(localStorage.getItem(RIGS_KEY) || "{}") || {}; } catch (e) { return {}; }
}
/* the player's board for a tone of this song, or null */
let rigSaveTimer = 0;
const rigPending = new Map();         // tone key -> board (or null: forget it), written a moment later
function rigSaved(key){
  if (rigPending.has(ampKey(key))) return rigPending.get(ampKey(key));
  const song = rigsRead()[rigSong()];
  return (song && song[ampKey(key)]) || null;
}
function rigStore(key, board){
  rigPending.set(ampKey(key), board ? JSON.parse(JSON.stringify(board)) : null);
  clearTimeout(rigSaveTimer);
  rigSaveTimer = setTimeout(() => {
    const all = rigsRead(), id = rigSong(), song = all[id] || {};
    for (const [k, b] of rigPending){ if (b) song[k] = b; else delete song[k]; }
    rigPending.clear();
    if (Object.keys(song).length) all[id] = song; else delete all[id];
    try { localStorage.setItem(RIGS_KEY, JSON.stringify(all)); } catch (e) {}
  }, 300);
}
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
/* the board of a tone: the player's, else the song's (its gear through the gear
   library, or what the converter made of it), else a plain amp */
function ampBoard(key){
  key = toneCanon(key);
  if (AMP.boards.has(key)) return AMP.boards.get(key);
  const kit = AMP.kit, nm = toneDef(key);
  const bass = nm && nm.rig ? !!nm.rig.bass || (!!S.tones.names[key] && S.nStr === 4) : S.nStr === 4;
  const saved = rigSaved(key);
  let b;
  if (saved) b = kit.asBoard(saved, { bass });
  else if (nm && nm.rig && nm.rig.gear) b = kit.boardFromGear(nm.rig.gear, { bass, kind: nm.kind || "" });
  else if (nm && nm.rig) b = nm.rig.board ? kit.asBoard(JSON.parse(JSON.stringify(nm.rig.board))) : kit.boardFromRig({ ...nm.rig, bass: nm.rig.bass || bass });
  else b = kit.emptyBoard(bass);
  if (bass && !saved && !b.amp.bassAmp){ b.amp.bassAmp = true; b.cab = "bass"; }
  AMP.boards.set(key, b);
  if (saved) AMP.edited.add(key); else AMP.edited.delete(key);
  return b;
}
async function ampSync(){
  if (!S.ampOn || !guitarInput.link){ ampClose(); ampPaint(); return; }
  if (AMP.amp || AMP.busy) return;
  AMP.busy = true;
  try {
    if (!window.AmpKit) await loadScript("web/amp.js");
    AMP.kit = window.AmpKit;
    if (!S.ampOn || !guitarInput.link || !guitarInput.link.source) return;
    AMP.amp = await AMP.kit.create(A.ctx, guitarInput.link.source);
    AMP.amp.setLevel(S.ampLevel);
    AMP.key = null;
    ampTone(hudToneKey || S.tones.base || "");
  } catch (e) {
    guitarInput.msg("Could not start the amp: " + ((e && e.message) || e));
    S.ampOn = false; savePrefs(); inEl("fAmpOn").checked = false;
  } finally { AMP.busy = false; ampPaint(); }
}
function ampClose(){
  if (AMP.amp) AMP.amp.close();
  AMP.amp = null; AMP.key = null;
}
/* a new song or arrangement: its tones are other rigs */
function ampReset(){
  if (AMP.amp) AMP.amp.reset();
  AMP.key = null;
  AMP.boards.clear(); AMP.edited.clear();
  rigFollow.song = null;                          // the open pedalboard shows the new tones
}
function ampTone(key){
  key = key || "";
  if (!AMP.amp){ ampPaint(); return; }
  if (key === AMP.key) return;
  AMP.key = key;
  AMP.amp.use(ampKey(toneCanon(key)), ampBoard(key));
  ampPaint();
}
/* ── the pedalboard panel (P) ── */
function rigToneKey(){
  return toneCanon((hudToneKey !== undefined ? hudToneKey : S.tones.base) || "");
}
function rigInfo(key){
  const nm = toneDef(key), live = rigToneKey();
  const kindOf = (k) => (k ? " (" + KIND_LABEL[k] + ")" : "");
  return { title: nm ? (nm.real || nm.raw) + kindOf(nm.kind) : "plain amp (the song has no tone)",
           edited: AMP.edited.has(key), key, follow: AMP.uiFollow,
           tones: songTones().map((t) => ({ ...t, inForce: t.key === live, edited: AMP.edited.has(t.key) || !!rigSaved(t.key) })),
           note: !AMP.amp ? (S.ampOn ? "waiting for the guitar input" : "amp off: A to hear it")
               : key !== live ? "not the tone in force: heard when the song gets to it" : "" };
}
function rigEdited(){
  const key = AMP.uiKey;
  rigStore(key, ampBoard(key));
  if (!AMP.edited.has(key)){ AMP.edited.add(key); if (AMP.ui) AMP.ui.setEdited(true); }
}
async function rigShow(on){
  if (!on){ if (AMP.ui) AMP.ui.hide(); return; }
  try {
    if (!window.AmpKit) await loadScript("web/amp.js");
    AMP.kit = window.AmpKit;
  } catch (e) { guitarInput.msg("Could not load the pedalboard: " + ((e && e.message) || e)); return; }
  if (!AMP.ui) AMP.ui = AMP.kit.mountBoard({
    getMaster: () => S.ampLevel,
    onMaster(v){
      S.ampLevel = v; savePrefs();
      inEl("vAmp").value = Math.round(v * 100); inEl("rvAmp").textContent = Math.round(v * 100) + "%";
      if (AMP.amp) AMP.amp.setLevel(v);
    },
    onKnob(id, k, v){ if (AMP.amp) AMP.amp.set(ampKey(AMP.uiKey), id, k, v); rigEdited(); },
    onToggle(id, on){ if (AMP.amp) AMP.amp.toggle(ampKey(AMP.uiKey), id, on); rigEdited(); },
    onChange(board){ if (AMP.amp) AMP.amp.rebuild(ampKey(AMP.uiKey), board); rigEdited(); },
    onReset(){
      const key = AMP.uiKey;
      rigStore(key, null);
      AMP.boards.delete(key);
      const fresh = ampBoard(key);
      AMP.edited.delete(key);
      if (AMP.amp) AMP.amp.rebuild(ampKey(key), fresh);
      AMP.ui.update(fresh, rigInfo(key));
    },
    /* a tone of the tone bar, or "" to follow the song again */
    onPick(key){
      AMP.uiFollow = !key;
      AMP.uiKey = key ? toneCanon(key) : rigToneKey();
      rigFollow.live = rigToneKey();
      AMP.ui.update(ampBoard(AMP.uiKey), rigInfo(AMP.uiKey));
    },
    onClose(){ inEl("bRig").textContent = "Open"; },
  });
  if (AMP.uiFollow || !toneDef(AMP.uiKey)){ AMP.uiFollow = true; AMP.uiKey = rigToneKey(); }
  rigFollow.live = rigToneKey(); rigFollow.amp = !!AMP.amp; rigFollow.song = rigSong();
  AMP.ui.show(ampBoard(AMP.uiKey), rigInfo(AMP.uiKey));
  inEl("bRig").textContent = "Close";
}
/* the open panel follows the tone in force, and the amp coming and going */
function rigFollow(){
  if (!AMP.ui || !AMP.ui.open || !AMP.kit) return;
  const live = rigToneKey();
  if (live === rigFollow.live && rigFollow.amp === !!AMP.amp && rigFollow.song === rigSong()) return;
  if (rigFollow.song !== rigSong() || !toneDef(AMP.uiKey)) AMP.uiFollow = true;   // another song: back to following
  rigFollow.live = live; rigFollow.amp = !!AMP.amp; rigFollow.song = rigSong();
  if (AMP.uiFollow) AMP.uiKey = live;
  AMP.ui.update(ampBoard(AMP.uiKey), rigInfo(AMP.uiKey));
}

function ampPaint(){
  rigFollow();
  const el = inEl("ampNow");
  if (!AMP.amp){ el.textContent = S.ampOn && !guitarInput.link ? "waiting for the guitar input" : "—"; return; }
  const nm = S.tones.names[AMP.key || ""];
  el.textContent = nm ? toneLabel(AMP.key) : "plain amp (the song has no tone)";
}

function inputSync(){
  inEl("fInOn").checked = !!guitarInput.link || guitarInput.busy;
  inEl("fInDev").disabled = guitarInput.busy;
  if (!guitarInput.link){ inEl("inLevel").style.width = "0"; inEl("inNote").textContent = "—"; guitarInput.note = ""; }
  guitarInput.hudPaint();
  cable.icon();
  ampPaint();
}

inEl("bRig").onclick = () => rigShow(!(AMP.ui && AMP.ui.open));
