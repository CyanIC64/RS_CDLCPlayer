"use strict";
/* ═══════════════════════════════════════════════════════════════════════════
   Play Song - a 3-D note highway, drawn with Canvas2D.

   The scene is laid out like this:

     X = fret axis    every fret is the same width, FW
     Y = height       the floor of the highway is y = 0; the strings are stacked
                      above it at the hit plane, low E on top (at the bottom
                      with the Invert strings option)
     Z = time axis    0 at the hit plane (the fretboard), negative into the screen

     - the fretboard stands at z = 0: coloured strings, copper frets, inlay
       dots, and the fret numbers below it
     - the highway is the floor behind it. Only the frets of the active
       *anchor* are lit as blue lanes; every other fret is a thin teal line
     - a note flies at the height of its string, on a stem that drops to a pad
       on the floor, with its fret number printed in front of the pad
     - a chord is a cyan frame across the whole anchor; repeats of the same
       chord are a low frame without noteheads
     - the camera sits above and slightly to the right of the neck, follows
       the anchors and pulls back when the upcoming anchors spread out

   Each playing technique has its own notehead and tail shape.
   ═══════════════════════════════════════════════════════════════════════════ */

/* string colours, low E first - red, yellow, blue, orange, green, purple */
const LANE = ["#ff2b2b","#ffd21f","#1e9bff","#ff8a1e","#3ee83e","#d030ff"];
const FONT = "'Century Gothic','Futura','Tw Cen MT','Trebuchet MS','Segoe UI',sans-serif";

const FW = 0.0855;                 // width of one fret, world units
const PITCH = FW*0.31;             // distance between two strings
const YLO = FW*0.22;               // height of the lowest string above the floor
const NECK_END = FW*24;
const SCROLL_BASE = 1.5;           // world units per second at note speed 100 %
const ZFAR = 6.2;                  // how far down the highway a note appears
const LOOK = 12.0;                  // seconds of anchors the camera frames ahead
const REPEAT_GAP = 3.0;            // a repeated note this soon carries no fret number
const INLAY = new Set([3,5,7,9,12,15,17,19,21,24]);

const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const lerp  = (a,b,t) => a + (b-a)*t;
const sstep = (u) => { u = clamp(u, 0, 1); return u*u*(3 - 2*u); };

const fretX   = (f) => f*FW;                 // x of fret wire f (0 = the nut)
const fretMid = (f) => (f - 0.5)*FW;         // middle of the space a fretted note is played in

/* colour helpers (all take #rrggbb) */
const _cc = new Map();
function rgb(hex){
  let v = _cc.get(hex);
  if (!v){ const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _cc.set(hex, v); }
  return v;
}
function rgba(hex, a){ const c = rgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }
function shade(hex, k){                       // k < 1 darkens
  const c = rgb(hex);
  return "rgb(" + Math.round(c[0]*k) + "," + Math.round(c[1]*k) + "," + Math.round(c[2]*k) + ")";
}
function tint(hex, k){                        // mix toward white
  const c = rgb(hex);
  return "rgb(" + Math.round(c[0] + (255-c[0])*k) + "," + Math.round(c[1] + (255-c[1])*k) + ","
                + Math.round(c[2] + (255-c[2])*k) + ")";
}

/* first index whose key is >= v, in an array sorted by that key */
function lowerBound(arr, key, v){
  let lo = 0, hi = arr.length;
  while (lo < hi){ const m = (lo + hi) >> 1; if (arr[m][key] < v) lo = m + 1; else hi = m; }
  return lo;
}

/* ── state ───────────────────────────────────────────────────────────────── */
const S = {
  meta:{}, arrs:[], arrIdx:0, beats:[], sections:[], stems:[],
  all:[], chords:[], anchors:[], hands:[], phrases:[], phReal:false,
  capo:0, nStr:6, maxSus:0, fMin:1, fMax:12,
  duration:0, time:0, playing:false, loop:false, muted:false, offMs:0,
  master:1.0, clickLevel:0.4, clickOn:false, rate:1, vis:1, visTo:1, resting:false, synthOn:false, synthLevel:0.6, syn:[],
  speed:2.0, zoom:1.0, showCells:true, showNums:true, showLabels:true, autoPan:true,
  showFingers:true, invert:false, lefty:false, tabView:false, showChord:true, showDiagram:true, showHit:false, camRate:0.5, holds:[], hits:[],
  lyrics:[], lyrPairs:[], showLyrics:true,
  inOn:false, inDevice:"",                        // guitar input: switched on last time, and which input
  inScore:true, inLatMs:60,                       // check notes against the chart; input + output latency (ms)
  ampOn:false, ampLevel:0.7,                      // play the guitar through the song's tone, and how loud
  camC:null, camS:4, camCv:0, camSv:0,
  fx:true, rscale:1, autoScale:false, dynScale:1, tones:{base:"", changes:[], names:{}},
  fps:0, bpm:0, loopA:0, loopB:0,
};

/* live geometry: "note speed" stretches the time axis. The far end of the
   highway stays where it is, so a faster highway shows less time ahead -
   which is what a note-speed setting is for. */
const G = { sc: SCROLL_BASE, hor: ZFAR/SCROLL_BASE };
function updGeom(){
  G.sc = SCROLL_BASE * S.speed;
  G.hor = ZFAR / G.sc;
  const txt = Math.round(S.speed*100) + "%";
  document.getElementById("hudSpd").textContent = txt;
  document.getElementById("rvSpeed").textContent = txt;
}

