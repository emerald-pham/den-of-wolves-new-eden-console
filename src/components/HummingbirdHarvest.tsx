import { useEffect, useRef, useState } from 'react';
import type { GameSession, HummingbirdHarvest as HummingbirdHarvestState, Player, ShuttleDocking } from '@/types/game';
import { subscribeHummingbirdHarvest } from '@/lib/firestore';
import {
  allocateHummingbirdHarvest,
  rollHummingbirdHarvest,
} from '@/lib/hummingbirdHarvestService';
import { captureSessionAuthority, isCurrentSessionAuthority, type SessionAuthorityCheckpoint } from '@/lib/sessionMutationAuthority';
import { phaseForSession } from '@/lib/turnPhase';
import { commandErrorCode, normalizeCommandError } from '@/lib/commandErrors';
import { useSessionStore } from '@/store/useSessionStore';

interface Props {
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

type HarvestAttempt =
  | Readonly<{ kind: 'roll'; requestId: string; expectedRevision: number }>
  | Readonly<{ kind: 'allocate'; requestId: string; expectedRevision: number; foodDieIndex: 0 | 1 }>;

interface HarvestAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly turn: number;
  readonly hostShipId: string;
  readonly checkpoint: SessionAuthorityCheckpoint;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && !('code' in error)) return error.message;
  return normalizeCommandError(error).message;
}

function uniqueHummingbirdHost(session: GameSession | null): string | undefined {
  const dockings = Array.isArray(session?.shuttleDockings) ? session.shuttleDockings : [];
  const rows = dockings.filter((row) => row.shuttleId === 'hummingbird');
  return rows.length === 1 && rows[0]?.shipId ? rows[0].shipId : undefined;
}

function explorerIsEntitled(me: Player | null): boolean {
  return me?.role === 'player' && me.activeConsoleRoleId === 'quellon-explorer' &&
    typeof me.replacementRoleId !== 'string';
}

function authorityForCurrentStore(expectedHostShipId?: string): HarvestAuthority | undefined {
  const state = useSessionStore.getState();
  const session = state.session;
  const me = state.me;
  const hostShipId = uniqueHummingbirdHost(session);
  const turn = session?.currentTurn ?? 1;
  const phase = session ? phaseForSession(session) : undefined;
  if (!session || !me || me.sessionId !== session.id || !explorerIsEntitled(me) ||
      !session.activeRoleIds?.includes('quellon-explorer') ||
      session.phase !== 'active' || !Number.isSafeInteger(turn) || turn < 1 ||
      !hostShipId || (expectedHostShipId !== undefined && hostShipId !== expectedHostShipId) ||
      !session.activeVesselIds?.includes(hostShipId) || !session.activeVesselIds.includes('quellon') ||
      session.shuttleFuelled?.hummingbird !== true ||
      phase?.airspace.state !== 'lifted' ||
      state.connection !== 'live' || state.sessionSnapshotFreshness !== 'server' ||
      !window.navigator.onLine) {
    return undefined;
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  return checkpoint
    ? { sessionId: session.id, uid: me.uid, turn, hostShipId, checkpoint }
    : undefined;
}

function authorityIsCurrent(expected: HarvestAuthority): boolean {
  if (!isCurrentSessionAuthority(expected.checkpoint)) return false;
  const current = authorityForCurrentStore(expected.hostShipId);
  return current?.sessionId === expected.sessionId && current.uid === expected.uid &&
    current.turn === expected.turn && current.hostShipId === expected.hostShipId;
}

function isUncertainTransportFailure(error: unknown): boolean {
  return ['aborted', 'cancelled', 'deadline-exceeded', 'internal', 'unknown', 'unavailable']
    .includes(commandErrorCode(error));
}

function newerHarvest(
  current: HummingbirdHarvestState | null,
  next: HummingbirdHarvestState | null,
): HummingbirdHarvestState | null {
  if (!next) return null;
  return !current || next.revision > current.revision ? next : current;
}

export default function HummingbirdHarvest({ docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const sessionSnapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const coordinationBlocked = phaseForSession(session)?.airspace.state !== 'lifted';
  const [harvest, setHarvest] = useState<HummingbirdHarvestState | null>(null);
  const harvestRef = useRef<HummingbirdHarvestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedFoodDieIndex, setSelectedFoodDieIndex] = useState<0 | 1 | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<HarvestAttempt | null>(null);
  const retryAttemptRef = useRef<HarvestAttempt | null>(null);
  const subscriptionGeneration = useRef(0);
  const sessionId = session?.id;
  const actorUid = me?.uid;
  const explorerEntitled = explorerIsEntitled(me) &&
    session?.activeRoleIds?.includes('quellon-explorer') === true;
  const sessionHummingbirdHost = uniqueHummingbirdHost(session);
  const activeHostAvailable = Boolean(sessionHummingbirdHost &&
    session?.activeVesselIds?.includes(sessionHummingbirdHost) &&
    session.activeVesselIds.includes('quellon'));
  const dockingMatchesSession = Boolean(
    docking && docking.shuttleId === 'hummingbird' && docking.shipId === sessionHummingbirdHost,
  );

  function setAttempt(attempt: HarvestAttempt | null): void {
    retryAttemptRef.current = attempt;
    setRetryAttempt(attempt);
  }

  function acceptHarvest(next: HummingbirdHarvestState | null): HummingbirdHarvestState | null {
    const accepted = newerHarvest(harvestRef.current, next);
    harvestRef.current = accepted;
    setHarvest(accepted);
    return accepted;
  }

  useEffect(() => {
    const generation = ++subscriptionGeneration.current;
    harvestRef.current = null;
    setHarvest(null);
    setSelectedFoodDieIndex(null);
    setAttempt(null);
    setError('');
    setNotice('');
    if (!sessionId || !actorUid || !explorerEntitled) return undefined;
    const unsubscribe = subscribeHummingbirdHarvest(
      sessionId,
      actorUid,
      next => {
        if (subscriptionGeneration.current !== generation) return;
        const accepted = acceptHarvest(next);
        if (accepted?.status === 'resolved') setSelectedFoodDieIndex(null);
      },
      () => undefined,
    );
    return () => {
      if (subscriptionGeneration.current === generation) subscriptionGeneration.current += 1;
      unsubscribe();
    };
  }, [actorUid, explorerEntitled, sessionId]);

  useEffect(() => {
    setAttempt(null);
    setSelectedFoodDieIndex(null);
    setNotice('');
  }, [
    docking?.shipId,
    fuelled,
    me?.activeConsoleRoleId,
    me?.replacementRoleId,
    me?.uid,
    session?.currentTurn,
    session?.phase,
    session?.turnPhase?.airspace.state,
    session?.turnPhase?.turn,
    sessionHummingbirdHost,
  ]);

  const visibleHarvest = explorerEntitled && session && me &&
    harvest?.sessionId === session.id && harvest.ownerUid === me.uid &&
    harvest.turn === (session.currentTurn ?? 1)
    ? harvest
    : null;
  const actorHarvest = explorerEntitled && session && me &&
    harvest?.sessionId === session.id && harvest.ownerUid === me.uid
    ? harvest
    : null;
  const pendingReceiptNeedsReconciliation = actorHarvest?.status === 'pending' &&
    (actorHarvest.turn !== (session?.currentTurn ?? 1) ||
      actorHarvest.hostShipId !== sessionHummingbirdHost);
  const unavailable = !docking || !fuelled || connection !== 'live' ||
    sessionSnapshotFreshness !== 'server' || !explorerEntitled || coordinationBlocked ||
    session?.phase !== 'active' || session?.shuttleFuelled?.hummingbird !== true ||
    !activeHostAvailable || !window.navigator.onLine || !dockingMatchesSession ||
    pendingReceiptNeedsReconciliation;
  const pending = visibleHarvest?.status === 'pending';
  const resolved = visibleHarvest?.status === 'resolved';

  useEffect(() => {
    if (!retryAttempt || !visibleHarvest || visibleHarvest.revision <= retryAttempt.expectedRevision) return;
    setAttempt(null);
    if (visibleHarvest.status === 'resolved') setSelectedFoodDieIndex(null);
  }, [retryAttempt, visibleHarvest]);

  async function runAttempt(attempt: HarvestAttempt): Promise<void> {
    if (busy || unavailable || !docking) return;
    if (attempt.kind === 'allocate' && (!visibleHarvest || visibleHarvest.status !== 'pending')) return;
    const authority = authorityForCurrentStore(docking.shipId);
    if (!authority) return;
    setAttempt(attempt);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const reply = attempt.kind === 'roll'
        ? await rollHummingbirdHarvest(attempt.expectedRevision, attempt.requestId)
        : await allocateHummingbirdHarvest(
          attempt.expectedRevision,
          attempt.foodDieIndex,
          attempt.requestId,
        );
      if (!authorityIsCurrent(authority)) {
        setAttempt(null);
        return;
      }
      if (!reply) {
        setAttempt(null);
        return;
      }
      const latest = acceptHarvest(reply.harvest);
      setAttempt(null);
      if (latest?.status === 'resolved') {
        setSelectedFoodDieIndex(null);
      } else if (attempt.kind === 'allocate') {
        setSelectedFoodDieIndex(attempt.foodDieIndex);
      }
      if (reply.status === 'stale') {
        setNotice(latest?.status === 'resolved'
          ? 'Harvest changed // the current private result is shown.'
          : 'Harvest changed // review the current private roll before choosing again.');
      }
    } catch (cause) {
      if (!authorityIsCurrent(authority)) {
        setAttempt(null);
        return;
      }
      if (isUncertainTransportFailure(cause)) {
        setAttempt(attempt);
        if (attempt.kind === 'allocate') setSelectedFoodDieIndex(attempt.foodDieIndex);
        setError('Outcome uncertain // retry this same request to check its result.');
      } else {
        setAttempt(null);
        setError(errorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  }

  function roll(): Promise<void> {
    if (busy || unavailable) return Promise.resolve();
    const currentAttempt = retryAttemptRef.current;
    const attempt = currentAttempt?.kind === 'roll'
      ? currentAttempt
      : {
        kind: 'roll' as const,
        expectedRevision: actorHarvest?.revision ?? 0,
        requestId: window.crypto.randomUUID(),
      };
    return runAttempt(attempt);
  }

  function allocate(foodDieIndex: 0 | 1): Promise<void> {
    if (busy || unavailable || !visibleHarvest || visibleHarvest.status !== 'pending') {
      return Promise.resolve();
    }
    const currentAttempt = retryAttemptRef.current;
    const attempt = currentAttempt?.kind === 'allocate'
      ? currentAttempt
      : {
        kind: 'allocate' as const,
        expectedRevision: visibleHarvest.revision,
        foodDieIndex,
        requestId: window.crypto.randomUUID(),
      };
    setSelectedFoodDieIndex(attempt.foodDieIndex);
    return runAttempt(attempt);
  }

  const activeRetry = retryAttempt;
  return (
    <section className="console-workspace__section hummingbird-harvest" aria-label="Hummingbird resource harvesting">
      <h3>Harvest allocation</h3>
      <p className="hummingbird-harvest__guidance">
        Coordination Phase // Fuelled Hummingbird rolls 2d6. Choose one die for food; the other becomes water in Hummingbird cargo.
      </p>
      {!docking && <p role="status">Unavailable // Hummingbird must be docked with a fleet ship.</p>}
      {pendingReceiptNeedsReconciliation && explorerEntitled && (
        <p role="status">Unavailable // This pending Hummingbird harvest no longer matches the current cycle or docking.</p>
      )}
      {docking && !fuelled && <p role="status">Unavailable // Hummingbird must be fuelled during the Team Phase.</p>}
      {docking && fuelled && session?.shuttleFuelled?.hummingbird !== true && (
        <p role="status">Unavailable // Hummingbird must be fuelled during the Team Phase.</p>
      )}
      {docking && fuelled && connection !== 'live' && <p role="status">Unavailable // Waiting for the live session connection.</p>}
      {docking && fuelled && connection === 'live' && coordinationBlocked && (
        <p role="status">Unavailable // Hummingbird harvesting requires the Coordination Phase.</p>
      )}
      {docking && fuelled && connection === 'live' && sessionHummingbirdHost && !activeHostAvailable && (
        <p role="status">Unavailable // Hummingbird must be docked with an active fleet ship.</p>
      )}
      {docking && fuelled && connection === 'live' && !window.navigator.onLine && (
        <p role="status">Unavailable // Reconnect to the live session before harvesting.</p>
      )}
      {docking && fuelled && connection === 'live' && !dockingMatchesSession && (
        <p role="status">Unavailable // Waiting for the current Hummingbird docking state.</p>
      )}
      {docking && fuelled && connection === 'live' && !explorerEntitled && (
        <p role="status">Unavailable // The active Quellon Explorer console is required.</p>
      )}
      {docking && fuelled && connection === 'live' && session?.phase !== 'active' && (
        <p role="status">Unavailable // Hummingbird harvesting requires active gameplay.</p>
      )}
      {visibleHarvest === null && !unavailable && !activeRetry && (
        <div className="hummingbird-harvest__actions">
          <button className="cic-action-button" type="button" disabled={busy} onClick={() => void roll()}>
            {busy ? 'Rolling…' : 'Roll 2d6 for harvest'}
          </button>
        </div>
      )}
      {!unavailable && pending && visibleHarvest && (
        <div className="hummingbird-harvest__allocation">
          <p role="status">Roll ready // choose which die becomes food.</p>
          {selectedFoodDieIndex !== null && (
            <p role="status">Die {selectedFoodDieIndex + 1} remains selected for food.</p>
          )}
          <div className="hummingbird-harvest__dice" aria-label="Hummingbird harvest dice">
            {visibleHarvest.rolls.map((die, index) => (
              <button key={`${visibleHarvest.requestId}-${index}`} className="cic-action-button" type="button"
                aria-pressed={selectedFoodDieIndex === index}
                disabled={busy || unavailable || activeRetry !== null}
                onClick={() => void allocate(index as 0 | 1)}>
                Die {index + 1}: {die} food / {visibleHarvest.rolls[index === 0 ? 1 : 0]} water
              </button>
            ))}
          </div>
        </div>
      )}
      {activeRetry?.kind === 'roll' && !unavailable && visibleHarvest === null && (
        <button className="cic-action-button" type="button" disabled={busy} onClick={() => void runAttempt(activeRetry)}>
          {busy ? 'Checking roll…' : 'Retry roll request'}
        </button>
      )}
      {activeRetry?.kind === 'allocate' && !unavailable && pending && visibleHarvest && (
        <button className="cic-action-button" type="button" disabled={busy}
          onClick={() => void runAttempt(activeRetry)}>
          {busy ? 'Checking allocation…' : `Retry Die ${activeRetry.foodDieIndex + 1} allocation`}
        </button>
      )}
      {!unavailable && resolved && visibleHarvest && (
        <p role="status">Resolved this cycle // {visibleHarvest.food} food and {visibleHarvest.water} water added to Hummingbird cargo.</p>
      )}
      {notice && !unavailable && <p role="status">{notice}</p>}
      {error && !unavailable && <p className="hummingbird-harvest__error" role="alert">{error}</p>}
    </section>
  );
}
