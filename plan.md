# Play Song — Deteção de notas e acordes pelo cabo USB

**O que se quer:** ligar a guitarra (ou o baixo) pelo **Rocksmith Real Tone Cable** e o Play Song passar a dizer, nota a nota, se o que foi tocado corresponde ao gráfico.

**A ideia-chave:** o player já sabe que notas deviam soar em cada instante. Por isso não é preciso *transcrever* o áudio (descobrir às cegas que nota foi tocada). Basta *verificar*: a nota ou o acorde esperado aconteceu dentro da janela de tempo e com o pitch certo? É muito mais fiável, e torna os acordes exequíveis sem ML.

---

## 1. Restrições do projeto

O plano tem de respeitar o que o Play Song já é:

| Restrição | Consequência para a deteção |
|---|---|
| Página estática, JS vanilla, sem React nem build da página | O detetor é um bundle esbuild novo, `web/pitch.js`, gerado de `src/detect/` pelo `build.mjs` atual. É carregado a pedido, com `loadScript`, só quando o utilizador liga a entrada da guitarra. |
| Tem de funcionar a partir de `file://` | O `audioWorklet.addModule(url)` não carrega a partir de `file://`. O processor vai como **string** e é carregado a partir de um Blob URL, o mesmo truque do `converter.worker.js`. |
| Sem headers COOP/COEP (`file://` e GitHub Pages) | Não há `SharedArrayBuffer`. A comunicação worklet → página é sempre por `postMessage`, que chega bem para cerca de 100 mensagens por segundo. |
| Wasm, se vier a ser preciso | Não se pode fazer `fetch` do `.wasm`: vai embutido em base64 no bundle, é compilado na página e enviado ao worklet pelo `port`. Com a NSDF via FFT (secção 3) é provável que nunca seja preciso. |
| Suporta baixo (`OPEN_BASS`, Mi1 = 41 Hz, até cerca de 31 Hz em drop) | Parâmetros por arranjo: guitarra com janela de 2048 amostras e mínimo de 70 Hz; baixo com janela de 4096 amostras e mínimo de 28 Hz. |
| Velocidade abaixo de 100 % usa `HTMLMediaElement` (`A.mode === "el"`) | O relógio da música deixa de ser o `A.ctx.currentTime`. A conversão de tempos está na secção 4. |
| Prefs guardadas em `playsong.prefs` | Os campos novos entram no objeto `PREFS`, que o `loadPrefs()` já sabe ler. |

---

## 2. Arquitetura

```
 Rocksmith cable ──getUserMedia──▶ MediaStreamSource (A.ctx, o mesmo contexto da música)
                                           │
                                           ▼
                        AudioWorkletNode "playsong-pitch"  (carregado a partir de um Blob)
                        ├─ ring buffer (2048 ou 4096 amostras)
                        ├─ onset: energia por bloco de 128 amostras (resolução de 2,7 ms)
                        ├─ pitch: MPM com NSDF via FFT, a cada hop
                        └─ presença: Goertzel nas frequências pedidas pela página
                                           │  postMessage {onset | frame}, com tempos do A.ctx
                                           ▼
 index.html ── PitchKit (web/pitch.js)
   ├─ converte os tempos do AudioContext para tempo de gráfico (secção 4)
   ├─ Verifier: compara com os alvos construídos a partir de S.syn
   ├─ envia ao worklet as frequências esperadas nos próximos ~250 ms
   └─ marca n.hit = true/false ──▶ draw() / tab view / hit light / HUD / barras de frase
```

**Porque usar o mesmo `AudioContext` da música:** o worklet marca cada deteção com o seu `currentTime`, que é o mesmo relógio onde a música está agendada no modo `buf`. Não há dois relógios a derivar um do outro.

**Taxa de amostragem:** o `audioInit()` cria hoje o contexto com a taxa por omissão da saída de áudio. O cabo é de 48 kHz. O Chrome faz resampling, mas o Firefox recusou durante muito tempo um `MediaStreamSource` com uma taxa diferente da do contexto. Proposta: `new AudioContext({ sampleRate: 48000, latencyHint: "interactive" })`. A música é descodificada para a taxa do contexto de qualquer forma.

---

## 3. Parâmetros de análise

| Parâmetro | Guitarra | Baixo | Notas |
|---|---|---|---|
| Janela | 2048 amostras (43 ms) | 4096 amostras (85 ms) | Pelo menos 3 períodos da nota mais grave. |
| Hop | 512 amostras (10,7 ms) | 1024 amostras (21 ms) | Graças à NSDF via FFT, custa cerca de 0,2 M operações por análise. |
| Gama de pitch | 70 – 1400 Hz | 28 – 500 Hz | Cobre drops até C#. |
| Noise gate (RMS) | 0,01 | 0,01 | Calibrar com WAVs reais do cabo. |
| Clarity mínima | 0,8 | 0,8 | |
| Onset | energia > 2× o envelope de pico | igual | O envelope decai cerca de 50 % em 120 ms. |
| Janela de acerto | ±120 ms | ±150 ms | |
| Tolerância de pitch | ±50 cents | ±50 cents | |

**NSDF via FFT:** o termo de autocorrelação da NSDF calcula-se com duas FFT de tamanho 2N, e o termo `m(τ)` por uma recorrência O(N). Assim o MPM passa de O(N·τmax) para O(N log N), cerca de 6 vezes menos trabalho na guitarra e 25 vezes menos no baixo. Isto torna o Wasm dispensável.

---

## 4. Tempo: do worklet para o gráfico

O worklet marca cada evento com `time` no relógio do `A.ctx`. Na página, ao receber a mensagem:

```js
/* Tempo de gráfico de um evento do worklet. Funciona nos dois modos de reprodução:
   tanto no "buf" como no "el" (abaixo de 100 %), o songTime() avança S.rate segundos
   de música por segundo real. */
function detChartTime(ctxTime){
  const ago = A.ctx.currentTime - ctxTime;              // há quanto tempo, em tempo real
  return songTime() - ago * S.rate                      // tempo de música do evento
       - S.offMs / 1000                                 // o mesmo offset que chartTime() usa
       - S.inLatMs / 1000;                              // latência de entrada + saída (calibrada)
}
```

- `S.inLatMs` junta a latência de entrada (cabo e WASAPI), a de saída (`A.ctx.outputLatency`: o jogador toca em sincronia com o que *ouve*) e o atraso do detetor. Mede-se em vez de se calcular (fase 3).
- Em modo `el`, o `A.el.currentTime` avança aos saltos em alguns browsers. Se se notar jitter, guardar um par (`A.ctx.currentTime`, `songTime()`) suavizado por frame de render e usá-lo em vez de chamar `songTime()` diretamente.
- Com a música em pausa, as deteções são ignoradas (exceto no afinador).

---

## 5. Fases

- [x] **Fase 0 — Fundações** (feita; falta só confirmar a unidade de `bn` com um gráfico real)
  - `src/package.json` com esbuild e vitest em versões fixas, e os scripts `build` e `test`.
  - Novo passo em `build.mjs` que gera `web/pitch.js` (secção 7.8).
  - `audioInit()` com `sampleRate: 48000` e `latencyHint: "interactive"`.
  - Extrair do `synVoice` uma função `eventMidi(e)` (pitch real com `hm`/`hp`), usada pelo synth e pelo detetor.
  - **Ler o `centOffset`** do arranjo: em `song.js` a partir do XML e em `sng.js`/`convert.js` a partir do manifest. Passa a `arr.centOffset`, usado em `hzOf()`.
  - Confirmar a unidade de `bn` com um XML conhecido. O desenho trata-a como meios-tons ("one chevron per half step").
  - README: retirar o "A" solto na linha 7 e completar a lista "V1.1 adds", que termina em ";".
- [x] **Fase 1 — Captura** (feita e testada em localhost com uma entrada simulada; falta testar com o cabo real e a partir de `file://`)
  - Secção "Guitar input" nas Options: escolher o dispositivo (pré-seleciona "Rocksmith"), botão de ligar, medidor de nível.
  - Worklet carregado a partir do Blob.
  - Prefs: `inDevice`, `inOn`.
  - Ouvir `devicechange` para quando o cabo é ligado ou desligado.
  - **Testar `getUserMedia` a partir de `file://`** em Chrome, Edge e Firefox. A permissão em `file://` pode não ficar memorizada.
  - (Opcional) Monitorização: cabo → ganho → `destination`, com aviso de latência.
- [x] **Fase 1b — Ícone do cabo na barra de controlo** (feita e testada com dispositivos simulados; falta testar com o cabo real)
  - Um ícone (ficha de jack ou cabo, em SVG inline, como os outros botões da barra) ao lado do botão Options.
  - Estados:

    | Estado | Aspeto | Quando |
    |---|---|---|
    | Sem cabo | escondido | nenhuma entrada com "Rocksmith" ou "Real Tone" no nome |
    | Cabo ligado, entrada desligada | cinzento | o cabo aparece no `enumerateDevices()` |
    | A ouvir | verde | `IN.link` ativo |
    | A ouvir com sinal | verde, com brilho que segue o nível (RMS) | o nível passa a noise gate |
    | Cabo desligado a meio | vermelho, durante alguns segundos | `inputLost()` |

  - Um clique liga ou desliga a entrada (o mesmo que a tecla G). O tooltip mostra o nome do dispositivo e o estado.
  - Deteção: `enumerateDevices()` no arranque e em cada `devicechange`. Ao ligar o cabo com a página aberta, o ícone aparece sem recarregar.
  - **Limitação do browser:** antes de a permissão de microfone ser dada uma vez, o `enumerateDevices()` devolve as entradas sem nome, por isso não se consegue saber qual é o cabo.
    - Nesse caso, o ícone aparece cinzento com um "?" e o tooltip "Click to look for the Rocksmith cable". O clique pede a permissão e depois identifica o cabo.
    - Em `http(s)` o Chrome memoriza a permissão e, nas visitas seguintes, o cabo é reconhecido logo. Em `file://` pode ser preciso pedir de novo; confirmar no teste com o cabo.
  - WebUSB e WebHID não servem como alternativa: o Chrome bloqueia o acesso a dispositivos de áudio USB por essas APIs.
  - Sem prefs novas: o estado vem do `IN` e da lista de dispositivos.
- [ ] **Fase 2 — Afinador** (tecla `U`)
  - Overlay com nota, cents e ponteiro.
  - Os alvos são as cordas soltas do arranjo atual (`OPEN_* + tuning`, com `centOffset`), destacando a corda mais próxima.
- [ ] **Fase 3 — Verificação de notas simples**
  - `Verifier` com os alvos construídos a partir de `S.syn`; cada nota fica com `n.hit = true/false`.
  - **Calibração de latência:**
    - assistente: tocar a corda solta em 8 cliques do metrónomo e usar a mediana do desvio;
    - auto-ajuste: durante o jogo, sugerir a mediana de (onset − `t` do alvo) dos acertos.
  - Prefs: `inLatMs`.
- [ ] **Fase 4 — Acordes e técnicas**
  - Acordes: presença por Goertzel nas fundamentais e harmónicos esperados. Acerto se pelo menos 60 % das cordas estiverem presentes.
  - Técnicas:

    | Técnica | Verificação |
    |---|---|
    | Abafada (`mt`) | Só onset. |
    | Hammer-on, pull-off, ligada (`ho`/`po`/`linked`) | Sem onset obrigatório; basta o pitch mudar. |
    | Bend (`bn`) | Pitch dentro do intervalo de `midi` a `midi + bend`. |
    | Slide (`sl`/`slu`) | Chegar ao traste final antes do fim do sustain. |
    | Harmónico (`hm`) | Pitch pelo mapa `HARMONIC` (já está em `eventMidi`). |
    | Palm mute (`pm`) | Onset obrigatório; pitch tolerante. |
- [ ] **Fase 5 — Feedback e pontuação**
  - Highway: a cabeça da nota fica verde (acerto) ou escura com contorno vermelho (falha).
  - Tab view: a mesma marcação.
  - Hit light: verde no acerto, vermelho na falha.
  - HUD: precisão e streak.
  - Barras de frase: percentagem de acerto em cada frase.
  - Resumo no fim da música, no `songEnded`.
- [ ] **Fase 6 — Wasm** (só se o benchmark da fase 3 o exigir)
  - Porte do núcleo DSP para Rust, com exports `extern "C"` simples.
  - O `.wasm` vai embutido em base64 no bundle.

---

## 6. Ficheiros

```
src/
  package.json              # novo: esbuild + vitest
  build.mjs                 # + passo 3: web/pitch.js
  detect/
    fft.js                  # FFT radix-2 com buffers pré-alocados
    fft.test.js
    mpm.js                  # McLeod Pitch Method, NSDF via FFT
    mpm.test.js
    notes.js                # midi ↔ Hz (com centOffset), freqToNote
    verify.js               # alvos + Verifier
    verify.test.js
    processor.entry.js      # AudioWorkletProcessor (vira string no build)
    pitch.entry.js          # API da página: window.PitchKit
  test-data/                # WAVs gravados do cabo + notas de referência (.json)
web/
  pitch.js                  # gerado: processor como string + PitchKit
index.html                  # Options "Guitar input", ligação ao frame(), cores das notas
```

---

## 7. Esqueleto de código

### 7.1 `src/detect/fft.js`

```js
/* FFT complexa radix-2, in-place, sem alocações por chamada.
   Usada pelo MPM para calcular a autocorrelação em O(n log n). */
export class FFT {
  constructor(n){
    if (n & (n - 1)) throw new Error("FFT size must be a power of 2");
    this.n = n;
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++){
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++){
      this.cos[i] = Math.cos(2 * Math.PI * i / n);
      this.sin[i] = -Math.sin(2 * Math.PI * i / n);   // e^{-iθ}
    }
  }

  /** Transformada direta de this.re / this.im, no próprio lugar. */
  run(){
    const { n, re, im, rev, cos, sin } = this;
    for (let i = 0; i < n; i++){
      const j = rev[i];
      if (j > i){
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1){
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size){
        for (let k = 0; k < half; k++){
          const wr = cos[k * step], wi = sin[k * step];
          const a = start + k, b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr;        im[a] += ti;
        }
      }
    }
  }
}
```

### 7.2 `src/detect/mpm.js`

```js
import { FFT } from "./fft.js";

/* McLeod Pitch Method (McLeod & Wyvill 2005), com a NSDF calculada via FFT:
     r(τ) = autocorrelação = IFFT(|FFT(x)|²)
     m(τ) = Σ x[j]² + x[j+τ]², obtido por uma recorrência O(n)
     n'(τ) = 2·r(τ) / m(τ)
   Os buffers são reservados no construtor: o detect() não aloca memória. */
export class McLeodDetector {
  constructor(size, sampleRate, minFreq = 70, maxFreq = 1400, k = 0.93){
    this.size = size;
    this.sampleRate = sampleRate;
    this.k = k;
    this.fft = new FFT(size * 2);                       // 2n para a autocorrelação linear
    this.maxTau = Math.min(Math.ceil(sampleRate / minFreq), (size / 2) | 0);
    this.minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
    this.nsdf = new Float64Array(this.maxTau + 2);
    this.cand = new Int32Array(64);
  }

  /** x: Float32Array com `size` amostras. Preenche out {freq, clarity}; devolve true se houver pitch. */
  detect(x, out){
    const { size: n, fft, nsdf, maxTau, minTau, cand } = this;
    const { re, im } = fft, N2 = fft.n;

    // r(τ): FFT → espectro de potência → FFT outra vez. Como a potência é real e par,
    // a segunda FFT dá a IFFT multiplicada por N2.
    for (let i = 0; i < n; i++){ re[i] = x[i]; im[i] = 0; }
    for (let i = n; i < N2; i++){ re[i] = 0; im[i] = 0; }
    fft.run();
    for (let i = 0; i < N2; i++){ re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    fft.run();

    // m(τ) por recorrência, e a NSDF
    let m = 0;
    for (let j = 0; j < n; j++) m += x[j] * x[j];
    m *= 2;
    for (let tau = 0; tau <= maxTau + 1; tau++){
      if (tau > 0){ const a = x[tau - 1], b = x[n - tau]; m -= a * a + b * b; }
      nsdf[tau] = m > 1e-12 ? (2 * re[tau] / N2) / m : 0;
    }

    // key maxima: o pico mais alto de cada lobo positivo
    let count = 0, tau = 1;
    while (tau <= maxTau && nsdf[tau] > 0) tau++;      // saltar o lobo de τ≈0
    let best = -1, bestVal = -Infinity;
    for (; tau <= maxTau; tau++){
      const v = nsdf[tau], prev = nsdf[tau - 1];
      if (prev <= 0 && v > 0){ best = -1; bestVal = -Infinity; }
      if (v > 0 && v > bestVal){ best = tau; bestVal = v; }
      if (prev > 0 && v <= 0 && best >= 0){
        if (count < cand.length) cand[count++] = best;
        best = -1;
      }
    }
    if (best >= 0 && count < cand.length) cand[count++] = best;
    if (!count) return false;

    // escolher o primeiro candidato ≥ k·máximo (evita erros de oitava para baixo)
    let highest = 0;
    for (let i = 0; i < count; i++) highest = Math.max(highest, nsdf[cand[i]]);
    const thr = this.k * highest;
    for (let i = 0; i < count; i++){
      const t = cand[i];
      if (t < minTau || nsdf[t] < thr) continue;
      const a = nsdf[t - 1], b = nsdf[t], c = nsdf[t + 1];   // interpolação parabólica
      const den = a - 2 * b + c;
      const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
      out.freq = this.sampleRate / (t + shift);
      out.clarity = b - 0.25 * (a - c) * shift;
      return true;
    }
    return false;
  }
}
```

### 7.3 `src/detect/notes.js`

```js
export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];  // como no index.html

/** Hz de um número MIDI, com o centOffset do arranjo (por exemplo -50 para "meio-tom abaixo via cents"). */
export const midiToHz = (midi, centOffset = 0) => 440 * Math.pow(2, (midi - 69) / 12 + centOffset / 1200);

/** MIDI fracionário de uma frequência; com centOffset, o 0 cai em cima da afinação do arranjo. */
export const hzToMidi = (hz, centOffset = 0) => 69 + 12 * Math.log2(hz / 440) - centOffset / 100;

export function freqToNote(hz, centOffset = 0){
  const exact = hzToMidi(hz, centOffset), midi = Math.round(exact);
  return { midi, name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1,
           cents: (exact - midi) * 100 };
}

export const cents = (hz, refHz) => 1200 * Math.log2(hz / refHz);
```

### 7.4 `src/detect/processor.entry.js`

```js
/* AudioWorkletProcessor "playsong-pitch". O build.mjs transforma este ficheiro numa string,
   e a página carrega-o a partir de um Blob (addModule não aceita file://). */
import { McLeodDetector } from "./mpm.js";

const RMS_GATE = 0.01, MIN_CLARITY = 0.8;
const ONSET_GATE = 1e-5;        // energia média mínima por bloco de 128 amostras
const ONSET_RATIO = 2.0;        // o bloco tem de ter o dobro do envelope de pico
const ONSET_DECAY = 0.985;      // decaimento do envelope por bloco (~50 % em 120 ms)
const ONSET_HOLD = 0.05;        // s: um onset no máximo a cada 50 ms

class PitchProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.configure({ window: 2048, hop: 512, minFreq: 70, maxFreq: 1400 });
    this.freqs = new Float64Array(0);      // frequências pedidas pela página (Goertzel)
    this.env = 0;
    this.lastOnset = -1;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "config") this.configure(m);
      else if (m.type === "expect") this.freqs = Float64Array.from(m.freqs);
    };
  }

  configure({ window, hop, minFreq, maxFreq }){
    this.N = window; this.mask = window - 1; this.hop = hop;
    this.ring = new Float32Array(window);
    this.frame = new Float32Array(window);
    this.win = new Float32Array(window);           // frame × Hann, para o Goertzel
    this.hann = new Float32Array(window);
    for (let i = 0; i < window; i++) this.hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (window - 1));
    this.det = new McLeodDetector(window, sampleRate, minFreq, maxFreq);
    this.res = { freq: 0, clarity: 0 };
    this.pos = 0; this.since = 0;
  }

  process(inputs){
    const x = inputs[0] && inputs[0][0];             // o cabo é mono
    if (!x) return true;

    let e = 0;
    for (let i = 0; i < x.length; i++){
      const s = x[i];
      e += s * s;
      this.ring[this.pos] = s;
      this.pos = (this.pos + 1) & this.mask;
    }
    e /= x.length;

    // onset: subida brusca de energia acima de um envelope de pico que decai
    if (e > ONSET_GATE && e > ONSET_RATIO * this.env && currentTime - this.lastOnset > ONSET_HOLD){
      this.lastOnset = currentTime;
      this.port.postMessage({ type: "onset", time: currentTime, energy: e });
    }
    this.env = Math.max(e, this.env * ONSET_DECAY);

    this.since += x.length;
    if (this.since >= this.hop){
      this.since -= this.hop;
      this.analyse(currentTime + x.length / sampleRate);
    }
    return true;
  }

  analyse(endTime){
    const { N, mask, ring, frame, win, hann } = this;
    let sum = 0, sumW = 0;
    for (let i = 0; i < N; i++){
      const s = ring[(this.pos + i) & mask];
      frame[i] = s; sum += s * s;
      const w = s * hann[i];
      win[i] = w; sumW += w * w;
    }
    const rms = Math.sqrt(sum / N);

    let freq = 0, clarity = 0;
    if (rms > RMS_GATE && this.det.detect(frame, this.res) && this.res.clarity >= MIN_CLARITY){
      freq = this.res.freq; clarity = this.res.clarity;
    }

    // presença em cada frequência pedida: a fração da energia da janela concentrada nela
    // (cerca de 1 para um seno puro exatamente nessa frequência)
    const F = this.freqs, presence = new Float32Array(F.length);
    if (rms > RMS_GATE && sumW > 0){
      for (let k = 0; k < F.length; k++){
        const c = 2 * Math.cos(2 * Math.PI * F[k] / sampleRate);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++){ const s0 = win[i] + c * s1 - s2; s2 = s1; s1 = s0; }
        presence[k] = 3 * (s1 * s1 + s2 * s2 - c * s1 * s2) / (N * sumW);
      }
    }

    this.port.postMessage({
      type: "frame",
      time: endTime - N / 2 / sampleRate,              // centro da janela
      freq, clarity, rms,
      freqs: F, presence,
    });
  }
}

registerProcessor("playsong-pitch", PitchProcessor);
```

### 7.5 `src/detect/verify.js`

```js
import { cents, midiToHz } from "./notes.js";

export const DEFAULTS = {
  window: 0.12,        // s: ± janela de acerto
  cents: 50,           // tolerância de pitch
  look: 0.15,          // s após o onset (ou após t) em que se procura o pitch
  minFrames: 2,        // frames de pitch certos necessários
  chordShare: 0.6,     // fração das notas do acorde que têm de estar presentes
  presence: 0.06,      // presença mínima (soma dos harmónicos) para contar uma nota do acorde
  harmonics: 3,        // fundamental + 2 harmónicos
};

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
      bend: notes.length === 1 ? (n0.bn || 0) : 0,      // TODO fase 0: confirmar a unidade de bn
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
    for (let k = i; k < this.targets.length; k++) this.targets[k].result = null;
  }

  onset(t, energy){ this.onsets.push({ t, energy }); }

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
      if (g.t < now - W || g.kind !== "chord") continue;
      for (const x of g.notes) for (let h = 1; h <= H; h++) set.add(x.hz * h);
    }
    return [...set].sort((a, b) => a - b);
  }

  /**
   * Chamar a cada frame de render. `settled` = tempo de gráfico até ao qual já
   * chegaram todas as deteções (chartTime() - inLat - atraso do detetor).
   */
  update(settled){
    const W = this.o.window;
    while (this.next < this.targets.length && this.targets[this.next].t + W < settled){
      const g = this.targets[this.next++];
      g.result = this.judge(g);
      const s = this.stats;
      if (g.result){ s.hit++; s.streak++; s.best = Math.max(s.best, s.streak); }
      else { s.miss++; s.streak = 0; }
      for (const x of g.notes) x.n.hit = g.result;    // o draw() e a tab view leem n.hit
      this.onResult(g);
    }
    // descartar deteções que já não podem servir a nenhum alvo
    const keep = settled - 2 * W - this.o.look;
    while (this.onsets.length && this.onsets[0].t < keep) this.onsets.shift();
    while (this.frames.length && this.frames[0].t < keep) this.frames.shift();
  }

  judge(g){
    const { window: W, look } = this.o;
    const onset = this.nearestOnset(g.t, W);
    if (onset) this.stats.lag.push(onset.t - g.t);    // para o auto-ajuste da latência
    if (g.kind === "muted") return !!onset;
    if (!onset && !g.legato) return false;

    const from = onset ? onset.t : g.t - W, to = from + look + (g.legato ? W : 0);
    return g.kind === "chord" ? this.chordOk(g, from, to) : this.singleOk(g, from, to);
  }

  nearestOnset(t, W){
    let best = null;
    for (const o of this.onsets){
      const d = Math.abs(o.t - t);
      if (d <= W && (!best || d < Math.abs(best.t - t))) best = o;
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
```

### 7.6 `src/detect/pitch.entry.js` (API da página: `window.PitchKit`)

```js
/* global PROCESSOR_SOURCE */   // injetado pelo build.mjs (define)
import { Verifier, buildTargets, DEFAULTS } from "./verify.js";
import { freqToNote, midiToHz } from "./notes.js";

export { Verifier, buildTargets, DEFAULTS, freqToNote, midiToHz };

const loaded = new WeakSet();

/** Os nomes dos dispositivos só aparecem depois de o utilizador dar permissão. */
export async function listInputs(){
  const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
  probe.getTracks().forEach((t) => t.stop());
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
}

export const findCable = (list) => list.find((d) => /rocksmith|real\s*tone/i.test(d.label));

export async function connect(ctx, deviceId, onMessage){
  if (!loaded.has(ctx)){
    const url = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: "text/javascript" }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    loaded.add(ctx);
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,   // ESSENCIAL
    channelCount: 1,
  }});
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "playsong-pitch", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    channelCount: 1, channelCountMode: "explicit",
  });
  node.port.onmessage = (e) => onMessage(e.data);
  // A saída do worklet fica em silêncio; ligar ao destination só garante que o grafo o processa.
  src.connect(node).connect(ctx.destination);

  let lastKey = "";
  return {
    stream,
    config(c){ node.port.postMessage({ type: "config", ...c }); },
    expect(freqs){
      const key = freqs.join(",");
      if (key !== lastKey){ lastKey = key; node.port.postMessage({ type: "expect", freqs }); }
    },
    close(){
      node.port.onmessage = null;
      src.disconnect(); node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export const PRESETS = {
  guitar: { window: 2048, hop: 512,  minFreq: 70, maxFreq: 1400 },
  bass:   { window: 4096, hop: 1024, minFreq: 28, maxFreq: 500 },
};
```

### 7.7 `src/package.json`

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs ../web",
    "test": "vitest run"
  },
  "devDependencies": {
    "esbuild": "0.24.2",
    "vitest": "2.1.8"
  }
}
```

### 7.8 `src/build.mjs` — novo passo 3

```js
// 3. o detetor de notas: o processor do AudioWorklet vira string (carregado a partir de um Blob,
//    porque addModule não aceita file://), e a API da página fica em window.PitchKit.
{
  const proc = await esbuild.build({ entryPoints: [path.join(here, "detect", "processor.entry.js")],
                                     bundle: true, format: "iife", write: false, logLevel: "warning" });
  await esbuild.build({ entryPoints: [path.join(here, "detect", "pitch.entry.js")], bundle: true,
                        format: "iife", globalName: "PitchKit", outfile: path.join(out, "pitch.js"),
                        define: { PROCESSOR_SOURCE: JSON.stringify(proc.outputFiles[0].text) },
                        banner: { js: "// Generated by build.mjs - Play Song note detection." },
                        logLevel: "warning" });
}
```

### 7.9 `index.html` — integração

**Estado e prefs** (junto de `S` e `PREFS`):

```js
// em S:
inOn: false, inDevice: "", inLatMs: 60, inScore: true,
// em PREFS:
inOn: 0, inDevice: 0, inLatMs: [-50, 400], inScore: 0,
```

**Options**, uma secção nova antes de `<h4>Sync</h4>`:

```html
<h4>Guitar input</h4>
<div class="row"><label for="fInDev">Input</label><select id="fInDev"><option value="">— press Connect —</option></select></div>
<div class="row"><label for="fInOn">Connect (G)</label><input id="fInOn" type="checkbox"></div>
<div class="row"><label>Level</label><span class="inmeter"><i id="inLevel"></i></span></div>
<div class="row"><label for="fInScore">Score notes</label><input id="fInScore" type="checkbox" checked></div>
<div class="row"><label for="fInLat" title="Input + output latency, measured with Calibrate">Input latency (ms)</label>
  <span class="offwrap"><input id="fInLat" type="number" step="1" value="60"><button id="bInCal">Calibrate</button></span></div>
```

**Ligação**:

```js
/* ── guitar input ─────────────────────────────────────────────────────────── */
const IN = { kit: null, link: null, ver: null, level: 0, last: null };

async function inputStart(){
  audioInit();
  if (!window.PitchKit) await loadScript("web/pitch.js");
  IN.kit = window.PitchKit;
  const list = await IN.kit.listInputs();
  fillInputSelect(list);                                   // preenche #fInDev, pré-seleciona o cabo
  const dev = list.find(d => d.deviceId === S.inDevice) || IN.kit.findCable(list) || list[0];
  S.inDevice = dev ? dev.deviceId : "";
  IN.link = await IN.kit.connect(A.ctx, S.inDevice, inputMessage);
  inputArrangement();                                      // preset guitarra/baixo + alvos
  S.inOn = true; savePrefs();
}

function inputStop(){
  if (IN.link) IN.link.close();
  IN.link = null; S.inOn = false; savePrefs();
}

/* chamada também em selectArrangement(), depois do buildSynth(a) */
function inputArrangement(){
  if (!IN.link) return;
  const a = currentArr();
  IN.link.config(S.nStr === 4 ? IN.kit.PRESETS.bass : IN.kit.PRESETS.guitar);
  const targets = IN.kit.buildTargets(S.syn, eventMidi, (a && a.centOffset) || 0);
  IN.ver = new IN.kit.Verifier(targets, { onResult: inputResult,
                                          window: S.nStr === 4 ? 0.15 : 0.12 });
  IN.ver.seek(chartTime());
}

function inputMessage(m){
  if (m.type === "frame") IN.level = Math.max(m.rms, IN.level * 0.9);
  IN.last = m;                                             // o afinador usa o último frame
  if (!IN.ver || !A.playing || !S.inScore) return;
  const t = detChartTime(m.time);                          // secção 4
  if (m.type === "onset") IN.ver.onset(t, m.energy);
  else IN.ver.frame(t, m.freq, m.clarity, m.freqs, m.presence);
}

function inputResult(g){
  // hit light / HUD: S.hits passa a vir das deteções quando a entrada está ligada (fase 5)
}

/* em frame(), depois de S.time = songTime(): */
function inputPump(){
  if (!IN.ver || !A.playing) return;
  const now = chartTime() - S.inLatMs / 1000;
  IN.link.expect(IN.ver.expected(now));
  IN.ver.update(now - 0.06);                               // 60 ms de margem para o atraso do detetor
}
/* em seek(t): IN.ver && IN.ver.seek(t - S.offMs/1000) */
```

**Desenho** (fase 5): em `drawHead()` e em `tabRowSvg()`, ler `n.hit`:
- `true` → glow verde;
- `false` → cabeça escurecida com contorno vermelho;
- `undefined` → como hoje.

### 7.10 Testes

**`src/detect/fft.test.js`:** comparar com uma DFT ingénua.

```js
import { describe, expect, it } from "vitest";
import { FFT } from "./fft.js";

it("matches a naive DFT", () => {
  const n = 64, f = new FFT(n), x = Array.from({ length: n }, () => Math.random() - 0.5);
  x.forEach((v, i) => { f.re[i] = v; f.im[i] = 0; });
  f.run();
  for (let k = 0; k < n; k++){
    let re = 0, im = 0;
    for (let j = 0; j < n; j++){ re += x[j] * Math.cos(2*Math.PI*k*j/n); im -= x[j] * Math.sin(2*Math.PI*k*j/n); }
    expect(f.re[k]).toBeCloseTo(re, 9);
    expect(f.im[k]).toBeCloseTo(im, 9);
  }
});
```

**`src/detect/mpm.test.js`:** cordas sintéticas, da guitarra e do baixo.

```js
import { describe, expect, it } from "vitest";
import { McLeodDetector } from "./mpm.js";

const SR = 48000;
const pluck = (n, hz, amps = [1, 0.6, 0.4, 0.25, 0.15]) => Float32Array.from({ length: n }, (_, i) =>
  0.3 * amps.reduce((s, a, h) => s + a * Math.sin(2 * Math.PI * hz * (h + 1) * i / SR), 0));
const cents = (a, b) => 1200 * Math.log2(a / b);

describe("guitar preset", () => {
  const det = new McLeodDetector(2048, SR, 70, 1400), out = { freq: 0, clarity: 0 };
  it.each([["E2", 82.41], ["A2", 110], ["G3", 196], ["E4", 329.63], ["E6", 1318.51]])("%s", (_, hz) => {
    expect(det.detect(pluck(2048, hz), out)).toBe(true);
    expect(Math.abs(cents(out.freq, hz))).toBeLessThan(3);
  });
  it("silence → nothing", () => expect(det.detect(new Float32Array(2048), out)).toBe(false));
});

describe("bass preset", () => {
  const det = new McLeodDetector(4096, SR, 28, 500), out = { freq: 0, clarity: 0 };
  it.each([["B0 (drop)", 30.87], ["E1", 41.2], ["A1", 55], ["G2", 98]])("%s", (_, hz) => {
    expect(det.detect(pluck(4096, hz), out)).toBe(true);
    expect(Math.abs(cents(out.freq, hz))).toBeLessThan(5);
  });
});
```

**`src/detect/verify.test.js`:** fluxos sintéticos de deteções.
- Uma nota tocada 30 ms depois de `t` com o pitch certo → acerto.
- Sem onset → falha.
- Pitch errado por um meio-tom → falha.
- Acorde com 4 das 6 notas presentes → acerto.
- Nota abafada só com onset → acerto.
- Hammer-on sem onset, com o pitch certo → acerto.

**Fase 3:** WAVs reais do cabo em `src/test-data/`, cada um com um `.json` de notas esperadas. Um teste corre o processor offline (o `McLeodDetector` e o onset em Node) e mede a percentagem de acertos. É assim que se afinam os limiares.

---

## 8. Riscos e questões em aberto

- **`getUserMedia` a partir de `file://`:** o Chrome trata `file://` como contexto seguro, mas pode pedir permissão sempre. Verificar nos três browsers na fase 1. Em último caso, documentar `npx serve` ou o GitHub Pages para o modo de prática.
- **Erros de oitava** com captadores de humbucker: ajustar `k` do MPM (0,85–0,95). Em notas simples, o Verifier pode aceitar ±12 semitons como "acerto parcial".
- **Acordes graves:** com uma janela de 2048 amostras, a resolução do Goertzel é de cerca de 23 Hz, por isso Mi2 e Fá2 não se distinguem pela fundamental. Medido: um Mi2 puro dá presença de 0,95 na frequência do Fá2, e um Lá2 dá 0,90 na do Si♭2. Os harmónicos 2 e 3 ajudam. A regra de 60 % torna o sistema tolerante, como o próprio jogo.
- **Notas rápidas** (abaixo de 60 ms entre notas): o `ONSET_HOLD` de 50 ms e a janela de ±120 ms podem atribuir um onset ao alvo errado. Na fase 3, consumir cada onset uma só vez, ao alvo mais próximo.
- **Tremolo (`tr`) e sustains longos:** na primeira versão contam só o ataque. A verificação do sustain (pitch mantido até `t + sus`) fica como extensão da fase 4.
- **Custo em main thread:** o `Verifier` faz trabalho O(frames na janela) por alvo, irrelevante ao lado do `draw()`.
