// The pedalboard: the tone's amp head with its cabinet, and a row of stompboxes
// before the amp and another in its effects loop - knobs to turn, footswitches,
// drag to reorder, "+" to add a pedal. The look and the knob follow JS Rocks
// (github.com/vitaliy-bobrov/js-rocks, MIT, (c) Vitaliy Bobrov), rewritten
// here without Angular.
//
// The page owns the board (an object of src/amp/catalog.js) and the sound;
// this panel changes the board in place and says what changed:
//   onKnob(id, param, value)   a knob ("amp" for the amp head) - turn it in place
//   onToggle(id, on)           a footswitch
//   onChange(board)            a pedal added, removed or moved, another cabinet - rebuild
//   onMaster(value)            the master volume (the page's amp volume)
//   onPick(key)                a tone picked on the tone bar ("" = follow the song)
//   onReset(), onClose()

import { FX, MODELS, GROUPS, CABS, AMP_KNOBS, AMP_PARAMS, VOICES, MICS, LIBRARY, makePedal, paramsOf, faceOf } from "./catalog.js";

const CSS = `
#pbRig{position:fixed;left:50%;top:6%;transform:translateX(-50%);width:min(1020px,calc(100vw - 16px));
  max-height:88vh;overflow:auto;background:#101317f5;border:1px solid #2b3138;border-radius:10px;
  box-shadow:0 14px 40px #000c;padding:12px 16px 14px;display:none;z-index:36;color:#dfe7ef;
  font:13px "Segoe UI",system-ui,sans-serif;user-select:none;-webkit-user-select:none}
#pbRig.show{display:block}
#pbRig .pb-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;color:#8b97a3;
  font-size:11px;letter-spacing:.09em;text-transform:uppercase}
#pbRig .pb-tone{text-transform:none;letter-spacing:0;color:#c3cdd7;font-size:13px}
#pbRig .pb-edit{display:none;padding:1px 6px;border:1px solid #d8a24a;color:#d8a24a;border-radius:3px;font-size:10px}
#pbRig.edited .pb-edit{display:inline-block}
#pbRig .pb-sp{flex:1}
#pbRig button.pb-btn{background:#171b20;border:1px solid #2b3138;color:#c3cdd7;border-radius:4px;padding:3px 10px;
  font:12px inherit;cursor:pointer;text-transform:none;letter-spacing:0}
#pbRig button.pb-btn:hover{border-color:#4a5560;color:#fff}
#pbRig button.pb-btn:disabled{opacity:.4;cursor:default}
#pbRig .pb-x{background:none;border:0;color:#8b97a3;font-size:22px;line-height:1;cursor:pointer;padding:0 2px}
#pbRig .pb-x:hover{color:#fff}
#pbRig .pb-off{color:#e0a43f;font-size:12px;text-transform:none;letter-spacing:0}

/* the song's tones */
#pbRig .pb-tones{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 12px}
#pbRig .pb-tcount{color:#6f7c89;font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-right:2px}
#pbRig .pb-tab{display:flex;align-items:center;gap:6px;background:#14181d;border:1px solid #2b3138;color:#c3cdd7;
  border-radius:14px;padding:3px 10px;font:12px "Segoe UI",system-ui,sans-serif;cursor:pointer}
#pbRig .pb-tab:hover{border-color:#4a5560;color:#fff}
#pbRig .pb-tab.cur{background:#1b2533;border-color:#3f8ce0;color:#fff}
#pbRig .pb-tab.live{box-shadow:inset 0 -2px 0 #3fbf6f}
#pbRig .pb-tab small{color:#6f7c89;font-size:10px}
#pbRig .pb-tab em{font-style:normal;color:#d8a24a;font-size:10px}
#pbRig .pb-kind{width:8px;height:8px;border-radius:50%;background:#6f7c89;flex:none}
#pbRig .pb-kind.clean{background:#3f8ce0} #pbRig .pb-kind.crunch{background:#e0a43f} #pbRig .pb-kind.distortion{background:#e0453f}

/* the amp head: tolex, a gold plate, chicken-head knobs */
#pbRig .pb-amp{border-radius:10px;border:3px solid #050505;padding:10px 14px 12px;margin-bottom:14px;
  background:repeating-linear-gradient(45deg,#1d1d1d 0 2px,#191919 2px 4px);box-shadow:0 8px 20px #0009,inset 0 1px 0 #ffffff14}
#pbRig .pb-amp.bass .pb-plate{background:linear-gradient(#b9c0c7,#8d969f)}
#pbRig .pb-amptop{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin-bottom:8px}
#pbRig .pb-brand{font:italic 700 24px Georgia,"Times New Roman",serif;color:#efe6cf;text-shadow:0 2px 0 #000;letter-spacing:.02em}
#pbRig .pb-brand small{font:600 10px "Segoe UI",system-ui,sans-serif;color:#8b8578;letter-spacing:.12em;margin-left:8px;
  text-transform:uppercase;font-style:normal}
#pbRig .pb-real{font:600 11px "Segoe UI",system-ui,sans-serif;color:#b8ae95;font-style:normal;letter-spacing:.02em;text-shadow:none;margin-top:2px}
#pbRig .pb-sels{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:flex-end}
#pbRig .pb-cab{display:flex;align-items:center;gap:6px;color:#8b8578;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
#pbRig .pb-cab select{background:#0c0c0c;color:#efe6cf;border:1px solid #3a3a3a;border-radius:4px;padding:3px 6px;font:12px inherit}
#pbRig .pb-plate{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;padding:10px 14px 8px;border-radius:6px;
  background:linear-gradient(#e0cd93,#b39a56);box-shadow:inset 0 1px 0 #fff8,inset 0 -2px 0 #0003;color:#2a2416}
#pbRig .pb-plate .pb-sep{width:1px;align-self:stretch;background:#0002;margin:0 2px}
#pbRig .pb-plate .pb-sw{margin-left:auto;display:flex;flex-direction:column;align-items:center;gap:6px}
#pbRig .pb-toggle{width:20px;height:34px;border-radius:4px;background:linear-gradient(#2a2a2a,#0d0d0d);border:1px solid #000;
  position:relative;cursor:pointer;padding:0}
#pbRig .pb-toggle::after{content:"";position:absolute;left:4px;right:4px;height:14px;border-radius:2px;top:16px;
  background:linear-gradient(#f2f2f2,#9a9a9a);transition:top .12s}
#pbRig .pb-toggle.on::after{top:2px}

/* the cabinet: a grille with its speakers */
#pbRig .pb-cabinet{display:flex;align-items:center;gap:16px;border-radius:10px;border:3px solid #050505;padding:10px 14px;
  margin-bottom:14px;background:repeating-linear-gradient(45deg,#1d1d1d 0 2px,#191919 2px 4px);box-shadow:0 8px 20px #0009;
  transition:filter .15s}
#pbRig .pb-cabinet.off{filter:brightness(.6) saturate(.5)}
#pbRig .pb-grille{display:grid;gap:6px;padding:8px;border-radius:6px;flex:none;
  background:repeating-linear-gradient(0deg,#2a2622 0 2px,#1c1a17 2px 4px);box-shadow:inset 0 0 0 2px #000,inset 0 0 12px #000a}
#pbRig .pb-grille[data-n="1"]{grid-template-columns:44px}
#pbRig .pb-grille[data-n="2"]{grid-template-columns:repeat(2,36px)}
#pbRig .pb-grille[data-n="4"]{grid-template-columns:repeat(2,30px)}
#pbRig .pb-grille[data-n="0"]{width:56px;height:44px;display:flex;align-items:center;justify-content:center}
#pbRig .pb-spk{display:block;aspect-ratio:1;border-radius:50%;
  background:radial-gradient(circle,#555 0 14%,#1a1a1a 16% 44%,#2c2c2c 46% 64%,#111 66%);box-shadow:0 0 0 1px #000}
#pbRig .pb-di{font:800 13px "Segoe UI",system-ui,sans-serif;color:#8b8578;letter-spacing:.1em}
#pbRig .pb-cabside{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
#pbRig .pb-cabname{font:700 15px "Segoe UI",system-ui,sans-serif;color:#efe6cf}
#pbRig .pb-sels.pb-left{margin-left:0;justify-content:flex-start}
#pbRig .pb-cabinet .pb-sw{display:flex;flex-direction:column;align-items:center;gap:6px}

/* rows of stompboxes, and the section headings (Rocksmith's tone designer) */
#pbRig .pb-lab{display:flex;align-items:baseline;gap:8px;color:#6f7c89;font-size:11px;margin:4px 0 6px}
#pbRig .pb-lab b{color:#5fb3ff;font:800 13px "Segoe UI",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}
#pbRig .pb-lab span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
#pbRig .pb-lab::after{content:"";flex:1;height:1px;background:#232930}
#pbRig .pb-row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;min-height:60px;padding:6px 4px 12px;
  border-radius:8px;transition:background .12s}
#pbRig .pb-row.over{background:#1b2533}
#pbRig .pb-empty{color:#6f7c89;font-size:12px;align-self:center}
#pbRig .pb-add{width:44px;height:44px;border-radius:50%;align-self:center;border:1px dashed #4a5560;background:#13171c;
  color:#c3cdd7;font-size:24px;line-height:1;cursor:pointer}
#pbRig .pb-add:hover{border-color:#3f8ce0;color:#fff}

#pbRig .pb-box{--c:#3f9a54;position:relative;width:122px;min-height:184px;border-radius:10px;padding:16px 8px 10px;
  display:flex;flex-direction:column;align-items:center;gap:6px;cursor:grab;
  background:linear-gradient(165deg,color-mix(in srgb,var(--c),#fff 16%),var(--c) 45%,color-mix(in srgb,var(--c),#000 28%));
  box-shadow:inset 0 1px 0 #fff5,inset 0 -3px 0 #0005,0 6px 14px #000a;color:#f5f5f5;transition:filter .15s,opacity .15s}
#pbRig .pb-box.light{color:#1b1f24}
#pbRig .pb-box.off{filter:saturate(.55) brightness(.75)}
#pbRig .pb-box.lift{z-index:5;cursor:grabbing;transition:none;box-shadow:inset 0 1px 0 #fff5,inset 0 -3px 0 #0005,0 16px 30px #000d}
#pbRig .pb-box{touch-action:none}
#pbRig .pb-box::before,#pbRig .pb-box::after{content:"";position:absolute;top:30px;width:6px;height:16px;background:#111;
  border-radius:2px;box-shadow:inset 0 0 0 2px #444}
#pbRig .pb-box::before{left:-6px} #pbRig .pb-box::after{right:-6px}
#pbRig .pb-knobs{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 6px;min-height:58px}
#pbRig .pb-name{font:800 12px "Segoe UI",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-align:center;
  line-height:1.15;margin-top:2px}
#pbRig .pb-gear{font-size:9px;opacity:.7;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pbRig .pb-led{width:8px;height:8px;border-radius:50%;background:#4a1212;box-shadow:inset 0 1px 1px #0008}
#pbRig .pb-led.on{background:#ff3b30;box-shadow:0 0 8px 2px #ff3b3099,inset 0 -1px 1px #0004}
#pbRig .pb-plate .pb-led.on{background:#ff5a1f}
#pbRig .pb-foot{margin-top:auto;width:38px;height:38px;border-radius:50%;border:2px solid #222;cursor:pointer;padding:0;
  background:radial-gradient(circle at 35% 30%,#fafafa,#a9adb2 45%,#5d6369 80%);box-shadow:0 3px 0 #0007}
#pbRig .pb-foot:active{transform:translateY(2px);box-shadow:0 1px 0 #0007}
#pbRig .pb-rm{position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;border:0;padding:0;
  background:#000a;color:#fff;font-size:13px;line-height:18px;cursor:pointer;opacity:0;transition:opacity .12s}
#pbRig .pb-box:hover .pb-rm,#pbRig .pb-rm:focus{opacity:1}

/* knobs (JS Rocks' knob: turned by the angle around its centre) */
#pbRig .pb-knob{--a:0deg;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;outline:none;position:relative}
#pbRig .pb-knob label{padding:0 2px}
#pbRig .pb-dial{width:32px;height:32px;border-radius:50%;cursor:pointer;position:relative;touch-action:none;
  background:radial-gradient(circle at 40% 35%,#4a4f55,#141618 70%);box-shadow:0 2px 3px #000a,inset 0 1px 0 #fff3}
#pbRig .pb-dial i{position:absolute;left:50%;top:3px;width:3px;height:11px;margin-left:-1.5px;border-radius:2px;
  background:#f2f2f2;transform-origin:50% 13px;transform:rotate(var(--a))}
#pbRig .pb-knob label{font:700 8.5px "Segoe UI",system-ui,sans-serif;letter-spacing:.05em;white-space:nowrap;pointer-events:none}
#pbRig .pb-knob:focus-visible .pb-dial{box-shadow:0 0 0 2px #3f8ce0,0 2px 3px #000a}
#pbRig .pb-knob .pb-val{position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:#000d;color:#fff;
  font:600 10px "Cascadia Mono",Consolas,monospace;padding:1px 5px;border-radius:3px;white-space:nowrap;display:none;z-index:2}
#pbRig .pb-knob.busy .pb-val,#pbRig .pb-knob:focus-visible .pb-val{display:block}
#pbRig .pb-plate .pb-knob{width:58px}
#pbRig .pb-plate .pb-dial{width:40px;height:40px;background:radial-gradient(circle at 40% 35%,#3b3b3b,#0b0b0b 70%)}
#pbRig .pb-plate .pb-dial i{height:15px;transform-origin:50% 17px;background:#efe6cf}
#pbRig .pb-plate .pb-knob label{font-size:9.5px}

/* the "+" menu */
#pbMenu{position:fixed;z-index:37;background:#14181d;border:1px solid #2b3138;border-radius:6px;box-shadow:0 10px 26px #000c;
  padding:6px;display:none;max-height:60vh;overflow:auto;min-width:180px;font:13px "Segoe UI",system-ui,sans-serif}
#pbMenu.show{display:block}
#pbMenu h5{margin:6px 6px 2px;color:#6f7c89;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
#pbMenu button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:0;color:#dfe7ef;
  padding:5px 8px;border-radius:4px;cursor:pointer;font:13px inherit}
#pbMenu button:hover,#pbMenu button:focus{background:#1b2533;outline:none}
#pbMenu button i{width:12px;height:12px;border-radius:3px;flex:none}
#pbRig .pb-hint{color:#6f7c89;font-size:11px;margin-top:2px}
#pbMenu button.pb-realgear{font-size:12px;padding:3px 8px 3px 14px;color:#c3cdd7}
#pbMenu button.pb-realgear small{margin-left:auto;padding-left:10px;color:#6f7c89;font-size:10px;white-space:nowrap}

/* ── real gear: faders, switches, a treadle ─────────────────────────────── */
#pbRig .pb-sliders{display:flex;gap:1px;align-items:flex-end}
#pbRig .pb-box:not(.look-rack):has(.pb-sliders){width:auto;min-width:118px}
#pbRig .pb-box .pb-knobs:has(.pb-sliders){flex-direction:column;align-items:center}
#pbRig .pb-slider{width:24px;min-width:0}
#pbRig .pb-slider .pb-dial,#pbRig .pb-treadle .pb-dial{border-radius:3px;cursor:ns-resize}
#pbRig .pb-slider .pb-dial{width:8px;height:70px;background:linear-gradient(90deg,#000,#2a2a2a 50%,#000);box-shadow:inset 0 0 0 1px #000,0 0 0 1px #fff2}
#pbRig .pb-slider .pb-dial i{display:none}
#pbRig .pb-slider .pb-dial b{position:absolute;left:-6px;right:-6px;height:12px;bottom:calc(var(--p) - 6px);border-radius:2px;
  background:linear-gradient(#f4f4f4,#9fa3a8 45%,#666 55%,#d6d6d6);box-shadow:0 2px 3px #000a}
#pbRig .pb-slider label{font-size:8px}
#pbRig .pb-switch{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:30px}
#pbRig .pb-switch label{font:700 8.5px "Segoe UI",system-ui,sans-serif;letter-spacing:.05em;white-space:nowrap}
#pbRig .pb-pos{font:700 8px "Segoe UI",system-ui,sans-serif;opacity:.8;min-height:10px}
#pbRig .pb-lever{--i:0;position:relative;width:16px;height:30px;padding:0;border-radius:3px;cursor:pointer;
  background:linear-gradient(#111,#2a2a2a);border:1px solid #000;box-shadow:inset 0 1px 0 #fff2}
#pbRig .pb-lever i{position:absolute;left:3px;width:8px;height:12px;top:calc(15px - var(--i) * 12px);border-radius:3px;transition:top .1s,left .1s;
  background:linear-gradient(90deg,#8d9196,#f2f2f2 45%,#8d9196)}
#pbRig .pb-lever[data-n="3"],#pbRig .pb-lever[data-n="4"]{width:calc(var(--n, 4) * 12px + 6px);height:16px}
#pbRig .pb-lever[data-n="3"]{--n:3}
#pbRig .pb-lever[data-n="3"] i,#pbRig .pb-lever[data-n="4"] i{top:2px;left:calc(2px + var(--i) * 12px);width:10px;height:10px}
#pbRig .pb-treadle{width:84px;min-width:0}
#pbRig .pb-treadle .pb-dial{width:78px;height:108px;border-radius:8px 8px 4px 4px;
  background:repeating-linear-gradient(0deg,#1c1c1c 0 5px,#0d0d0d 5px 8px);box-shadow:0 6px 10px #000c,inset 0 0 0 2px #000;
  transform:perspective(260px) rotateX(calc(var(--a) * -0.1));transition:transform .05s}
#pbRig .pb-treadle .pb-dial i,#pbRig .pb-treadle .pb-dial b{display:none}
#pbRig .pb-knob.pb-s{width:40px} #pbRig .pb-knob.pb-s .pb-dial{width:24px;height:24px}
#pbRig .pb-knob.pb-s .pb-dial i{height:8px;transform-origin:50% 9px}
#pbRig .pb-knob.pb-l .pb-dial{width:42px;height:42px} #pbRig .pb-knob.pb-l .pb-dial i{height:15px;transform-origin:50% 18px}

/* ── knob styles ──────────────────────────────────────────────────────── */
#pbRig .ks-boss .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{background:radial-gradient(circle,#4a4a4a 0 36%,#121212 40%,#050505 70%);box-shadow:0 0 0 2px #0008,0 3px 4px #000a}
#pbRig .ks-mxr .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{width:26px;height:26px;background:radial-gradient(circle at 40% 35%,#333,#000 70%)}
#pbRig .ks-mxr .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i{height:9px;transform-origin:50% 10px}
#pbRig .ks-chrome .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{background:radial-gradient(circle at 38% 32%,#fff,#c3c6ca 35%,#7c8086 75%);box-shadow:0 2px 4px #000b}
#pbRig .ks-chrome .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i{background:#111}
#pbRig .ks-gold .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{background:radial-gradient(circle at 40% 35%,#fff0b8,#d5b25a 40%,#8a6a22 80%);box-shadow:0 0 0 3px #111,0 3px 4px #000a}
#pbRig .ks-gold .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i{background:#2a2416}
#pbRig .ks-skirt .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{background:radial-gradient(circle,#d6d6d6 0 26%,#9a9a9a 29%,#151515 32% 70%,#2c2c2c 72%);
  box-shadow:0 0 0 4px #0c0c0c,0 0 0 5px #444,0 3px 4px #000a}
#pbRig .ks-fluted .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{background:repeating-conic-gradient(#1a1a1a 0 8deg,#050505 8deg 16deg);box-shadow:0 0 0 1px #000,0 3px 4px #000a}
#pbRig .ks-rack .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{width:26px;height:26px;background:radial-gradient(circle at 40% 35%,#8d9196,#3b3e42 70%)}
#pbRig .ks-rack .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i{height:9px;transform-origin:50% 10px}
/* chicken heads: a long pointer over a small round base */
#pbRig .ks-chicken .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial,#pbRig .ks-cream .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial,
#pbRig .ks-pointer .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial{background:radial-gradient(circle,#1a1a1a 0 46%,transparent 48%);box-shadow:none}
#pbRig .ks-chicken .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i,#pbRig .ks-cream .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i,
#pbRig .ks-pointer .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i{top:0;height:32px;width:12px;margin-left:-6px;transform-origin:50% 50%;
  border-radius:50% 50% 30% 30% / 70% 70% 30% 30%;background:linear-gradient(90deg,#000,#2a2a2a 50%,#000);box-shadow:0 2px 3px #000a}
#pbRig .ks-cream .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i,#pbRig .theme-vox .pb-dial i{background:linear-gradient(90deg,#b9ad8c,#f3ead2 50%,#b9ad8c)}
#pbRig .ks-pointer .pb-knob:not(.pb-slider):not(.pb-treadle) .pb-dial i{background:linear-gradient(90deg,#3a2414,#6a4428 50%,#3a2414)}
#pbRig .pb-plate .pb-knob.pb-slider{width:26px;min-width:0}

/* ── pedal enclosures ─────────────────────────────────────────────────── */
#pbRig .pb-box[class*="look-"] .pb-name{white-space:normal}
#pbRig .look-compact{width:118px;min-height:204px;padding-bottom:84px;border-radius:7px 7px 10px 10px}
#pbRig .look-compact .pb-foot{position:absolute;left:7px;right:7px;bottom:7px;width:auto;height:70px;border-radius:5px 5px 8px 8px;border:0;
  background:repeating-linear-gradient(0deg,#262626 0 3px,#151515 3px 6px);box-shadow:inset 0 1px 0 #fff2,0 3px 0 #0008}
#pbRig .look-compact .pb-name{font-size:11px}
#pbRig .look-mxr{width:104px;min-height:176px;border-radius:5px;background:linear-gradient(170deg,color-mix(in srgb,var(--c),#fff 10%),var(--c) 50%,color-mix(in srgb,var(--c),#000 18%))}
#pbRig .look-wide{width:178px;min-height:196px;border-radius:6px}
#pbRig .look-tall{width:136px;min-height:226px;border-radius:6px}
#pbRig .look-round{width:156px;height:156px;min-height:0;border-radius:50%;padding:22px 10px 8px;gap:2px}
#pbRig .look-round .pb-foot{width:30px;height:30px}
#pbRig .look-round .pb-gear{max-width:96px}
#pbRig .look-round::before,#pbRig .look-round::after{top:68px}
#pbRig .look-wedge{width:150px;min-height:180px;border-radius:4px;clip-path:polygon(9% 0,91% 0,100% 100%,0 100%);padding-top:20px}
#pbRig .look-wedge::before,#pbRig .look-wedge::after{display:none}
#pbRig .look-wah{width:120px;min-height:262px;border-radius:12px 12px 8px 8px;gap:4px;padding-top:10px}
#pbRig .look-wah .pb-foot{width:26px;height:26px}
#pbRig .pb-box.wood{border-left:9px solid #8a5a32;border-right:9px solid #8a5a32;
  border-image:repeating-linear-gradient(0deg,#8a5a32 0 6px,#a5703f 6px 10px,#7a4e2a 10px 14px) 9}
/* a rack unit, 19": as wide as the row lets it */
#pbRig .look-rack{flex:1 1 440px;width:auto;min-width:0;max-width:640px;min-height:78px;flex-direction:row;align-items:center;gap:10px;padding:6px 6px;border-radius:3px;
  background:linear-gradient(#34383d,#202326 60%,#1a1c1f);box-shadow:inset 0 1px 0 #fff2,inset 0 -2px 0 #0007,0 6px 14px #000a}
#pbRig .look-rack::before,#pbRig .look-rack::after{display:none}
#pbRig .look-rack .pb-knobs{min-height:0;flex-wrap:wrap;flex:1;min-width:0;justify-content:flex-start;align-items:flex-end}
#pbRig .pb-ear{width:16px;align-self:stretch;flex:none;border-radius:2px;
  background:radial-gradient(circle at 50% 22%,#0b0b0b 0 3px,transparent 4px),radial-gradient(circle at 50% 78%,#0b0b0b 0 3px,transparent 4px),linear-gradient(90deg,#55595e,#8a8e93 50%,#55595e)}
#pbRig .pb-rside{display:flex;flex-direction:column;gap:2px;width:120px;flex:none}
#pbRig .pb-rside .pb-name{text-align:left;font-size:11px}
#pbRig .pb-rside .pb-gear{max-width:120px}
#pbRig .pb-rsw{display:flex;flex-direction:column;align-items:center;gap:6px;flex:none}
#pbRig .look-rack .pb-foot{width:auto;height:auto;margin:0;padding:3px 6px;border-radius:3px;border:1px solid #000;
  background:linear-gradient(#4a4e53,#2a2d31);color:#d9dde2;font:700 8px "Segoe UI",system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 2px 0 #000}
#pbRig .look-rack .pb-rm{top:2px;right:22px}

/* ── amp panels ───────────────────────────────────────────────────────── */
#pbRig .pb-plate .pb-switch{color:inherit}
#pbRig .pb-outk{width:44px} #pbRig .pb-outk .pb-dial{width:26px;height:26px}
#pbRig .pb-outk .pb-dial i{height:9px;transform-origin:50% 10px} #pbRig .pb-outk label{color:#8b8578}
#pbRig .pb-plate.theme-blackface{background:linear-gradient(#1c1c1c,#0b0b0b);color:#d9d9d9;box-shadow:inset 0 2px 0 #9a9a9a,inset 0 -2px 0 #000}
#pbRig .pb-amp.theme-blackface{background:repeating-linear-gradient(45deg,#1b1b1b 0 2px,#151515 2px 4px)}
#pbRig .pb-plate.theme-tweed{background:linear-gradient(#e2e2dc,#a9aaa4);color:#2a1c10}
#pbRig .pb-amp.theme-tweed{background:repeating-linear-gradient(45deg,#cfae6c 0 3px,#a8854a 3px 5px,#bf9a5a 5px 7px)}
#pbRig .pb-amp.theme-tweed .pb-brand,#pbRig .pb-amp.theme-orange .pb-brand{color:#1d140b;text-shadow:0 1px 0 #fff6}
#pbRig .pb-amp.theme-tweed .pb-real,#pbRig .pb-amp.theme-orange .pb-real,#pbRig .pb-amp.theme-tweed .pb-cab,#pbRig .pb-amp.theme-orange .pb-cab,
#pbRig .pb-amp.theme-tweed .pb-brand small,#pbRig .pb-amp.theme-orange .pb-brand small{color:#3a2a16}
#pbRig .pb-plate.theme-silver{background:linear-gradient(#eef0f2,#a9adb2);color:#1b1b1b}
#pbRig .pb-plate.theme-vox{background:linear-gradient(#9a6a46,#5c3820);color:#f3ead2}
#pbRig .pb-amp.theme-vox{background:repeating-linear-gradient(45deg,#1a1a1a 0 3px,#101010 3px 6px),#111}
#pbRig .pb-plate.theme-mesa{background:linear-gradient(#141414,#050505);color:#e6e6e6;box-shadow:inset 0 0 0 2px #8a8e93}
#pbRig .pb-plate.theme-rect{background:repeating-linear-gradient(45deg,#4d5156 0 3px,#3a3d41 3px 6px),repeating-linear-gradient(-45deg,#0000 0 3px,#0003 3px 6px);
  color:#f2f2f2;text-shadow:0 1px 0 #000}
#pbRig .pb-plate.theme-orange{background:linear-gradient(#f1e9d6,#d9ccad);color:#1b1b1b}
#pbRig .pb-amp.theme-orange{background:repeating-linear-gradient(45deg,#f0832a 0 2px,#de7120 2px 4px)}
#pbRig .pb-plate.theme-jc{background:linear-gradient(#d8dbde,#9ea3a8);color:#1b1b1b}
#pbRig .pb-plate.theme-hiwatt{background:#0a0a0a;color:#f2f2f2;box-shadow:inset 0 0 0 1px #f2f2f2,inset 0 0 0 4px #0a0a0a,inset 0 0 0 5px #777}
#pbRig .pb-plate.theme-highgain{background:linear-gradient(#26282b,#141517);color:#dcdcdc;box-shadow:inset 0 2px 0 #b3262b}
#pbRig .pb-plate.theme-bass{background:linear-gradient(#c3ccd6,#8796a6);color:#0f1a2a}
#pbRig .pb-plate.theme-di{background:linear-gradient(#202326,#0d0e10);color:#e6e6e6}
`;

const ROWS = ["pre", "loop", "rack"];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function isLight(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return false;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}
function fmt(kn, v){
  if (kn.scale) return (clamp((v - kn.min) / (kn.max - kn.min), 0, 1) * kn.scale).toFixed(1);   // a real amp's 0..10
  if (kn.unit === "Hz") return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.?0+$/, "") + " kHz" : Math.round(v) + " Hz";
  const span = kn.max - kn.min;
  let s;
  if (!kn.unit && kn.min === 0 && kn.max === 1) s = (v * 10).toFixed(1);                  // 0..10, like the knob's dots
  else s = (span >= 100 ? Math.round(v) : Math.abs(v) < 10 && kn.step < 1 ? v.toFixed(1) : String(Math.round(v * 10) / 10));
  if (kn.min < 0 && v > 0) s = "+" + s;
  return s + (kn.unit ? (kn.unit.startsWith(":") ? kn.unit : " " + kn.unit) : "");
}

/* a knob: drag around it (the angle sets the value, -135°..135°), the wheel
   and the arrow keys step it, a double click puts it back. kind "slider" (a
   fader) and "treadle" (a wah's rocking pedal) are dragged up and down instead.
   kn.invert: the control goes up as the setting goes down (a SENSITIVITY on a threshold). */
function knob(kn, value, def, onInput, kind = "knob"){
  if (kn.invert){
    const flip = (x) => kn.max + kn.min - x;
    return knob({ ...kn, invert: false }, flip(value), flip(def), (x) => onInput(flip(x)), kind);
  }
  const START = -135, END = 135, lin = kind !== "knob";
  const root = el("div", "pb-knob" + (lin ? " pb-" + kind : "") + (kn.size ? " pb-" + kn.size : "")),
        dial = el("div", "pb-dial"), val = el("span", "pb-val");
  dial.appendChild(el("i"));
  if (lin) dial.appendChild(el("b"));
  root.append(val, dial, el("label", "", kn.label));
  root.tabIndex = 0;
  root.setAttribute("role", "slider");
  root.setAttribute("aria-label", kn.label);
  root.setAttribute("aria-valuemin", kn.min);
  root.setAttribute("aria-valuemax", kn.max);
  let v = value;
  /* where a value sits on the control (0..1), and back: linear, or log for a frequency */
  const toPc = kn.log ? (x) => clamp(Math.log(x / kn.min) / Math.log(kn.max / kn.min), 0, 1)
                      : (x) => clamp((x - kn.min) / (kn.max - kn.min), 0, 1);
  const fromPc = kn.log ? (t) => kn.min * Math.pow(kn.max / kn.min, clamp(t, 0, 1))
                        : (t) => kn.min + clamp(t, 0, 1) * (kn.max - kn.min);
  const paint = () => {
    const pc = toPc(v);
    root.style.setProperty("--a", Math.round(START + (END - START) * pc) + "deg");
    root.style.setProperty("--p", (pc * 100).toFixed(1) + "%");
    val.textContent = fmt(kn, v);
    root.setAttribute("aria-valuenow", v);
    root.setAttribute("aria-valuetext", val.textContent);
    root.title = `${kn.label}: ${val.textContent}`;
  };
  const put = (x) => {
    x = clamp(x, kn.min, kn.max);
    x = Math.round(x / kn.step) * kn.step;
    x = Math.round(x * 1000) / 1000;
    if (x === v) return;
    v = x; paint(); onInput(v);
  };
  const stepBig = Math.max(kn.step, (kn.max - kn.min) / 50);
  const nudge = (n) => put(kn.log ? fromPc(toPc(v) + n * 0.02) : v + n * stepBig);
  let cx = 0, cy = 0;
  dial.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = dial.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    dial.setPointerCapture(e.pointerId);
    root.classList.add("busy"); root.focus({ preventScroll: true });
  });
  dial.addEventListener("pointermove", (e) => {
    if (!dial.hasPointerCapture(e.pointerId)) return;
    if (lin){
      const r = dial.getBoundingClientRect();
      put(fromPc((r.bottom - e.clientY) / r.height));
      return;
    }
    const x = cx - e.clientX, y = cy - e.clientY;
    let deg = Math.round(Math.atan2(y, x) * 180 / Math.PI);
    if (deg < 0) deg += 360;
    deg -= 90;
    if (x > 0 && y <= 0) deg -= 360;
    deg = clamp(deg, START, END);
    put(fromPc((deg - START) / (END - START)));
  });
  const up = (e) => { if (dial.hasPointerCapture(e.pointerId)) dial.releasePointerCapture(e.pointerId); root.classList.remove("busy"); };
  dial.addEventListener("pointerup", up);
  dial.addEventListener("pointercancel", up);
  dial.addEventListener("dblclick", (e) => { e.stopPropagation(); put(def); });
  root.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); nudge(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  root.addEventListener("keydown", (e) => {
    const k = e.key;
    let d = 0;
    if (k === "ArrowUp" || k === "ArrowRight") d = 1;
    else if (k === "ArrowDown" || k === "ArrowLeft") d = -1;
    else if (k === "PageUp") d = 5;
    else if (k === "PageDown") d = -5;
    else if (k === "Home"){ e.preventDefault(); e.stopPropagation(); put(kn.min); return; }
    else if (k === "End"){ e.preventDefault(); e.stopPropagation(); put(kn.max); return; }
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    nudge(d);
  });
  paint();
  return root;
}

/* a switch with two or more positions (a BRIGHT, a RATIO): a click moves it on */
function lever(c, value, onInput){
  const opts = c.options || [];
  let i = opts.reduce((b, o, j) => (Math.abs(o[1] - value) < Math.abs(opts[b][1] - value) ? j : b), 0);
  const root = el("div", "pb-switch"), btn = el("button", "pb-lever"), pos = el("span", "pb-pos");
  btn.dataset.n = opts.length;
  btn.appendChild(el("i"));
  const paint = () => {
    btn.style.setProperty("--i", i);
    pos.textContent = opts[i] ? opts[i][0] : "";
    btn.title = `${c.label}: ${pos.textContent}`;
    btn.setAttribute("aria-label", btn.title);
  };
  btn.onclick = (e) => { e.stopPropagation(); i = (i + 1) % opts.length; paint(); onInput(opts[i][1]); };
  root.append(pos, btn, el("label", "", c.label));
  paint();
  return root;
}

/* a face's control as a knob's spec: the setting's own, with the control's label and range */
function specOf(c, base){
  const kn = { ...base, label: c.label };
  if (Number.isFinite(c.min)) kn.min = c.min;
  if (Number.isFinite(c.max)) kn.max = c.max;
  if (c.scale) kn.scale = c.scale;
  if (c.invert) kn.invert = true;
  if (c.size) kn.size = c.size;
  return kn;
}

/* the knobs a theme of amp has */
const AMP_KNOB = { blackface:"skirt", tweed:"pointer", plexi:"gold", silver:"gold", vox:"chicken", mesa:"mxr", rect:"chrome",
                   orange:"chicken", jc:"mxr", hiwatt:"mxr", highgain:"fluted", bass:"skirt", di:"mxr" };

/**
 * @param {object} cb  the callbacks (see the top of this file) and getMaster()
 */
export function mountBoard(cb){
  if (!document.getElementById("pbStyle")){
    const st = el("style"); st.id = "pbStyle"; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = el("div"); root.id = "pbRig"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Pedalboard");
  const menu = el("div"); menu.id = "pbMenu";
  document.body.append(root, menu);

  let board = null, info = {}, dragId = "";

  const notifyKnob = (id, k, v) => { if (cb.onKnob) cb.onKnob(id, k, v); };
  const changed = () => { if (cb.onChange) cb.onChange(board); render(); };
  const find = (id) => {
    for (const row of ROWS){ const i = board[row].findIndex((p) => p.id === id); if (i >= 0) return { row, i }; }
    return null;
  };

  function head(){
    const h = el("div", "pb-head");
    h.append(el("b", "", "Pedalboard"));
    const t = el("span", "pb-tone", info.title || "");
    h.append(t, el("span", "pb-edit", "edited"));
    if (info.note) h.append(el("span", "pb-off", info.note));
    h.append(el("span", "pb-sp"));
    const rs = el("button", "pb-btn", "Song's tone");
    rs.title = "Put the board back as the song's tone has it";
    rs.disabled = !info.edited;
    rs.onclick = () => { if (cb.onReset) cb.onReset(); };
    const x = el("button", "pb-x", "×"); x.title = "Close (P)"; x.setAttribute("aria-label", "Close");
    x.onclick = () => hide();
    h.append(rs, x);
    return h;
  }

  /* every tone of the song, of all its arrangements: pick one to see and change it */
  function tones(){
    const list = info.tones || [];
    if (!list.length) return null;
    const bar = el("div", "pb-tones");
    bar.appendChild(el("span", "pb-tcount", list.length === 1 ? "1 tone" : `${list.length} tones`));
    const follow = el("button", "pb-tab pb-follow" + (info.follow ? " cur" : ""), "▶ Follow the song");
    follow.title = "Show the tone in force as the song plays";
    follow.setAttribute("aria-pressed", !!info.follow);
    follow.onclick = () => { if (cb.onPick) cb.onPick(""); };
    bar.appendChild(follow);
    for (const t of list){
      const b = el("button", "pb-tab" + (t.key === info.key ? " cur" : "") + (t.inForce ? " live" : ""));
      const dot = el("i", "pb-kind " + (t.kind || ""));
      const name = el("span", "", t.label);
      b.append(dot, name);
      if (t.arrs && t.arrs.length) b.appendChild(el("small", "", t.arrs.join(", ")));
      if (t.edited) b.appendChild(el("em", "", "edited"));
      b.title = (t.inForce ? "In force now. " : "") + (t.raw || t.key);
      b.setAttribute("aria-pressed", t.key === info.key);
      b.onclick = () => { if (cb.onPick) cb.onPick(t.key); };
      bar.appendChild(b);
    }
    return bar;
  }

  /* a select (the amp's voice, the cabinet, the microphone): each builds the chain again */
  function pick(label, options, value, onPick, title){
    const l = el("label", "pb-cab", label), sel = el("select");
    for (const [id, name] of options){ const o = el("option", "", name); o.value = id; sel.appendChild(o); }
    sel.value = value;
    sel.onchange = () => { onPick(sel.value); changed(); };
    sel.addEventListener("keydown", (e) => e.stopPropagation());
    if (title) sel.title = title;
    l.appendChild(sel);
    return l;
  }

  /* the cabinet: its speakers drawn, which one, the microphone on it, on/off */
  function cabinet(){
    const id = CABS[board.cab] ? board.cab : (board.amp.bassAmp ? "bass" : "2x12");
    const box = el("div", "pb-cabinet" + (board.cabOn === false ? " off" : ""));
    const grille = el("div", "pb-grille");
    const n = id === "none" ? 0 : /^1x/.test(id) ? 1 : /^2x/.test(id) ? 2 : 4;
    grille.dataset.n = n;
    for (let i = 0; i < n; i++) grille.appendChild(el("i", "pb-spk"));
    if (!n) grille.appendChild(el("span", "pb-di", "DI"));
    const side = el("div", "pb-cabside");
    const title = el("div", "pb-cabname", CABS[id].name);
    if (board.cabReal || board.cabGear) title.appendChild(el("div", "pb-real", [board.cabReal, board.cabGear].filter(Boolean).join(" \u00b7 ")));
    const sels = el("div", "pb-sels pb-left");
    sels.append(
      pick("Cabinet", Object.entries(CABS).map(([k, c]) => [k, c.name]), id, (v) => { board.cab = v; }, "The speaker cabinet"),
      pick("Mic", [["", "none"], ...MICS.map((m) => [m, m.replace("_", " ").replace("OffAxis", "off axis")])], MICS.includes(board.mic) ? board.mic : "",
           (v) => { board.mic = v; }, "The microphone on the cabinet, and where it points"));
    const sw = el("div", "pb-sw"), on = board.cabOn !== false;
    const led = el("span", "pb-led" + (on ? " on" : "")), tg = el("button", "pb-toggle" + (on ? " on" : ""));
    tg.title = "Cabinet on / off"; tg.setAttribute("aria-label", "Cabinet on or off"); tg.setAttribute("aria-pressed", on);
    tg.onclick = () => {
      board.cabOn = board.cabOn === false;
      led.classList.toggle("on", board.cabOn); tg.classList.toggle("on", board.cabOn); tg.setAttribute("aria-pressed", board.cabOn);
      box.classList.toggle("off", !board.cabOn);
      if (cb.onToggle) cb.onToggle("cab", board.cabOn);
    };
    sw.append(led, tg);
    side.append(title, sels);
    box.append(grille, side, sw);
    return box;
  }

  /* the library's amp heads, for the Model select */
  const AMPS = Object.values(LIBRARY).filter((e) => e.type === "amp" && e.face)
    .sort((x, y) => String(x.real || x.name).localeCompare(String(y.real || y.name)));
  function useAmp(key){
    const a = board.amp, e = LIBRARY[key];
    if (!e){ return; }
    a.gear = e.key; a.name = e.name || a.name;
    if (e.real) a.real = e.real; else delete a.real;
    if (VOICES[e.voice]) a.voice = e.voice;
    a.bassAmp = !!e.bass || !!(VOICES[a.voice] && VOICES[a.voice].bass);
    if (CABS[e.cab]) board.cab = e.cab;
  }

  /* a section's heading, as Rocksmith's tone designer names it */
  const SECTION = {
    pre:  ["Pre", "pedals before the amp's distortion: gates, compressors, wahs, octavers, drives"],
    amp:  ["Amp", "the head: its voice, gain and EQ"],
    loop: ["Loop", "the amp's effects loop, after the preamp and before the cabinet: EQ, modulation, delay"],
    cab:  ["Cabinet", "the speakers and the microphone on them"],
    rack: ["Rack", "studio effects after the cabinet, in stereo: reverbs, delays, compressors, EQ"],
  };
  const lab = (k) => { const l = el("div", "pb-lab"); l.append(el("b", "", SECTION[k][0]), el("span", "", SECTION[k][1])); return l; };

  function amp(){
    const a = board.amp;
    const box = el("div", "pb-amp" + (a.bassAmp ? " bass" : "") + (faceOf(a.gear) ? " theme-" + faceOf(a.gear).theme : ""));
    const top = el("div", "pb-amptop");
    const brand = el("div", "pb-brand", a.name || "Amp");
    brand.appendChild(el("small", "", a.bassAmp ? "bass amp" : "amplifier"));
    if (a.real){ const r = el("div", "pb-real", a.real); r.title = a.gear ? `From the song's tone: ${a.gear}` : ""; brand.appendChild(r); }
    const sels = el("div", "pb-sels");
    sels.append(pick("Model", [["", "(the song's)"], ...AMPS.map((e) => [e.key, e.real ? `${e.real}` : e.name])], LIBRARY[a.gear] ? a.gear : "",
                     (k) => useAmp(k), "Put another amp head here (its face, voice and cabinet)"),
                pick("Voice", Object.entries(VOICES).map(([id, v]) => [id, v.name]), VOICES[a.voice] ? a.voice : "generic",
                     (v) => { a.voice = v; }, "What kind of amp this head is"));
    top.append(brand, sels);

    const face = faceOf(a.gear);
    const master = { k:"master", label:"MASTER", min:0, max:1, step:0.01 };
    const masterKnob = (spec) => knob(spec, cb.getMaster ? cb.getMaster() : 0.7, 0.7, (v) => { if (cb.onMaster) cb.onMaster(v); });
    const ampSet = (k, v) => { a[k] = v; notifyKnob("amp", k, v); };
    const plate = el("div", "pb-plate" + (face ? " theme-" + face.theme + " ks-" + (AMP_KNOB[face.theme] || "mxr") : ""));
    if (face){
      /* the real head's panel: its controls, in its order */
      const base = Object.fromEntries(AMP_PARAMS.map((kn) => [kn.k, kn]));
      const sliders = el("div", "pb-sliders");
      for (const c of face.controls){
        if (c.param === "master"){ plate.appendChild(masterKnob(specOf(c, master))); continue; }
        const b = base[c.param]; if (!b) continue;
        const v = Number.isFinite(a[c.param]) ? a[c.param] : b.def;
        if (c.type === "switch") plate.appendChild(lever(c, v, (x) => ampSet(c.param, x)));
        else if (c.type === "slider") sliders.appendChild(knob(specOf(c, b), v, b.def, (x) => ampSet(c.param, x), "slider"));
        else plate.appendChild(knob(specOf(c, b), v, b.def, (x) => ampSet(c.param, x)));
      }
      if (sliders.childNodes.length){ plate.appendChild(el("span", "pb-sep")); plate.appendChild(sliders); }
      /* a head with no master of its own still has the page's volume, off the panel */
      if (!face.controls.some((c) => c.param === "master")){
        const out = masterKnob({ ...master, label: "OUTPUT" }); out.classList.add("pb-outk");
        sels.prepend(out);
      }
    } else {
      plate.appendChild(masterKnob(master));
      plate.appendChild(el("span", "pb-sep"));
      for (const kn of AMP_KNOBS){
        plate.appendChild(knob(kn, Number.isFinite(a[kn.k]) ? a[kn.k] : kn.def, kn.def, (v) => ampSet(kn.k, v)));
      }
    }
    const sw = el("div", "pb-sw"), led = el("span", "pb-led" + (a.on !== false ? " on" : ""));
    const tg = el("button", "pb-toggle" + (a.on !== false ? " on" : ""));
    tg.title = "Amp on / off"; tg.setAttribute("aria-label", "Amp on or off"); tg.setAttribute("aria-pressed", a.on !== false);
    tg.onclick = () => {
      a.on = a.on === false;
      led.classList.toggle("on", a.on); tg.classList.toggle("on", a.on); tg.setAttribute("aria-pressed", a.on);
      if (cb.onToggle) cb.onToggle("amp", a.on);
    };
    sw.append(led, tg);
    plate.appendChild(sw);
    box.append(top, plate);
    return box;
  }

  function pedal(p){
    const m = MODELS[p.model];
    const face = faceOf(p.gear), look = face && face.look !== "head" ? face.look : "";
    const color = (look && face.color) || m.color;
    const box = el("div", "pb-box" + (look ? " look-" + look + " ks-" + (face.knob || "boss") : "") + (face && face.wood ? " wood" : "")
                       + (isLight(color) ? " light" : "") + (p.on === false ? " off" : ""));
    box.style.setProperty("--c", color);
    if (look && face.ink) box.style.color = face.ink;
    box.dataset.id = p.id;
    const led = el("span", "pb-led" + (p.on !== false ? " on" : ""));
    const kw = el("div", "pb-knobs");
    const base = Object.fromEntries(paramsOf(m.fx).map((kn) => [kn.k, kn]));
    const val = (kn) => { const def = m.params[kn.k] ?? kn.def; return [Number.isFinite(p.params[kn.k]) ? p.params[kn.k] : def, def]; };
    const put = (k) => (v) => { p.params[k] = v; notifyKnob(p.id, k, v); };
    let tread = null;
    if (look){
      /* the real pedal's controls: knobs, faders, switches, a treadle */
      const sliders = el("div", "pb-sliders");
      for (const c of face.controls){
        const b = base[c.param]; if (!b) continue;
        const [v, def] = val(b);
        if (c.type === "switch") kw.appendChild(lever(c, v, put(c.param)));
        else if (c.type === "slider") sliders.appendChild(knob(specOf(c, b), v, def, put(c.param), "slider"));
        else if (c.type === "treadle") tread = knob(specOf(c, b), v, def, put(c.param), "treadle");
        else kw.appendChild(knob(specOf(c, b), v, def, put(c.param)));
      }
      if (sliders.childNodes.length) kw.prepend(sliders);
    } else {
      for (const kn of FX[m.fx].knobs){ const [v, def] = val(kn); kw.appendChild(knob(kn, v, def, put(kn.k))); }
    }
    const name = el("div", "pb-name", look ? face.title || m.name : m.name);
    const real = (look && face.after) || p.real;
    const gear = el("div", "pb-gear", real || (p.gear ? p.gear.replace(/^(Bass_)?(Pedal|Rack)_/i, "") : m.group));
    const e = p.gear && LIBRARY[p.gear];
    if (p.gear) gear.title = [`From the song's tone: ${p.gear}`, real && `Modelled on: ${real}`,
                              e && e.alt && `Real gear: ${e.alt.join(" · ")}`, look && `Sound: ${m.name}`].filter(Boolean).join("\n");
    const foot = el("button", "pb-foot");
    foot.title = "On / off"; foot.setAttribute("aria-label", `${m.name} on or off`); foot.setAttribute("aria-pressed", p.on !== false);
    foot.onclick = () => {
      p.on = p.on === false;
      box.classList.toggle("off", !p.on); led.classList.toggle("on", p.on); foot.setAttribute("aria-pressed", p.on);
      if (cb.onToggle) cb.onToggle(p.id, p.on);
    };
    const rm = el("button", "pb-rm", "×");
    rm.title = "Remove"; rm.setAttribute("aria-label", `Remove ${m.name}`);
    rm.onclick = (e) => {
      e.stopPropagation();
      const at = find(p.id); if (!at) return;
      board[at.row].splice(at.i, 1); changed();
    };
    if (look === "rack"){
      /* a rack unit: ears, the name on the left, the controls, then the LED and the bypass */
      const side = el("div", "pb-rside"); side.append(name, gear);
      const sw = el("div", "pb-rsw"); foot.textContent = "BYPASS"; sw.append(led, foot);
      box.append(el("i", "pb-ear"), side, kw, sw, el("i", "pb-ear"), rm);
    } else if (look === "wah"){
      box.append(led, name, kw, tread || el("span"), gear, foot, rm);
    } else box.append(led, kw, name, gear, foot, rm);

    /* moved by dragging it (pointer events, so it works with a finger too); a knob or a button is not a handle */
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".pb-knob, .pb-switch, button")) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      let moving = false;
      box.setPointerCapture(e.pointerId);
      const rowAt = (x, y) => { const r = document.elementsFromPoint(x, y).find((n) => n.classList && n.classList.contains("pb-row")); return r && root.contains(r) ? r : null; };
      const move = (ev) => {
        if (!moving){
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          moving = true; dragId = p.id; box.classList.add("lift");
        }
        box.style.transform = `translate(${ev.clientX - sx}px,${ev.clientY - sy}px) rotate(-2deg)`;
        const r = rowAt(ev.clientX, ev.clientY);
        if (!r || !r.classList.contains("over")){ clearOver(); if (r) r.classList.add("over"); }
      };
      const end = (ev) => {
        box.removeEventListener("pointermove", move);
        box.removeEventListener("pointerup", end);
        box.removeEventListener("pointercancel", end);
        if (!moving) return;
        const r = ev.type === "pointerup" ? rowAt(ev.clientX, ev.clientY) : null;
        box.classList.remove("lift"); box.style.transform = ""; clearOver();
        const at = find(p.id);
        if (r && at){
          const idx = dropIndex(r, ev.clientX, ev.clientY);
          board[at.row].splice(at.i, 1);
          board[r.dataset.row].splice(idx, 0, p);
          dragId = ""; changed();
        } else dragId = "";
      };
      box.addEventListener("pointermove", move);
      box.addEventListener("pointerup", end);
      box.addEventListener("pointercancel", end);
    });
    return box;
  }

  const clearOver = () => root.querySelectorAll(".pb-row.over").forEach((r) => r.classList.remove("over"));
  /* where a dropped pedal goes in a row: before the first box whose middle is right of the pointer */
  const dropIndex = (rowEl, x, y) => {
    const boxes = [...rowEl.querySelectorAll(".pb-box")].filter((b) => b.dataset.id !== dragId);
    for (let i = 0; i < boxes.length; i++){
      const r = boxes[i].getBoundingClientRect();
      if (y < r.top) return i;
      if (y <= r.bottom && x < r.left + r.width / 2) return i;
    }
    return boxes.length;
  };

  function row(name){
    const r = el("div", "pb-row"); r.dataset.row = name;
    for (const p of board[name]) if (MODELS[p.model]) r.appendChild(pedal(p));
    if (!board[name].length) r.appendChild(el("span", "pb-empty", { pre: "No pedals before the amp.", loop: "Nothing in the effects loop.", rack: "Nothing in the rack." }[name]));
    const add = el("button", "pb-add", "+");
    add.title = "Add a pedal"; add.setAttribute("aria-label", "Add a pedal " + { pre: "before the amp", loop: "in the effects loop", rack: "in the rack" }[name]);
    add.onclick = (e) => { e.stopPropagation(); openMenu(add, name); };
    r.appendChild(add);
    return r;
  }

  function openMenu(anchor, rowName){
    menu.textContent = "";
    for (const g of GROUPS){
      const ms = Object.entries(MODELS).filter(([, m]) => m.group === g);
      if (!ms.length) continue;
      menu.appendChild(el("h5", "", g));
      for (const [id, m] of ms){
        const b = el("button"); const sw = el("i"); sw.style.background = m.color;
        b.append(sw, document.createTextNode(m.name));
        b.onclick = () => { closeMenu(); board[rowName].push(makePedal(id)); changed(); };
        menu.appendChild(b);
      }
      /* the library's real gear of this group, with its face */
      const real = Object.values(LIBRARY).filter((e) => e.face && MODELS[e.model] && MODELS[e.model].group === g)
        .sort((x, y) => x.face.title.localeCompare(y.face.title));
      for (const e of real){
        const b = el("button", "pb-realgear"); const sw = el("i"); sw.style.background = e.face.color;
        b.append(sw, document.createTextNode(e.face.title.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())), el("small", "", e.face.after || ""));
        b.onclick = () => {
          closeMenu();
          const pd = makePedal(e.model, e.params || {});
          pd.gear = e.key; if (e.real) pd.real = e.real;
          board[rowName].push(pd); changed();
        };
        menu.appendChild(b);
      }
    }
    menu.classList.add("show");
    const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = clamp(r.left, 8, innerWidth - mw - 8) + "px";
    menu.style.top = (r.bottom + 6 + mh > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + "px";
    const first = menu.querySelector("button"); if (first) first.focus();
  }
  function closeMenu(){ menu.classList.remove("show"); }
  document.addEventListener("pointerdown", (e) => { if (menu.classList.contains("show") && !menu.contains(e.target)) closeMenu(); }, true);
  menu.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") closeMenu(); });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){ e.stopPropagation(); if (menu.classList.contains("show")) closeMenu(); else hide(); }
  });

  function render(){
    if (!board) return;
    const scroll = root.scrollTop;
    root.textContent = "";
    root.classList.toggle("edited", !!info.edited);
    root.append(head());
    const tb = tones(); if (tb) root.appendChild(tb);
    if (!Array.isArray(board.rack)) board.rack = [];
    root.append(
      lab("pre"), row("pre"),
      lab("amp"), amp(),
      lab("loop"), row("loop"),
      lab("cab"), cabinet(),
      lab("rack"), row("rack"),
      el("div", "pb-hint", "Drag a pedal to move it · turn a knob by dragging around it, with the wheel or the arrow keys · double-click a knob to put it back"));
    root.scrollTop = scroll;
  }
  function hide(){
    closeMenu();
    if (!root.classList.contains("show")) return;
    root.classList.remove("show");
    if (cb.onClose) cb.onClose();
  }

  return {
    get open(){ return root.classList.contains("show"); },
    /** show `b`; info: {title, edited, note, key, follow, tones: [{key, raw, label, kind, arrs, inForce, edited}]} */
    show(b, i = {}){ board = b; info = i; render(); root.classList.add("show"); },
    /** the same board, other details (or another board while open) */
    update(b, i = {}){ board = b; info = i; if (root.classList.contains("show")) render(); },
    /** flag the board as changed (or not) without drawing it again - a knob may be in a hand */
    setEdited(on){
      info = { ...info, edited: !!on };
      root.classList.toggle("edited", !!on);
      const rs = root.querySelector(".pb-head .pb-btn"); if (rs) rs.disabled = !on;
    },
    hide,
  };
}
