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
//   onReset(), onClose()

import { FX, MODELS, GROUPS, CABS, AMP_KNOBS, makePedal } from "./catalog.js";

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

/* the amp head: tolex, a gold plate, chicken-head knobs */
#pbRig .pb-amp{border-radius:10px;border:3px solid #050505;padding:10px 14px 12px;margin-bottom:14px;
  background:repeating-linear-gradient(45deg,#1d1d1d 0 2px,#191919 2px 4px);box-shadow:0 8px 20px #0009,inset 0 1px 0 #ffffff14}
#pbRig .pb-amp.bass .pb-plate{background:linear-gradient(#b9c0c7,#8d969f)}
#pbRig .pb-amptop{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin-bottom:8px}
#pbRig .pb-brand{font:italic 700 24px Georgia,"Times New Roman",serif;color:#efe6cf;text-shadow:0 2px 0 #000;letter-spacing:.02em}
#pbRig .pb-brand small{font:600 10px "Segoe UI",system-ui,sans-serif;color:#8b8578;letter-spacing:.12em;margin-left:8px;
  text-transform:uppercase;font-style:normal}
#pbRig .pb-cab{margin-left:auto;display:flex;align-items:center;gap:6px;color:#8b8578;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
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

/* rows of stompboxes */
#pbRig .pb-lab{display:flex;align-items:center;gap:8px;color:#6f7c89;font-size:10px;letter-spacing:.12em;
  text-transform:uppercase;margin:4px 0 6px}
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
#pbRig .pb-knob{--a:0deg;display:flex;flex-direction:column;align-items:center;gap:2px;width:48px;outline:none;position:relative}
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
`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function isLight(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return false;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}
function fmt(kn, v){
  const span = kn.max - kn.min;
  let s;
  if (!kn.unit && kn.min === 0 && kn.max === 1) s = (v * 10).toFixed(1);                  // 0..10, like the knob's dots
  else s = (span >= 100 ? Math.round(v) : Math.abs(v) < 10 && kn.step < 1 ? v.toFixed(1) : String(Math.round(v * 10) / 10));
  if (kn.min < 0 && v > 0) s = "+" + s;
  return s + (kn.unit ? (kn.unit.startsWith(":") ? kn.unit : " " + kn.unit) : "");
}

/* a knob: drag around it (the angle sets the value, -135°..135°), the wheel
   and the arrow keys step it, a double click puts it back */
function knob(kn, value, def, onInput){
  const START = -135, END = 135;
  const root = el("div", "pb-knob"), dial = el("div", "pb-dial"), val = el("span", "pb-val");
  dial.appendChild(el("i"));
  root.append(val, dial, el("label", "", kn.label));
  root.tabIndex = 0;
  root.setAttribute("role", "slider");
  root.setAttribute("aria-label", kn.label);
  root.setAttribute("aria-valuemin", kn.min);
  root.setAttribute("aria-valuemax", kn.max);
  let v = value;
  const paint = () => {
    const pc = (v - kn.min) / (kn.max - kn.min);
    root.style.setProperty("--a", Math.round(START + (END - START) * pc) + "deg");
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
    const x = cx - e.clientX, y = cy - e.clientY;
    let deg = Math.round(Math.atan2(y, x) * 180 / Math.PI);
    if (deg < 0) deg += 360;
    deg -= 90;
    if (x > 0 && y <= 0) deg -= 360;
    deg = clamp(deg, START, END);
    put(kn.min + (deg - START) / (END - START) * (kn.max - kn.min));
  });
  const up = (e) => { if (dial.hasPointerCapture(e.pointerId)) dial.releasePointerCapture(e.pointerId); root.classList.remove("busy"); };
  dial.addEventListener("pointerup", up);
  dial.addEventListener("pointercancel", up);
  dial.addEventListener("dblclick", (e) => { e.stopPropagation(); put(def); });
  root.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); put(v + (e.deltaY < 0 ? 1 : -1) * stepBig); }, { passive: false });
  root.addEventListener("keydown", (e) => {
    const k = e.key;
    let d = 0;
    if (k === "ArrowUp" || k === "ArrowRight") d = stepBig;
    else if (k === "ArrowDown" || k === "ArrowLeft") d = -stepBig;
    else if (k === "PageUp") d = stepBig * 5;
    else if (k === "PageDown") d = -stepBig * 5;
    else if (k === "Home"){ e.preventDefault(); e.stopPropagation(); put(kn.min); return; }
    else if (k === "End"){ e.preventDefault(); e.stopPropagation(); put(kn.max); return; }
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    put(v + d);
  });
  paint();
  return root;
}

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
    for (const row of ["pre", "loop"]){ const i = board[row].findIndex((p) => p.id === id); if (i >= 0) return { row, i }; }
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

  function amp(){
    const a = board.amp;
    const box = el("div", "pb-amp" + (a.bassAmp ? " bass" : ""));
    const top = el("div", "pb-amptop");
    const brand = el("div", "pb-brand", a.name || "Amp");
    brand.appendChild(el("small", "", a.bassAmp ? "bass amp" : "amplifier"));
    const cab = el("label", "pb-cab", "Cabinet");
    const sel = el("select");
    for (const [id, c] of Object.entries(CABS)){
      const o = el("option", "", c.name); o.value = id; sel.appendChild(o);
    }
    sel.value = CABS[board.cab] ? board.cab : (a.bassAmp ? "bass" : "2x12");
    sel.onchange = () => { board.cab = sel.value; changed(); };
    sel.addEventListener("keydown", (e) => e.stopPropagation());
    cab.appendChild(sel);
    top.append(brand, cab);

    const plate = el("div", "pb-plate");
    const master = { k:"master", label:"MASTER", min:0, max:1, step:0.01 };
    plate.appendChild(knob(master, cb.getMaster ? cb.getMaster() : 0.7, 0.7, (v) => { if (cb.onMaster) cb.onMaster(v); }));
    plate.appendChild(el("span", "pb-sep"));
    for (const kn of AMP_KNOBS){
      plate.appendChild(knob(kn, Number.isFinite(a[kn.k]) ? a[kn.k] : kn.def, kn.def, (v) => { a[kn.k] = v; notifyKnob("amp", kn.k, v); }));
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
    const box = el("div", "pb-box" + (isLight(m.color) ? " light" : "") + (p.on === false ? " off" : ""));
    box.style.setProperty("--c", m.color);
    box.dataset.id = p.id;
    const led = el("span", "pb-led" + (p.on !== false ? " on" : ""));
    const kw = el("div", "pb-knobs");
    for (const kn of FX[m.fx].knobs){
      const def = m.params[kn.k] ?? kn.def;
      const k = knob(kn, Number.isFinite(p.params[kn.k]) ? p.params[kn.k] : def, def, (v) => { p.params[kn.k] = v; notifyKnob(p.id, kn.k, v); });
      kw.appendChild(k);
    }
    const name = el("div", "pb-name", m.name);
    const gear = el("div", "pb-gear", p.gear ? p.gear.replace(/^(Bass_)?(Pedal|Rack)_/i, "") : m.group);
    if (p.gear) gear.title = `From the song's tone: ${p.gear}`;
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
    box.append(led, kw, name, gear, foot, rm);

    /* moved by dragging it (pointer events, so it works with a finger too); a knob or a button is not a handle */
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".pb-knob, button")) return;
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
    if (!board[name].length) r.appendChild(el("span", "pb-empty", name === "pre" ? "No pedals before the amp." : "Nothing in the effects loop."));
    const add = el("button", "pb-add", "+");
    add.title = "Add a pedal"; add.setAttribute("aria-label", "Add a pedal " + (name === "pre" ? "before the amp" : "in the effects loop"));
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
    root.append(head(), amp(),
      el("div", "pb-lab", "Pedals → amp"), row("pre"),
      el("div", "pb-lab", "Effects loop → out"), row("loop"),
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
    /** show `b` (the board of the tone in force); info: {title, edited, note} */
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
