/**
 * Hostile copy previously shown by the launcher. Keep this list shared so a
 * future Wolf event cannot quietly grow a second, inaccessible message path.
 */
export const HACKING_MESSAGES = [
  'EARTH IS NOT FOR YOU',
  'BE AFRAID',
  'A COLD GRAVE AWAITS YOU',
  'YOU WILL DIE A HORRIBLE DEATH',
  'EVERYONE YOU KNOW IS A SPY',
  'WE CANNOT BE STOPPED',
] as const;

export const HACKING_MESSAGE_INITIAL_DELAY_MS = 20_000;
export const HACKING_MESSAGE_DURATION_MS = 5_000;
export const HACKING_MESSAGE_INTERVAL_MS = 60_000;

export type HackingMessage = (typeof HACKING_MESSAGES)[number];

/** Pick a different message while keeping the sequence unpredictable. */
export function nextHackingMessage(
  previous: HackingMessage | null,
  random: () => number = Math.random,
): HackingMessage {
  const first = HACKING_MESSAGES[0] ?? 'WE CANNOT BE STOPPED';
  if (previous === null) {
    return HACKING_MESSAGES[Math.floor(random() * HACKING_MESSAGES.length)] ?? first;
  }

  const previousIndex = HACKING_MESSAGES.indexOf(previous);
  if (previousIndex < 0) return first;
  const offset = 1 + Math.floor(random() * (HACKING_MESSAGES.length - 1));
  return HACKING_MESSAGES[(previousIndex + offset) % HACKING_MESSAGES.length] ?? first;
}

/** Select one existing message consistently for every console receiving a notice. */
export function hackingMessageForNoticeId(noticeId: string): HackingMessage {
  let hash = 2_166_136_261;
  for (const character of noticeId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return HACKING_MESSAGES[hash % HACKING_MESSAGES.length] ?? HACKING_MESSAGES[0];
}
