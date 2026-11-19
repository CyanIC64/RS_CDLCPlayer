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
