"use strict";
/* ── camera ──────────────────────────────────────────────────────────────────
   Measured off the reference captures (1125 px tall, 50° vertical FOV):
     - one fret is 0.164·H wide when a 4-fret anchor is framed, 0.067·H when
       the upcoming anchors span 14 frets
     - the camera sits ~24° above the neck and ~6.5° to its right, and looks
       down the highway rather than at the neck, so the fretboard lands in the
       lower third of the view and the vanishing point right of centre       */
const CAM_EASE = 0.85;              // camera spring stiffness, 1/s - lower is lazier (x the Camera speed option)
const LOOK_BACK = 1.5;              // seconds of anchors just played that stay in frame
const FOV = 50*Math.PI/180, CAM_ELEV = 24*Math.PI/180, CAM_YAW = 6.5*Math.PI/180;

function makeCam(W, H, cFret, span, nStr, zoom){
  const k = (H/2)/Math.tan(FOV/2);
  let ppf = 0.164*H*Math.pow(4/span, 0.72);       // pixels per fret at the hit plane
  ppf = Math.min(ppf, 0.60*W/span) * zoom;
  const d = k*FW/ppf;                              // distance camera -> neck
  const pitch = (10*Math.PI/180)*Math.pow(4/span, 0.45);
  const sy = Math.sin(CAM_YAW), cy = Math.cos(CAM_YAW);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const ce = Math.cos(CAM_ELEV), se = Math.sin(CAM_ELEV);
  return {
    px: fretX(cFret) + d*ce*sy,
    py: YLO + (nStr-1)*PITCH/2 + d*se,
    pz: d*ce*cy,
    fx: -sy*cp, fy: -sp,  fz: -cy*cp,              // forward
    rx:  cy,    ry: 0,    rz: -sy,                 // right
    ux: -sy*sp, uy: cp,   uz: -cy*sp,              // up
    k, cx: W/2, cy: H*0.48, ppf,
  };
}

function project(cam, x, y, z){
  const dx = x - cam.px, dy = y - cam.py, dz = z - cam.pz;
  const zc = dx*cam.fx + dy*cam.fy + dz*cam.fz;
  if (zc < 0.03) return null;
  const s = cam.k / zc;
  /* left-handed: the scene is mirrored left to right, here and nowhere else -
     every line, head and frame follows. Writing must not be mirrored: see
     neckAxes and chordName. */
  return { x: cam.cx + (S.lefty ? -1 : 1)*(dx*cam.rx + dy*cam.ry + dz*cam.rz)*s,
           y: cam.cy - (dx*cam.ux + dy*cam.uy + dz*cam.uz)*s, s };
}

