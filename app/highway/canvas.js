"use strict";
/* ── canvas ──────────────────────────────────────────────────────────────── */
const cv = document.getElementById("hw"), ctx = cv.getContext("2d", {alpha:false});
let W = 1, H = 1, dpr = 1;
function resize(){
  const r = cv.getBoundingClientRect();
  /* render scale: fewer pixels to fill. dynScale is the automatic part - it
     drops while the frame rate is low (see autoResolution) */
  dpr = (window.devicePixelRatio || 1) * S.rscale * (S.autoScale ? S.dynScale : 1);
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  if (SPR.dpr !== dpr){ SPR.dpr = dpr; SPR.text.clear(); SPR.head.clear(); }   // sprites are made for one pixel density
  if (cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)){
    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  }
}
window.addEventListener("resize", resize);

/* cached soft glow sprite - far cheaper than shadowBlur per note */
const glowCache = new Map();
function glowSprite(color){
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(32,32,0, 32,32,32);
  rg.addColorStop(0, color); rg.addColorStop(0.35, color + "88");
  rg.addColorStop(1, color + "00");
  g.fillStyle = rg; g.fillRect(0,0,64,64);
  glowCache.set(color, c);
  return c;
}
function glow(color, x, y, rw, rh, a, plain){
  if (!S.fx || a <= 0.004 || rw < 1 || rh < 1) return;
  /* added light whitens where it overlaps; "plain" keeps the note's own colour */
  ctx.globalCompositeOperation = plain ? "source-over" : "lighter";
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glowSprite(color), 0, 0, 64, 64, x - rw, y - rh, rw*2, rh*2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}

function quad(a, b, c, d, fill){
  if (!a || !b || !c || !d) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function seg(a, b){ if (a && b){ ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }

/* rounded rectangle path, centred coordinates */
function rr(x, y, w, h, r, c){
  c = c || ctx;                                   // the canvas to trace the path on
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

/* ── sprites ─────────────────────────────────────────────────────────────────
   Outlined, glowing text and detailed noteheads are slow to draw from scratch:
   a stroked glyph outline, a blurred shadow, a clip region. A busy passage has
   dozens of each on screen, every frame. So each distinct one is drawn once
   into a small off-screen canvas and from then on only stamped with drawImage,
   which is about the cheapest thing a canvas can do.

   A sprite is rendered at the next size up in a short ladder of sizes and
   scaled down to the exact size when stamped, so a note growing as it
   approaches re-uses a handful of sprites instead of one per pixel size.   */
const SPR = { text:new Map(), head:new Map() };
function sprCanvas(w, h){
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w*dpr)); c.height = Math.max(1, Math.ceil(h*dpr));
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  return [c, g];
}
/* stamp a sprite centred on (x, y), scaled by k, optionally in the neck's own axes */
function sprStamp(sp, x, y, k, a, ax, ox, oy){
  const w = sp.w*k, h = sp.h*k;
  ctx.globalAlpha = a;
  if (ax){
    ctx.setTransform(dpr*ax.ex[0], dpr*ax.ex[1], dpr*ax.ey[0], dpr*ax.ey[1], dpr*x, dpr*y);
    ctx.drawImage(sp.c, (ox || 0) - sp.cx*k, (oy || 0) - sp.cy*k, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else ctx.drawImage(sp.c, x + (ox || 0) - sp.cx*k, y + (oy || 0) - sp.cy*k, w, h);
  ctx.globalAlpha = 1;
}
function textSprite(txt, size, color, glowCol){
  const q = size <= 14 ? Math.ceil(size) : size <= 30 ? Math.ceil(size/2)*2 : Math.ceil(size/4)*4;
  const glowOn = glowCol && S.fx ? glowCol : "";
  const key = txt + "|" + q + "|" + color + "|" + glowOn + "|" + dpr;
  let sp = SPR.text.get(key);
  if (sp) return sp;
  if (SPR.text.size > 1200) SPR.text.clear();
  const font = "700 " + q + "px " + FONT;
  ctx.font = font;
  const tw = ctx.measureText(txt).width, pad = q*(glowOn ? 0.75 : 0.25) + 3;
  const w = tw + pad*2, h = q*1.35 + pad*2;
  const [c, g] = sprCanvas(w, h);
  g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  if (glowOn){ g.shadowColor = glowOn; g.shadowBlur = q*0.45*dpr; }
  g.lineWidth = Math.max(2, q*0.16); g.strokeStyle = "rgba(0,0,0,0.78)";
  g.strokeText(txt, w/2, h/2);
  g.shadowBlur = 0;
  g.fillStyle = color;
  g.fillText(txt, w/2, h/2);
  sp = { c, w, h, cx:w/2, cy:h/2, q, tw };
  SPR.text.set(key, sp);
  return sp;
}

/* text with a dark rim so it stays readable on the lit lanes.
   `ax` (from neckAxes) writes it in the plane of the fretboard instead of flat */
function label(txt, x, y, size, color, a, glowCol, ax){
  if (a <= 0.004 || size < 1) return;
  const sp = textSprite(txt, size, color, glowCol);
  sprStamp(sp, x, y, size/sp.q, a, ax);
}

/* A head or a frame lies in the plane of the neck, so its sides must run
   parallel to the frets and its top and bottom parallel to the strings. Seen
   from the camera those two directions are not at right angles: the shape is
   drawn in a skewed frame - x along the string, y along the fret. setSkew
   takes the projections of a point above and below the note and returns the
   distance between them in pixels. */
const SK = { x:0, y:1, on:false };
function setSkew(pu, pd){
  SK.on = false;
  if (!pu || !pd) return 0;
  const dx = pd.x - pu.x, dy = pd.y - pu.y, L = Math.hypot(dx, dy);
  if (L < 0.5) return 0;
  SK.x = dx/L; SK.y = dy/L; SK.on = true;
  return L;
}
function headFrame(x, y, ang){
  const c = Math.cos(ang), sn = Math.sin(ang);
  if (SK.on) ctx.transform(c, sn, SK.x, SK.y, x, y);
  else ctx.transform(c, sn, -sn, c, x, y);
}

/* ── noteheads ───────────────────────────────────────────────────────────────
   One shape per technique. Drawn in the head's
   own frame: origin at its centre, hw/hh = half width / half height.        */
const HEAD_SIZES = [3, 4, 5.5, 7.5, 10, 13, 17, 22, 28, 36, 46, 60, 80, 110];   // half-widths a head sprite is drawn at
/* gk: how close the note is, 0 far away .. 1 at the fretboard. A far note is
   drawn in its plain colour; its rim lightens and its inner frame shows as it
   approaches, so the glow does not distract while the note is still far off. */
function drawHead(x, y, ang, hw, hh, col, n, a, gk){
  if (a <= 0.004) return;
  const c0 = Math.cos(ang), s0 = Math.sin(ang);
  const ex = SK.on ? SK.x : -s0, ey = SK.on ? SK.y : c0;           // the head's own frame, see setSkew
  if (hw < 2.4){                                   // too far away for any detail
    ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.setTransform(dpr*c0, dpr*s0, dpr*ex, dpr*ey, dpr*x, dpr*y);
    ctx.fillRect(-hw, -Math.max(0.8, hh), hw*2, Math.max(1.6, hh*2));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    return;
  }
  const marks = S.showLabels && hh > 2.6;
  let q = hw;
  for (const v of HEAD_SIZES) if (v >= hw){ q = v; break; }
  const bend = n.bn > 0 ? (n.bn < 1.5 ? 1 : n.bn < 2.5 ? 2 : 3) : 0;
  const gl = Math.round(clamp(gk === undefined ? 1 : gk, 0, 1)*4);    // five steps: a sprite for each
  const key = col + "|" + q + "|" + (n.tp ? 1 : 0) + (n.ac ? 1 : 0) + (n.pm ? 1 : 0) + (n.mt ? 1 : 0) + (n.hm ? 1 : 0)
            + (n.hp ? 1 : 0) + (n.ho ? 1 : 0) + (n.po ? 1 : 0) + bend + (marks ? 1 : 0) + "|" + gl + "|" + dpr;
  let sp = SPR.head.get(key);
  if (!sp){
    if (SPR.head.size > 900) SPR.head.clear();
    const qh = q*hh/hw;                                             // same proportions at the sprite's size
    const mx = q*0.55 + 3, top = qh*(1.6 + bend*0.8) + 4, bot = qh*0.9 + 4;   // room for the accent frame, chevrons, wedge
    const w = (q + mx)*2, h = qh*2 + top + bot;
    const [c, g] = sprCanvas(w, h);
    g.translate(q + mx, qh + top);
    headShape(g, q, qh, col, n, marks, gl/4);
    sp = { c, w, h, cx:q + mx, cy:qh + top, q };
    SPR.head.set(key, sp);
  }
  const k = hw/sp.q;
  ctx.globalAlpha = a;
  ctx.setTransform(dpr*c0, dpr*s0, dpr*ex, dpr*ey, dpr*x, dpr*y);
  ctx.drawImage(sp.c, -sp.cx*k, -sp.cy*k, sp.w*k, sp.h*k);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
}
/* the guitar input's verdict on a note, at the hit plane: a green head for a
   hit, a dark one ringed in red for a miss (a: how much of it is left) */
function judgedHead(cx, cy, ang, hw, hh, ok, a){
  if (ok) glow("#4dff8f", cx, cy, hw*2.8, hh*4.6, 0.65*a);
  ctx.save(); headFrame(cx, cy, ang);
  ctx.globalAlpha = a*S.vis; ctx.lineJoin = "round";
  rr(-hw, -hh, hw*2, hh*2, hh*0.32);
  ctx.fillStyle = ok ? "#2fd46f" : "#14181d"; ctx.fill();
  ctx.strokeStyle = ok ? "#d4ffe1" : "#ff4d42"; ctx.lineWidth = Math.max(1.6, hh*(ok ? 0.26 : 0.40)); ctx.stroke();
  ctx.restore(); ctx.globalAlpha = 1;
}
/* the picture of one notehead, drawn around the origin of `g` - used to make its sprite */
function headShape(g, hw, hh, col, n, marks, gk){
  g.lineJoin = "round"; g.lineCap = "round";
  const lw = Math.max(1.2, hh*0.30);
  const fhm = n.mt, isPM = n.pm && !fhm, harm = n.hm || n.hp;

  if (n.tp){
    /* tap: a wedge pointing down at the string */
    const t = hh*1.35;
    g.beginPath();
    g.moveTo(-hw, -t); g.lineTo(-hw*0.42, -t); g.lineTo(0, t*0.05);
    g.lineTo(hw*0.42, -t); g.lineTo(hw, -t); g.lineTo(0, t);
    g.closePath();
    g.fillStyle = shade(col, 0.78); g.fill();
    g.strokeStyle = tint(col, 0.5); g.lineWidth = lw*0.8; g.stroke();
  } else {
    if (n.ac){                                     // accent: a second, glowing frame
      rr(-hw - lw*1.5, -hh - lw*1.5, hw*2 + lw*3, hh*2 + lw*3, hh*0.6, g);
      g.strokeStyle = rgba(col, 0.25 + 0.30*gk); g.lineWidth = lw*1.5; g.stroke();
    }
    rr(-hw, -hh, hw*2, hh*2, hh*0.32, g);
    g.fillStyle = (isPM || fhm) ? shade(col, 0.22) : n.hp ? shade(col, 0.95) : shade(col, 0.80);
    g.fill();
    if (isPM && marks){                            // palm mute: the head is crossed out in its own colour
      g.save(); g.clip();
      g.strokeStyle = col; g.lineWidth = Math.max(1.4, hh*0.55); g.lineCap = "butt";
      g.beginPath();
      g.moveTo(-hw, -hh); g.lineTo(hw, hh); g.moveTo(hw, -hh); g.lineTo(-hw, hh);
      g.stroke();
      g.restore();
      rr(-hw, -hh, hw*2, hh*2, hh*0.32, g);
    }
    g.strokeStyle = n.ac ? tint(col, 0.30 + 0.40*gk) : tint(col, 0.06 + 0.26*gk); g.lineWidth = lw; g.stroke();
    if (!isPM && !fhm && !harm && !n.ho && !n.po && hw > 6){
      /* the lighter inner frame every plain head has */
      rr(-hw + lw*1.25, -hh + lw*1.15, hw*2 - lw*2.5, hh*2 - lw*2.3, hh*0.15, g);
      g.strokeStyle = "rgba(255,255,255," + (0.10 + 0.32*gk).toFixed(2) + ")"; g.lineWidth = Math.max(1, lw*0.42); g.stroke();
    }
  }

  if (marks){
    const u = hh*0.72;
    if (fhm){                                      // frethand mute: white cross
      g.strokeStyle = "#fff"; g.lineWidth = Math.max(1.3, hh*0.34);
      g.beginPath();
      g.moveTo(-u*1.25, -u); g.lineTo(u*1.25, u); g.moveTo(u*1.25, -u); g.lineTo(-u*1.25, u);
      g.stroke();
    } else if (harm){                              // harmonic: white target; pinch: dark target
      const c2 = n.hp ? "rgba(40,22,0,0.85)" : "#fff";
      g.strokeStyle = c2; g.fillStyle = c2; g.lineWidth = Math.max(1.1, hh*0.26);
      g.beginPath(); g.ellipse(0, 0, u*1.15, u*0.86, 0, 0, Math.PI*2); g.stroke();
      g.beginPath(); g.arc(0, 0, Math.max(0.8, u*0.30), 0, Math.PI*2); g.fill();
    } else if ((n.ho || n.po) && !n.tp){           // hammer-on points down, pull-off up
      const dir = n.po ? -1 : 1;
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(-u*1.05, -u*0.85*dir); g.lineTo(u*1.05, -u*0.85*dir); g.lineTo(0, u*0.95*dir);
      g.closePath(); g.fill();
    }
    if (n.bn > 0){                                 // bend: one chevron per half step, stacked on the head
      const cnt = n.bn < 1.5 ? 1 : n.bn < 2.5 ? 2 : 3;
      g.strokeStyle = tint(col, 0.35); g.lineWidth = Math.max(1.2, hh*0.30);
      g.beginPath();
      for (let i = 0; i < cnt; i++){
        const yy = -hh - lw - hh*0.55 - i*hh*0.75;
        g.moveTo(-hw*0.5, yy + hh*0.45); g.lineTo(0, yy - hh*0.15); g.lineTo(hw*0.5, yy + hh*0.45);
      }
      g.stroke();
    }
  }
}

