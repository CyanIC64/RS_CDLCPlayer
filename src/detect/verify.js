import { cents, midiToHz } from "./notes.js";

export const DEFAULTS = {
  window: 0.12,        // s: ± janela de acerto
  cents: 50,           // tolerância de pitch
  look: 0.15,          // s após o onset (ou após t) em que se procura o pitch
  minFrames: 2,        // frames de pitch certos necessários
  chordShare: 0.6,     // fração das notas do acorde que têm de estar presentes
  presence: 0.04,      // presença mínima (soma dos harmónicos) para contar uma nota do acorde
  fundamental: 0.01,   // presença mínima da própria fundamental (um G2 sozinho não faz o D3 de um acorde de Sol)
  veto: 1.5,           // o meio tom ao lado com 1,5× a presença da nota: é a vizinha que está a soar
  harmonics: 3,        // fundamental + 2 harmónicos
  rescue: 0.15,        // presença (soma dos harmónicos) que aceita uma nota simples sem pitch MPM certo
  long: 0,             // s: duração da janela longa da presença (0 = presença ao tempo do frame)
  pmCents: 150,        // palm mute: só um pitch claro mais longe do que isto conta como nota errada
  vetoFloor: 0.25,     // × presence: presença mínima do meio tom ao lado para vetar uma nota
  pmChord: 0.5,        // acorde em palm mute: os limiares de presença e de fundamental × isto
};

const near = (a, b) => Math.abs(1200 * Math.log2(a / b)) < 50;
const SEMI = [1, Math.pow(2, -1 / 12), Math.pow(2, 1 / 12)];   // a nota, meio tom abaixo, meio tom acima

/**
 * As frequências que se medem para uma nota: os harmónicos 1..H dela e do meio
 * tom abaixo e acima. A página e o Verifier usam esta mesma função, por isso os
 * valores coincidem exatamente (são as chaves do mapa de presença).
 */
export function probe(hz, H = DEFAULTS.harmonics){
  const out = [];
  for (let h = 1; h <= H; h++) for (const r of SEMI) out.push(hz * h * r);
  return out;
}

/**
 * Alvos a partir de S.syn: o synth já junta as notas, os acordes e os acordes
 * repetidos sem notas próprias, com o midi de cada uma.
 * eventMidi(e) é o pitch real (com harmónicos), igual ao do synth.
 *
 * `range` é o intervalo de pitch aceite, em cents a partir da nota:
 *  - bend: até bn·200. O synth e a highway leem bn em meios-tons, mas nos XML do
 *    Rocksmith os passos parecem ser tons inteiros (step="0.500" = meio tom). Até se
 *    confirmar com um gráfico real, aceitam-se as duas leituras;
 *  - slide: do traste de partida ao de chegada.
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
    const n0 = notes[0].n, single = notes.length === 1;
    let range = [0, 0];
    if (single && n0.bn > 0) range = [0, n0.bn * 200];
    const to = n0.sl > 0 ? n0.sl : n0.slu > 0 ? n0.slu : -1;
    if (single && to >= 0 && Number.isFinite(n0.f)){
      const d = (to - n0.f) * 100;
      range = [Math.min(range[0], d), Math.max(range[1], d)];
    }
    out.push({
      t: syn[i].t, notes,
      kind: notes.every(x => x.n.mt) ? "muted" : single ? "single" : "chord",
      legato: single && !!(n0.ho || n0.po || n0.tp || n0.linked),
      pm: notes.every(x => x.n.pm),
      range,
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
    this.onsets = [];                                  // [{t, energy, used}]
    this.frames = [];                                  // [{t, freq, clarity, tL, pres: Map<hz, presence>}]
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

  /** t: centro da janela curta (MPM); tL: centro da janela longa (presença), ou t. */
  frame(t, freq, clarity, freqs, presence, tL = t){
    let pres = null;
    if (freqs && freqs.length){
      pres = new Map();
      for (let i = 0; i < freqs.length; i++) pres.set(freqs[i], presence[i]);
    }
    this.frames.push({ t, freq, clarity, tL, pres });
  }

  /** Frequências que o worklet deve medir: notas dos alvos em [now - window, now + ahead]. */
  expected(now, ahead = 0.25){
    const set = new Set(), { window: W, harmonics: H } = this.o;
    for (let i = Math.max(0, this.next - 4); i < this.targets.length; i++){
      const g = this.targets[i];
      if (g.t > now + ahead) break;
      // a janela longa ainda precisa destas frequências depois da janela de acerto
      if (g.t < now - W - this.o.look - this.o.long || g.kind === "muted") continue;
      for (const x of g.notes) for (const f of probe(x.hz, H)) set.add(f);
    }
    return [...set].sort((a, b) => a - b);
  }

  /**
   * Chamar a cada frame de render. `settled` = tempo de gráfico até ao qual já
   * chegaram todas as deteções (chartTime() - inLat - atraso do detetor).
   * A presença da janela longa chega `long` segundos depois; os acordes esperam por ela.
   */
  update(settled){
    const W = this.o.window, T = this.targets, wait = (g) => g.kind === "chord" ? this.o.long : 0;
    // alvos cuja janela já passou: acerto ou falha
    while (this.next < T.length && T[this.next].t + W + wait(T[this.next]) < settled){
      const g = T[this.next++];
      this.resolve(g, this.judge(g));
    }
    // o alvo seguinte, com a janela já aberta: um acerto conta logo que está provado,
    // sem esperar pelo fim da janela (é o que dá feedback no momento da nota)
    while (this.next < T.length && T[this.next].t - W <= settled){
      const g = T[this.next];
      if (this.judge(g, true) !== true) break;
      this.next++;
      this.resolve(g, true);
    }
    // descartar deteções que já não podem servir a nenhum alvo
    const keep = settled - 2 * W - this.o.look - 2 * this.o.long;
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
      if (g.kind === "chord") ok = this.chordOk(g, from, to, early);
      else if (g.pm) ok = this.pmOk(g, from, to, early);
      else ok = this.singleOk(g, from, to) || (!!onset && this.rescueOk(g, from, to));
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

  /** pitch MPM dentro do intervalo da nota (com bend ou slide), em minFrames frames */
  singleOk(g, from, to, tol = this.o.cents){
    const target = g.notes[0], lo = g.range[0] - tol, hi = g.range[1] + tol;
    let good = 0;
    for (const f of this.frames){
      if (f.t < from || f.t > to || !f.freq) continue;
      const c = cents(f.freq, target.hz);
      if (c >= lo && c <= hi && ++good >= this.o.minFrames) return true;
    }
    return false;
  }

  /**
   * Palm mute: o ataque conta, e o pitch é tolerante (abafada, a corda dá pouca
   * nota). No fim da janela só falha se o MPM ouvir com clareza outra nota (mais
   * de pmCents fora, e não a oitava) em minFrames frames; na tentativa antecipada
   * é preciso o contrário, minFrames frames perto da nota e nenhum errado.
   */
  pmOk(g, from, to, early = false){
    const hz = g.notes[0].hz, { pmCents, minFrames } = this.o;
    let wrong = 0, good = 0;
    for (const f of this.frames){
      if (f.t < from || f.t > to || !f.freq) continue;
      const c = cents(f.freq, hz), oct = Math.abs(c - 1200 * Math.round(c / 1200));
      if (Math.abs(c) > pmCents && oct > pmCents) wrong++; else good++;
    }
    return early ? good >= minFrames && wrong === 0 : wrong < minFrames;
  }

  /** os frames cuja janela longa cai sobretudo depois do ataque */
  *longFrames(from, to){
    const half = this.o.long / 2;
    for (const f of this.frames) if (f.pres && f.tL >= from + half / 2 && f.tL <= to + half) yield f;
  }

  /**
   * A nota (hz) num frame: { sum, h1, own, nb }.
   *  - sum: presença dos harmónicos 1..H; h1: a da fundamental;
   *  - own e nb: só os harmónicos que não caem noutra nota do acorde (`others`,
   *    frequências h1..6 das outras notas): a presença deles e a do meio tom
   *    abaixo ou acima (o maior). Num Sol, o B2 partilha o 2.º harmónico com o
   *    B3; sem esta exclusão, um C3 no lugar do B2 passava pelo B3.
   */
  noteIn(f, hz, others){
    const H = this.o.harmonics, P = (x) => f.pres.get(x) || 0;
    const taken = (x) => others.some((o) => Math.abs(1200 * Math.log2(x / o)) < 60);
    let sum = 0, h1 = 0, own = 0, lo = 0, hi = 0;
    for (let h = 1; h <= H; h++){
      const a = hz * h * SEMI[0], b = hz * h * SEMI[1], c = hz * h * SEMI[2];
      const p = P(a);
      sum += p; if (h === 1) h1 = p;
      if (taken(a)) continue;
      own += p;
      if (!taken(b)) lo += P(b);
      if (!taken(c)) hi += P(c);
    }
    return { sum, h1, own, nb: Math.max(lo, hi) };
  }

  /**
   * Uma corda anterior ainda a soar pode prender o MPM à nota antiga, ou deixá-lo
   * sem pitch claro (duas notas juntas). Aceita-se então a nota se a presença
   * dela for forte em `minFrames` frames, e não dominada pelo meio tom ao lado.
   * Guardas:
   *  - se o MPM ouvir com clareza um pitch que nem a nota-alvo nem a anterior
   *    explicam, é uma nota errada e não há rescue;
   *  - a nota-alvo não pode ser a oitava ou a 12.ª da anterior, porque essa
   *    presença viria dos harmónicos da nota antiga.
   */
  rescueOk(g, from, to){
    const { rescue, minFrames, veto } = this.o, hz = g.notes[0].hz;
    const prev = g.i > 0 ? this.targets[g.i - 1] : null;
    if (!prev || g.t - prev.t > 2) return false;
    const ringing = prev.notes.map((x) => x.hz);
    if (ringing.some((r) => near(hz, r) || near(hz, r * 2) || near(hz, r * 3))) return false;
    const explained = (f) => near(f, hz) || near(f, hz * 2) || near(f, hz / 2)
      || ringing.some((r) => near(f, r) || near(f, r * 2) || near(f, r / 2));
    for (const f of this.frames) if (f.t >= from && f.t <= to && f.freq && !explained(f.freq)) return false;
    let good = 0;
    for (const f of this.longFrames(from, to)){
      const x = this.noteIn(f, hz, []);
      if (x.sum >= rescue && x.nb < veto * x.own) good++;
    }
    return good >= minFrames;
  }

  /**
   * Acerto se pelo menos chordShare das notas estiverem presentes (soma dos
   * harmónicos, e a própria fundamental) e nenhuma for claramente a vizinha:
   * uma nota nunca presente e com o meio tom ao lado a dominar em minFrames
   * frames é um dedo no traste errado. Na tentativa antecipada (`early`) exigem-se
   * todas as notas, porque o veto ainda não teve frames para se provar.
   *
   * O veto conta frames: uma nota é errada quando o meio tom ao lado a domina em
   * pelo menos minFrames frames e em mais frames do que ela se ouve. Só conta um
   * vizinho com presença >= vetoFloor × presence: com o limiar antigo (½), a terça
   * de um Mi maior passava num Mi menor (gravações chord-E/chord-Em pelo cabo).
   *
   * Palm mute (pm-E5-chug.wav): abafado, o acorde soa fraco e o E2 quase sem
   * fundamental, por isso os limiares descem (× pmChord); e no ataque a corda sobe
   * de afinação o bastante para o meio tom ao lado dominar, por isso não há veto,
   * tal como uma nota simples em palm mute é tolerante ao pitch (pmOk).
   */
  chordOk(g, from, to, early = false){
    const { veto, chordShare, minFrames, vetoFloor } = this.o, k = g.pm ? this.o.pmChord : 1;
    const P = this.o.presence * k, P1 = this.o.fundamental * k, floor = this.o.presence * vetoFloor;
    const n = g.notes.length, present = new Array(n).fill(0), vetoed = new Array(n).fill(0);
    const others = g.notes.map((x, i) => {
      const o = [];
      g.notes.forEach((y, j) => { if (j !== i) for (let h = 1; h <= 6; h++) o.push(y.hz * h); });
      return o;
    });
    for (const f of this.longFrames(from, to)){
      for (let i = 0; i < n; i++){
        const x = this.noteIn(f, g.notes[i].hz, others[i]);
        if (!g.pm && x.nb >= veto * x.own && x.nb >= floor) vetoed[i]++;
        else if (x.sum >= P && x.h1 >= P1) present[i]++;
      }
    }
    const count = present.filter((p) => p > 0).length;
    if (early) return count === n && vetoed.every((v) => v === 0);
    // um dedo no traste errado: o meio tom ao lado domina a nota em mais frames do que ela se ouve
    const wrong = vetoed.some((v, i) => v >= minFrames && v > present[i]);
    return count >= Math.ceil(chordShare * n) && !wrong;
  }
}
