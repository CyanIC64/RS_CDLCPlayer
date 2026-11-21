"use strict";
/* ── the resting highway ─────────────────────────────────────────────────────
   While a song is being opened or converted there is nothing to play, so the
   highway is shown at rest: no notes, no lyrics, no finger markers or chord
   names, and the camera at its normal four-fret zoom around the 7th fret.
   What was on screen fades out first; the camera then glides to the rest
   position, and from there to the new song's first position when it arrives. */
function fadeTo(v){
  S.visTo = v;
  return new Promise(res => {
    const t0 = performance.now();
    const chk = () => {
      if (Math.abs(S.vis - v) < 0.01 || performance.now() - t0 > 900){ S.vis = v; res(); }
      else setTimeout(chk, 40);
    };
    chk();
  });
}
function restChart(){
  S.all = []; S.chords = []; S.hands = []; S.holds = []; S.hits = []; S.syn = []; S.phrases = [];
  S.lyrics = []; S.lyrPairs = []; S.beats = []; S.sections = [];
  S.tones = { base:"", changes:[], names:{} };
  S.anchors = [{ t:0, t0:0, fret:6, width:4, row:false }];      // frets 6-9: centred on the 7th fret line
  S.maxSus = 0; S.capo = 0; S.resting = true;
  S.time = 0; A.offset = 0;
  loopSel.reset();
  lyrPair = null; $("lyr").style.display = "none";
  hudSecIdx = -2; hudToneKey = undefined;
  $("hudArr").textContent = "—";
  $("tuning").textContent = "";
  $("stem").style.display = "none";          // no song, no stems to pick
  renderTimeline(); paintClock();
  tabView.invalidate();
}
function startFrames(){
  if (!framesRunning){ framesRunning = true; requestAnimationFrame(frame); }
}

function showHint(on){
  $("hint").classList.toggle("hide", !on);
}
async function boot(){
  busy("Starting…");
  await loadPrefs();
  guitarInput.restore();
  cable.scan();
  restChart(); resize(); startFrames();           // the empty highway is up straight away

  /* Is a Play Song server behind this page? If not, the page is on its own:
     load the in-page converter and wait for a dropped file. */
  SERVER = await serverAvailable();
  if (!SERVER){
    /* get the converter ready while the visitor looks for a song; if no Worker
       can run here, the in-page converter is loaded when a song is dropped */
    startWorker().then((w) => { if (!w) return loadStatics(); }).catch(() => {});
    idle();
    $("title").textContent = "Play Song";
    $("artist").textContent = "no song open";
    $("hintNote").textContent =
      "The file is opened on this page - it is never uploaded, and nothing is changed in your file.";
    showHint(true);
    return;
  }

  fetch("/api/limits").then(r => r.json()).then(L => {
    $("hintNote").textContent =
      "The file is sent to this server to be converted (up to " + L.max_upload_mb + " MB), and deleted after "
      + L.idle_minutes + " minutes without use. Nothing is changed in your file.";
  }).catch(() => {});
  const st = await waitForPack();
  if (st.stage === "empty"){                      // the usual start: nothing open yet
    idle();
    $("title").textContent = "Play Song";
    $("artist").textContent = "no song open";
    showHint(true);
    return;
  }
  await showSong();                               // the visitor came back to a session that still has a song
}

/* Read the song the page has - fetched from the server, or converted locally -
   and play it. Runs at start-up, and again whenever another song is dropped. */
async function showSong(noPlay){
  showHint(false);
  busy("Reading the chart…");
  const d = LOCAL.payload || await (async () => {
    const res = await fetch("/api/song");
    return res.json();
  })();
  if (d.error) throw new Error(d.error);

  /* forget the previous song */
  if (A.playing) pause();
  A.buf = null; A.offset = 0; A.playing = false;
  S.time = 0; S.playing = false; S.offMs = 0; S.bpm = 0; S.loopB = 0;
  if (S.loop){ S.loop = false; $("bLoop").classList.remove("on"); }
  setPlayIcon(false);
  lyrPair = null; $("lyr").style.display = "none";
  loadSongData.told = false; $("lyrErr").classList.remove("show");
  hudSecIdx = -2; hudToneKey = undefined;

  loadSongData(d);
  S.duration = +(d.meta && d.meta.duration) || 0;

  // BPM from the beat grid (median gap, so a stray beat cannot skew it)
  if (S.beats.length > 3){
    const gaps = [];
    for (let i = 1; i < S.beats.length; i++){
      const g = S.beats[i].time - S.beats[i-1].time;
      if (g > 0.08 && g < 2) gaps.push(g);
    }
    gaps.sort((a,b) => a-b);
    if (gaps.length) S.bpm = 60 / gaps[gaps.length >> 1];
  }

  // header
  const T = (s) => (s || "—");
  $("title").textContent = T(S.meta.title);
  $("artist").textContent = T(S.meta.artist);
  $("album").textContent = [S.meta.album, S.meta.year].filter(Boolean).join(" · ") || "";
  document.title = (S.meta.title ? S.meta.title + " - " : "") + "Play Song";

  {
    const c = $("cover");
    c.innerHTML = '<div class="ph">NO ART</div>';
    const src = LOCAL.payload ? LOCAL.cover : ("/api/art?" + Date.now());
    if (S.meta.cover && src){
      const img = new Image();
      img.onload = () => { c.innerHTML = ""; c.appendChild(img); };
      img.src = src;                                // not the previous song's picture
    }
  }

  // arrangements
  const fArr = $("fArr");
  fArr.innerHTML = "";
  S.arrs.forEach((a, i) => {
    const o = document.createElement("option"); o.value = i; o.textContent = a.name || ("arr " + i);
    fArr.appendChild(o);
  });
  fArr.onchange = () => { selectArrangement(+fArr.value); fArr.blur(); };
  $("path").classList.toggle("one", S.arrs.length < 2);

  // stems: only worth a picker when the pack really was separated
  const stemSel = $("stemSel");
  stemSel.length = 1; stemSel.value = "";
  $("stem").style.display = S.stems.length > 1 ? "flex" : "none";
  if (S.stems.length > 1){
    for (const s of S.stems){
      const o = document.createElement("option");
      o.value = s.id; o.textContent = s.id.charAt(0).toUpperCase() + s.id.slice(1);
      stemSel.appendChild(o);
    }
    stemSel.onchange = async () => {
      const keep = songTime(), was = S.playing;
      pause(); setPlayIcon(false);
      busy("Decoding the audio…");
      try { await loadAudio(stemSel.value); } finally { idle(); }
      seek(Math.min(keep, S.duration - 0.05));
      if (was){ play(); setPlayIcon(true); }
    };
  }

  /* When another song replaces the one on screen, the camera is not cut: it
     keeps where it was and eases to the new song's first position while the
     audio is being decoded. */
  S.keepCam = S.camC !== null;                    // glide over from wherever the camera is (the rest position)
  S.resting = false;
  S.vis = 0; S.visTo = 1;                         // the new chart fades in
  selectArrangement(0);
  S.keepCam = false;
  updGeom();
  $("tdur").textContent = fmt(S.duration);
  renderTimeline();
  paintClock();
  {
    const cum = +(S.meta.note_offset_ms || 0);
    const om = $("offMsg");
    if (om) om.textContent = cum
      ? "this pack has already been shifted " + (cum > 0 ? "+" : "") + cum + " ms in total"
      : "positive offset = chart later than the audio";
  }

  // deep link: ?t=SECONDS&arr=N  (handy when linking a section from the GUI); ?paused = do not auto-play.
  // Only for the song the page was opened with.
  const q = new URLSearchParams(firstSong ? location.search : "");
  firstSong = false;
  if (q.has("arr")){
    const i = clamp(parseInt(q.get("arr"), 10) || 0, 0, Math.max(0, S.arrs.length - 1));
    selectArrangement(i); fArr.value = i;
  }
  if (q.has("t")) seek(clamp(parseFloat(q.get("t")) || 0, 0, Math.max(0, S.duration - 0.1)));
  if (q.has("cfg")) $("cfg").classList.add("show");
  if (q.has("off")) applyOffset(clamp(Math.round(parseFloat(q.get("off")) || 0), -60000, 60000));

  resize();
  startFrames();                      // the highway is on screen while the audio is still coming

  busy("Decoding the audio…");
  try {
    await loadAudio("");
    buildPhrases();                   // the decoded audio may be longer than the manifest said
  } catch (err) {
    console.warn("audio unavailable:", err);
    notice("The audio could not be decoded - the highway still plays, silently.");
    setTimeout(idle, 6000);
    return;
  }
  idle();
  if (A.silent){
    notice("No audio came with this chart - it plays silently. Drop the XML together with the song's audio to hear it.");
    setTimeout(idle, 7000);
  }
  if (noPlay || q.has("paused")) return;
  play(); setPlayIcon(true);
  if (A.ctx.state === "suspended"){   // the browser wants a click before it lets the page make sound
    waitingForGesture = true;
    notice("Ready - click anywhere or press Space to start" + (A.silent ? " (no audio came with this chart: it plays silently)" : ""));
  }
}

/* ── drop a song on the window to play it ────────────────────────────────────
   The file itself is sent to the server (a page is not told where a dropped
   file lives), which opens it like the one it was started with. The song that
   is playing stays if the new one cannot be opened. */
let opening = false;
/* send the file, reporting how far it has got (it may be a slow line) */
function upload(file, onProgress){
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", "/api/open");
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded/e.total); };
    x.onerror = () => reject(new Error("the upload failed - is the server still there?"));
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch (e) {}
      if (x.status >= 200 && x.status < 300 && !d.error) resolve(d);
      else reject(new Error(d.error || ("HTTP " + x.status)));
    };
    x.send(file);
  });
}
async function openDropped(input){
  if (opening) return;
  const list = Array.isArray(input) ? input : [input];
  /* arrangement XML among the files: a chart still in its project folder (a
     .psarc next to it is that chart packed - the XML is what is being worked on) */
  const xmlSet = list.some((f) => /\.xml$/i.test(f.name));
  const file = xmlSet ? null : list.find((f) => /\.(psarc|feedpak)$/i.test(f.name));
  if (!xmlSet && !file){
    notice("Only .psarc, .feedpak and arrangement .xml files can be played - not " + (list.length ? list[0].name : "that"));
    setTimeout(idle, 5000);
    return;
  }
  const label = xmlSet ? xmlSetName(list) : file.name;
  opening = true;
  let cleared = Promise.resolve();
  try {
    if (S.playing){ pause(); setPlayIcon(false); }
    showHint(false);
    try { audioInit(); A.ctx.resume(); } catch (e) {}     // while the click or drop still counts as the user's
    SERVER = await serverAvailable();                     // a drop can beat boot()'s probe

    if (!SERVER || xmlSet){
      /* no server: convert here, in a worker beside the page (or in the page itself) */
      cleared = fadeTo(0).then(() => {
        restChart(); S.visTo = 1;
        $("title").textContent = label;
        $("artist").textContent = "opening…";
        $("album").textContent = "";
      });
      busy("Reading " + label + "…");
      const song = xmlSet ? await openLocalXml(list, (m) => busy(m)) : await openLocal(file, (m) => busy(m));
      await cleared;
      const oldCover = LOCAL.cover;
      LOCAL.payload = song.payload;
      LOCAL.cover = song.cover;
      LOCAL.audio = song.audio;
      LOCAL.stems = song.stems;
      if (oldCover && oldCover.startsWith("blob:") && oldCover !== LOCAL.cover)
        setTimeout(() => URL.revokeObjectURL(oldCover), 2000);   // the new picture has replaced it
      await showSong();
      return;
    }

    LOCAL.payload = null; LOCAL.audio = null; LOCAL.stems = null;   // the server's song from now on, not one opened here
    busy("Uploading " + file.name + "…");
    /* what is on screen fades away and the highway goes to rest while the new song is opened */
    cleared = fadeTo(0).then(() => {
      restChart(); S.visTo = 1;
      $("title").textContent = file.name;       // what is being opened, not the song that left
      $("artist").textContent = "opening…";
      $("album").textContent = "";
    });
    await upload(file, (f) => busy("Uploading " + file.name + "… " + Math.round(f*100) + "%"));
    const st = await waitForPack();
    if (st.open_error) throw new Error(st.open_error);
    await cleared;
    await showSong();
  } catch (err) {
    let back = false;
    try { await cleared; await showSong(true); back = true; } catch (e2) {}   // bring back the song that was on, paused
    notice("Could not open that song: " + err.message);
    setTimeout(idle, 8000);
    if (!back){                                    // there was none: back to the welcome card
      $("title").textContent = "Play Song";
      $("artist").textContent = "no song open";
      showHint(true);
    }
  } finally {
    opening = false;
  }
}
{
  const veil = $("drop");
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; veil.classList.add("show"); });
  window.addEventListener("dragover",  (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; if (--depth <= 0){ depth = 0; veil.classList.remove("show"); } });
  /* a dropped folder is read through (a project folder: XML, audio, art) */
  const KEEP = /\.(psarc|feedpak|xml|ogg|mp3|wav|flac|m4a|aac|opus|webm|wem|jpe?g|png|webp|gif|bmp|dds)$/i;
  async function readTree(entries){
    const out = [];
    const walk = async (en, depth) => {
      if (out.length >= 400) return;
      if (en.isFile){
        if (!KEEP.test(en.name)) return;
        const f = await new Promise((res) => en.file(res, () => res(null)));
        if (f){ f.relPath = en.fullPath.replace(/^\//, ""); out.push(f); }
      } else if (en.isDirectory && depth < 4){
        const rd = en.createReader();
        for (;;){
          const batch = await new Promise((res) => rd.readEntries(res, () => res([])));
          if (!batch.length) break;
          for (const c of batch) await walk(c, depth + 1);
        }
      }
    };
    for (const en of entries) await walk(en, 0);
    return out;
  }
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; veil.classList.remove("show");
    const ents = [...(e.dataTransfer.items || [])].map((it) => it.webkitGetAsEntry ? it.webkitGetAsEntry() : null).filter(Boolean);
    if (ents.some((en) => en.isDirectory)){ readTree(ents).then((l) => { if (l.length) openDropped(l); }); return; }
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) openDropped(files);
  });
}

{
  const pick = $("filePick");
  const choose = () => { pick.value = ""; pick.click(); };
  $("hintPick").onclick = choose;
  $("bOpen").onclick = choose;
  pick.onchange = () => { if (pick.files && pick.files.length) openDropped([...pick.files]); };
}

