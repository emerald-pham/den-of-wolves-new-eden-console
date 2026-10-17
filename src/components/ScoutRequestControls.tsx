import './DecisionGuidance.css';
import { useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  isScoutEntitlementHolder,
  isScoutingRequestPhaseAvailable,
  type ScoutEntitlementId,
} from '@/lib/scoutRequestAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import ScoutReportController from './ScoutReportController';
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

const PROCEDURE_GUIDANCE: Readonly<Record<ScoutEntitlementId, string>> = {
  starlight: [
    'Choose a printed system within two jumps of AEGIS\'s current position on the printed chart.',
    'A second, distinct request in the same cycle requires Starlight to be fuelled in AEGIS\'s shuttle bay during that cycle.',
  ].join(' '),
  endeavour: 'Choose any printed system on the chart; Endeavour has unlimited range. One request per cycle.',
  'comms-officer': "Choose a printed system within one jump of AEGIS's current position on the chart. One request per cycle.",
  hummingbird: [
    'Choose a printed system within three jumps of Quellon\'s current position on the printed chart.',
    'Hummingbird allows one request per cycle.',
  ].join(' '),
};

interface RetryAttempt {
  readonly entitlementId: ScoutEntitlementId;
  readonly targetCoordinate: string;
  readonly requestId: string;
  readonly authorityKey: string;
}

interface StoredScoutDraft {
  readonly version: 1;
  readonly sessionId: string;
  readonly uid: string;
  readonly entitlementId: ScoutEntitlementId;
  readonly targetCoordinate: string;
}

interface RestoredScoutDraft {
  readonly targetCoordinate: string;
  readonly found: boolean;
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
    me.replacementStatus ?? null,
    me.activeConsoleRoleId ?? null,
  ]);
}

function currentScoutAuthorityKey(entitlementId: ScoutEntitlementId): string | null {
  const { session, me } = useSessionStore.getState();
  return scoutAuthorityKey(entitlementId, session, me);
}

function scoutDraftKey(sessionId: string | undefined, uid: string | undefined, entitlementId: ScoutEntitlementId): string | null {
  return sessionId && uid
    ? `pc10:scout-draft:${encodeURIComponent(sessionId)}:${encodeURIComponent(uid)}:${entitlementId}`
    : null;
}

function restoreScoutDraft(
  key: string | null,
  expected: Readonly<{ sessionId: string | undefined; uid: string | undefined; entitlementId: ScoutEntitlementId }>,
): RestoredScoutDraft {
  const empty: RestoredScoutDraft = { targetCoordinate: '', found: false };
  if (!key || typeof window === 'undefined') return empty;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return empty;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return empty;
    const value = parsed as Record<string, unknown>;
    if (value.version !== 1 || value.sessionId !== expected.sessionId || value.uid !== expected.uid ||
        value.entitlementId !== expected.entitlementId || typeof value.targetCoordinate !== 'string' ||
        !/^\d{0,4}$/.test(value.targetCoordinate)) return empty;

    return {
      targetCoordinate: value.targetCoordinate,
      found: true,
    };
  } catch {
    return empty;
  }
}

function saveScoutDraft(
  key: string | null,
  identity: Readonly<{ sessionId: string | undefined; uid: string | undefined; entitlementId: ScoutEntitlementId }>,
  targetCoordinate: string,
): void {
  if (!key || typeof window === 'undefined' || !identity.sessionId || !identity.uid ||
      !/^\d{0,4}$/.test(targetCoordinate)) return;
  try {
    const draft: StoredScoutDraft = {
      version: 1,
      sessionId: identity.sessionId,
      uid: identity.uid,
      entitlementId: identity.entitlementId,
      targetCoordinate,
    };
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage is a convenience only; current form state and server authority remain primary.
  }
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
  const authorityKey = scoutAuthorityKey(entitlementId, session, me);
  const draftStorageKey = scoutDraftKey(session?.id, me?.uid, entitlementId);
  const draftIdentity = useMemo(
    () => ({ sessionId: session?.id, uid: me?.uid, entitlementId }),
    [session?.id, me?.uid, entitlementId],
  );
  const [initialDraft] = useState(() => restoreScoutDraft(draftStorageKey, draftIdentity));
  const [targetCoordinate, setTargetCoordinate] = useState(initialDraft.targetCoordinate);
  const [retryAttempt, setRetryAttempt] = useState<RetryAttempt | null>(null);
  const [busyAttempt, setBusyAttempt] = useState<RetryAttempt | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const authorized = isScoutEntitlementHolder(entitlementId, session, me);
  const phaseAvailable = isScoutingRequestPhaseAvailable(session);
  const hasLiveSnapshot = connection === 'live' && freshness === 'server';
  const procedureGuidance = PROCEDURE_GUIDANCE[entitlementId];
  const authorityEpoch = useRef(0);
  const previousAuthority = useRef({ authorityKey, draftStorageKey });
  const retry = retryAttempt?.authorityKey === authorityKey ? retryAttempt : null;
  const busy = busyAttempt?.authorityKey === authorityKey;
  const coordinateIsValid = /^\d{4}$/.test(targetCoordinate);

  useLayoutEffect(() => {
    if (previousAuthority.current.authorityKey === authorityKey &&
        previousAuthority.current.draftStorageKey === draftStorageKey) return;
    const storageKeyChanged = previousAuthority.current.draftStorageKey !== draftStorageKey;
    previousAuthority.current = { authorityKey, draftStorageKey };
    authorityEpoch.current += 1;
    const restored = restoreScoutDraft(draftStorageKey, draftIdentity);
    if (!storageKeyChanged || restored.found) setTargetCoordinate(restored.targetCoordinate);
    setRetryAttempt(null);
    setBusyAttempt(null);
    setError('');
    setConfirmation('');
  }, [authorityKey, draftStorageKey, draftIdentity]);

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

    const attemptEpoch = authorityEpoch.current;
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
      if (authorityEpoch.current !== attemptEpoch ||
          currentScoutAuthorityKey(entitlementId) !== attempt.authorityKey) return;
      setRetryAttempt((current) => current?.requestId === attempt.requestId &&
        current.authorityKey === attempt.authorityKey ? null : current);
      setConfirmation('Request recorded. Your private scouting report will arrive automatically.');
    } catch (caught) {
      if (authorityEpoch.current !== attemptEpoch ||
          currentScoutAuthorityKey(entitlementId) !== attempt.authorityKey) return;
      if (isDefinitiveInvalidArgument(caught)) {
        setRetryAttempt((current) => current?.requestId === attempt.requestId &&
          current.authorityKey === attempt.authorityKey ? null : current);
        setError('The server rejected this request. Check the printed coordinate, then submit again.');
      } else {
        setError('The request was not confirmed. Retry the same request to preserve its identity.');
      }
    } finally {
      if (authorityEpoch.current === attemptEpoch) {
        setBusyAttempt((current) => current?.requestId === attempt.requestId &&
          current.authorityKey === attempt.authorityKey ? null : current);
      }
    }
  }

  function updateTarget(value: string): void {
    const nextCoordinate = value.slice(0, 4);
    setTargetCoordinate(nextCoordinate);
    saveScoutDraft(draftStorageKey, draftIdentity, nextCoordinate);
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
      {procedureGuidance && (
        <p className="scout-request__description decision-guidance" id={`${id}-procedure`}>
          {procedureGuidance}
        </p>
      )}
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
            aria-describedby={procedureGuidance
              ? `${id}-procedure ${id}-help`
              : `${id}-help`}
            onChange={(event) => updateTarget(event.target.value)}
          />
        </label>
        <button className="cic-action-button scout-request__submit" type="submit"
          disabled={!canSubmit} aria-describedby={`${id}-procedure ${id}-help`}>
          {busy ? 'Recording request…' : retrying ? 'Retry same request' : 'Record request'}
        </button>
        <p className="scout-request__help decision-guidance" id={`${id}-help`}>
          Recording uses a scouting request for this cycle. Your private report arrives here automatically; it does not move your craft.
        </p>
      </form>

      {error && <p className="scout-request__notice scout-request__error" role="alert">{error}</p>}
      {confirmation && <p className="scout-request__notice" role="status">{confirmation}</p>}
      <ScoutReportController refreshKey={confirmation} entitlementId={entitlementId} />
    </section>
  );
}
