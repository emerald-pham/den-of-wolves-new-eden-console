import Intrusion from './Intrusion';

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

interface HackingMessageOverlayProps {
  readonly enabled?: boolean;
  readonly message: HackingMessage | null;
}

/**
 * Render a hacking message using the existing accessible-by-default intrusion
 * presentation. The default is deliberately disabled: callers must opt in
 * from an authoritative, context-specific gameplay event.
 */
export default function HackingMessageOverlay({
  enabled = false,
  message,
}: HackingMessageOverlayProps) {
  if (!enabled || message === null) return null;
  return <Intrusion message={message} />;
}
