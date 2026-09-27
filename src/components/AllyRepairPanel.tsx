import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import { parseAllyRepairLedger } from '@/lib/allyRepairLedger';
import {
  hasCurrentAllyHolderAuthority,
  repairConsolesFromAlly,
  type AllyRepairAuthorityBinding,
  type AllyRepairCommand,
  type AllyRepairServiceResult,
  type AllyRepairStaleResult,
} from '@/lib/allyRepairService';
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

interface AllyStaleRecovery {
  readonly reply: AllyRepairStaleResult;
  readonly binding: AllyRepairAuthorityBinding;
}

interface AllyExactRetry {
  readonly command: AllyRepairCommand;
  readonly binding: AllyRepairAuthorityBinding;
}

function sameSystemIds(left: readonly string[], right: readonly string[]): boolean {
  const sortedRight = [...right].sort();
  return left.length === sortedRight.length && left.every((id, index) => id === sortedRight[index]);
}

function staleReplyMatchesCommand(
  result: AllyRepairStaleResult,
  sessionId: string,
  command: AllyRepairCommand,
): boolean {
  return result.sessionId === sessionId && result.requestId === command.requestId &&
    result.shuttleId === 'ally' && result.expectedHostShipId === command.expectedHostShipId &&
    sameSystemIds(result.systemIds, command.systemIds) &&
    result.expectedControlRevision === command.expectedControlRevision &&
    result.expectedRepairRevision === command.expectedRepairRevision &&
    result.expectedCycle === command.expectedCycle;
}

export default function AllyRepairPanel({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)! as GameSession;
  const me = useSessionStore((state) => state.me)!;
  const [systemIds, setSystemIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<AllyExactRetry | null>(null);
  const [staleRecovery, setStaleRecovery] = useState<AllyStaleRecovery | null>(null);
  const pendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const identity = JSON.stringify([session.id, me.uid]);
  const sessionControl = session.shuttleControl?.ally;
  const currentControl = sessionControl ?? control;

  const parsedLedger = parseAllyRepairLedger(session.allyRepairs);
  const repairHistoryValid = parsedLedger !== null && parsedLedger.cycle <= (session.currentTurn ?? 0);
  const ledger = repairHistoryValid ? parsedLedger! : undefined;
  const repairRevision = ledger?.revision ?? 0;
  const currentCycle = session.currentTurn ?? 0;
  const hostsThisCycle = ledger && ledger.cycle === currentCycle ? ledger.hosts : [];
  const repairedOnHost = docking
    ? hostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const hostAlreadyUsed = Boolean(docking && hostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = hostAlreadyUsed || hostsThisCycle.length === 0 ||
    (hostsThisCycle.length === 1 && fuelled);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const damage = docking ? session.shipDamage?.[docking.shipId] : undefined;
  const repairOptions = docking
    ? (damage?.damagedSystemIds ?? []).filter((id) => !repairedOnHost.includes(id)) : [];
  const staleSelectedIds = systemIds.filter((id) => !repairOptions.includes(id));
  const visibleSystemIds = [...repairOptions, ...staleSelectedIds];
  const selectionIsCurrent = systemIds.length >= 1 && systemIds.every((id) => repairOptions.includes(id));
  const materials = docking ? session.shipResources?.[docking.shipId]?.materials ?? 0 : 0;
  const repairDeadline = session.turnPhase?.openAirspaceEndsAt
    ? Date.parse(session.turnPhase.openAirspaceEndsAt) : Number.NaN;
  const turnPhase = session.turnPhase;
  const repairWindowOpen = session.phase === 'active' && currentCycle >= 1 &&
    turnPhase !== undefined && turnPhase.turn === currentCycle &&
    turnPhase.airspace.state === 'lifted' && turnPhase.timerPause === undefined &&
    Number.isFinite(repairDeadline) && Date.now() < repairDeadline;
  const authorityBinding: AllyRepairAuthorityBinding = {
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
  const hasCurrentAuthority = hasCurrentAllyHolderAuthority(authorityBinding, true);
  const propsMatchProjection = sessionControl?.revision === control.revision &&
    sessionControl?.ownerUid === control.ownerUid && sessionControl?.holderUid === control.holderUid &&
    Boolean(docking && session.shuttleDockings?.filter((entry) => entry.shuttleId === 'ally').length === 1 &&
      session.shuttleDockings?.find((entry) => entry.shuttleId === 'ally')?.shipId === docking.shipId);
  const selectedMaterials = systemIds.length * 4;
  const canSubmit = repairHistoryValid && hasCurrentAuthority && propsMatchProjection && Boolean(docking) &&
    repairWindowOpen && repairShipAvailable && repairSlotsRemaining > 0 && selectionIsCurrent &&
    systemIds.length <= Math.min(2, repairSlotsRemaining) && materials >= selectedMaterials &&
    damage?.destroyed !== true;
  const retryCommand = retry && hasCurrentAllyHolderAuthority(retry.binding, true) ? retry : null;
  const pendingForCurrentActor = pending && pendingRef.current?.sessionId === session.id &&
    pendingRef.current.uid === me.uid;
  const staleSnapshotCurrent = staleRecovery !== null &&
    hasCurrentAllyHolderAuthority(staleRecovery.binding, true) && repairHistoryValid &&
    currentCycle >= staleRecovery.reply.currentCycle &&
    (sessionControl?.revision ?? -1) >= staleRecovery.reply.currentControlRevision &&
    repairRevision >= staleRecovery.reply.currentRepairRevision &&
    docking?.shipId === staleRecovery.reply.expectedHostShipId && propsMatchProjection;
  const canRetryStale = Boolean(staleSnapshotCurrent && canSubmit);
  const authoritySignal = JSON.stringify([
    identity, me.role, me.assignedRoleId, me.activeConsoleRoleId, me.fleetGroupId,
    session.phase, session.currentTurn, sessionControl?.ownerUid, sessionControl?.holderUid,
    sessionControl?.revision, docking?.shipId,
  ]);

  useEffect(() => {
    pendingRef.current = null;
    setPending(false);
    setSystemIds([]);
    setStatus('');
    setError('');
    setRetry(null);
    setStaleRecovery(null);
  }, [identity, docking?.shipId]);

  useEffect(() => {
    if (retry && !hasCurrentAllyHolderAuthority(retry.binding, true)) {
      setRetry(null);
      setError('Ally repair authority changed while the request was pending.');
    }
    if (staleRecovery && !hasCurrentAllyHolderAuthority(staleRecovery.binding, true)) {
      setRetry(null);
      setStaleRecovery(null);
      setError('Ally repair authority changed while the request was pending.');
    }
  }, [authoritySignal, retry, staleRecovery]);

  function chooseConsole(systemId: string, checked: boolean): void {
    setRetry(null);
    setError('');
    setStatus('');
    setSystemIds((current) => checked
      ? current.includes(systemId) ? current : [...current, systemId]
      : current.filter((id) => id !== systemId));
  }

  async function submitRepair(): Promise<void> {
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    if (!checkpoint || !current.me || !isCurrentSessionAuthority(checkpoint)) return;
    const existingPending = pendingRef.current;
    if (existingPending?.sessionId === checkpoint.sessionId && existingPending.uid === checkpoint.uid) return;

    const exactRetry = retry && hasCurrentAllyHolderAuthority(retry.binding, true) ? retry : null;
    if (retry && !exactRetry) return;
    const freshStaleRetry = staleRecovery !== null;
    if (freshStaleRetry && !canRetryStale) return;
    if (!exactRetry && !freshStaleRetry && !canSubmit) return;

    const liveSession = current.session as GameSession;
    const liveControl = liveSession.shuttleControl?.ally;
    if (!liveControl) return;
    const command: AllyRepairCommand = exactRetry?.command ?? {
      requestId: window.crypto.randomUUID(),
      systemIds: [...systemIds],
      expectedControlRevision: liveControl.revision,
      expectedRepairRevision: repairRevision,
      expectedCycle: liveSession.currentTurn ?? 0,
      expectedHostShipId: docking?.shipId ?? '',
    };
    const binding: AllyRepairAuthorityBinding = exactRetry?.binding ?? {
      sessionId: liveSession.id,
      uid: current.me.uid,
      role: current.me.role,
      assignedRoleId: current.me.assignedRoleId,
      activeConsoleRoleId: current.me.activeConsoleRoleId,
      fleetGroupId: current.me.fleetGroupId ?? '',
      ownerUid: liveControl.ownerUid,
      expectedHostShipId: command.expectedHostShipId,
      expectedControlRevision: command.expectedControlRevision,
      expectedRepairRevision: command.expectedRepairRevision,
      expectedCycle: command.expectedCycle,
    };
    if (!hasCurrentAllyHolderAuthority(binding, true)) return;

    pendingRef.current = checkpoint;
    setPending(true);
    setStatus('');
    setError('');
    setRetry({ command, binding });
    setStaleRecovery(null);
    const isCurrentRequestCheckpoint = () => pendingRef.current === checkpoint;
    try {
      const result: AllyRepairServiceResult = await repairConsolesFromAlly(command);
      if (!isCurrentRequestCheckpoint()) return;
      if (result.status === 'stale') {
        if (!staleReplyMatchesCommand(result, binding.sessionId, command)) {
          setRetry(null);
          setError('Ally repair returned an invalid stale request binding. Refresh before retrying.');
          return;
        }
        if (!hasCurrentAllyHolderAuthority(binding, true)) {
          setRetry(null);
          setStaleRecovery(null);
          setError('Ally repair authority or Coordination changed while the request was pending.');
          return;
        }
        setRetry(null);
        setStaleRecovery({ reply: result, binding });
        setStatus('Ally repair state changed. Review the current live state before retrying.');
        return;
      }
      if (!hasCurrentAllyHolderAuthority(binding, false)) {
        setRetry(null);
        setStaleRecovery(null);
        setError('Ally repair authority changed while the request was pending.');
        return;
      }
      setStatus(result.status === 'replayed'
        ? `This repair was already recorded // ${result.materialsRemaining} materials remain.`
        : `Repaired ${result.systemIds.length} console${result.systemIds.length === 1 ? '' : 's'} // ${result.materialsRemaining} materials remain.`);
      setRetry(null);
      setStaleRecovery(null);
      setSystemIds([]);
    } catch (cause) {
      if (!isCurrentRequestCheckpoint()) return;
      if (hasCurrentAllyHolderAuthority(binding, true)) {
        setError(cause instanceof Error ? cause.message : 'Ally repair failed.');
      } else {
        setRetry(null);
        setStaleRecovery(null);
        setError('Ally repair authority or Coordination changed while the request was pending.');
      }
    } finally {
      if (pendingRef.current === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  const hasStaleRetry = staleRecovery !== null;
  const isHolder = control.shuttleId === 'ally' &&
    control.ownerRoleId === 'joint-engineering-shepherd-icebreaker' &&
    me.role === 'player' && me.uid === control.holderUid &&
    me.assignedRoleId === 'joint-engineering-shepherd-icebreaker';

  return <section className="console-workspace__section shuttle-control" aria-label="Ally console repair">
    <p className="console-workspace__eyebrow">Repair rig // docked host</p>
    <h3>Repair damaged consoles</h3>
    <p>Spend 4 materials per console to repair up to 2 consoles on this ship. A fuelled Ally may repair a second ship in the same cycle.</p>
    {docking
      ? <p>Docked host // {findShip(docking.shipId)?.name ?? docking.shipId} // materials // {materials} // repair slots remaining // {repairSlotsRemaining}</p>
      : <p>Dock Ally before repairing consoles.</p>}
    {!isHolder && <p>The current Joint Engineering Union Engineer holding Ally controls repairs.</p>}
    {!repairWindowOpen && <p>Ally repairs open during Coordination Phase.</p>}
    {hostsThisCycle.length === 1 && !hostAlreadyUsed && !fuelled &&
      <p>Fuel Ally before repairing a second ship this cycle.</p>}
    {hostsThisCycle.length >= 2 && !hostAlreadyUsed &&
      <p>Ally may repair at most two ships this cycle.</p>}
    {damage?.destroyed && <p>A destroyed ship cannot receive Ally repairs.</p>}
    {repairOptions.length === 0 && <p>No damaged consoles are eligible on this ship.</p>}
    {staleSelectedIds.length > 0 && <p>One or more selected consoles are no longer eligible in the current repair state.</p>}
    {systemIds.length > 0 && materials < selectedMaterials &&
      <p>This repair needs {selectedMaterials} materials; the host has {materials}.</p>}
    {!repairHistoryValid && <p>Ally repair history is unavailable. Refresh the live session before repairing.</p>}
    <fieldset disabled={!repairHistoryValid || pendingForCurrentActor || !isHolder || !docking || !repairWindowOpen ||
      !repairShipAvailable || repairSlotsRemaining === 0}>
      <legend>Damaged consoles</legend>
      {visibleSystemIds.map((systemId) => {
        const checked = systemIds.includes(systemId);
        const atCapacity = systemIds.length >= Math.min(2, repairSlotsRemaining);
        const name = findShip(docking?.shipId)?.systems?.find((system) => system.id === systemId)?.name ??
          systemId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        return <label key={systemId}>
          <input type="checkbox" checked={checked} disabled={!checked && atCapacity}
            onChange={(event) => chooseConsole(systemId, event.target.checked)} /> {name}
        </label>;
      })}
    </fieldset>
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button"
        disabled={pendingForCurrentActor || (retry ? !retryCommand : hasStaleRetry ? !canRetryStale : !canSubmit)}
        onClick={() => void submitRepair()}>
        {pendingForCurrentActor ? 'Repairing consoles…' : retryCommand ? 'Retry exact repair request' :
          hasStaleRetry ? 'Retry repair with current revision' : 'Repair selected consoles'}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {retryCommand && !pendingForCurrentActor && <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {staleRecovery && !staleSnapshotCurrent && !pendingForCurrentActor &&
      <p>The current live Ally state is still updating. Wait for it before retrying.</p>}
    {staleRecovery && staleSnapshotCurrent && staleSelectedIds.length > 0 && !pendingForCurrentActor &&
      <p>Review the selected consoles; no longer eligible consoles cannot be retried.</p>}
    {status && <p role="status">{status}</p>}
  </section>;
}
