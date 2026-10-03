import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import {
  capturePhiliaRepairAuthority,
  hasCurrentPhiliaRepairAuthority,
  repairConsolesFromPhilia,
  type PhiliaRepairAuthorityBinding,
  type PhiliaRepairCommand,
  type PhiliaRepairStaleResult,
} from '@/lib/philiaRepairService';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, PhiliaRepairLedger, Player, ShuttleControlEntry, ShuttleDocking } from '@/types/game';
import { memberPhiliaRepairLedger } from '../../functions/src/memberSession';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRepairLedger(value: unknown): value is PhiliaRepairLedger | undefined {
  if (value !== undefined && memberPhiliaRepairLedger(value)) return true;
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      !Array.isArray(value.hosts) || value.hosts.length < 1 || value.hosts.length > 2) return false;
  const seenShips = new Set<string>();
  return value.hosts.every((host) => {
    if (!isRecord(host) || Object.keys(host).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        typeof host.shipId !== 'string' || host.shipId.length === 0 || seenShips.has(host.shipId) ||
        !Array.isArray(host.systemIds) || host.systemIds.length < 1 || host.systemIds.length > 2 ||
        host.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
        new Set(host.systemIds).size !== host.systemIds.length) return false;
    seenShips.add(host.shipId);
    return true;
  });
}

function currentPhiliaHost(session: GameSession): string | null {
  const raw = (session as unknown as Record<string, unknown>).shuttleDockings;
  if (!Array.isArray(raw) || raw.some((entry) => {
    if (!isRecord(entry)) return true;
    return typeof entry.shuttleId !== 'string' || !entry.shuttleId.trim() ||
      typeof entry.shipId !== 'string' || !entry.shipId.trim() ||
      typeof entry.dockedAt !== 'string' || !entry.dockedAt.trim() ||
      entry.inTransit === true || entry.transit === true || entry.status === 'in-transit' ||
      entry.state === 'in-transit' || entry.dockingState === 'in-transit';
  })) return null;
  const dockings = raw.filter((entry) => isRecord(entry) && entry.shuttleId === 'philia');
  return dockings.length === 1 ? (dockings[0] as Record<string, unknown>).shipId as string : null;
}

export default function PhiliaRepairPanel({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)!;
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
    readonly command: PhiliaRepairCommand;
    readonly checkpoint: SessionAuthorityCheckpoint;
    readonly authority: PhiliaRepairAuthorityBinding;
  } | null>(null);
  const [staleRecovery, setStaleRecovery] = useState<{
    readonly reply: PhiliaRepairStaleResult;
    readonly authority: PhiliaRepairAuthorityBinding;
  } | null>(null);
  const pendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const identity = JSON.stringify([session.id, me.uid]);

  const repairHistoryValid = isRepairLedger(session.philiaRepairs);
  const ledger = repairHistoryValid ? session.philiaRepairs : undefined;
  const repairRevision = ledger?.revision ?? 0;
  const hostsThisCycle = ledger && ledger.cycle === session.currentTurn ? ledger.hosts : [];
  const hostsUsedThisCycle = ledger && ledger.cycle === session.currentTurn ? ledger.totalHostsUsed ?? hostsThisCycle.length : 0;
  const repairedOnHost = docking
    ? hostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const hostAlreadyUsed = Boolean(docking &&
    hostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = hostAlreadyUsed || hostsUsedThisCycle === 0 ||
    (hostsUsedThisCycle === 1 && fuelled);
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
  const currentControl = session.shuttleControl?.philia;
  const currentDockedHost = currentPhiliaHost(session as GameSession);
  const hostMatchesProjection = Boolean(docking && currentDockedHost === docking.shipId);
  const controlMatchesProps = currentControl?.shuttleId === 'philia' &&
    currentControl.holderUid === control.holderUid && currentControl.revision === control.revision &&
    currentControl.ownerRoleId === 'dione-engineer';
  let displayAuthority: PhiliaRepairAuthorityBinding | null = null;
  if (docking && Number.isSafeInteger(session.currentTurn) && repairHistoryValid) {
    try {
      displayAuthority = capturePhiliaRepairAuthority(session as GameSession, me as Player, {
        requestId: 'philia-panel-authority-check', systemIds: ['reactor'],
        expectedControlRevision: control.revision, expectedRepairRevision: repairRevision,
        expectedCycle: session.currentTurn as number, expectedHostShipId: docking.shipId,
      });
    } catch {
      displayAuthority = null;
    }
  }
  const isHolder = displayAuthority !== null && controlMatchesProps && hostMatchesProjection;
  const selectedMaterials = systemIds.length * 4;
  const canSubmit = repairHistoryValid && isHolder && Boolean(docking) && repairWindowOpen && repairShipAvailable &&
    repairSlotsRemaining > 0 && systemIds.length >= 1 &&
    systemIds.length <= Math.min(2, repairSlotsRemaining) && materials >= selectedMaterials &&
    damage?.destroyed !== true;

  const retryCommand = retry && hasCurrentPhiliaRepairAuthority(retry.authority)
    ? retry.command : null;
  const staleStillAuthorized = staleRecovery !== null &&
    hasCurrentPhiliaRepairAuthority(staleRecovery.authority);
  const staleSelectionMatches = staleRecovery !== null &&
    [...systemIds].sort().join('|') === [...staleRecovery.reply.systemIds].sort().join('|');
  const staleProjectionReady = staleRecovery !== null && currentControl !== undefined &&
    Number.isSafeInteger(currentControl.revision) &&
    currentControl.revision >= staleRecovery.reply.currentControlRevision &&
    repairRevision >= staleRecovery.reply.currentRepairRevision &&
    Number.isSafeInteger(session.currentTurn) &&
    (session.currentTurn as number) >= staleRecovery.reply.currentCycle;
  const staleRetryReady = staleStillAuthorized && staleSelectionMatches && staleProjectionReady && canSubmit;
  const pendingCheckpoint = pendingRef.current;
  const pendingForCurrentAuthority = pending && pendingCheckpoint !== null &&
    isCurrentSessionAuthority(pendingCheckpoint);
  const statusMessage = status?.checkpoint.sessionId === session.id &&
    status.checkpoint.uid === me.uid ? status.message : '';
  const errorMessage = error?.checkpoint.sessionId === session.id &&
    error.checkpoint.uid === me.uid ? error.message : '';

  useEffect(() => {
    setSystemIds([]);
  }, [docking?.shipId, identity]);

  useEffect(() => {
    const eligible = new Set(repairOptions);
    setSystemIds((current) => {
      const next = current.filter((id) => eligible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [repairOptions.join('|')]);

  useEffect(() => {
    pendingRef.current = null;
    setPending(false);
    setStatus(null);
    setError(null);
    setRetry(null);
    setStaleRecovery(null);
  }, [identity]);

  useEffect(() => {
    if (staleRecovery && !staleSelectionMatches) setStaleRecovery(null);
  }, [staleRecovery, staleSelectionMatches]);

  function chooseConsole(systemId: string, checked: boolean): void {
    setRetry(null);
    setStaleRecovery(null);
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
    const pendingCheckpointCurrent = pendingRef.current;
    if (pendingCheckpointCurrent && isCurrentSessionAuthority(pendingCheckpointCurrent)) return;
    const activeRetry = retry && hasCurrentPhiliaRepairAuthority(retry.authority) ? retry : null;
    const activeStaleRetry = staleRecovery && staleRetryReady ? staleRecovery : null;
    const latest = current.session as GameSession | undefined;
    const latestControl = latest?.shuttleControl?.philia;
    const command: PhiliaRepairCommand = activeRetry?.command ?? {
      requestId: window.crypto.randomUUID(),
      systemIds: [...systemIds],
      expectedControlRevision: latestControl?.revision ?? control.revision,
      expectedRepairRevision: repairRevision,
      expectedCycle: latest?.currentTurn ?? session.currentTurn ?? 0,
      expectedHostShipId: docking?.shipId ?? '',
    };
    if (!activeRetry && !activeStaleRetry && !canSubmit) return;
    if (activeStaleRetry && !canSubmit) return;

    pendingRef.current = checkpoint;
    setPending(true);
    setStatus(null);
    setError(null);
    setRetry(null);
    if (activeStaleRetry) setStaleRecovery(null);
    let authority: PhiliaRepairAuthorityBinding | null = null;
    try {
      authority = capturePhiliaRepairAuthority(
        current.session as GameSession, current.me as Player, command,
      );
      setRetry({ command, checkpoint, authority });
      const result = await repairConsolesFromPhilia(command);
      if (!hasCurrentPhiliaRepairAuthority(authority)) return;
      if (result.status === 'stale') {
        setRetry(null);
        setStaleRecovery({ reply: result, authority });
        return;
      }
      setStatus({
        checkpoint,
        message: result.status === 'replayed'
          ? `This repair was already recorded // ${result.materialsRemaining} materials remain.`
          : `Repaired ${result.systemIds.length} console${result.systemIds.length === 1 ? '' : 's'} // ${result.materialsRemaining} materials remain.`,
      });
      setRetry(null);
      setStaleRecovery(null);
      setSystemIds([]);
    } catch (cause) {
      if (authority && !hasCurrentPhiliaRepairAuthority(authority)) return;
      setError({
        checkpoint,
        message: cause instanceof Error ? cause.message : 'Philia repair failed.',
      });
    } finally {
      if (isCurrentSessionAuthority(checkpoint) && pendingRef.current === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  const retryLabel = pendingForCurrentAuthority ? 'Repairing consoles…'
    : retryCommand ? 'Retry exact repair request'
      : staleRecovery && staleStillAuthorized
        ? staleRetryReady ? 'Retry selected consoles with current state' : 'Waiting for live repair state…'
        : 'Repair selected consoles';
  const repairDisabled = pendingForCurrentAuthority ||
    (retryCommand ? false : staleRecovery ? !staleRetryReady : !canSubmit);

  return <section className="console-workspace__section shuttle-control" aria-label="Philia console repair">
    <p className="console-workspace__eyebrow">Repair rig // docked host</p>
    <h3>Repair damaged consoles</h3>
    <p>Spend 4 materials for each of up to 2 consoles on this ship. Fuelled Philia may repair a second ship in the same cycle.</p>
    {docking
      ? <p>Docked host // {findShip(docking.shipId)?.name ?? docking.shipId} // materials // {materials} // repair slots remaining // {repairSlotsRemaining}</p>
      : <p>Dock Philia before repairing consoles.</p>}
    {!isHolder && <p>The current Dione Engineer holding Philia at its in-group dock controls repairs.</p>}
    {!repairWindowOpen && <p>Philia repairs open during Coordination Phase.</p>}
    {hostsUsedThisCycle === 1 && !hostAlreadyUsed && !fuelled &&
      <p>Fuel Philia before repairing a second ship this cycle.</p>}
    {hostsUsedThisCycle >= 2 && !hostAlreadyUsed &&
      <p>Philia may repair at most two ships this cycle.</p>}
    {damage?.destroyed && <p>A destroyed host cannot receive Philia repairs.</p>}
    {repairOptions.length === 0 && <p>No damaged consoles are eligible on this ship.</p>}
    {systemIds.length > 0 && materials < selectedMaterials &&
      <p>This repair needs {selectedMaterials} materials; the host has {materials}.</p>}
    {!repairHistoryValid && <p>Philia repair history is unavailable. Refresh the live session before repairing.</p>}
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
      <button className="cic-action-button" type="button" disabled={repairDisabled}
        onClick={() => void submitRepair()}>{retryLabel}</button>
    </div>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    {retryCommand && !pendingForCurrentAuthority && <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {staleRecovery && staleStillAuthorized && <p role="status">{staleRetryReady
      ? 'Repair state changed. The live projection is current; explicitly retry to submit a fresh request.'
      : 'Repair state changed. Waiting for the live repair projection before retrying.'}</p>}
    {statusMessage && <p role="status">{statusMessage}</p>}
  </section>;
}
