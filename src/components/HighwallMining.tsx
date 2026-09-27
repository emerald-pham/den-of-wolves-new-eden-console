import { useState } from 'react';
import type { ShuttleControlEntry, ShuttleDocking } from '@/types/game';
import {
  canRetryHighwallMiningExactly,
  HighwallMiningUncertainError,
  retryHighwallMiningExactly,
  runHighwallMining,
  type HighwallMiningExactRetry,
  type HighwallMiningStaleReply,
} from '@/lib/highwallMiningService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { hasFreshSessionAuthority } from '@/lib/sessionMutationAuthority';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';

interface Props {
  readonly control?: ShuttleControlEntry | undefined;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

interface StaleRecovery {
  readonly resource: 'materials' | 'ore';
  readonly reply: HighwallMiningStaleReply;
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export default function HighwallMining({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const me = useSessionStore((state) => state.me)!;
  const connection = useSessionStore((state) => state.connection);
  const snapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [staleRecovery, setStaleRecovery] = useState<StaleRecovery>();
  const [exactRetry, setExactRetry] = useState<HighwallMiningExactRetry>();
  const state = session.highwallMining;
  const liveDockings = session.shuttleDockings?.filter((entry) => entry.shuttleId === 'highwall') ?? [];
  const currentDocking = session.shuttleDockings === undefined
    ? docking : liveDockings.length === 1 ? liveDockings[0] : undefined;
  const currentControl = session.shuttleControl === undefined ? control : session.shuttleControl.highwall;
  const currentOperations = state && state.cycle === session.currentTurn ? state.operations : [];
  const limit = fuelled ? 3 : 2;
  const isHolder = currentControl?.holderUid === me.uid;
  const activeRole = session.activeRoleIds?.includes('icebreaker-miner') === true;
  const activeVessel = session.activeVesselIds?.includes('icebreaker') === true;
  const phase = phaseForSession(session);
  const coordinationOpen = session.phase === 'active' && (session.currentTurn ?? 0) >= 1 &&
    phase?.airspace.state === 'lifted' && !phase.timerPause &&
    Date.now() < Date.parse(phase.openAirspaceEndsAt);
  const localGroupAuthority = typeof me.fleetGroupId === 'string' && me.fleetGroupId.trim().length > 0 &&
    session.playerDiscovery?.groupId === me.fleetGroupId &&
    session.playerDiscovery.fleetGroupVesselIds?.includes(currentDocking?.shipId ?? '') === true;
  const liveSnapshot = connection === 'live' && snapshotFreshness === 'server' && hasFreshSessionAuthority();
  const holderAuthority = liveSnapshot && session.phase === 'active' && me.role === 'player' &&
    isHolder && currentControl?.ownerRoleId === 'icebreaker-miner' && validRevision(currentControl.revision) &&
    activeRole && activeVessel && currentDocking?.shuttleId === 'highwall' && localGroupAuthority;
  const canExactRetry = exactRetry !== undefined && canRetryHighwallMiningExactly(exactRetry);
  const staleSnapshotCaughtUp = staleRecovery !== undefined && holderAuthority &&
    currentDocking?.shipId === staleRecovery.reply.hostShipId &&
    (session.currentTurn ?? 0) >= staleRecovery.reply.currentCycle &&
    (state?.revision ?? 0) >= staleRecovery.reply.currentRevision &&
    (currentControl?.revision ?? -1) >= staleRecovery.reply.currentControlRevision;
  const canFreshRetry = staleSnapshotCaughtUp && coordinationOpen && currentOperations.length < limit;
  const unavailable = busy || !currentDocking || !currentControl || !isHolder || !activeRole || !activeVessel ||
    connection !== 'live' || !coordinationOpen || currentOperations.length >= limit ||
    staleRecovery !== undefined || exactRetry !== undefined;

  const recoveryStatus = exactRetry
    ? canExactRetry
      ? 'Outcome uncertain // Retry the exact request to safely confirm whether it committed.'
      : 'Highwall authority changed // Exact retry is unavailable until the current holder state is restored.'
    : staleRecovery
      ? !holderAuthority || currentDocking?.shipId !== staleRecovery.reply.hostShipId
        ? 'Highwall authority changed // Refresh the current holder, fleet group, and dock before retrying.'
        : !staleSnapshotCaughtUp
          ? 'Mining state changed // Waiting for the current server snapshot before retrying.'
          : !coordinationOpen
            ? 'Highwall state is current // Wait for the Coordination Phase before retrying.'
            : currentOperations.length >= limit
              ? 'Highwall state is current // No mining operation remains this cycle.'
              : `Highwall state is current // Retry ${staleRecovery.resource} with a fresh request and current revisions.`
      : '';

  async function mine(
    resource: 'materials' | 'ore',
    exact?: HighwallMiningExactRetry,
    freshRetry = false,
  ): Promise<void> {
    if (busy || (!exact && (freshRetry
      ? (!canFreshRetry || !currentControl || !session.currentTurn)
      : (unavailable || !currentControl || !session.currentTurn)))) return;
    setBusy(true);
    setStatus('');
    try {
      const result = exact
        ? await retryHighwallMiningExactly(exact)
        : await runHighwallMining(
          resource, state?.revision ?? 0, currentControl!.revision, session.currentTurn!,
        );
      if (result.status === 'stale') {
        setExactRetry(undefined);
        setStaleRecovery({ resource, reply: result });
        return;
      }
      setStaleRecovery(undefined);
      setExactRetry(undefined);
      setStatus(`${result.status === 'replayed' ? 'Operation replayed' : 'Operation committed'} // ` +
        `${result.operation.rolls.join(' + ')} = ${result.operation.amount} ` +
        `${resource === 'ore' ? 'strytium ore' : 'materials'}.`);
    } catch (cause) {
      setStaleRecovery(undefined);
      if (cause instanceof HighwallMiningUncertainError) {
        setExactRetry(cause.retry);
        return;
      }
      setExactRetry(undefined);
      setStatus(cause instanceof Error && !('code' in cause)
        ? cause.message : normalizeCommandError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="console-workspace__section highwall-mining" aria-label="Highwall mining operations">
    <h3>Mining operations</h3>
    <p>Coordination Phase // Conduct two operations each cycle. A fuelled Highwall may conduct a third.</p>
    <p>Operations remaining // {Math.max(0, limit - currentOperations.length)} of {limit}</p>
    {!currentDocking && <p>Unavailable // Highwall must be docked with an active fleet ship.</p>}
    {!isHolder && <p>Unavailable // Only the current Highwall holder may mine.</p>}
    {!coordinationOpen && <p>Unavailable // Highwall mining requires the Coordination Phase.</p>}
    {!fuelled && currentOperations.length >= 2 && <p>Fuel Highwall during the Team Phase to unlock its third operation.</p>}
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button" disabled={unavailable}
        onClick={() => void mine('materials')}>Roll 1d6 materials</button>
      <button className="cic-action-button" type="button" disabled={unavailable}
        onClick={() => void mine('ore')}>Roll 3d6 strytium ore</button>
      {exactRetry && <button className="cic-action-button" type="button"
        disabled={busy || !canExactRetry} onClick={() => void mine(exactRetry.command.resource, exactRetry)}>
        Retry exact Highwall request
      </button>}
      {staleRecovery && <button className="cic-action-button" type="button"
        disabled={busy || !canFreshRetry} onClick={() => void mine(staleRecovery.resource, undefined, true)}>
        Retry selected Highwall operation
      </button>}
    </div>
    {currentOperations.length > 0 && <ol aria-label="Highwall mining results">
      {currentOperations.map((operation, index) => <li key={operation.requestId}>
        Operation {index + 1} // {operation.rolls.join(' + ')} = {operation.amount} {operation.resource}
      </li>)}
    </ol>}
    {(exactRetry || staleRecovery ? recoveryStatus : status) &&
      <p role="status">{exactRetry || staleRecovery ? recoveryStatus : status}</p>}
  </section>;
}
