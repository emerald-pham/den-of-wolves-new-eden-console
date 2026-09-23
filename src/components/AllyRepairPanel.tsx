import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import { parseAllyRepairLedger } from '@/lib/allyRepairLedger';
import { repairConsolesFromAlly, type AllyRepairCommand } from '@/lib/allyRepairService';
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

export default function AllyRepairPanel({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)! as GameSession;
  const me = useSessionStore((state) => state.me)!;
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
  const [retry, setRetry] = useState<{
    readonly command: AllyRepairCommand;
    readonly checkpoint: SessionAuthorityCheckpoint;
  } | null>(null);
  const pendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const identity = JSON.stringify([session.id, me.uid]);
  const retryCommand = retry && isCurrentSessionAuthority(retry.checkpoint)
    ? retry.command : null;
  const pendingForCurrentAuthority = pending && pendingRef.current !== null &&
    isCurrentSessionAuthority(pendingRef.current);
  const statusMessage = status?.checkpoint.sessionId === session.id &&
    status.checkpoint.uid === me.uid ? status.message : '';
  const errorMessage = error?.checkpoint.sessionId === session.id &&
    error.checkpoint.uid === me.uid ? error.message : '';

  const parsedLedger = parseAllyRepairLedger(session.allyRepairs);
  const repairHistoryValid = parsedLedger !== null && parsedLedger.cycle <= (session.currentTurn ?? 0);
  const ledger = repairHistoryValid ? parsedLedger! : undefined;
  const repairRevision = ledger?.revision ?? 0;
  const hostsThisCycle = ledger && ledger.cycle === session.currentTurn ? ledger.hosts : [];
  const repairedOnHost = docking
    ? hostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const hostAlreadyUsed = Boolean(docking && hostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = hostAlreadyUsed || hostsThisCycle.length === 0 ||
    (hostsThisCycle.length === 1 && fuelled);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const damage = docking ? session.shipDamage?.[docking.shipId] : undefined;
  const repairOptions = docking
    ? (damage?.damagedSystemIds ?? []).filter((id) => !repairedOnHost.includes(id)) : [];
  const materials = docking ? session.shipResources?.[docking.shipId]?.materials ?? 0 : 0;
  const repairDeadline = session.turnPhase?.openAirspaceEndsAt
    ? Date.parse(session.turnPhase.openAirspaceEndsAt) : Number.NaN;
  const turnPhase = session.turnPhase;
  const repairWindowOpen = session.phase === 'active' &&
    (session.currentTurn ?? 0) >= 1 && turnPhase !== undefined && turnPhase.turn === session.currentTurn &&
    turnPhase.airspace.state === 'lifted' && turnPhase.timerPause === undefined &&
    Number.isFinite(repairDeadline) && Date.now() < repairDeadline;
  const isHolder = control.shuttleId === 'ally' &&
    control.ownerRoleId === 'joint-engineering-shepherd-icebreaker' && me.role === 'player' &&
    me.uid === control.holderUid && me.assignedRoleId === 'joint-engineering-shepherd-icebreaker';
  const selectedMaterials = systemIds.length * 4;
  const canSubmit = repairHistoryValid && isHolder && Boolean(docking) && repairWindowOpen &&
    repairShipAvailable && repairSlotsRemaining > 0 && systemIds.length >= 1 &&
    systemIds.length <= Math.min(2, repairSlotsRemaining) && materials >= selectedMaterials &&
    damage?.destroyed !== true;

  useEffect(() => setSystemIds([]), [repairRevision, control.revision, docking?.shipId, session.currentTurn, identity]);

  useEffect(() => {
    pendingRef.current = null;
    setPending(false);
    setStatus(null);
    setError(null);
    setRetry(null);
  }, [identity]);

  function chooseConsole(systemId: string, checked: boolean): void {
    setRetry(null);
    setError(null);
    setStatus(null);
    setSystemIds((current) => checked
      ? current.includes(systemId) ? current : [...current, systemId]
      : current.filter((id) => id !== systemId));
  }

  async function submitRepair(): Promise<void> {
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    const pendingCheckpoint = pendingRef.current;
    if (pendingCheckpoint && isCurrentSessionAuthority(pendingCheckpoint)) return;
    const activeRetry = retry && isCurrentSessionAuthority(retry.checkpoint) ? retry : null;
    const command: AllyRepairCommand = activeRetry?.command ?? {
      requestId: window.crypto.randomUUID(),
      systemIds: [...systemIds],
      expectedControlRevision: control.revision,
      expectedRepairRevision: repairRevision,
      expectedCycle: session.currentTurn ?? 0,
      expectedHostShipId: docking?.shipId ?? '',
    };
    if (!activeRetry && !canSubmit) return;

    pendingRef.current = checkpoint;
    setPending(true);
    setStatus(null);
    setError(null);
    setRetry({ command, checkpoint });
    try {
      const result = await repairConsolesFromAlly(command);
      if (!isCurrentSessionAuthority(checkpoint)) return;
      setStatus({
        checkpoint,
        message: result.status === 'replayed'
          ? `This repair was already recorded // ${result.materialsRemaining} materials remain.`
          : `Repaired ${result.systemIds.length} console${result.systemIds.length === 1 ? '' : 's'} // ${result.materialsRemaining} materials remain.`,
      });
      setRetry(null);
      setSystemIds([]);
    } catch (cause) {
      if (!isCurrentSessionAuthority(checkpoint)) return;
      setError({
        checkpoint,
        message: cause instanceof Error ? cause.message : 'Ally repair failed.',
      });
    } finally {
      if (isCurrentSessionAuthority(checkpoint) && pendingRef.current === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

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
    {systemIds.length > 0 && materials < selectedMaterials &&
      <p>This repair needs {selectedMaterials} materials; the host has {materials}.</p>}
    {!repairHistoryValid && <p>Ally repair history is unavailable. Refresh the live session before repairing.</p>}
    <fieldset disabled={!repairHistoryValid || pendingForCurrentAuthority || !isHolder || !docking || !repairWindowOpen ||
      !repairShipAvailable || repairSlotsRemaining === 0 || damage?.destroyed === true}>
      <legend>Damaged consoles</legend>
      {repairOptions.map((systemId) => {
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
      <button className="cic-action-button" type="button" disabled={pendingForCurrentAuthority || (!retryCommand && !canSubmit)}
        onClick={() => void submitRepair()}>
        {pendingForCurrentAuthority ? 'Repairing consoles…' : retryCommand ? 'Retry exact repair request' : 'Repair selected consoles'}
      </button>
    </div>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    {retryCommand && !pendingForCurrentAuthority && <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {statusMessage && <p role="status">{statusMessage}</p>}
  </section>;
}
