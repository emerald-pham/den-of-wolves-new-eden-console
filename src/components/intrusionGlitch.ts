const SIGNAL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const SIGNAL_GLITCH_INTERVAL_MS = 1000;
export const SIGNAL_SCRAMBLE_CHANCE = 0.1;

function nextLetter(letter: string): string {
  const index = SIGNAL_ALPHABET.indexOf(letter);
  return SIGNAL_ALPHABET[(index + 1) % SIGNAL_ALPHABET.length] ?? 'X';
}

/** Distort letters independently while leaving word spacing and punctuation stable. */
export function scrambleSignalText(
  text: string,
  random: () => number = Math.random,
  ensureScramble = false,
): string {
  let changed = false;
  const letters = [...text].map((letter) => {
    if (!SIGNAL_ALPHABET.includes(letter) || random() >= SIGNAL_SCRAMBLE_CHANCE) {
      return letter;
    }

    const candidate = SIGNAL_ALPHABET[Math.floor(random() * SIGNAL_ALPHABET.length)] ?? 'X';
    changed = true;
    return candidate === letter ? nextLetter(letter) : candidate;
  });

  if (ensureScramble && !changed) {
    const firstLetter = letters.findIndex((letter) => SIGNAL_ALPHABET.includes(letter));
    if (firstLetter >= 0) letters[firstLetter] = nextLetter(letters[firstLetter] ?? 'X');
  }

  return letters.join('');
}
