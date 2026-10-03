import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import {
  hasCurrentChacauHolderAuthority,
  repairConsolesFromChacau,
  type ChacauRepairAuthorityBinding,
  type ChacauRepairCommand,
  type ChacauRepairServiceResult,
  type ChacauRepairStaleResult,
} from '@/lib/chacauRepairService';
import { parseChacauRepairLedger } from '@/lib/chacauRepairLedger';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

interface ChacauStaleRecovery {
  readonly reply: ChacauRepairStaleResult;
  readonly binding: ChacauRepairAuthorityBinding;
  readonly checkpoint: SessionAuthorityCheckpoint;
}

interface ChacauExactRetry {
  readonly command: ChacauRepairCommand;
  readonly binding: ChacauRepairAuthorityBinding;
  readonly checkpoint: SessionAuthorityCheckpoint;
}

function sameSystemIds(left: readonly string[], right: readonly string[]): boolean {
  const sortedRight = [...right].sort();
  const sortedLeft = [...left].sort();
  return sortedLeft.length === sortedRight.length &&
    sortedLeft.every((id, index) => id === sortedRight[index]);
}

function staleReplyMatchesCommand(
  result: ChacauRepairStaleResult,
  sessionId: string,
  command: ChacauRepairCommand,
): boolean {
  return result.sessionId === sessionId && result.requestId === command.requestId &&
    result.shuttleId === 'chacau' && result.expectedHostShipId === command.expectedHostShipId &&
    sameSystemIds(result.systemIds, command.systemIds) &&
    result.expectedControlRevision === command.expectedControlRevision &&
    result.expectedRepairRevision === command.expectedRepairRevision &&
    result.expectedCycle === command.expectedCycle;
}

export default function ChacauRepairPanel({ control, docking, fuelled }: Props) {
  const session = useSessionStore(state => state.session)! as GameSession;
  const me = useSessionStore(state => state.me)!;
  const [systemIds, setSystemIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{
    readonly checkpoint: SessionAuthorityCheckpoint;
    readonly message: string;
  } | null>(null);
  const [error, setError] = useState<{
    readonly checkpoint: SessionAuthorityCheckpoint;
    readonly message: string;
  } | null>(null);
  const [retry, setRetry] = useState<ChacauExactRetry | null>(null);
  const [staleRecovery, setStaleRecovery] = useState<ChacauStaleRecovery | null>(null);
  const pendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const identity = JSON.stringify([session.id, me.uid]);
  const sessionControl = session.shuttleControl?.chacau;
  const currentControl = sessionControl ?? control;

  const parsedLedger = parseChacauRepairLedger(session.chacauRepairs);
  const repairHistoryValid = parsedLedger !== null && parsedLedger.cycle <= (session.currentTurn ?? 0);
  const ledger = repairHistoryValid ? parsedLedger! : undefined;
  const repairRevision = ledger?.revision ?? 0;
  const currentCycle = session.currentTurn ?? 0;
  const hostsThisCycle = ledger && ledger.cycle === currentCycle ? ledger.hosts : [];
  const hostsUsedThisCycle = ledger && ledger.cycle === currentCycle ? ledger.totalHostsUsed ?? hostsThisCycle.length : 0;
  const repairedOnHost = docking
    ? hostsThisCycle.find(host => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const hostAlreadyUsed = Boolean(docking && hostsThisCycle.some(host => host.shipId === docking.shipId));
  const repairShipAvailable = hostAlreadyUsed || hostsUsedThisCycle === 0 ||
    (hostsUsedThisCycle === 1 && fuelled);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const damage = docking ? session.shipDamage?.[docking.shipId] : undefined;
  const repairOptions = docking
    ? (damage?.damagedSystemIds ?? []).filter(id => !repairedOnHost.includes(id)) : [];
  const staleSelectedIds = systemIds.filter(id => !repairOptions.includes(id));
  const visibleSystemIds = [...repairOptions, ...staleSelectedIds];
  const selectionIsCurrent = systemIds.length >= 1 && systemIds.every(id => repairOptions.includes(id));
  const materials = docking ? session.shipResources?.[docking.shipId]?.materials ?? 0 : 0;
  const repairDeadline = session.turnPhase?.openAirspaceEndsAt
    ? Date.parse(session.turnPhase.openAirspaceEndsAt) : Number.NaN;
  const turnPhase = session.turnPhase;
  const repairWindowOpen = session.phase === 'active' && currentCycle >= 1 &&
    turnPhase !== undefined && turnPhase.turn === currentCycle &&
    turnPhase.airspace.state === 'lifted' && turnPhase.timerPause === undefined &&
    Number.isFinite(repairDeadline) && Date.now() < repairDeadline;
  const authorityBinding: ChacauRepairAuthorityBinding = {
    sessionId: session.id,
    uid: me.uid,
    role: me.role,
    assignedRoleId: me.assignedRoleId,
    activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId: me.fleetGroupId ?? '',
    ownerUid: currentControl.ownerUid ?? '',
    expectedHostShipId: docking?.shipId ?? '',
    expectedControlRevision: currentControl.revision,
    expectedRepairRevision: repairRevision,
    expectedCycle: currentCycle,
  };
  const hasCurrentAuthority = hasCurrentChacauHolderAuthority(authorityBinding, true);
  const projectedDockings = session.shuttleDockings?.filter(entry => entry.shuttleId === 'chacau') ?? [];
  const propsMatchProjection = sessionControl?.revision === control.revision &&
    sessionControl?.ownerUid === control.ownerUid && sessionControl?.holderUid === control.holderUid &&
    projectedDockings.length === 1 && projectedDockings[0]?.shipId === docking?.shipId;
  const isHolder = currentControl.shuttleId === 'chacau' &&
    currentControl.ownerRoleId === 'refinery-124-engineer' && me.role === 'player' &&
    me.uid === currentControl.holderUid && me.assignedRoleId === 'refinery-124-engineer' &&
    me.activeConsoleRoleId === 'refinery-124-engineer';
  const selectedMaterials = systemIds.length * 4;
  const canSubmit = repairHistoryValid && hasCurrentAuthority && propsMatchProjection && Boolean(docking) &&
    repairWindowOpen && repairShipAvailable && repairSlotsRemaining > 0 && selectionIsCurrent &&
    systemIds.length <= Math.min(2, repairSlotsRemaining) && materials >= selectedMaterials &&
    damage?.destroyed !== true;
  const retryCommand = retry &&
    isCurrentSessionAuthority(retry.checkpoint) &&
    hasCurrentChacauHolderAuthority(retry.binding, true) ? retry : null;
  const pendingForCurrentActor = pending && pendingRef.current?.sessionId === session.id &&
    pendingRef.current.uid === me.uid;
  const staleSnapshotCurrent = staleRecovery !== null &&
    isCurrentSessionAuthority(staleRecovery.checkpoint) &&
    hasCurrentChacauHolderAuthority(staleRecovery.binding, true) && repairHistoryValid &&
    currentCycle >= staleRecovery.reply.currentCycle &&
    (sessionControl?.revision ?? -1) >= staleRecovery.reply.currentControlRevision &&
    repairRevision >= staleRecovery.reply.currentRepairRevision &&
    docking?.shipId === staleRecovery.reply.expectedHostShipId && propsMatchProjection;
  const canRetryStale = Boolean(staleSnapshotCurrent && canSubmit);
  const authoritySignal = JSON.stringify([
    identity, me.role, me.assignedRoleId, me.activeConsoleRoleId, me.fleetGroupId,
    me.connected, session.phase, session.currentTurn, session.activeRoleIds,
    session.activeVesselIds, session.playerDiscovery?.groupId,
    session.playerDiscovery?.fleetGroupVesselIds, currentControl.ownerUid,
    currentControl.holderUid, currentControl.revision, projectedDockings,
  ]);

  useEffect(() => {
    setSystemIds([]);
    setStatus(null);
    setError(null);
    setRetry(null);
    setStaleRecovery(null);
  }, [identity, docking?.shipId]);

  useEffect(() => {
    pendingRef.current = null;
    setPending(false);
  }, [identity]);

  useEffect(() => {
    if (retry && (!isCurrentSessionAuthority(retry.checkpoint) ||
        !hasCurrentChacauHolderAuthority(retry.binding, true))) {
      setRetry(null);
      setError({
        checkpoint: retry.checkpoint,
        message: 'Chacau repair authority changed while the request was pending.',
      });
    }
    if (staleRecovery && (!isCurrentSessionAuthority(staleRecovery.checkpoint) ||
        !hasCurrentChacauHolderAuthority(staleRecovery.binding, true))) {
      setRetry(null);
      setStaleRecovery(null);
      setError({
        checkpoint: staleRecovery.checkpoint,
        message: 'Chacau repair authority or Coordination changed while the request was pending.',
      });
    }
  }, [authoritySignal, retry, staleRecovery]);

  function chooseConsole(systemId: string, checked: boolean): void {
    setRetry(null);
    setError(null);
    setStatus(null);
    setSystemIds(current => checked
      ? current.includes(systemId) ? current : [...current, systemId]
      : current.filter(id => id !== systemId));
  }

  async function submitRepair(): Promise<void> {
    const current = useSessionStore.getState();
    const currentSession = current.session as GameSession | undefined;
    const currentMe = current.me;
    const checkpoint = captureSessionAuthority(currentSession?.id ?? '', currentMe?.uid);
    if (!checkpoint || !currentSession || !currentMe || !isCurrentSessionAuthority(checkpoint)) return;
    const existingPending = pendingRef.current;
    if (existingPending?.sessionId === checkpoint.sessionId && existingPending.uid === checkpoint.uid) return;

    const exactRetry = retry && hasCurrentChacauHolderAuthority(retry.binding, true) ? retry : null;
    if (retry && !exactRetry) return;
    const freshStaleRetry = staleRecovery !== null;
    if (freshStaleRetry && !canRetryStale) return;
    if (!exactRetry && !freshStaleRetry && !canSubmit) return;

    const liveSession = currentSession;
    const liveControl = liveSession.shuttleControl?.chacau;
    const liveLedger = parseChacauRepairLedger(liveSession.chacauRepairs);
    if (!liveControl || !liveLedger || !docking) return;
    const command: ChacauRepairCommand = exactRetry?.command ?? {
      requestId: window.crypto.randomUUID(),
      systemIds: [...systemIds],
      expectedControlRevision: liveControl.revision,
      expectedRepairRevision: liveLedger.revision,
      expectedCycle: liveSession.currentTurn ?? 0,
      expectedHostShipId: docking.shipId,
    };
    const binding: ChacauRepairAuthorityBinding = exactRetry?.binding ?? {
      sessionId: liveSession.id,
      uid: currentMe.uid,
      role: currentMe.role,
      assignedRoleId: currentMe.assignedRoleId,
      activeConsoleRoleId: currentMe.activeConsoleRoleId,
      fleetGroupId: currentMe.fleetGroupId ?? '',
      ownerUid: liveControl.ownerUid,
      expectedHostShipId: command.expectedHostShipId,
      expectedControlRevision: command.expectedControlRevision,
      expectedRepairRevision: command.expectedRepairRevision,
      expectedCycle: command.expectedCycle,
    };
    if (!hasCurrentChacauHolderAuthority(binding, true)) return;

    pendingRef.current = checkpoint;
    setPending(true);
    setStatus(null);
    setError(null);
    setRetry({ command, binding, checkpoint });
    setStaleRecovery(null);
    const isCurrentRequest = () => pendingRef.current === checkpoint;
    try {
      const result: ChacauRepairServiceResult = await repairConsolesFromChacau(command);
      if (!isCurrentRequest()) return;
      if (result.status === 'stale') {
        if (!staleReplyMatchesCommand(result, binding.sessionId, command)) {
          setRetry(null);
          setError({
            checkpoint,
            message: 'Chacau repair returned an invalid stale request binding. Refresh before retrying.',
          });
          return;
        }
        if (!hasCurrentChacauHolderAuthority(binding, true)) {
          setRetry(null);
          setStaleRecovery(null);
          setError({
            checkpoint,
            message: 'Chacau repair authority or Coordination changed while the request was pending.',
          });
          return;
        }
        setRetry(null);
        setStaleRecovery({ reply: result, binding, checkpoint });
        setStatus({
          checkpoint,
          message: 'Chacau repair state changed. Review the current live state before retrying.',
        });
        return;
      }
      if (!hasCurrentChacauHolderAuthority(binding, false)) {
        setRetry(null);
        setStaleRecovery(null);
        setError({
          checkpoint,
          message: 'Chacau repair authority changed while the request was pending.',
        });
        return;
      }
      setStatus({
        checkpoint,
        message: result.status === 'replayed'
          ? 'This repair was already recorded // ' + result.materialsRemaining + ' materials remain.'
          : 'Repaired ' + result.systemIds.length + ' console' +
            (result.systemIds.length === 1 ? '' : 's') + ' // ' +
            result.materialsRemaining + ' materials remain.',
      });
      setRetry(null);
      setStaleRecovery(null);
      setSystemIds([]);
    } catch (cause) {
      if (!isCurrentRequest()) return;
      if (hasCurrentChacauHolderAuthority(binding, true)) {
        setError({
          checkpoint,
          message: cause instanceof Error ? cause.message : 'Chacau repair failed.',
        });
      } else {
        setRetry(null);
        setStaleRecovery(null);
        setError({
          checkpoint,
          message: 'Chacau repair authority or Coordination changed while the request was pending.',
        });
      }
    } finally {
      if (pendingRef.current === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  const hasStaleRetry = staleRecovery !== null;
  return <section className="console-workspace__section shuttle-control" aria-label="Chacau console repair">
    <p className="console-workspace__eyebrow">Repair rig // docked host</p>
    <h3>Repair damaged consoles</h3>
    <p>Spend 4 materials per console to repair up to 2 consoles on this ship. A fuelled Chacau may repair a second ship in the same cycle.</p>
    {docking
      ? <p>Docked host // {findShip(docking.shipId)?.name ?? docking.shipId} // materials // {materials} // repair slots remaining // {repairSlotsRemaining}</p>
      : <p>Dock Chacau before repairing consoles.</p>}
    {!isHolder && <p>The current Refinery 124 Engineer holding Chacau controls repairs.</p>}
    {!repairWindowOpen && <p>Chacau repairs open during Coordination Phase.</p>}
    {hostsUsedThisCycle === 1 && !hostAlreadyUsed && !fuelled &&
      <p>Fuel Chacau before repairing a second ship this cycle.</p>}
    {hostsUsedThisCycle >= 2 && !hostAlreadyUsed &&
      <p>Chacau may repair at most two ships this cycle.</p>}
    {damage?.destroyed && <p>A destroyed ship cannot receive Chacau repairs.</p>}
    {repairOptions.length === 0 && <p>No damaged consoles are eligible on this ship.</p>}
    {staleSelectedIds.length > 0 &&
      <p>One or more selected consoles are no longer eligible in the current repair state.</p>}
    {systemIds.length > 0 && materials < selectedMaterials &&
      <p>This repair needs {selectedMaterials} materials; the host has {materials}.</p>}
    {!repairHistoryValid && <p>Chacau repair history is unavailable. Refresh the live session before repairing.</p>}
    <fieldset disabled={!repairHistoryValid || pendingForCurrentActor || !isHolder || !docking ||
      !repairWindowOpen || !repairShipAvailable || repairSlotsRemaining === 0}>
      <legend>Damaged consoles</legend>
      {visibleSystemIds.map(systemId => {
        const checked = systemIds.includes(systemId);
        const atCapacity = systemIds.length >= Math.min(2, repairSlotsRemaining);
        const name = findShip(docking?.shipId)?.systems?.find(system => system.id === systemId)?.name ??
          systemId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        return <label key={systemId}>
          <input type="checkbox" checked={checked} disabled={!checked && atCapacity}
            onChange={event => chooseConsole(systemId, event.target.checked)} /> {name}
        </label>;
      })}
    </fieldset>
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button"
        disabled={pendingForCurrentActor ||
          (retry ? !retryCommand : hasStaleRetry ? !canRetryStale : !canSubmit)}
        onClick={() => void submitRepair()}>
        {pendingForCurrentActor ? 'Repairing consoles…' : retryCommand ? 'Retry exact repair request' :
          hasStaleRetry ? 'Retry repair with current revision' : 'Repair selected consoles'}
      </button>
    </div>
    {error && error.checkpoint.sessionId === session.id && error.checkpoint.uid === me.uid &&
      <p role="alert">{error.message}</p>}
    {retryCommand && !pendingForCurrentActor &&
      <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {staleRecovery && !staleSnapshotCurrent && !pendingForCurrentActor &&
      <p>The current live Chacau state is still updating. Wait for it before retrying.</p>}
    {staleRecovery && staleSnapshotCurrent && staleSelectedIds.length > 0 && !pendingForCurrentActor &&
      <p>Review the selected consoles; no longer eligible consoles cannot be retried.</p>}
    {status?.checkpoint.sessionId === session.id && status.checkpoint.uid === me.uid &&
      <p role="status">{status.message}</p>}
  </section>;
}
