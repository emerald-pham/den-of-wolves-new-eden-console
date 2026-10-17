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
import HummingbirdHarvestChoices, { type HummingbirdHarvestAttempt } from './HummingbirdHarvestChoices';

interface Props {
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

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
    typeof me.replacementRoleId !== 'string' && me.replacementStatus == null;
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
  const [retryAttempt, setRetryAttempt] = useState<HummingbirdHarvestAttempt | null>(null);
  const retryAttemptRef = useRef<HummingbirdHarvestAttempt | null>(null);
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

  function setAttempt(attempt: HummingbirdHarvestAttempt | null): void {
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
    me?.replacementStatus,
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
  useEffect(() => {
    if (!retryAttempt || !visibleHarvest || visibleHarvest.revision <= retryAttempt.expectedRevision) return;
    setAttempt(null);
    if (visibleHarvest.status === 'resolved') setSelectedFoodDieIndex(null);
  }, [retryAttempt, visibleHarvest]);

  async function runAttempt(attempt: HummingbirdHarvestAttempt): Promise<void> {
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

  const unavailableMessages = [
    !docking ? 'Unavailable // Hummingbird must be docked with a fleet ship.' : '',
    pendingReceiptNeedsReconciliation && explorerEntitled
      ? 'Unavailable // This pending Hummingbird harvest no longer matches the current cycle or docking.' : '',
    docking && !fuelled ? 'Unavailable // Hummingbird must be fuelled during the Team Phase.' : '',
    docking && fuelled && session?.shuttleFuelled?.hummingbird !== true
      ? 'Unavailable // Hummingbird must be fuelled during the Team Phase.' : '',
    docking && fuelled && connection !== 'live' ? 'Unavailable // Waiting for the live session connection.' : '',
    docking && fuelled && connection === 'live' && coordinationBlocked
      ? 'Unavailable // Hummingbird harvesting requires the Coordination Phase.' : '',
    docking && fuelled && connection === 'live' && sessionHummingbirdHost && !activeHostAvailable
      ? 'Unavailable // Hummingbird must be docked with an active fleet ship.' : '',
    docking && fuelled && connection === 'live' && !window.navigator.onLine
      ? 'Unavailable // Reconnect to the live session before harvesting.' : '',
    docking && fuelled && connection === 'live' && !dockingMatchesSession
      ? 'Unavailable // Waiting for the current Hummingbird docking state.' : '',
    docking && fuelled && connection === 'live' && !explorerEntitled
      ? 'Unavailable // The active Quellon Explorer console is required.' : '',
    docking && fuelled && connection === 'live' && session?.phase !== 'active'
      ? 'Unavailable // Hummingbird harvesting requires active gameplay.' : '',
  ].filter((message) => message.length > 0);

  return <HummingbirdHarvestChoices
    view={{
      available: !unavailable,
      unavailableMessages,
      harvest: visibleHarvest,
      retryAttempt,
      selectedFoodDieIndex,
      busy,
      notice,
      error,
    }}
    onRoll={() => void roll()}
    onAllocate={foodDieIndex => void allocate(foodDieIndex)}
    onRetry={attempt => void runAttempt(attempt)}
  />;
}
