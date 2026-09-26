import { useEffect, useId, useState, type FormEvent } from 'react';
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
  readonly authorityKey: string;
}

function requestId(): string {
  return window.crypto.randomUUID();
}

function scoutAuthorityKey(
  entitlementId: ScoutEntitlementId,
  session: ReturnType<typeof useSessionStore.getState>['session'],
  me: ReturnType<typeof useSessionStore.getState>['me'],
): string | null {
  if (!session || !me || !isScoutEntitlementHolder(entitlementId, session, me) ||
      typeof session.currentTurn !== 'number' || !Number.isSafeInteger(session.currentTurn)) {
    return null;
  }
  return JSON.stringify([
    entitlementId,
    session.id,
    me.uid,
    me.sessionId,
    session.currentTurn,
    me.role,
    me.assignedRoleId ?? null,
    me.seatId ?? null,
    me.replacementRoleId ?? null,
    me.activeConsoleRoleId ?? null,
  ]);
}

function currentScoutAuthorityKey(entitlementId: ScoutEntitlementId): string | null {
  const { session, me } = useSessionStore.getState();
  return scoutAuthorityKey(entitlementId, session, me);
}

function isDefinitiveInvalidArgument(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'functions/invalid-argument';
}

export default function ScoutRequestControls({ entitlementId }: Props) {
  const id = useId();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [targetCoordinate, setTargetCoordinate] = useState('');
  const [retryAttempt, setRetryAttempt] = useState<RetryAttempt | null>(null);
  const [busyAttempt, setBusyAttempt] = useState<RetryAttempt | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const authorized = isScoutEntitlementHolder(entitlementId, session, me);
  const phaseAvailable = isScoutingRequestPhaseAvailable(session);
  const hasLiveSnapshot = connection === 'live' && freshness === 'server';
  const authorityKey = scoutAuthorityKey(entitlementId, session, me);
  const retry = retryAttempt?.authorityKey === authorityKey ? retryAttempt : null;
  const busy = busyAttempt?.authorityKey === authorityKey;
  const coordinateIsValid = /^\d{4}$/.test(targetCoordinate);

  useEffect(() => {
    setRetryAttempt((current) => current?.authorityKey === authorityKey ? current : null);
    setBusyAttempt((current) => current?.authorityKey === authorityKey ? current : null);
    setError('');
    setConfirmation('');
  }, [authorityKey]);

  if (!authorized) return null;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || !authorityKey || !phaseAvailable || !hasLiveSnapshot) return;
    const attempt = retry ?? {
      entitlementId,
      targetCoordinate,
      requestId: requestId(),
      authorityKey,
    };
    if (!/^\d{4}$/.test(attempt.targetCoordinate)) return;

    setRetryAttempt(attempt);
    setBusyAttempt(attempt);
    setError('');
    setConfirmation('');
    try {
      const { requestScout } = await import('@/lib/scoutRequestService');
      await requestScout({
        entitlementId: attempt.entitlementId,
        targetCoordinate: attempt.targetCoordinate,
        requestId: attempt.requestId,
      });
      if (currentScoutAuthorityKey(entitlementId) !== attempt.authorityKey) return;
      setRetryAttempt((current) => current?.requestId === attempt.requestId &&
        current.authorityKey === attempt.authorityKey ? null : current);
      setConfirmation('Request recorded. Check with the facilitator for follow-up.');
    } catch (caught) {
      if (currentScoutAuthorityKey(entitlementId) !== attempt.authorityKey) return;
      if (isDefinitiveInvalidArgument(caught)) {
        setRetryAttempt((current) => current?.requestId === attempt.requestId &&
          current.authorityKey === attempt.authorityKey ? null : current);
        setError('The server rejected this request. Check the printed coordinate, then submit again.');
      } else {
        setError('The request was not confirmed. Retry the same request to preserve its identity.');
      }
    } finally {
      setBusyAttempt((current) => current?.requestId === attempt.requestId &&
        current.authorityKey === attempt.authorityKey ? null : current);
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
