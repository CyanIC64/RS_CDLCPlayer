"use strict";
/* ── the highway, pass by pass ───────────────────────────────────────────────
   draw() (draw.js) sets up the frame - the time, the camera, the projection -
   in a context F and runs these passes in order, back to front. Each pass
   takes what it needs from F; collectNotes() adds the notes in view. */
function drawFarGlow(F){
  const { P, zx0, zx1 } = F;
  /* glow behind the far end of the highway */
  {
    const v = P((zx0 + zx1)/2, 0, -ZFAR);
    if (v) glow("#0a3a6a", v.x, v.y + H*0.05, W*0.30, H*0.20, 0.55);
  }
}

/* every fret as a thin line to the horizon */
function drawFretLines(F){
  const { P } = F;
  /* ── 1. every fret as a thin teal line running to the horizon ────────── */
  ctx.lineWidth = 1;
  for (let f = 0; f <= 24; f++){
    const a = P(fretX(f), 0, 0), b = P(fretX(f), 0, -ZFAR);
    if (!a || !b) continue;
    if (Math.max(a.x, b.x) < -60 || Math.min(a.x, b.x) > W + 60) continue;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, "rgba(0,176,170,0.46)"); g.addColorStop(0.65, "rgba(0,150,160,0.20)");
    g.addColorStop(1, "rgba(0,150,160,0)");
    ctx.strokeStyle = g;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

/* the lit lanes of each anchor, cut at every beat */
function drawLanes(F){
  const { t, tEnd, zOf, fog, A, ai, P } = F;
  /* ── 2. the lit lanes of each anchor, cut at every beat ──────────────── */
  {
    const cuts = [{ t, k:0 }];
    for (let i = lowerBound(S.beats, "time", t + 0.0005); i < S.beats.length && S.beats[i].time < tEnd; i++)
      cuts.push({ t: S.beats[i].time, k: S.beats[i].measure >= 0 ? 2 : 1 });
    for (let i = ai + 1; i < A.length && A[i].t < tEnd; i++) cuts.push({ t: A[i].t, k:0 });
    cuts.sort((p, q) => p.t - q.t);
    let run = null;
    const fillRun = (r) => {
      const al = r.al === undefined ? 1 : r.al;
      const c1 = "rgba(7,30,60," + (0.92*al).toFixed(3) + ")", c2 = "rgba(26,92,168," + (0.30*al).toFixed(3) + ")";
      for (let f = r.f0; f <= r.f1; f++){
        const xa = fretX(f - 1), xb = fretX(f);
        quad(P(xa, 0, r.zNear), P(xb, 0, r.zNear), P(xb, 0, r.zFar), P(xa, 0, r.zFar), c1);
        if (S.fx) quad(P(xa + FW*0.20, 0, r.zNear), P(xb - FW*0.20, 0, r.zNear),
                       P(xb - FW*0.20, 0, r.zFar), P(xa + FW*0.20, 0, r.zFar), c2);
      }
    };
    const lines = [];                                          // drawn after the fills, so a fill never covers a line
    for (let i = cuts.length - 1; i >= 0; i--){               // far to near
      const ta = cuts[i].t, tb = i + 1 < cuts.length ? cuts[i+1].t : tEnd;
      if (tb - ta < 0.002) continue;
      const an = A[anchorIdx((ta + tb)/2)];
      const f0 = an.fret, f1 = Math.min(24, an.fret + an.width - 1);
      const z0 = zOf(ta), z1 = zOf(tb) - 0.004, al = fog((ta + tb)/2);
      if (al <= 0.01) continue;
      /* The floor of a lane is the same colour from cell to cell until the fog
         starts, so the fully lit cells of one anchor are filled as one long
         quad per fret (run), not one per beat cell. Lines stay per cell: their
         width follows the distance. */
      if (al < 0.999 || !run || run.an !== an){
        if (run) fillRun(run);
        run = al >= 0.999 ? { an, f0, f1, zNear:z0, zFar:z1 } : null;
        if (!run) fillRun({ an, f0, f1, zNear:z0, zFar:z1, al });
      } else run.zNear = z0;                                   // going far to near: extend toward the neck
      lines.push({ i, f0, f1, z0, z1, al });
    }
    if (run) fillRun(run);
    for (const L of lines){
      const { i, f0, f1, z0, z1, al } = L;
      const near = P(fretX(f0 - 1), 0, z0);
      const sc = near ? near.s*FW : 20;
      ctx.lineCap = "butt";
      ctx.strokeStyle = "rgba(0,196,232," + (0.85*al).toFixed(3) + ")";
      ctx.lineWidth = clamp(sc*0.022, 0.8, 2.2);
      ctx.beginPath();
      for (let f = f0; f < f1; f++) seg(P(fretX(f), 0, z0), P(fretX(f), 0, z1));
      ctx.stroke();
      ctx.strokeStyle = "rgba(70,236,255," + al.toFixed(3) + ")";
      ctx.lineWidth = clamp(sc*0.045, 1.1, 4.2);
      ctx.beginPath();
      seg(P(fretX(f0 - 1), 0, z0), P(fretX(f0 - 1), 0, z1)); seg(P(fretX(f1), 0, z0), P(fretX(f1), 0, z1));
      ctx.stroke();
      if (S.showCells && cuts[i].k){                           // beat line / measure line
        ctx.strokeStyle = cuts[i].k === 2 ? "rgba(150,214,244," + (0.62*al).toFixed(3) + ")"
                                          : "rgba(84,150,196," + (0.34*al).toFixed(3) + ")";
        ctx.lineWidth = cuts[i].k === 2 ? clamp(sc*0.03, 1, 3) : 1;
        ctx.beginPath(); seg(P(fretX(f0 - 1), 0, z0), P(fretX(f1), 0, z0)); ctx.stroke();
      }
    }
  }
}

/* hand shapes: the edges of the anchor glow while a chord is held */
function drawHandShapes(F){
  const { t, tEnd, zOf, fog, A, P } = F;
  /* ── 3. hand shapes: the edges of the anchor glow for as long as the
          chord is held (purple-white for an arpeggio) ─────────────────── */
  for (let i = Math.max(0, lowerBound(S.hands, "t", t - 30)); i < S.hands.length; i++){
    const h = S.hands[i];
    if (h.t > tEnd) break;
    if (h.t1 < t) continue;
    const ta = Math.max(h.t, t), tb = Math.min(h.t1, tEnd);
    if (tb - ta < 0.02) continue;
    const an = A[anchorIdx(h.t + 0.002)];
    const z0 = zOf(ta), z1 = zOf(tb), wd = FW*0.085;
    const al = (fog(ta) + fog(tb))/2;
    const colr = h.arp ? "rgba(190,170,255," : "rgba(70,240,255,";
    for (const x of [fretX(an.fret - 1), fretX(Math.min(24, an.fret + an.width - 1))])
      quad(P(x - wd, 0, z0), P(x + wd, 0, z0), P(x + wd, 0, z1), P(x - wd, 0, z1), colr + (0.92*al).toFixed(3) + ")");
  }
}

/* fret numbers on the floor where the hand moves to a new anchor */
function drawAnchorNumbers(F){
  const { t, tEnd, zOf, fog, A, ai, cam, P } = F;
  /* ── 4. fret numbers on the floor where the hand moves to a new anchor ── */
  if (S.showNums){
    for (let i = ai + 1; i < A.length && A[i].t < tEnd; i++){
      const an = A[i], pv = A[i-1];
      if (!an.row) continue;                                   // thinned out once, when the chart was loaded
      const z = zOf(an.t) + FW*0.30;
      const al = fog(an.t) * clamp((an.t - t - 0.25)/0.5, 0, 1);   // gone before it reaches the neck's own numbers
      if (al <= 0.02) continue;
      const lo2 = an.fret, hi2 = an.fret + an.width - 1;
      for (let f = Math.max(1, lo2 - 3); f <= Math.min(24, hi2 + 5); f++){
        const inZone = f >= lo2 && f <= hi2;
        if (!inZone && !INLAY.has(f)) continue;
        const p = P(fretMid(f), 0, z);
        if (!p) continue;
        const fs = p.s*FW*0.46;
        if (fs < 7) continue;
        label(String(f), p.x, p.y, Math.min(fs, 34), inZone ? "#a9dcec" : "#1f8f88", (inZone ? 0.85 : 0.75)*al, null,
              neckAxes(cam, fretMid(f), 0, z));                  // slanted with the neck, like the numbers under it
      }
    }
  }
}

/* the notes and chord frames in view, furthest first, and how lit each string is */
function collectNotes(F){
  const { t, nStr, tEnd } = F;
  /* ── notes in view ───────────────────────────────────────────────────── */
  /* While a stretch is being looped, the notes that lie outside it are still
     shown as they come down the highway, but without their colour - they are
     not part of what is being practised. */
  const off0 = S.offMs/1000;
  const lpA = S.loop && S.loopB ? S.loopA - off0 - 0.005 : -Infinity;
  const lpB = S.loop && S.loopB ? S.loopB - off0 - 0.005 : Infinity;
  const outside = (tt) => tt < lpA || tt >= lpB;
  const judging = !!(guitarInput.link && guitarInput.ver && S.inScore);           // the guitar input is checking the notes
  const items = [];
  const act = new Array(nStr).fill(0);
  for (let i = lowerBound(S.all, "t", t - S.maxSus - 0.3); i < S.all.length; i++){
    const n = S.all[i];
    if (n.t > tEnd) break;
    if (n.hide) continue;
    const d = n.t - t;
    if (d < -0.25 && n.t + n.sus < t) continue;
    items.push({ d, n, ev:null });
    const s = clamp(n.s, 0, nStr - 1);
    const lit = d >= 0 ? clamp(1 - d/1.6, 0, 1) : (n.t + n.sus > t ? 1 : clamp(1 + d/0.25, 0, 1));
    if (lit*S.vis > act[s]) act[s] = lit*S.vis;
  }
  for (let i = lowerBound(S.chords, "t", t - 0.16); i < S.chords.length; i++){
    const ev = S.chords[i];
    if (ev.t > tEnd) break;
    items.push({ d: ev.t - t + 1e-6, n:null, ev });            // the frame goes behind its own notes
  }
  items.sort((p, q) => q.d - p.d);                             // furthest first
  F.outside = outside; F.judging = judging; F.items = items; F.act = act;
}

/* the fretboard at the hit plane: inlays, frets, capo, strings */
function drawNeck(F){
  const { t, nStr, yOf, yTop, yBot, A, cam, P, zf0, zf1, act } = F;
  /* ── 5. the fretboard at the hit plane ───────────────────────────────── */
  const pNear = P(fretX(S.camC), yBot, 0);
  const ppf = pNear ? pNear.s*FW : cam.ppf;                    // pixels per fret at the neck

  /* inlay dots */
  for (let f = 1; f <= 24; f++){
    if (!INLAY.has(f)) continue;
    const inZone = f > zf0 && f <= zf1;
    const ys = (f % 12 === 0) ? [lerp(yBot, yTop, 0.25), lerp(yBot, yTop, 0.75)] : [(yBot + yTop)/2];
    for (const yy of ys){
      const p = P(fretMid(f), yy, 0);
      if (!p || p.x < -40 || p.x > W + 40) continue;
      const r = p.s*FW*0.105;
      ctx.globalAlpha = inZone ? 0.95 : 0.80;
      ctx.fillStyle = inZone ? "#b08a22" : "#0c5f58";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r*0.92, 0, 0, Math.PI*2); ctx.fill();
      ctx.lineWidth = Math.max(1, r*0.16); ctx.strokeStyle = inZone ? "#e2bd4a" : "#17877c";
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  /* frets: copper where the hand is, dark elsewhere */
  ctx.lineCap = "round";
  for (let f = 0; f <= 24; f++){
    const a = P(fretX(f), yBot - PITCH*0.55, 0), b = P(fretX(f), yTop + PITCH*0.55, 0);
    if (!a || !b || a.x < -30 || a.x > W + 30) continue;
    const inZone = f >= zf0 && f <= zf1;
    const lw = clamp(a.s*FW*(f === 0 ? 0.09 : 0.045), 1.2, f === 0 ? 12 : 6);
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = lw + 2;
    ctx.beginPath(); ctx.moveTo(a.x + 1.5, a.y); ctx.lineTo(b.x + 1.5, b.y); ctx.stroke();
    const g = ctx.createLinearGradient(a.x - lw, 0, a.x + lw, 0);
    if (f === 0){ g.addColorStop(0, "#8d8676"); g.addColorStop(0.5, "#e9e2cf"); g.addColorStop(1, "#7d7666"); }
    else if (inZone){ g.addColorStop(0, "#7a4a1c"); g.addColorStop(0.45, "#e6a35a"); g.addColorStop(1, "#6a3f18"); }
    else { g.addColorStop(0, "#241a12"); g.addColorStop(0.45, "#5b4530"); g.addColorStop(1, "#1e160f"); }
    ctx.strokeStyle = g; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.lineCap = "butt";

  /* capo */
  if (S.capo > 0 && S.capo <= 24){
    const a = P(fretMid(S.capo) + FW*0.2, yBot - PITCH*0.7, 0), b = P(fretMid(S.capo) + FW*0.2, yTop + PITCH*0.7, 0);
    if (a && b){
      ctx.lineCap = "round"; ctx.strokeStyle = "rgba(210,214,222,0.92)"; ctx.lineWidth = clamp(a.s*FW*0.16, 3, 16);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.lineCap = "butt";
      label("CAPO", b.x, b.y - ppf*0.22, clamp(ppf*0.16, 9, 16), "#d2d6de", 0.9, null);
    }
  }

  /* strings: dim until a note is on its way down that string.

     A string that has just been struck is drawn moving. From the spot the
     note is fretted at (the nut, for an open string) toward the bridge it
     swings up and down, widest away from the finger, and dies away - quickly
     for a plain or palm-muted note, slowly under a held one. Behind the
     finger, toward the nut, it stays still.

     A bend pushes the string out of line: it runs straight from the nut to
     the note's spot, where it is pushed furthest, and straight back from
     there toward the bridge. That spot is exactly where the held note's frame
     is drawn (same position, same bend and vibrato), so the corner of the
     string sits in the frame. */
  const sxR = Math.max(NECK_END + 3*FW, cam.px + 40*FW);
  const struck = new Array(nStr).fill(null);
  for (let i = lowerBound(S.all, "t", t + 1e-6) - 1; i >= 0; i--){
    const n = S.all[i], age = t - n.t;
    if (age > Math.max(1.0, S.maxSus + 0.1)) break;
    const si = clamp(n.s, 0, nStr - 1);
    if (struck[si]) continue;                                  // the latest strike on each string decides
    const held = sustained(n) && age < n.sus;
    struck[si] = (n.mt || (age > 1.0 && !held)) ? { still:true } : { n, age, held };
  }
  for (let s = 0; s < nStr; s++){
    const y = yOf(s), col = LANE[s] || "#9aa7b2";
    const k = act[s];
    const lw = clamp(ppf*(0.030 - s*0.0028), 1, 5.5);
    const hit = struck[s] && !struck[s].still ? struck[s] : null;

    /* where the string is, as a list of points: rest line, bend corner, swing */
    let pts, ghost = null;
    const swing = (() => {
      if (!hit || S.vis < 0.05) return 0;
      const n = hit.n;
      const tau = n.pm ? 0.06 : hit.held ? Math.max(0.6, n.sus*0.7) : 0.30;
      return PITCH*(n.pm ? 0.09 : 0.17)*(n.ac ? 1.25 : 1)*Math.exp(-hit.age/tau)*S.vis;
    })();
    const u = hit && hit.held ? (t - hit.n.t)/hit.n.sus : 0;
    const push = hit && hit.held ? bendY(hit.n, u) + vibY(hit.n, t) : 0;      // how far the finger pushes it
    if (swing < PITCH*0.006 && Math.abs(push) < PITCH*0.01){
      const a = P(fretX(-2.2), y, 0), b = P(sxR, y, 0);
      if (!a || !b) continue;
      pts = [a, b];
    } else {
      const n = hit.n;
      const xp = n.f > 0 ? noteX(n, hit.held ? u : 0, 0) : fretX(0);          // the finger, or the nut
      const ph = Math.sin(hit.age*Math.PI*2*(19 + s*2.3));                    // where in its swing it is now
      const shape = (x) => x <= xp ? 0 : 1 - Math.exp(-(x - xp)/(FW*1.5));    // none at the finger, full a few frets on
      const rest = (x) => x <= 0 ? 0 : x <= xp ? push*(x/Math.max(xp, 1e-6)) : push*(1 - (x - xp)/(sxR - xp));
      const xs = [fretX(-2.2), 0];
      if (xp > 0.0001) xs.push(xp);
      for (let q = 1; q <= 14; q++){ const x = xp + q*FW*0.5; if (x < sxR) xs.push(x); }
      xs.push(sxR);
      pts = []; const up = [], dn = [];
      for (const x of xs){
        const w = shape(x)*swing, r0 = rest(x);
        const c = P(x, y + r0 + w*ph, 0);
        if (!c) continue;
        pts.push(c);
        if (swing >= PITCH*0.02){
          const e1 = P(x, y + r0 + w, 0), e2 = P(x, y + r0 - w, 0);
          if (e1 && e2){ up.push(e1); dn.push(e2); }
        }
      }
      if (pts.length < 2) continue;
      if (up.length > 1) ghost = [up, dn];
    }
    const trace = (L) => { ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y); for (let i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y); };

    if (k > 0.02 && S.fx){
      ctx.globalCompositeOperation = "lighter";
      /* one wide additive stroke across the screen per lit string (it used to
         be two): this is the costliest thing a chord lights up */
      ctx.strokeStyle = rgba(col, 0.36*k); ctx.lineWidth = lw*3.8;
      trace(pts); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
    if (ghost){                                                // the blur of the swing: its two extremes, faint
      ctx.strokeStyle = rgba(col, 0.30); ctx.lineWidth = Math.max(1, lw*0.7); ctx.lineJoin = "round";
      trace(ghost[0]); ctx.stroke();
      trace(ghost[1]); ctx.stroke();
    }
    ctx.strokeStyle = k > 0.02 ? tint(col, 0.25*k) : col;
    ctx.globalAlpha = 0.50 + 0.50*k;
    ctx.lineWidth = lw*(1 + 0.35*k); ctx.lineJoin = "round";
    trace(pts); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* notes and chord frames, far to near */
function drawNotes(F){
  const { t, nStr, yOf, zOf, fog, A, cam, P, outside, judging, items } = F;
  /* ── 6. notes and chord frames, far to near ──────────────────────────── */
  for (const it of items){
    if (it.ev){
      const ev = it.ev, d = ev.t - t;
      const an = A[anchorIdx(ev.t + 0.002)];
      const x0 = fretX(an.fret - 1), x1 = fretX(Math.min(24, an.fret + an.width - 1));
      const a = d < 0 ? clamp(1 + d/0.15, 0, 1) : fog(ev.t);
      if (a <= 0.01) continue;
      let top = YLO + PITCH*1.25;
      if (!ev.rep){ let hi = -Infinity; for (const cn of ev.notes) hi = Math.max(hi, yOf(cn.s)); top = hi + PITCH*0.95; }
      ev.landed = d < 0;
      drawChordBox(cam, ev, x0, x1, top, d < 0 ? 0 : zOf(ev.t), a, clamp(1 - d/1.2, 0, 1));
      continue;
    }
    const n = it.n, d = it.d;
    const s = clamp(n.s, 0, nStr - 1), grey = outside(n.t), col = grey ? GREY_NOTE : (LANE[s] || "#9aa7b2"), y = yOf(s);
    const an = A[anchorIdx(n.t + 0.002)];
    const ax0 = fretX(an.fret - 1), ax1 = fretX(Math.min(24, an.fret + an.width - 1));
    const zoneMid = (ax0 + ax1)/2, open = n.f <= 0;

    if (sustained(n))
      drawTail(cam, n, t, y, col, zoneMid, open ? (ax1 - ax0)*0.5 : FW*0.13, fog);
    if (n.linked || d < 0) continue;                // played heads are handled at the hit plane

    const z = zOf(n.t), al = fog(n.t);
    if (al <= 0.01) continue;
    const inChord = n.ch !== undefined;

    if (open){
      /* open string: a bar across the whole anchor, on legs when it is a single note */
      const hh = PITCH*0.16;
      const a = P(ax0, y - hh, z), b = P(ax1, y - hh, z), c = P(ax1, y + hh, z), e = P(ax0, y + hh, z);
      if (!a || !b || !c || !e) continue;
      if (!inChord){
        ctx.strokeStyle = rgba(col, 0.7*al); ctx.lineWidth = clamp(a.s*FW*0.03, 1, 3);
        ctx.beginPath(); seg(P(ax0, 0, z), P(ax0, y, z)); seg(P(ax1, 0, z), P(ax1, y, z)); ctx.stroke();
      }
      ctx.globalAlpha = al;
      quad(a, b, c, e, n.pm || n.mt ? shade(col, 0.45) : col);
      ctx.strokeStyle = tint(col, 0.5); ctx.lineWidth = clamp(a.s*FW*0.018, 0.8, 2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y);
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 1;
      if (d < 0.9) glow(col, (a.x + b.x)/2, (a.y + e.y)/2, Math.abs(b.x - a.x)*0.6, Math.max(6, a.s*PITCH*1.2), 0.30*(1 - d/0.9)*al);
      continue;
    }

    const xc = fretMid(n.f);
    const pl = P(xc - FW*0.30, y, z), pr = P(xc + FW*0.30, y, z);
    if (!pl || !pr) continue;
    const cx = (pl.x + pr.x)/2, cy2 = (pl.y + pr.y)/2;
    if (cx < -80 || cx > W + 80) continue;
    const hw = Math.hypot(pr.x - pl.x, pr.y - pl.y)/2, hh = hw*(PITCH*0.41)/(FW*0.30);

    if (!inChord){
      /* pad on the floor and the stem that carries the head */
      quad(P(xc - FW*0.46, 0, z + FW*0.22), P(xc + FW*0.46, 0, z + FW*0.22),
           P(xc + FW*0.46, 0, z - FW*0.22), P(xc - FW*0.46, 0, z - FW*0.22),
           "rgba(122,176,196," + (0.42*al).toFixed(3) + ")");
      const base = P(xc, 0, z);
      if (base){
        ctx.strokeStyle = rgba(col, 0.85*al); ctx.lineWidth = clamp(hw*0.11, 1, 4);
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(cx, cy2 + hh); ctx.stroke();
      }
    }

    const slope = Math.atan2(pr.y - pl.y, pr.x - pl.x);
    setSkew(P(xc, y + PITCH*0.4, z), P(xc, y - PITCH*0.4, z));
    const gk = sstep(1 - d/1.4);                                // 0 far away .. 1 at the fretboard
    if (gk > 0.01 && !grey) glow(col, cx, cy2, hw*2.3, hh*3.6, 0.40*gk*gk*al, true);
    drawHead(cx, cy2, slope, hw, hh, judging && S.showHit && n.hit === true ? "#4dff8f" : col, n, al, grey ? 0 : gk);

    /* fret number on the floor in front of the note */
    if (S.showNums && n.lab){
      const p = P(xc, 0, z + FW*(inChord ? 0.62 : 0.60));
      if (p){
        const fs = p.s*FW*0.50;
        /* the number fades out over the last stretch before the neck, where
           the neck's own fret numbers take over (by distance, so it looks the
           same at every note speed) */
        const na = al * clamp((d*G.sc - 0.12)/0.80, 0, 1);
        if (fs >= 7 && na > 0.02) label(String(n.f), p.x, p.y, Math.min(fs, 40), grey ? "#aab2ba" : "#ffab1f", na, !grey && d < 1.2 && na > 0.5 ? "rgba(255,150,0,0.8)" : null,
                                        neckAxes(cam, xc, 0, z + FW*(inChord ? 0.62 : 0.60)));
      }
    }
  }
}

/* the frame a note lands in at the hit plane, and its flash */
function drawHitFrames(F){
  const { t, nStr, yOf, P, outside, items } = F;
  /* ── 7. at the hit plane: the frame a note lands in, and its flash ───── */
  for (const it of items){
    const n = it.n;
    if (!n || n.f <= 0) continue;
    const d = it.d, held = d < 0 && n.t + n.sus > t && sustained(n);
    if (!held && (d > 0.75 || d < -0.22)) continue;
    if (n.linked && !held) continue;
    const s = clamp(n.s, 0, nStr - 1), col = outside(n.t) ? GREY_NOTE : LANE[s], y = yOf(s);
    const u = held ? (t - n.t)/n.sus : 0;
    const xc = noteX(n, u, 0), yy = y + (held ? bendY(n, u) + vibY(n, t) : 0);
    const pl = P(xc - FW*0.34, yy, 0), pr = P(xc + FW*0.34, yy, 0);
    if (!pl || !pr) continue;
    const cx = (pl.x + pr.x)/2, cy2 = (pl.y + pr.y)/2;
    /* the frame is exactly one string lane tall, so two on neighbouring strings never overlap */
    const lane = setSkew(P(xc, yy + PITCH*0.40, 0), P(xc, yy - PITCH*0.40, 0));
    let hw = Math.hypot(pr.x - pl.x, pr.y - pl.y)/2, hh = lane > 0 ? lane/2 : hw*(PITCH*0.40)/(FW*0.34);
    let a, lw = Math.max(1.5, hh*0.34);
    if (held){ a = 1; glow(col, cx, cy2, hw*2.6, hh*4.2, 0.55); }
    else if (d >= 0){ a = 0.25 + 0.75*(1 - d/0.75); }
    else {
      const k = -d/0.22;                            // struck: the frame bursts outward
      a = 1 - k; hw *= 1 + 0.30*k; hh *= 1 + 0.22*k;
      glow(col, cx, cy2, hw*2.8, hh*4.6, 0.75*(1 - k));
    }
    ctx.save(); headFrame(cx, cy2, Math.atan2(pr.y - pl.y, pr.x - pl.x));
    ctx.globalAlpha = a*S.vis; ctx.lineJoin = "round";
    rr(-hw, -hh, hw*2, hh*2, hh*0.3);
    if (held || d < 0){ ctx.fillStyle = rgba(col, held ? 0.45 : 0.35); ctx.fill(); }
    ctx.strokeStyle = (held || d < 0.12) ? tint(col, 0.55) : col; ctx.lineWidth = lw; ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

/* the guitar input's verdicts at the hit plane */
function drawVerdicts(F){
  const { t, nStr, yOf, A, P, judging } = F;
  /* ── 7c. the guitar input's verdicts at the hit plane: a green head for a
          note hit, a dark one ringed in red for a miss, fading out. A
          verdict comes a little after the note lands (the detector's delay).
          Only with the note-hit light on. */
  if (judging && S.showHit){
    const now = performance.now();
    for (let i = lowerBound(S.all, "t", t - 2); i < S.all.length && S.all[i].t < t + 0.4; i++){
      const n = S.all[i];
      if (n.hit === undefined || !n.hitAt || n.hide) continue;
      const age = (now - n.hitAt)/(n.hit ? 450 : 750);
      if (age >= 1 || age < 0) continue;
      const s = clamp(n.s, 0, nStr - 1), y = yOf(s);
      let xc, half;
      if (n.f > 0){ xc = noteX(n, 0, 0); half = FW*0.34; }
      else {                                        // an open string: across its anchor
        const an = A[anchorIdx(n.t + 0.002)];
        const ax0 = fretX(an.fret - 1), ax1 = fretX(Math.min(24, an.fret + an.width - 1));
        xc = (ax0 + ax1)/2; half = (ax1 - ax0)/2;
      }
      const pl = P(xc - half, y, 0), pr = P(xc + half, y, 0);
      if (!pl || !pr) continue;
      const lane = setSkew(P(xc, y + PITCH*0.40, 0), P(xc, y - PITCH*0.40, 0));
      const hw = Math.hypot(pr.x - pl.x, pr.y - pl.y)/2, hh = lane > 0 ? lane/2 : hw*(PITCH*0.40)/(FW*0.34);
      judgedHead((pl.x + pr.x)/2, (pl.y + pr.y)/2, Math.atan2(pr.y - pl.y, pr.x - pl.x), hw, n.f > 0 ? hh : hh*0.6, n.hit, 1 - age*age);
    }
    /* a repeated chord has no heads of its own: its frame takes the verdict */
    for (let i = lowerBound(S.chords, "t", t - 2); i < S.chords.length && S.chords[i].t < t + 0.4; i++){
      const ev = S.chords[i];
      if (!ev.rep) continue;
      const g = guitarInput.byT && guitarInput.byT.get(Math.round(ev.t*1000));
      if (!g || g.result === null || !g.at) continue;
      const age = (now - g.at)/(g.result ? 450 : 750);
      if (age >= 1 || age < 0) continue;
      const an = A[anchorIdx(ev.t + 0.002)];
      const x0 = fretX(an.fret - 1), x1 = fretX(Math.min(24, an.fret + an.width - 1)), top = YLO + PITCH*1.25;
      const pa = P(x0, 0, 0), pb = P(x1, 0, 0), pc = P(x1, top, 0), pd = P(x0, top, 0);
      if (!pa || !pb || !pc || !pd) continue;
      const k = 1 - age*age, col = g.result ? "#4dff8f" : "#ff4d42";
      if (g.result) glow(col, (pa.x + pb.x)/2, (pa.y + pd.y)/2, Math.abs(pb.x - pa.x)*0.7, Math.abs(pa.y - pd.y)*0.9, 0.5*k);
      ctx.globalAlpha = k*S.vis;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y); ctx.lineTo(pd.x, pd.y); ctx.closePath();
      ctx.fillStyle = g.result ? "rgba(47,212,111,0.28)" : "rgba(20,24,29,0.6)"; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = clamp(pa.s*FW*0.05, 2, 6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/* the fingers and the chord name of the shape being held */
function drawHeldShape(F){
  const { t, yOf, A, cam, P } = F;
  /* ── 7b. what the fretting hand holds right now: a marker per finger on
           the neck, and the chord's name above the strings, left of the
           anchor. Both stay for as long as the same shape keeps being played. */
  if (S.showFingers && S.holds.length){
    for (const m of fingerPills(t, yOf)){
      const kk = sstep(m.k)*S.vis, z = (1 - kk)*FING_Z;                // comes in from in front of the neck
      const pa = P(m.x, m.ya, z), pb = P(m.x, m.yb, z), pt = P(m.x, m.yt, z);
      if (pa && pb && pt && pa.x > -40 && pa.x < W + 40) drawPill(pa, pb, pt, pt.s*FW*0.15, m.g, kk, neckAxes(cam, m.x, m.yt, z));
    }
  }
  if (S.showChord && S.holds.length){
    const hi3 = lowerBound(S.holds, "t", t + 1e-6) - 1;          // the last hold that has landed
    const h = S.holds[hi3], nx = S.holds[hi3 + 1];
    if (h && h.name && t <= h.t1 + 0.30){
      /* it makes way just before the next chord's name arrives at the same spot */
      let a = clamp((h.t1 + 0.30 - t)/0.30, 0, 1);
      if (nx && nx.name) a = Math.min(a, clamp((nx.t - 0.22 - t)/0.20, 0, 1));
      const an = A[anchorIdx(h.t + 0.002)];
      const p = P(fretX(an.fret - 1), nameY(), 0);
      if (p) chordName(h.name, p, p.s, a*S.vis, neckAxes(cam, fretX(an.fret - 1), nameY(), 0));
    }
  }
}

/* fret numbers under the neck */
function drawNeckNumbers(F){
  const { cam, P, zf0, zf1 } = F;
  /* ── 8. fret numbers under the neck: every fret of the anchor, and the
          inlay frets everywhere else ──────────────────────────────────── */
  for (let f = 1; f <= 24; f++){
    const inZone = f > zf0 && f <= zf1;
    if (!inZone && !INLAY.has(f)) continue;
    const p = P(fretMid(f), 0, FW*0.40);
    if (!p || p.x < -30 || p.x > W + 30) continue;
    const fs = clamp(p.s*FW*0.40, 9, 44);
    /* slanted with the neck, like the chord name */
    const ax = neckAxes(cam, fretMid(f), 0, FW*0.40);
    if (inZone) label(String(f), p.x, p.y, fs, "#ffb01f", 1, "rgba(255,140,0,0.75)", ax);
    else label(String(f), p.x, p.y, fs*0.92, "#1c8f86", 0.85, null, ax);
  }
}
