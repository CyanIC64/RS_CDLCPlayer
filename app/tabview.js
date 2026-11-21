"use strict";
/* ── tab view ────────────────────────────────────────────────────────────────
   The arrangement on screen as standard guitar tablature, in place of the
   highway: one line per string (high e on top), bars wrapped into rows, a fret
   number per note, the playing techniques above the staff, the rhythm under
   it and the lyrics under that, one syllable at a time. A box follows the
   notes being played, and the view scrolls with it.

   It is drawn once per song (and per window width) as one SVG per row; only
   the box moves while the song plays. Click anywhere in a row to play from
   there.

   Rhythm: the chart only says when each note starts. A note's length is taken
   as the time to the next note (or the end of the bar), measured in beats on
   the song's own beat grid, and rounded to the nearest common note value -
   good for reading, not a transcription. */
const TABK = {
  MARGIN: 26, PADL: 16, PADR: 8, STR: 13,       // page margin, space inside a bar, string spacing
  TOP: 74, RHY: 30, LYR: 22, GAP: 30,           // annotation band above the staff, rhythm band, lyric band, gap to the next row
  W0: 20, W1: 30,                               // a note's slot: W0 + W1*sqrt(beats)
};
const tabEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

/* the bars, beats and note values of the song: web/chart.js (src/chart/tab.js) */
const { tabValue } = ChartKit, tabXAt = ChartKit.xAt;
const tabBeatPos = (t) => ChartKit.beatPos(S.beats, t);
const tabMeasures = (lastT, firstT) => ChartKit.measures(S.beats, lastT, firstT);
/* the events of the arrangement: every moment something is struck, with its notes */
const tabEvents = () => ChartKit.tabEvents(S.all, S.chords);

class TabView {
  constructor(){
    this.on = false;          // shown in place of the highway
    this.dirty = true;        // to be laid out again before it is shown
    this.rows = []; this.bars = []; this.evs = [];
    this.width = 0; this.nStr = 6;
    this.curEv = -1; this.curRow = -1;
    this.holdUntil = 0;       // a manual scroll: the view stops following until then
    this.groups = null;       // the <g> of every event, by index, for the marks
    this.lit = new Set(); this.maxLen = 0;
    this.listen();
  }

  build(){
    const view = $("tabview");
    const page = $("tabpage");
    this.dirty = false; this.rows = []; this.curEv = -1; this.curRow = -1;
    const width = Math.max(320, view.clientWidth);
    this.width = width;
    const nStr = S.nStr; this.nStr = nStr;
    this.evs = (S.all && S.all.length) ? tabEvents() : [];
    if (!this.evs.length){
      page.innerHTML = '<div class="tabempty">Open a song to see its tab.</div>';
      page.style.height = ""; return;
    }
    const evs = this.evs;
    let lastT = 0;
    for (const e of evs) for (const n of e.notes) lastT = Math.max(lastT, n.t + n.sus);
    let bars = tabMeasures(lastT, evs[0].t);
    /* bars before the first note are left out, as a tab book would */
    while (bars.length > 1 && bars[1].t0 <= evs[0].t + 1e-4) bars.shift();
    bars = bars.filter((b) => b.t1 > evs[0].t - 1e-4 || b.t0 > evs[0].t);

    /* lengths, note values and slot widths */
    let bi = 0;
    for (let i = 0; i < evs.length; i++){
      const e = evs[i];
      while (bi < bars.length - 1 && e.t >= bars[bi].t1 - 1e-4) bi++;
      e.bar = bi;
      const nextT = Math.min(i + 1 < evs.length ? evs[i+1].t : Infinity, bars[bi].t1);
      e.beat = tabBeatPos(e.t);
      e.beats = Math.max(0.05, tabBeatPos(nextT) - e.beat);
      e.val = tabValue(e.beats);
      const wide = e.notes.some((n) => n.hm || n.f >= 10) ? 6 : 0;
      e.w = TABK.W0 + TABK.W1*Math.sqrt(clamp(e.beats, 0.125, 4)) + wide;
      /* marked while it sounds: a held note for its length, a short one for a
         moment - but not past the next note, or the marks would run together */
      e.idx = i;
      const held = Math.max(...e.notes.map((n) => n.t + n.sus));
      e.end = Math.max(held, e.t + Math.min(0.2, Math.max(0.06, (i + 1 < evs.length ? evs[i+1].t : e.t + 1) - e.t - 0.02)));
    }
    for (const b of bars){ b.evs = []; b.lead = 0; }
    for (const e of evs) bars[e.bar].evs.push(e);
    for (const b of bars){
      const first = b.evs.length ? b.evs[0].t : b.t1;
      const rest = tabBeatPos(first) - tabBeatPos(b.t0);
      b.lead = rest > 0.06 ? TABK.W1*Math.sqrt(Math.min(rest, 4)) : 0;
      b.nat = TABK.PADL + b.lead + b.evs.reduce((s, e) => s + e.w, 0) + TABK.PADR;
      if (!b.evs.length) b.nat = Math.max(b.nat, 70);
    }
    /* a bar is at least as wide as the lyrics sung in it, so the words do not pile up */
    for (const ln of S.lyrics) for (const sy of ln.syl){
      const b = bars.find((q) => sy[0] >= q.t0 - 1e-3 && sy[0] < q.t1);
      if (b) b.lyr = (b.lyr || 0) + String(sy[2]).trim().length*6.6 + 6;
    }
    for (const b of bars) if (b.lyr) b.nat = Math.max(b.nat, b.lyr + TABK.PADL + 6);

    /* rows: as many bars as fit, then stretched to the full width */
    const avail = width - 2*TABK.MARGIN;
    const rows = [];
    let cur = [], sum = 0;
    for (const b of bars){
      if (cur.length && sum + b.nat > avail){ rows.push({ bars:cur, nat:sum }); cur = []; sum = 0; }
      cur.push(b); sum += Math.min(b.nat, avail);
    }
    if (cur.length) rows.push({ bars:cur, nat:sum, last:true });

    const staffH = (nStr - 1)*TABK.STR;
    const rowH = TABK.TOP + staffH + TABK.RHY + TABK.LYR + TABK.GAP;
    let html = "", top = 10;
    rows.forEach((row, ri) => {
      const k = (row.last && row.nat < avail*0.7) ? 1 : avail/row.nat;
      let x = TABK.MARGIN;
      for (const b of row.bars){
        const w = Math.min(b.nat, avail)*k, kk = w/b.nat;
        b.x0 = x; b.x1 = x + w; b.row = ri;
        let ex = x + (TABK.PADL + b.lead)*kk;
        b.knots = [[b.t0, x + 4]];
        for (const e of b.evs){ e.x = ex + 7*kk; e.row = ri; b.knots.push([e.t, e.x]); ex += e.w*kk; }
        b.knots.push([b.t1, x + w]);
        x += w;
      }
      row.top = top; row.h = rowH; row.idx = ri;
      row.staffTop = TABK.TOP; row.staffBot = TABK.TOP + staffH;
      top += rowH;
    });
    /* drawn once every bar has its place: a mark may reach into a later bar */
    this.rows = rows; this.bars = bars;
    for (const row of rows) html += this.rowSvg(row, width, nStr);
    page.innerHTML = html + '<div id="tabcur"></div>';
    this.groups = [];
    for (const g of page.querySelectorAll("g.te")) this.groups[+g.dataset.e] = g;
    if (guitarInput.ver) guitarInput.markTabAll();
    this.lit = new Set();
    this.maxLen = evs.reduce((m, e) => Math.max(m, e.end - e.t), 0);
    page.style.height = (top + 40) + "px";
  }

  barAt(t){
    const B = this.bars;
    if (!B || !B.length) return null;
    let lo = 0, hi = B.length - 1;
    while (lo < hi){ const m = (lo + hi + 1) >> 1; if (B[m].t0 <= t) lo = m; else hi = m - 1; }
    return B[lo];
  }

  rowSvg(row, width, nStr){
    const ST = TABK.STR, sTop = row.staffTop, sBot = row.staffBot;
    const yS = (s) => sTop + (nStr - 1 - s)*ST;                        // high string on top, as tab is written
    const L = [];                                                       // svg pieces
    const x0 = row.bars[0].x0, x1 = row.bars[row.bars.length - 1].x1;
    /* staff */
    for (let s = 0; s < nStr; s++) L.push(`<line x1="${x0}" x2="${x1}" y1="${yS(s)}" y2="${yS(s)}" class="tl"/>`);
    for (const b of row.bars){
      L.push(`<line x1="${b.x0}" x2="${b.x0}" y1="${sTop}" y2="${sBot}" class="tb"/>`);
      L.push(`<text x="${b.x0 + 2}" y="${sTop - 6}" class="tn">${b.num}</text>`);
    }
    L.push(`<line x1="${x1}" x2="${x1}" y1="${sTop}" y2="${sBot}" class="tb"/>`);

    /* section names, where a section starts */
    const rt0 = row.bars[0].t0, rt1 = row.bars[row.bars.length - 1].t1;
    let lastSecX = -1e9;
    for (const sec of S.sections){
      if (sec.time < rt0 - 1e-3 || sec.time >= rt1) continue;
      const b = this.barAt(sec.time); if (!b || b.row !== row.idx) continue;
      const x = Math.max(tabXAt(b, sec.time) - 6, lastSecX + 70);
      lastSecX = x;
      L.push(`<text x="${x}" y="14" class="tsec">${tabEsc(secLabel(sec.name))}</text>`);
    }

    const evs = row.bars.flatMap((b) => b.evs);
    const yPM = 42, yVib = 53, yBendLbl = 63;
    /* palm-mute runs: "P.M." and a dashed line to the end of the run */
    let run = null;
    const flushRun = () => {
      if (!run) return;
      L.push(`<text x="${run.x0 - 9}" y="${yPM}" class="tpml">P.M.</text>`);
      if (run.x1 - run.x0 > 22){
        L.push(`<line x1="${run.x0 + 18}" x2="${run.x1 + 8}" y1="${yPM - 4}" y2="${yPM - 4}" class="tdash"/>`);
        L.push(`<line x1="${run.x1 + 8}" x2="${run.x1 + 8}" y1="${yPM - 8}" y2="${yPM}" class="tthin"/>`);
      }
      run = null;
    };
    for (const e of evs){
      const pm = e.notes.every((n) => n.pm && !n.mt) || (e.notes.some((n) => n.pm) && e.notes.every((n) => n.pm || n.mt));
      if (pm){ if (run && e.x - run.x1 < 70) run.x1 = e.x; else { flushRun(); run = { x0:e.x, x1:e.x }; } }
      else flushRun();
    }
    flushRun();

    /* the notes */
    const lastOn = new Array(8).fill(null);                             // the previous note drawn on each string, in this row
    for (const e of evs){
      const x = e.x;
      if (e.name) L.push(`<text x="${x}" y="28" class="tch">${tabEsc(e.name)}</text>`);
      {
        let ya = Infinity, yb = -Infinity, wmax = 1;
        for (const n of e.notes){
          const y = yS(clamp(n.s, 0, nStr - 1)); ya = Math.min(ya, y); yb = Math.max(yb, y);
          wmax = Math.max(wmax, (n.hm ? String(n.f).length + 2 : n.linked ? String(n.f).length + 2 : String(n.f).length));
        }
        const hw = 3.8*wmax + 5;
        L.push(`<g class="te" data-e="${e.idx}"><rect class="thl" x="${x - hw}" y="${ya - 8}" width="${hw*2}" height="${yb - ya + 16}" rx="4"/>`);
      }
      let marks = [];
      for (const n of e.notes){
        const s = clamp(n.s, 0, nStr - 1), y = yS(s);
        const prev = lastOn[s];
        let txt = n.mt ? "X" : String(n.f);
        if (n.hm && !n.mt) txt = "<" + n.f + ">";
        if (n.linked && prev && prev.n.f === n.f && !n.mt) txt = "(" + n.f + ")";
        L.push(`<text x="${x}" y="${y + 4.5}" class="tf">${tabEsc(txt)}</text>`);
        const hw = 3.6*txt.length + 1;
        /* hammer-on / pull-off: an arc from the note before on this string */
        if ((n.ho || n.po) && prev && x - prev.x < 160){
          const xa = prev.x + 3, xb = x - 3, mid = (xa + xb)/2;
          L.push(`<path d="M${xa},${y - 7} Q${mid},${y - 16} ${xb},${y - 7}" class="tarc"/>`);
        }
        /* slide: a line to the note it slides to, or a short slant out */
        const tgt = n.sl > 0 ? n.sl : n.slu > 0 ? n.slu : 0;
        if (tgt && n.f > 0){
          const up = tgt > n.f, dy = up ? -3.5 : 3.5;
          const nx = this.nextOn(e, s, n.t + n.sus, n.sl);
          if (n.sl > 0 && nx && nx.row === row.idx && nx.x - x < 220){
            L.push(`<line x1="${x + hw + 1}" y1="${y - dy}" x2="${nx.x - hw - 1}" y2="${y + dy}" class="tslide"/>`);
          } else {
            L.push(`<line x1="${x + hw + 1}" y1="${y - dy}" x2="${x + hw + 10}" y2="${y + dy}" class="tslide"/>`);
          }
        }
        /* bend: an arrow up to above the staff, with how far */
        if (n.bn > 0){
          const lbl = n.bn === 2 ? "full" : n.bn === 1 ? "½" : n.bn === 0.5 ? "¼" : n.bn === 3 ? "1½" : n.bn === 4 ? "2" : String(n.bn/2);
          const xa = x + hw, ya = y - 3, xt = x + hw + 8;
          L.push(`<path d="M${xa},${ya} Q${xt},${ya} ${xt},${sTop - 9}" class="tbend"/>`);
          L.push(`<path d="M${xt - 3},${sTop - 5} L${xt},${sTop - 11} L${xt + 3},${sTop - 5} Z" class="tarrow"/>`);
          L.push(`<text x="${xt}" y="${yBendLbl - 1}" class="tbl">${lbl}</text>`);
        }
        /* vibrato: a wavy line over its length */
        if (n.vb){
          const b = this.bars[e.bar];
          let xe = x + 26;
          const be = this.barAt(n.t + Math.max(n.sus, 0.2));
          if (be && be.row === row.idx) xe = Math.max(x + 18, tabXAt(be, n.t + Math.max(n.sus, 0.2)));
          else xe = Math.max(x + 18, b.x1 - 4);
          marks.push(this.wave(x - 4, xe, yVib));
        }
        if (n.tr) marks.push(`<path d="M${x - 5},${yVib + 4} l4,-6 M${x - 1},${yVib + 4} l4,-6 M${x + 3},${yVib + 4} l4,-6" class="tthin"/>`);
        if (n.tp) marks.push(`<text x="${x}" y="${yPM}" class="tpm">T</text>`);
        if (n.hp) marks.push(`<text x="${x}" y="${yPM}" class="tpm">P.H.</text>`);
        if (n.ac) marks.push(`<text x="${x}" y="${yVib + 3}" class="tacc">&gt;</text>`);
        lastOn[s] = { x, n };
      }
      L.push(`</g>`);
      for (const m of [...new Set(marks)]) L.push(m);
    }

    /* rhythm: a stem per moment, beamed within each beat */
    const rTop = sBot + 9, rBot = rTop + 19;
    for (const e of evs){
      L.push(`<line x1="${e.x}" x2="${e.x}" y1="${rTop}" y2="${rBot}" class="tstem"/>`);
      if (e.val[3]) L.push(`<circle cx="${e.x + 4}" cy="${rBot - 2}" r="1.3" class="tdot"/>`);
    }
    for (let i = 0; i < evs.length; ){
      const e = evs[i];
      if (!e.val[1]){ i++; continue; }
      const beat = Math.floor(e.beat + 1e-3);
      let j = i;
      while (j + 1 < evs.length && evs[j+1].val[1] && Math.floor(evs[j+1].beat + 1e-3) === beat && evs[j+1].bar === e.bar) j++;
      const grp = evs.slice(i, j + 1);
      for (let lv = 1; lv <= 3; lv++){
        const y = rBot - (lv - 1)*4;
        for (let g = 0; g < grp.length; g++){
          if (grp[g].val[1] < lv) continue;
          if (g + 1 < grp.length && grp[g+1].val[1] >= lv){
            L.push(`<line x1="${grp[g].x}" x2="${grp[g+1].x}" y1="${y}" y2="${y}" class="tbeam"/>`);
          } else if (!(g > 0 && grp[g-1].val[1] >= lv)){             // alone at this level: a stub
            const dir = g + 1 < grp.length ? 1 : -1;
            L.push(`<line x1="${grp[g].x}" x2="${grp[g].x + 7*dir}" y1="${y}" y2="${y}" class="tbeam"/>`);
          }
        }
      }
      if (grp.length > 1 && grp.every((q) => q.val[2])){
        const xa = grp[0].x, xb = grp[grp.length - 1].x;
        L.push(`<path d="M${xa},${rBot + 4} v3 H${xb} v-3" class="tthin"/><text x="${(xa + xb)/2}" y="${rBot + 14}" class="ttri">3</text>`);
      }
      i = j + 1;
    }

    /* lyrics, one syllable at a time, under the rhythm */
    const yL = rBot + TABK.LYR + 4;
    let lastEnd = -1e9;
    for (const ln of S.lyrics){
      if (ln.end < rt0 || ln.t >= rt1) continue;
      for (const sy of ln.syl){
        const [t, , text] = sy;
        if (t < rt0 - 1e-3 || t >= rt1) continue;
        const b = this.barAt(t); if (!b || b.row !== row.idx) continue;
        const w = String(text).trim();
        if (!w) continue;
        let x = tabXAt(b, t);
        const cont = !/^\s/.test(text) && sy !== ln.syl[0];         // continues the word before it
        if (x < lastEnd + 4) x = lastEnd + 4;
        L.push(`<text x="${x}" y="${yL}" class="tly">${cont ? "-" : ""}${tabEsc(w)}</text>`);
        lastEnd = x + (w.length + (cont ? 1 : 0))*6.4;
      }
    }

    return `<svg class="tabrow" data-row="${row.idx}" style="top:${row.top}px" width="${width}" height="${row.h}" viewBox="0 0 ${width} ${row.h}">${L.join("")}</svg>`;
  }
  wave(xa, xb, y){
    let d = `M${xa},${y}`;
    for (let x = xa, k = 0; x < xb; x += 4, k++) d += ` L${x + 2},${y + (k & 1 ? 2 : -2)} L${x + 4},${y}`;
    return `<path d="${d}" class="tthin"/>`;
  }
  /* the next note on string s after event e, if it comes when this one's slide ends */
  nextOn(e, s, tEnd, fret){
    const evs = this.evs;
    for (let i = evs.indexOf(e) + 1; i < evs.length && evs[i].t <= tEnd + 0.25; i++){
      const m = evs[i].notes.find((n) => n.s === s);
      if (m) return m.f === fret ? evs[i] : null;              // the next note on the string, if it is the slide's target
    }
    return null;
  }

  /* the box over the notes being played, and the view following it */
  follow(){
    if (!this.on || !this.evs.length) return;
    const cur = $("tabcur");
    if (!cur) return;
    const t = chartTime(), evs = this.evs;

    /* the line: where this moment falls in its bar, sliding between the notes */
    const b = this.barAt(t);
    if (!b || t < this.bars[0].t0 || b.row === undefined){ cur.style.display = "none"; }
    else {
      const row = this.rows[b.row], x = tabXAt(b, Math.min(t, b.t1));
      cur.style.display = "block";
      cur.style.height = (row.staffBot - row.staffTop + 20) + "px";
      cur.style.transform = `translate(${x.toFixed(1)}px, ${Math.round(row.top + row.staffTop - 10)}px)`;
      if (b.row !== this.curRow){
        this.curRow = b.row;
        if (performance.now() > this.holdUntil){
          const view = $("tabview");
          const want = row.top - view.clientHeight*0.22;
          view.scrollTo({ top: Math.max(0, want), behavior: Math.abs(view.scrollTop - want) > view.clientHeight*2 ? "auto" : "smooth" });
        }
      }
    }

    /* the marks: every moment that is sounding now */
    const now = new Set();
    for (let k = lowerBound(evs, "t", t + 0.005) - 1; k >= 0 && evs[k].t > t - this.maxLen - 0.01; k--){
      if (evs[k].end > t) now.add(k);
    }
    for (const k of this.lit) if (!now.has(k) && this.groups[k]) this.groups[k].classList.remove("on");
    for (const k of now) if (!this.lit.has(k) && this.groups[k]) this.groups[k].classList.add("on");
    this.lit = now;
  }

  set(on){
    this.on = !!on;
    S.tabView = this.on;
    $("stage").classList.toggle("tabmode", this.on);
    $("bTab").classList.toggle("on", this.on);
    if (this.on){
      if (this.dirty || Math.abs($("tabview").clientWidth - this.width) > 2) this.build();
      this.curEv = -1; this.curRow = -1; this.holdUntil = 0;
      this.follow();
    } else {
      resize();
    }
  }
  invalidate(){
    this.dirty = true;
    if (this.on) this.set(true);
  }


  listen(){
    const view = $("tabview");
    /* reading ahead: the view stops following for a few seconds after a manual scroll */
    const hold = () => { this.holdUntil = performance.now() + 5000; };
    view.addEventListener("wheel", hold, { passive: true });
    view.addEventListener("touchmove", hold, { passive: true });
    view.addEventListener("keydown", (e) => { if (/Page|Arrow|Home|End/.test(e.key)) hold(); });
    /* click: play from there */
    view.addEventListener("click", (e) => {
      const svg = e.target.closest && e.target.closest("svg.tabrow");
      if (!svg) return;
      const row = this.rows[+svg.dataset.row];
      const r = svg.getBoundingClientRect(), x = e.clientX - r.left;
      const b = row.bars.find((q) => x >= q.x0 && x < q.x1) || (x < row.bars[0].x0 ? row.bars[0] : row.bars[row.bars.length - 1]);
      let t = b.t0;
      const K = b.knots;
      for (let k = 1; k < K.length; k++){
        if (x <= K[k][1]){ const [t0, x0] = K[k-1], [t1, x1] = K[k]; t = x1 > x0 ? t0 + (t1 - t0)*(x - x0)/(x1 - x0) : t1; break; }
        t = K[k][0];
      }
      /* land on the note clicked, not just before it */
      const i = lowerBound(this.evs, "t", t - 0.15);
      if (i < this.evs.length && Math.abs(this.evs[i].x - x) < 10 && this.evs[i].row === row.idx) t = this.evs[i].t;
      this.holdUntil = 0;
      seek(Math.max(0, t - 0.05 + S.offMs/1000));
    });
    let tm = 0;
    window.addEventListener("resize", () => { clearTimeout(tm); tm = setTimeout(() => { if (this.on) this.set(true); else this.dirty = true; }, 150); });
    $("bTab").onclick = () => { this.set(!this.on); savePrefs(); };
  }
}
const tabView = new TabView();
