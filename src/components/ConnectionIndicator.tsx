import type { ConnectionStatus } from '@/store/useSessionStore';

type IndicatorStatus = ConnectionStatus | 'blue';

/**
 * The status light in the header.
 *
 * Colour is the fast signal, but it is never the only one: the label carries
 * the same meaning for anyone who cannot distinguish the dots, and `role`
 * "status" makes a change announce itself politely to a screen reader rather
 * than interrupting whatever the player was doing.
 */

const LABELS: Record<IndicatorStatus, string> = {
  red: 'Offline',
  yellow: 'CONNECTED',
  green: 'In session',
  blue: 'NOT CONNECTED — AWAITING IRIS AUTHENTICATION',
};

const TITLES: Record<IndicatorStatus, string> = {
  red: 'No connection to Firebase',
  yellow: 'Connected to Firebase, not in a session',
  green: 'Connected to Firebase and in a session',
  blue: 'Connected to Firebase and awaiting Iris Authentication during Turn 0',
};

export default function ConnectionIndicator({
  status,
}: {
  status: IndicatorStatus;
}) {
  return (
    <span
      className="indicator"
      role="status"
      data-status={status}
      title={TITLES[status]}
    >
      <span className="indicator__dot" aria-hidden="true" />
      <span className="indicator__label">{LABELS[status]}</span>
    </span>
  );
}
