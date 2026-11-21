// Tunings and chord names.

export const OPEN_GTR = [40, 45, 50, 55, 59, 64], OPEN_BASS = [28, 33, 38, 43];   // MIDI numbers of the open strings
export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const NAMED_TUNINGS = { "-2,0,0,0,-2,-2":"DADGAD", "-2,-2,0,0,0,-2":"Open G", "-2,0,0,-1,-2,-2":"Open D",
                               "0,2,2,1,0,0":"Open E", "0,0,2,2,2,0":"Open A" };

/* An arrangement's tuning (semitones per string, low string first) in words:
   "E Standard", "Drop D", a named open tuning or "Custom tuning", the notes of
   the open strings, and the capo. */
export function tuningText(a, nStr = 6, capo = 0){
  const open = nStr === 4 ? OPEN_BASS : OPEN_GTR;
  const t = open.map((_, i) => +((a.tuning || [])[i]) || 0);
  const nm = (i) => NOTE_NAMES[(((open[i] + t[i]) % 12) + 12) % 12];
  let name = NAMED_TUNINGS[t.join(",")] || "Custom tuning";
  if (t.every(v => v === t[0])) name = nm(0) + " Standard";
  else if (t[0] === t[1] - 2 && t.slice(1).every(v => v === t[1])) name = "Drop " + nm(0);
  return { name, notes: open.map((_, i) => nm(i)).join(" "), capo: capo > 0 ? "Capo " + capo : "" };
}

/* a chord name as printed: flats and sharps as ♭ and ♯ ("Bb/F#" -> "B♭/F♯") */
export function chordLabel(s){
  return String(s || "").trim().replace(/(^|\/)([A-G])b/g, "$1$2♭").replace(/#/g, "♯");
}
