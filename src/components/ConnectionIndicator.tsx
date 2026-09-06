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
  yellow: 'Connected',
  green: 'In session',
  blue: 'Connected, Awaiting Uplink',
};

const TITLES: Record<IndicatorStatus, string> = {
  red: 'No connection to Firebase',
  yellow: 'Connected to Firebase, not in a session',
  green: 'Connected to Firebase and in a session',
  blue: 'Connected to Firebase and awaiting CIC full uplink at Turn 1',
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
