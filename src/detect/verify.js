import { cents, midiToHz } from "./notes.js";

export const DEFAULTS = {
  window: 0.12,        // s: ± janela de acerto
  cents: 50,           // tolerância de pitch
  look: 0.15,          // s após o onset (ou após t) em que se procura o pitch
  minFrames: 2,        // frames de pitch certos necessários
  chordShare: 0.6,     // fração das notas do acorde que têm de estar presentes
  presence: 0.06,      // presença mínima (soma dos harmónicos) para contar uma nota do acorde
  harmonics: 3,        // fundamental + 2 harmónicos
  rescue: 0.25,        // presença (soma dos harmónicos) que aceita uma nota simples sem pitch MPM certo
};

const near = (a, b) => Math.abs(1200 * Math.log2(a / b)) < 50;

/**
 * Alvos a partir de S.syn: o synth já junta as notas, os acordes e os acordes
 * repetidos sem notas próprias, com o midi de cada uma.
 * eventMidi(e) é o pitch real (com harmónicos), igual ao do synth.
 */
export function buildTargets(syn, eventMidi, centOffset = 0){
  const out = [];
  for (let i = 0; i < syn.length; ){
    let j = i;
    while (j < syn.length && syn[j].t === syn[i].t) j++;
    const notes = [];
    for (let q = i; q < j; q++){
      const e = syn[q], midi = eventMidi(e);
      notes.push({ n: e.n, midi, hz: midiToHz(midi, centOffset) });
    }
    const n0 = notes[0].n;
    out.push({
      t: syn[i].t, notes,
      kind: notes.every(x => x.n.mt) ? "muted" : notes.length > 1 ? "chord" : "single",
      legato: notes.length === 1 && !!(n0.ho || n0.po || n0.tp || n0.linked),
      // bn in half steps, as the highway draws it (one chevron per half step).
      // Still to confirm against a real chart with a known full-step bend (bend="2").
      bend: notes.length === 1 ? (n0.bn || 0) : 0,
      result: null,                                    // true | false depois de resolvido
    });
    i = j;
  }
  return out;
}

/** Guarda as últimas deteções (já em tempo de gráfico) e resolve os alvos quando a janela passa. */
export class Verifier {
  constructor(targets, opts = {}){
    this.o = { ...DEFAULTS, ...opts };
    this.targets = targets;
    targets.forEach((g, i) => { g.i = i; });
    this.next = 0;
    this.onsets = [];                                  // [{t, energy}]
    this.frames = [];                                  // [{t, freq, clarity, pres: Map<hz, presence>}]
    this.stats = { hit: 0, miss: 0, streak: 0, best: 0, lag: [] };
    this.onResult = opts.onResult || (() => {});
  }

  /** Depois de um seek: os alvos a partir de t voltam a estar por resolver. */
  seek(t){
    this.onsets.length = 0;
    this.frames.length = 0;
    let i = 0;
    while (i < this.targets.length && this.targets[i].t < t) i++;
    this.next = i;
    for (let k = i; k < this.targets.length; k++){
      const g = this.targets[k];
      if (g.result === null) continue;
      g.result = null;
      for (const x of g.notes) x.n.hit = undefined;
    }
  }

  onset(t, energy){ this.onsets.push({ t, energy, used: false }); }

  frame(t, freq, clarity, freqs, presence){
    let pres = null;
    if (freqs && freqs.length){
      pres = new Map();
      for (let i = 0; i < freqs.length; i++) pres.set(freqs[i], presence[i]);
    }
    this.frames.push({ t, freq, clarity, pres });
  }

  /** Frequências que o worklet deve medir: notas dos alvos em [now - window, now + ahead]. */
  expected(now, ahead = 0.25){
    const set = new Set(), { window: W, harmonics: H } = this.o;
    for (let i = this.next; i < this.targets.length; i++){
      const g = this.targets[i];
      if (g.t > now + ahead) break;
      if (g.t < now - W || g.kind === "muted") continue;
      for (const x of g.notes) for (let h = 1; h <= H; h++) set.add(x.hz * h);
    }
    return [...set].sort((a, b) => a - b);
  }

  /**
   * Chamar a cada frame de render. `settled` = tempo de gráfico até ao qual já
   * chegaram todas as deteções (chartTime() - inLat - atraso do detetor).
   */
  update(settled){
    const W = this.o.window, T = this.targets;
    // alvos cuja janela já passou: acerto ou falha
    while (this.next < T.length && T[this.next].t + W < settled) this.resolve(T[this.next++], this.judge(T[this.next - 1]));
    // o alvo seguinte, com a janela já aberta: um acerto conta logo que está provado,
    // sem esperar pelo fim da janela (é o que dá feedback no momento da nota)
    while (this.next < T.length && T[this.next].t - W <= settled){
      const g = T[this.next];
      if (this.judge(g, true) !== true) break;
      this.next++;
      this.resolve(g, true);
    }
    // descartar deteções que já não podem servir a nenhum alvo
    const keep = settled - 2 * W - this.o.look;
    while (this.onsets.length && this.onsets[0].t < keep) this.onsets.shift();
    while (this.frames.length && this.frames[0].t < keep) this.frames.shift();
  }

  resolve(g, ok){
    g.result = ok;
    const s = this.stats;
    if (ok){ s.hit++; s.streak++; s.best = Math.max(s.best, s.streak); }
    else { s.miss++; s.streak = 0; }
    for (const x of g.notes) x.n.hit = ok;            // o draw() e a tab view leem n.hit
    this.onResult(g);
  }

  /**
   * true/false. Com `early`, é uma tentativa antes do fim da janela: devolve null
   * em vez de false e não gasta o onset, porque a prova ainda pode chegar.
   */
  judge(g, early = false){
    const { window: W, look } = this.o;
    const onset = this.nearestOnset(g, W);
    let ok;
    if (g.kind === "muted") ok = !!onset;
    else if (!onset && !g.legato) ok = false;
    else {
      const from = onset ? onset.t : g.t - W, to = from + look + (g.legato ? W : 0);
      ok = g.kind === "chord" ? this.chordOk(g, from, to)
         : this.singleOk(g, from, to) || (!!onset && this.rescueOk(g, from, to));
    }
    if (early && !ok) return null;
    if (onset){
      onset.used = true;
      if (ok) this.lag(onset, g);                     // só os acertos: um onset de outra nota enviesaria a média
    }
    return ok;
  }

  lag(onset, g){
    const L = this.stats.lag;
    L.push(onset.t - g.t);
    if (L.length > 64) L.shift();
  }

  /**
   * O onset por usar mais próximo de g.t, dentro de ±W. Cada onset serve um só
   * alvo: se estiver mais perto do alvo seguinte, fica para esse.
   */
  nearestOnset(g, W){
    const nx = this.targets[g.i + 1];
    let best = null;
    for (const o of this.onsets){
      if (o.used) continue;
      const d = Math.abs(o.t - g.t);
      if (d > W || (best && d >= Math.abs(best.t - g.t))) continue;
      if (nx && Math.abs(o.t - nx.t) < d) continue;
      best = o;
    }
    return best;
  }

  singleOk(g, from, to){
    const target = g.notes[0], lo = -this.o.cents, hi = g.bend * 100 + this.o.cents;
    let good = 0;
    for (const f of this.frames){
      if (f.t < from || f.t > to || !f.freq) continue;
      const c = cents(f.freq, target.hz);
      if (c >= lo && c <= hi && ++good >= this.o.minFrames) return true;
    }
    return false;
  }

  /**
   * Uma corda anterior ainda a soar pode prender o MPM à nota antiga, ou deixá-lo
   * sem pitch claro (duas notas juntas). Aceita-se então a nota se a presença
   * dela for forte em `minFrames` frames. Guardas:
   *  - se o MPM ouvir com clareza um pitch que nem a nota-alvo nem a anterior
   *    explicam, é uma nota errada e não há rescue (com 2048 amostras o
   *    Goertzel não separa Mi2 de Fá2, por isso a presença sozinha não chega);
   *  - a nota-alvo não pode ser a oitava ou a 12.ª da anterior, porque essa
   *    presença viria dos harmónicos da nota antiga.
   */
  rescueOk(g, from, to){
    const { harmonics: H, rescue, minFrames } = this.o, hz = g.notes[0].hz;
    const prev = g.i > 0 ? this.targets[g.i - 1] : null;
    if (!prev || g.t - prev.t > 2) return false;
    const ringing = prev.notes.map((x) => x.hz);
    if (ringing.some((r) => near(hz, r) || near(hz, r * 2) || near(hz, r * 3))) return false;
    const explained = (f) => near(f, hz) || near(f, hz * 2) || near(f, hz / 2)
      || ringing.some((r) => near(f, r) || near(f, r * 2) || near(f, r / 2));
    let good = 0;
    for (const f of this.frames){
      if (f.t < from || f.t > to) continue;
      if (f.freq && !explained(f.freq)) return false;
      if (!f.pres) continue;
      let sum = 0;
      for (let h = 1; h <= H; h++) sum += f.pres.get(hz * h) || 0;
      if (sum >= rescue) good++;
    }
    return good >= minFrames;
  }

  chordOk(g, from, to){
    const { harmonics: H, presence: P, chordShare } = this.o;
    const present = new Set();
    for (const f of this.frames){
      if (f.t < from || f.t > to || !f.pres) continue;
      g.notes.forEach((x, i) => {
        let sum = 0;
        for (let h = 1; h <= H; h++) sum += f.pres.get(x.hz * h) || 0;
        if (sum >= P) present.add(i);
      });
    }
    return present.size >= Math.ceil(chordShare * g.notes.length);
  }
}
