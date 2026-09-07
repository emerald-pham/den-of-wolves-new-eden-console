import Intrusion from './Intrusion';
import type { HackingMessage } from '@/lib/hackingMessages';

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
