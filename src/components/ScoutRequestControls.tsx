import { useId, useState, type FormEvent } from 'react';
import {
  isScoutEntitlementHolder,
  isScoutingRequestPhaseAvailable,
  type ScoutEntitlementId,
} from '@/lib/scoutRequestAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import './ScoutRequestControls.css';

interface Props {
  readonly entitlementId: ScoutEntitlementId;
}

const LABELS: Readonly<Record<ScoutEntitlementId, string>> = {
  starlight: 'Starlight',
  hummingbird: 'Hummingbird',
  endeavour: 'Endeavour',
  'comms-officer': 'Comms Officer',
};

interface RetryAttempt {
  readonly entitlementId: ScoutEntitlementId;
  readonly targetCoordinate: string;
  readonly requestId: string;
}

function requestId(): string {
  return window.crypto.randomUUID();
}

export default function ScoutRequestControls({ entitlementId }: Props) {
  const id = useId();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [targetCoordinate, setTargetCoordinate] = useState('');
  const [retryAttempt, setRetryAttempt] = useState<RetryAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const authorized = isScoutEntitlementHolder(entitlementId, session, me);
  const phaseAvailable = isScoutingRequestPhaseAvailable(session);
  const hasLiveSnapshot = connection === 'live' && freshness === 'server';
  const retry = retryAttempt?.entitlementId === entitlementId ? retryAttempt : null;
  const coordinateIsValid = /^\d{4}$/.test(targetCoordinate);

  if (!authorized) return null;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || !phaseAvailable || !hasLiveSnapshot) return;
    const attempt = retry ?? {
      entitlementId,
      targetCoordinate,
      requestId: requestId(),
    };
    if (!/^\d{4}$/.test(attempt.targetCoordinate)) return;

    setRetryAttempt(attempt);
    setBusy(true);
    setError('');
    setConfirmation('');
    try {
      const { requestScout } = await import('@/lib/scoutRequestService');
      await requestScout(attempt);
      setRetryAttempt(null);
      setConfirmation('Request recorded. Check with the facilitator for follow-up.');
    } catch {
      setError('The request was not confirmed. Retry the same request to preserve its identity.');
    } finally {
      setBusy(false);
    }
  }

  function updateTarget(value: string): void {
    setTargetCoordinate(value.slice(0, 4));
    setError('');
    setConfirmation('');
  }

  const label = LABELS[entitlementId];
  const canSubmit = phaseAvailable && hasLiveSnapshot && coordinateIsValid && !busy;
  const retrying = retry !== null;

  return (
    <section className="scout-request" aria-label={`${label} scouting request`}>
      <p className="scout-request__eyebrow">{label} // printed procedure</p>
      <h3>Scouting request</h3>
      <p className="scout-request__description">
        Enter a printed four-digit system coordinate to record a request.
      </p>
      {phaseAvailable && <p className="scout-request__phase">Coordination phase available.</p>}

      {!phaseAvailable && (
        <p className="scout-request__notice">
          Scouting requests are available during an active Coordination phase.
        </p>
      )}
      {phaseAvailable && !hasLiveSnapshot && (
        <p className="scout-request__notice">
          Reconnect until the live session state returns before recording a request.
        </p>
      )}

      <form className="scout-request__form" onSubmit={(event) => void submit(event)}>
        <label className="scout-request__field" htmlFor={`${id}-coordinate`}>
          <span>Printed system coordinate</span>
          <input
            id={`${id}-coordinate`}
            name="targetCoordinate"
            autoComplete="off"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            value={retry?.targetCoordinate ?? targetCoordinate}
            disabled={busy || retrying}
            aria-describedby={`${id}-help`}
            onChange={(event) => updateTarget(event.target.value)}
          />
        </label>
        <button className="cic-action-button scout-request__submit" type="submit"
          disabled={!canSubmit}>
          {busy ? 'Recording request…' : retrying ? 'Retry same request' : 'Record request'}
        </button>
        <p className="scout-request__help" id={`${id}-help`}>
          Use the coordinate printed on your chart.
        </p>
      </form>

      {error && <p className="scout-request__notice scout-request__error" role="alert">{error}</p>}
      {confirmation && <p className="scout-request__notice" role="status">{confirmation}</p>}
    </section>
  );
}
