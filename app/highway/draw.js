"use strict";
/* ── drawing ─────────────────────────────────────────────────────────────── */

/* where a note is along the neck, u = 0..1 through its sustain (slides move) */
function noteX(n, u, zoneMid){
  if (n.f <= 0) return zoneMid;
  const tgt = n.sl > 0 ? n.sl : n.slu > 0 ? n.slu : 0;
  if (!tgt) return fretMid(n.f);
  return lerp(fretMid(n.f), fretMid(tgt), sstep((u - 0.3)/0.7));
}
/* how far a bend has lifted the tail at u */
function bendY(n, u){
  return n.bn > 0 ? Math.min(PITCH*1.5, n.bn*PITCH*0.42) * sstep(u/0.45) : 0;
}

/* Vibrato is the string being pushed up and down across the fret, so the tail
   (and the held note at the neck) wave vertically. The chart only says that a
   note has vibrato, not how wide, so every vibrato gets the same swing. */
const VIB_HZ = 5.5, VIB_AMP = PITCH*0.26;
const vibY = (n, tau) => n.vb ? Math.sin((tau - n.t)*Math.PI*2*VIB_HZ) * VIB_AMP * Math.min(1, (tau - n.t)*6) : 0;

/* sustain tail: a flat ribbon at string height. A slide bends it across the
   frets, a bend lifts it, vibrato waves it up and down and tremolo makes it
   a zigzag. */
function drawTail(cam, n, t, y, col, zoneMid, halfW, fog){
  const tA = Math.max(n.t, t), tB = Math.min(n.t + n.sus, t + G.hor);
  if (tB - tA < 0.01) return;
  const open = n.f <= 0;
  const ts = [];
  if (n.tr){
    const step = 1/20;
    ts.push(tA);
    for (let k = Math.ceil((tA - n.t)/step + 0.001); n.t + k*step < tB; k++) ts.push(n.t + k*step);
    ts.push(tB);
  } else {
    const curved = n.sl > 0 || n.slu > 0 || n.bn > 0 || n.vb;
    const N = curved ? clamp(Math.ceil((tB - tA)*(n.vb ? 44 : 16)), 8, 90) : 1;
    for (let i = 0; i <= N; i++) ts.push(lerp(tA, tB, i/N));
  }
  const Lp = [], Rp = [];
  for (const tau of ts){
    const u = (tau - n.t)/n.sus;
    let x = noteX(n, u, zoneMid);
    if (n.tr) x += ((Math.round((tau - n.t)*20) & 1) ? 1 : -1) * FW*0.10;
    const yy = y + bendY(n, u) + vibY(n, tau), z = -(tau - t)*G.sc;
    const a = project(cam, x - halfW, yy, z), b = project(cam, x + halfW, yy, z);
    if (!a || !b) return;
    Lp.push(a); Rp.push(b);
  }
  const p0 = Lp[0], p1 = Lp[Lp.length - 1];
  const a0 = fog(tA), a1 = fog(tB) * (n.slu > 0 && tB >= n.t + n.sus - 0.01 ? 0.15 : 1);
  const k = open ? 0.16 : 0.62;
  let fill, edge;
  if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 2 || Math.abs(a0 - a1) < 0.02){
    fill = rgba(col, k*a0); edge = rgba(col, 0.95*a0);
  } else {
    fill = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    fill.addColorStop(0, rgba(col, k*a0)); fill.addColorStop(1, rgba(col, k*a1));
    edge = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    edge.addColorStop(0, rgba(col, 0.95*a0)); edge.addColorStop(1, rgba(col, 0.95*a1));
  }
  ctx.beginPath();
  ctx.moveTo(Lp[0].x, Lp[0].y);
  for (let i = 1; i < Lp.length; i++) ctx.lineTo(Lp[i].x, Lp[i].y);
  for (let i = Rp.length - 1; i >= 0; i--) ctx.lineTo(Rp[i].x, Rp[i].y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = edge; ctx.lineWidth = clamp(Lp[0].s*FW*0.022, 0.8, 2.6);
  ctx.beginPath();
  ctx.moveTo(Lp[0].x, Lp[0].y);
  for (let i = 1; i < Lp.length; i++) ctx.lineTo(Lp[i].x, Lp[i].y);
  ctx.moveTo(Rp[0].x, Rp[0].y);
  for (let i = 1; i < Rp.length; i++) ctx.lineTo(Rp[i].x, Rp[i].y);
  ctx.stroke();
}

/* the frame a chord flies in: thick cyan posts, a thin lid, a slab on the floor */
function drawChordBox(cam, ev, x0, x1, yTopBox, z, a, near){
  const bl = project(cam, x0, 0, z), br = project(cam, x1, 0, z);
  const tr = project(cam, x1, yTopBox, z), tl = project(cam, x0, yTopBox, z);
  if (!bl || !br || !tr || !tl) return;
  const lw = clamp(bl.s*FW*0.085, 1.2, 9);

  /* slab on the floor under the frame */
  const d = FW*0.30;
  ctx.globalAlpha = 1;
  quad(project(cam, x0, 0, z + d), project(cam, x1, 0, z + d),
       project(cam, x1, 0, z - d), project(cam, x0, 0, z - d), "rgba(120,190,205," + (0.30*a).toFixed(3) + ")");

  ctx.beginPath();
  ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(tl.x, tl.y);
  ctx.closePath();
  ctx.fillStyle = "rgba(30,200,220," + ((ev.rep ? 0.16 : 0.10)*a).toFixed(3) + ")";
  ctx.fill();

  if (lw > 2.5 && near > 0.5) glow("#2fe6ff", (bl.x + br.x)/2, (bl.y + tl.y)/2,
                     Math.abs(br.x - bl.x)*0.75, Math.abs(bl.y - tl.y)*0.95, 0.10*a*near);

  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const c1 = "rgba(64,236,255," + (0.95*a).toFixed(3) + ")";
  ctx.strokeStyle = c1; ctx.lineWidth = ev.rep ? lw*0.55 : lw;
  ctx.beginPath(); seg(bl, tl); seg(br, tr); ctx.stroke();
  ctx.lineWidth = Math.max(1, lw*0.45);
  ctx.beginPath(); seg(tl, tr); seg(bl, br); ctx.stroke();

  if (ev.rep && (ev.mute || ev.pm)){               // a muted strum is crossed out
    ctx.strokeStyle = "rgba(64,236,255," + (0.55*a).toFixed(3) + ")";
    ctx.lineWidth = Math.max(1, lw*0.5);
    ctx.beginPath(); seg(bl, tr); seg(br, tl); ctx.stroke();
  }
  ctx.lineCap = "butt";

  /* The name rides at the top-left corner of the frame. Only the first chord
     of a hold carries it; once that chord lands, the hold's own name takes
     over at the same corner (see 7b) and stays while the chord is repeated. */
  if (!ev.rep && ev.name && ev.hold !== 2 && !(ev.hold === 1 && ev.landed)){
    const p = project(cam, x0, nameY(), z);
    if (p) chordName(ev.name, p, p.s, a, neckAxes(cam, x0, nameY(), z));
  }
}

/* A chord's name stands left of its frame at one fixed height: a string's
   width above the top string, whatever the chord and however tall its frame.
   So it never lies across the strings. `tl` is the projected point on the
   frame's left edge at that height; the text sits on it, right-aligned. */
const nameY = () => YLO + S.nStr*PITCH;
/* The name is written in the plane of the fretboard, not flat on the screen:
   its baseline runs along the strings and its uprights along the frets, so it
   leans and slopes exactly as the neck does from the camera. `ax` holds those
   two directions on screen (see neckAxes); without it the text is drawn flat. */
function chordName(name, tl, sc, a, ax){
  const fs = clamp(sc*FW*0.62, 0, 54);
  if (fs < 9 || a <= 0.01) return;
  const sp = textSprite(name, fs, "#eef1f3", null), k = fs/sp.q, tw = sp.tw*k;
  if (S.lefty){
    /* mirrored, the frame's low-fret edge is on its right: the name stands right
       of it, left-aligned, kept on screen at the right edge */
    const left = Math.min(W - tw - 10, tl.x + fs*0.45) - tl.x;
    sprStamp(sp, tl.x, tl.y, k, a, ax, left + tw/2, -fs*0.36);
    return;
  }
  /* right-aligned to the frame, sitting on the line; kept on screen at the left edge */
  const right = Math.max(tw + 10, tl.x - fs*0.45) - tl.x;
  sprStamp(sp, tl.x, tl.y, k, a, ax, right - tw/2, -fs*0.36);
}
/* On screen, which way the strings run (ex) and which way "down the fret" points
   (ey) at a point of the neck plane. Unit vectors: they turn and skew what is
   drawn with them, without changing its size. */
function neckAxes(cam, x, y, z){
  const p = project(cam, x, y, z), q = project(cam, x + FW, y, z), u = project(cam, x, y + PITCH, z);
  if (!p || !q || !u) return null;
  const lx = Math.hypot(q.x - p.x, q.y - p.y), ly = Math.hypot(p.x - u.x, p.y - u.y);
  if (lx < 0.5 || ly < 0.5) return null;
  const k = S.lefty ? -1 : 1;                      // mirrored, the strings run right to left: text still reads left to right
  return { ex:[k*(q.x - p.x)/lx, k*(q.y - p.y)/lx], ey:[(p.x - u.x)/ly, (p.y - u.y)/ly] };
}

/* difficulty bars across the top */
const BARS = { x0:0, x1:1, top:0, h:1 };
function drawPhraseBars(t, off){
  BARS.x0 = W*0.126; BARS.x1 = W*0.895;
  BARS.h = clamp(H*0.066, 22, 76); BARS.top = Math.max(8, H*0.048);
  const ph = S.phrases, D = S.duration || 0;
  if (!ph.length || D <= 0) return;
  const base = BARS.top + BARS.h, span = BARS.x1 - BARS.x0;
  const tick = Math.max(2, Math.round(BARS.h*0.055));
  const gFut = ctx.createLinearGradient(0, BARS.top, 0, base);
  gFut.addColorStop(0, "#d63cff"); gFut.addColorStop(1, "#b40fe8");
  /* the bars picked for looping (or being picked right now, while the mouse is held) */
  const sel = loopSel.range();
  /* with the guitar input: each phrase played is coloured by its score, red to green, with its % above */
  const judged = guitarInput.link && S.inScore && guitarInput.phr && guitarInput.phr.length === ph.length ? guitarInput.phr : null;
  const fsP = clamp(BARS.h*0.27, 8, 12);
  for (let pi = 0; pi < ph.length; pi++){
    const p = ph[pi];
    const xa = BARS.x0 + span*clamp((p.t0 + off)/D, 0, 1), xb = BARS.x0 + span*clamp((p.t1 + off)/D, 0, 1);
    const w = Math.max(1, xb - xa - (xb - xa > 5 ? 2 : 0.5));
    const picked = sel && pi >= sel[0] && pi <= sel[1];
    ctx.globalAlpha = sel && !picked ? 0.38 : 1;
    if (picked){                                    // a lit column behind the bar, so even an empty phrase shows
      ctx.fillStyle = "rgba(120,235,255,0.20)";
      ctx.fillRect(xa, BARS.top - 3, w, BARS.h + 3);
    }
    const cur = t >= p.t0 && t < p.t1, past = t >= p.t1;
    const bh = Math.max(p.lv > 0 ? 3 : 0, BARS.h*p.lv);
    const ps = judged && judged[pi].done > 0 ? judged[pi] : null, pct = ps ? ps.hit/ps.done : 0;
    if (bh > 0){
      ctx.fillStyle = ps && !cur ? "hsl(" + Math.round(pct*125) + ",70%," + (past ? 36 : 48) + "%)" : past ? "#3a1c4e" : cur ? "#ff5cf4" : gFut;
      ctx.fillRect(xa, base - bh, w, bh);
      if (cur){                                     // the part of the phrase already played
        ctx.fillStyle = "#4a1fd0";
        ctx.fillRect(xa, base - bh, w*clamp((t - p.t0)/(p.t1 - p.t0), 0, 1), bh);
      }
    }
    ctx.fillStyle = picked ? "#7ff0ff" : past ? "#4b4b55" : cur ? "#20b8cc" : "#ff8a00";
    ctx.fillRect(xa, base + tick, w, picked ? tick*1.6 : tick);
    if (ps && w >= 14){
      const y = Math.max(BARS.top + fsP*0.5, base - bh - 3);
      ctx.font = "700 " + fsP.toFixed(1) + 'px "Segoe UI",system-ui,sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillStyle = "hsl(" + Math.round(pct*125) + ",85%,66%)";
      ctx.fillText(Math.round(pct*100) + (w >= 28 ? "%" : ""), xa + w/2, y);
    }
    if (picked && bh > 0){                          // and the bar itself brightens
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(xa, base - bh, w, bh);
    }
  }
  ctx.globalAlpha = 1;
  if (sel){                                         // one frame round the whole selection
    const xa = BARS.x0 + span*clamp((ph[sel[0]].t0 + off)/D, 0, 1), xb = BARS.x0 + span*clamp((ph[sel[1]].t1 + off)/D, 0, 1);
    ctx.strokeStyle = "rgba(127,240,255,0.95)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(xa - 1.5, BARS.top - 4.5, xb - xa + 1, BARS.h + tick*3 + 7);
  }
  /* tone switches: a small flag above the bars, dimmed once it is behind */
  const tcs = S.tones.changes;
  if (tcs.length){
    const r = clamp(BARS.h*0.10, 3, 6.5), y0 = BARS.top - r*2.1;
    ctx.fillStyle = "#ffe9a8";
    for (const c of tcs){
      const x = BARS.x0 + span*clamp((c.t + off)/D, 0, 1);
      ctx.globalAlpha = t >= c.t ? 0.40 : 1;
      ctx.beginPath(); ctx.moveTo(x - r, y0); ctx.lineTo(x + r, y0); ctx.lineTo(x, y0 + r*1.7); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* The note-hit light, under the middle of the bars: it blinks at the instant
   a note reaches the fretboard. Watch it against the music while turning the
   note offset - when the blink sits on the attack, the chart is in sync. */
function drawHitLight(t){
  const r = clamp(H*0.0105, 5, 11);
  const cx = (BARS.x0 + BARS.x1)/2, cy = BARS.top + BARS.h + Math.max(2, Math.round(BARS.h*0.055))*2 + r*2.1;
  const k = hitFlash(t);
  if (k > 0) glow("#49e9ff", cx, cy, r*4.5, r*4.5, 0.95*k);
  /* with the guitar input on: a green ring for a note hit, red for a miss */
  const f = guitarInput.flash, fk = f ? 1 - (performance.now() - f.at)/450 : 0;
  if (fk > 0){
    const col = f.ok ? "#4dff8f" : "#ff4d42";
    glow(col, cx, cy, r*5.5, r*5.5, 0.9*fk);
    ctx.beginPath(); ctx.arc(cx, cy, r*(1.9 - 0.5*fk), 0, Math.PI*2);
    ctx.globalAlpha = fk; ctx.lineWidth = Math.max(2, r*0.35); ctx.strokeStyle = col; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = "#0a0d11"; ctx.fill();
  if (k > 0){ ctx.globalAlpha = k; ctx.fillStyle = "#e6fdff"; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.lineWidth = Math.max(1.2, r*0.22);
  ctx.strokeStyle = k > 0 ? "rgba(120,240,255," + (0.45 + 0.55*k).toFixed(3) + ")" : "#3b4753";
  ctx.stroke();
}

/* a finger marker: a white capsule over the strings one finger holds, with the
   finger's number in it (at the top of a barre) */
/* The markers of the hand at time t, as world-space pills {g, x, ya, yb, yt, k}:
   k is how far the marker has come in - it fades with k and hangs in front
   of the neck by (1 - k), so it is seen approaching and then sticking to the
   fretboard, and lifting off again when it leaves. */
function fingerPills(t, yOf){
  const Hd = S.holds, k = lowerBound(Hd, "in0", t + 1e-6) - 1;
  if (k < 0) return [];
  const h = Hd[k], nx = Hd[k+1], e = PITCH*0.20;
  const geo = (m, kk) => {
    const y0 = yOf(m.s0), y1 = yOf(m.s1), hi = Math.max(y0, y1), lo = Math.min(y0, y1);
    return { g:m.g, x:fretMid(m.f), ya:hi + e, yb:lo - e, yt: m.s1 > m.s0 ? hi : (y0 + y1)/2, k:kk };
  };
  const u = clamp((t - h.in0)/Math.max(0.01, h.t - h.in0), 0, 1);
  if (u < 1 && h.link){
    /* sliding over from the previous hold: a finger in both moves in a straight line */
    const out = [], prev = new Map(Hd[k-1].pills.map(m => [m.g, m]));
    for (const m of h.pills){
      const b = geo(m, 1), o = prev.get(m.g);
      if (o){
        const a = geo(o, 1);
        for (const key of ["x", "ya", "yb", "yt"]) b[key] = lerp(a[key], b[key], u);
        prev.delete(m.g);
      } else b.k = u;
      out.push(b);
    }
    for (const o of prev.values()) out.push(geo(o, 1 - u));
    return out;
  }
  let kk = u;
  if (t > h.t1 && !(nx && nx.link)) kk = clamp(1 - (t - h.t1)/FING_IN, 0, 1);
  return kk > 0.01 ? h.pills.map(m => geo(m, kk)) : [];
}

function drawPill(pa, pb, pt, r, txt, a, axes){
  const ax = pa.x, ay = pa.y, bx = pb.x, by = pb.y;
  const ang = Math.atan2(by - ay, bx - ax);
  const path = () => {
    ctx.beginPath();
    ctx.arc(ax, ay, r, ang + Math.PI/2, ang + Math.PI*1.5);
    ctx.arc(bx, by, r, ang - Math.PI/2, ang + Math.PI/2);
    ctx.closePath();
  };
  ctx.globalAlpha = a; ctx.lineJoin = "round";
  path(); ctx.fillStyle = "rgba(255,255,255,0.13)"; ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = Math.max(3, r*0.34); ctx.stroke();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.4, r*0.15); ctx.stroke();
  ctx.globalAlpha = 1;
  label(txt, pt.x, pt.y, r*1.7, "#fff", a, null, axes);        // the number slants with the neck
}

/* ── chord diagram ───────────────────────────────────────────────────────────
   Under the lyrics, a flat picture of the chord the hand is holding: the same
   strings in the same colours and order as the neck, frets left
   to right, a numbered dot per finger, a capsule for a barre, a ring for an
   open string and a cross for a string that is not played. It holds still
   where the highway shows the chord only in passing and in perspective.
   It stays up between two shapes that follow each other closely, and dims
   when the highway runs behind it. */
function drawChordDiagram(t, cam, curA){
  const Hd = S.holds, k = lowerBound(Hd, "t", t + 1e-6) - 1;
  if (k < 0) return;
  const h = Hd[k], nx = Hd[k+1];
  if (!h.frets || !h.frets.some(f => f >= 0)) return;
  let a = (nx && nx.link) ? (t < nx.t ? 1 : 0) : clamp((h.t1 + 0.30 - t)/0.30, 0, 1);
  a *= S.vis;
  if (a <= 0.01) return;

  const nS = S.nStr, fr = h.frets;
  const fretted = fr.filter(f => f > 0);
  const lo = fretted.length ? Math.min.apply(null, fretted) : 1;
  const hi = fretted.length ? Math.max.apply(null, fretted) : 1;
  const base = hi <= 5 ? 1 : lo;                               // low chords are shown from the nut
  const nF = clamp(hi - base + 1, 4, 7);
  const cw = clamp(H*0.055, 22, 58), sp = cw*0.44;             // fret cell width, string spacing
  const x0 = W*0.08, yName = Math.max(H*0.335, BARS.top + BARS.h + cw*2.2);
  const gx = x0 + cw*0.75, gy = yName + cw*0.62;               // top-left of the grid
  const gw = nF*cw, gh = (nS - 1)*sp;
  /* left-handed: the grid is mirrored about its middle, so the nut and the
     open-string marks are on the right; the writing is not mirrored */
  const MX = S.lefty ? (x) => 2*gx + gw - x : (x) => x;
  const padR = S.lefty ? cw*0.85 : cw*0.45;

  /* dim it while the highway is behind it */
  {
    const xl = fretX(curA.fret - 1), xr = fretX(Math.min(24, curA.fret + curA.width - 1));
    for (let i = 0; i <= 8 && a > 0.3; i++){
      for (const xx of [xl, xr]){
        const p = project(cam, xx, 0, -ZFAR*i/8);
        if (p && p.x > x0 - cw && p.x < gx + gw + padR + cw*0.55 && p.y > yName - cw && p.y < gy + gh + cw*1.3){ a = Math.min(a, 0.28); break; }
      }
    }
  }

  ctx.save();
  ctx.globalAlpha = a; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  rr(x0 - cw*0.35, yName - cw*0.62, gx + gw + padR - (x0 - cw*0.35), gy + gh + cw*1.05 - (yName - cw*0.62), cw*0.22);
  ctx.fill();

  if (h.name){
    ctx.font = "700 " + (cw*0.72).toFixed(1) + "px " + FONT;
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f2f4f5";
    ctx.fillText(h.name, x0, yName);
  }
  /* frets, with the nut as a thick bar when the diagram starts at fret 1 */
  for (let i = 0; i <= nF; i++){
    const x = MX(gx + i*cw), nut = base === 1 && i === 0;
    ctx.strokeStyle = nut ? "#e9e2cf" : "#58626e"; ctx.lineWidth = nut ? Math.max(3, cw*0.12) : 1.5;
    ctx.beginPath(); ctx.moveTo(x, gy - sp*0.25); ctx.lineTo(x, gy + gh + sp*0.25); ctx.stroke();
  }
  /* strings, and what each one does when it is not fretted */
  const yS = (s) => gy + (S.invert ? nS - 1 - s : s)*sp;       // same order as the neck
  for (let s = 0; s < nS; s++){
    const used = fr[s] >= 0, col = LANE[s] || "#9aa7b2", y = yS(s);
    ctx.strokeStyle = used ? col : rgba(col, 0.28); ctx.lineWidth = used ? Math.max(1.6, cw*0.055) : 1.2;
    ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke();
    const mx = MX(gx - cw*0.42), r = sp*0.30;
    if (fr[s] === 0){                                           // open string
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, r*0.36);
      ctx.beginPath(); ctx.arc(mx, y, r, 0, Math.PI*2); ctx.stroke();
    } else if (!used){                                          // not played
      ctx.strokeStyle = "#7b8794"; ctx.lineWidth = Math.max(1.4, r*0.34);
      ctx.beginPath(); ctx.moveTo(mx - r*0.8, y - r*0.8); ctx.lineTo(mx + r*0.8, y + r*0.8);
      ctx.moveTo(mx + r*0.8, y - r*0.8); ctx.lineTo(mx - r*0.8, y + r*0.8); ctx.stroke();
    }
  }
  /* fingers: a barre first, so the single dots sit on top of it */
  const R = sp*0.44;
  const cellX = (f) => MX(gx + (f - base + 0.5)*cw);
  const num = (txt, x, y) => {
    ctx.font = "700 " + (R*1.45).toFixed(1) + "px " + FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
    ctx.fillText(txt, x, y + R*0.06);
  };
  const pills = h.pills.filter(m => m.f >= base && m.f < base + nF);
  for (const m of pills){
    if (m.s1 === m.s0) continue;
    const x = cellX(m.f);
    ctx.strokeStyle = "rgba(235,240,245,0.92)"; ctx.lineWidth = R*2;
    ctx.beginPath(); ctx.moveTo(x, yS(m.s0)); ctx.lineTo(x, yS(m.s1)); ctx.stroke();
    ctx.strokeStyle = "#2a323c"; ctx.lineWidth = R*2 - Math.max(3, R*0.42);
    ctx.beginPath(); ctx.moveTo(x, yS(m.s0)); ctx.lineTo(x, yS(m.s1)); ctx.stroke();
    num(m.g, x, Math.min(yS(m.s0), yS(m.s1)));                 // the number at the top of the barre
  }
  /* a string under a barre that another finger frets higher belongs to that finger */
  for (let s = 0; s < nS; s++){
    const f = fr[s];
    if (!(f > 0) || f < base || f >= base + nF) continue;
    const m = pills.find(q => q.f === f && s >= q.s0 && s <= q.s1);
    if (m && m.s1 !== m.s0) continue;                           // part of the barre itself
    const x = cellX(f), y = yS(s), col = LANE[s] || "#9aa7b2";
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2);
    ctx.fillStyle = shade(col, 0.62); ctx.fill();
    ctx.strokeStyle = tint(col, 0.55); ctx.lineWidth = Math.max(1.4, R*0.20); ctx.stroke();
    if (m) num(m.g, x, y);
  }
  /* fret numbers under the cells */
  ctx.font = "700 " + (cw*0.36).toFixed(1) + "px " + FONT;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = 0; i < nF; i++){
    ctx.fillStyle = i === 0 || INLAY.has(base + i) ? "#ffb01f" : "#7d6a3c";
    ctx.fillText(String(base + i), MX(gx + (i + 0.5)*cw), gy + gh + cw*0.60);
  }
  ctx.restore();
}

function draw(dt){
  const t = chartTime();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

  if ((!S.all || !S.all.length) && !S.resting){
    ctx.fillStyle = "#4d5a68"; ctx.font = "13px 'Segoe UI',system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("this arrangement has no notes to draw", W/2, H/2);
    ctx.textAlign = "left";
    return;
  }

  const nStr = S.nStr;
  /* the height of string s at the neck: low E on top, or at the bottom when
     the strings are inverted. yTop / yBot are the highest and lowest string
     either way. */
  const yOf = (s) => { const k = clamp(s, 0, nStr - 1); return YLO + (S.invert ? k : nStr - 1 - k)*PITCH; };
  const yTop = YLO + (nStr - 1)*PITCH, yBot = YLO;
  const HOR = G.hor, tEnd = t + HOR;
  const zOf = (tau) => -(tau - t)*G.sc;
  /* S.vis fades the whole chart out and in (see restChart): lanes, notes,
     frames, tails and numbers all take their alpha from fog() */
  const fog = (tau) => clamp((tEnd - tau)/(HOR*0.30), 0, 1)*S.vis;

  /* ── camera: frame the anchors of the next LOOK seconds ──────────────── */
  const A = S.anchors, ai = anchorIdx(t), curA = A[ai];
  let lo, hi;
  if (S.autoPan){
    lo = curA.fret - 1; hi = curA.fret + curA.width - 1;
    for (let i = anchorIdx(t - LOOK_BACK); i < A.length && A[i].t < t + LOOK; i++){
      lo = Math.min(lo, A[i].fret - 1); hi = Math.max(hi, A[i].fret + A[i].width - 1);
    }
  } else {
    lo = Math.max(0, S.fMin - 1); hi = Math.max(lo + 4, S.fMax);
  }
  const wantC = (lo + hi)/2, wantS = Math.max(4, hi - lo);
  if (S.camC === null){ S.camC = wantC; S.camS = wantS; S.camCv = S.camSv = 0; }
  else {
    /* A critically damped spring: the camera eases out of one framing and
       into the next over four to five seconds, with no sudden start or stop.
       Because it frames LOOK seconds ahead, it has all but finished moving
       before the notes that needed the new angle arrive. */
    const w = CAM_EASE * S.camRate;
    S.camCv += ((wantC - S.camC)*w*w - 2*w*S.camCv)*dt;  S.camC += S.camCv*dt;
    S.camSv += ((wantS - S.camS)*w*w - 2*w*S.camSv)*dt;  S.camS = Math.max(4, S.camS + S.camSv*dt);
  }
  const cam = makeCam(W, H, S.camC, S.camS, nStr, S.zoom);
  const P = (x, y, z) => project(cam, x, y, z);
  const zx0 = fretX(curA.fret - 1), zx1 = fretX(Math.min(24, curA.fret + curA.width - 1));

  /* glow behind the far end of the highway */
  {
    const v = P((zx0 + zx1)/2, 0, -ZFAR);
    if (v) glow("#0a3a6a", v.x, v.y + H*0.05, W*0.30, H*0.20, 0.55);
  }

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

  /* ── 5. the fretboard at the hit plane ───────────────────────────────── */
  const zf0 = curA.fret - 1, zf1 = Math.min(24, curA.fret + curA.width - 1);
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

  drawPhraseBars(t, S.offMs/1000);
  if (S.showHit) drawHitLight(t);
  if (S.showDiagram && S.holds.length) drawChordDiagram(t, cam, curA);
}

