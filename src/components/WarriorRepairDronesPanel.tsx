import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import { damageSystemIdsForShip } from '@/lib/chacauRepairLedger';
import { parseWarriorRepairDronesLedger } from '@/lib/warriorRepairDronesLedger';
import {
  repairWithWarriorDrones,
  type WarriorRepairDronesCommand,
} from '@/lib/warriorRepairDronesService';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

const ROLE_ID = 'warrior-captain';

function repairCommandAuthorityIsCurrent(
  checkpoint: SessionAuthorityCheckpoint | null | undefined,
  command: WarriorRepairDronesCommand,
): boolean {
  if (!checkpoint) return false;
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  const ship = session?.smallShipStates?.warrior;
  const phase = phaseForSession(session);
  const deadline = phase ? Date.parse(phase.openAirspaceEndsAt) : Number.NaN;
  return session?.id === checkpoint.sessionId && me?.sessionId === checkpoint.sessionId &&
    me?.uid === checkpoint.uid && me.role === 'player' && me.replacementRoleId === ROLE_ID &&
    me.activeConsoleRoleId === null && me.seatId === null &&
    current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
    window.navigator.onLine && session.phase === 'active' && session.currentTurn === command.expectedCycle &&
    phase?.airspace.state === 'lifted' && phase.timerPause === undefined &&
    Number.isFinite(deadline) && Date.now() < deadline &&
    ship?.hostShipId === command.expectedHostShipId &&
    ship.dockingRevision === command.expectedDockingRevision;
}

export default function WarriorRepairDronesPanel() {
  const session = useSessionStore((state) => state.session) as GameSession | null;
  const me = useSessionStore((state) => state.me);
  const [systemIds, setSystemIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [completedCycle, setCompletedCycle] = useState<number | null>(null);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const [status, setStatus] = useState<{ checkpoint: SessionAuthorityCheckpoint; message: string } | null>(null);
  const [error, setError] = useState<{ checkpoint: SessionAuthorityCheckpoint; message: string } | null>(null);
  const [retry, setRetry] = useState<{
    command: WarriorRepairDronesCommand;
    checkpoint: SessionAuthorityCheckpoint;
    stale: boolean;
  } | null>(null);
  const pendingRef = useRef<{
    checkpoint: SessionAuthorityCheckpoint;
    command: WarriorRepairDronesCommand;
  } | null>(null);
  const recoveryRef = useRef<{
    checkpoint: SessionAuthorityCheckpoint;
    command: WarriorRepairDronesCommand;
  } | null>(null);
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const identity = JSON.stringify([
    session?.id, me?.uid, me?.role, me?.replacementRoleId, me?.activeConsoleRoleId, me?.seatId,
  ]);

  const currentCycle = session?.currentTurn ?? 0;
  const ledger = parseWarriorRepairDronesLedger(session?.warriorRepairDrones);
  const repairHistoryValid = ledger !== null && ledger.cycle <= currentCycle &&
    (currentCycle === 0 ? ledger.revision === 0 : ledger.revision <= ledger.cycle);
  const repairRevision = repairHistoryValid ? ledger!.revision : 0;
  const warrior = session?.smallShipStates?.warrior;
  const hostShipId = warrior?.hostShipId ?? null;
  const hostShip = hostShipId ? findShip(hostShipId) : undefined;
  const coreRosterValid = Boolean(session?.activeVesselIds?.length &&
    session.activeVesselIds.every((id) => Boolean(findShip(id))));
  const hostIsActive = Boolean(coreRosterValid && warrior?.dockingRevision && warrior.dockingRevision >= 1 &&
    hostShipId && hostShip && session?.activeVesselIds?.includes(hostShipId));
  const hostDamage = hostShipId && hostIsActive ? session?.shipDamage?.[hostShipId] : undefined;
  const materials = hostShipId && hostIsActive ? session?.shipResources?.[hostShipId]?.materials ?? 0 : 0;
  const eligibleSystemIds = hostShipId && hostIsActive && hostDamage?.destroyed !== true
    ? (hostDamage?.damagedSystemIds ?? []).filter((id) =>
      damageSystemIdsForShip(hostShipId).has(id) && !id.startsWith('armoured-hull'))
    : [];
  const damageIdentity = JSON.stringify(eligibleSystemIds);
  const phase = phaseForSession(session);
  const deadline = phase ? Date.parse(phase.openAirspaceEndsAt) : Number.NaN;
  const coordinationOpen = session?.phase === 'active' && currentCycle >= 1 &&
    phase?.airspace.state === 'lifted' && phase.timerPause === undefined &&
    Number.isFinite(deadline) && Date.now() < deadline;
  const maintenance = warrior?.cycle;
  const teamMaintenanceClosed = maintenance?.step === 0 &&
    typeof maintenance.completedAt === 'string' && maintenance.completedAt.length > 0;
  const teamMaintenanceOpenAtFinalStep = maintenance?.step === 5 && maintenance.completedAt === undefined;
  const maintenanceReady = Boolean(maintenance && maintenance.turn === currentCycle &&
    (teamMaintenanceClosed || teamMaintenanceOpenAtFinalStep) && maintenance.chargingSkipped === false &&
    Object.keys(maintenance.results).sort().join(',') === '1,2,3,4' &&
    maintenance.charges.includes('repair-drones'));
  const usedThisCycle = (repairHistoryValid && ledger!.cycle === currentCycle) || completedCycle === currentCycle;
  const isCaptain = me?.role === 'player' && me.replacementRoleId === 'warrior-captain' &&
    me.activeConsoleRoleId === null && me.seatId === null;
  const selectedSystemsAreEligible = systemIds.length >= 1 && systemIds.length <= 2 &&
    systemIds.every((id) => eligibleSystemIds.includes(id));
  const canSubmit = isCaptain && repairHistoryValid && hostIsActive && maintenanceReady &&
    coordinationOpen && !usedThisCycle && !hostDamage?.destroyed && materials >= 6 &&
    selectedSystemsAreEligible;
  const statusMessage = status && status.checkpoint.sessionId === session?.id && status.checkpoint.uid === me?.uid
    ? status.message : '';
  const errorMessage = error && error.checkpoint.sessionId === session?.id && error.checkpoint.uid === me?.uid
    ? error.message : '';
  const retryCommand = retry && (retry.stale
    ? repairCommandAuthorityIsCurrent(retry.checkpoint, retry.command)
    : isCurrentSessionAuthority(retry.checkpoint)) ? retry.command : null;
  const pendingForCurrentAuthority = pending && pendingRef.current !== null &&
    repairCommandAuthorityIsCurrent(pendingRef.current.checkpoint, pendingRef.current.command);

  useEffect(() => {
    const inFlight = pendingRef.current;
    if (inFlight && repairCommandAuthorityIsCurrent(inFlight.checkpoint, inFlight.command)) return;
    const recovery = recoveryRef.current;
    if (recovery && repairCommandAuthorityIsCurrent(recovery.checkpoint, recovery.command)) {
      const currentSession = useSessionStore.getState().session as GameSession | null;
      const currentCycle = currentSession?.currentTurn ?? 0;
      const latest = parseWarriorRepairDronesLedger(currentSession?.warriorRepairDrones);
      if (!latest || latest.cycle > currentCycle || latest.revision > currentCycle || currentCycle < 1) {
        recoveryRef.current = null;
        setRetry(null);
        return;
      }
      if (latest.cycle === currentCycle) {
        setCompletedCycle(currentCycle);
        setRetry(null);
        setStatus({ checkpoint: recovery.checkpoint, message: 'Repair Drones have already been used this cycle. Review the current console damage.' });
        return;
      }
      const activeRetry = retryRef.current;
      if (activeRetry?.stale && repairCommandAuthorityIsCurrent(activeRetry.checkpoint, activeRetry.command) &&
          latest.revision > activeRetry.command.expectedRepairRevision) {
        setRetry({
          ...activeRetry,
          command: { ...activeRetry.command, requestId: window.crypto.randomUUID(), expectedRepairRevision: latest.revision },
        });
      }
      return;
    }
    if (inFlight) {
      pendingRef.current = null;
      setPending(false);
    }
    recoveryRef.current = null;
    setSystemIds([]);
    setRetry(null);
    setError(null);
    setStatus(null);
    setCompletedCycle(null);
  }, [hostShipId, currentCycle, repairRevision, warrior?.dockingRevision, damageIdentity, identity,
    coordinationOpen, recoveryEpoch]);

  useEffect(() => {
    pendingRef.current = null;
    recoveryRef.current = null;
    setPending(false);
    setRetry(null);
    setError(null);
    setStatus(null);
    setCompletedCycle(null);
  }, [identity]);

  function toggleSystem(systemId: string): void {
    const next = systemIds.includes(systemId)
      ? systemIds.filter((id) => id !== systemId)
      : systemIds.length < 2 ? [...systemIds, systemId] : systemIds;
    if (JSON.stringify(next) !== JSON.stringify(systemIds)) {
      recoveryRef.current = null;
      setSystemIds(next);
      setRetry(null);
      setError(null);
      setStatus(null);
    }
  }

  async function submit(): Promise<void> {
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    if (pendingRef.current && repairCommandAuthorityIsCurrent(
      pendingRef.current.checkpoint, pendingRef.current.command,
    )) return;
    const activeRetry = retry && (retry.stale
      ? repairCommandAuthorityIsCurrent(retry.checkpoint, retry.command)
      : isCurrentSessionAuthority(retry.checkpoint)) ? retry : null;
    const command: WarriorRepairDronesCommand = activeRetry?.command ?? {
      requestId: window.crypto.randomUUID(),
      expectedCycle: currentCycle,
      expectedRepairRevision: repairRevision,
      expectedDockingRevision: warrior?.dockingRevision ?? -1,
      expectedHostShipId: hostShipId ?? '',
      systemIds: [...systemIds],
    };
    if ((!activeRetry || activeRetry.stale) && !canSubmit) return;

    pendingRef.current = { checkpoint, command };
    setPending(true);
    setRetry({ command, checkpoint, stale: false });
    setError(null);
    setStatus(null);
    try {
      const result = await repairWithWarriorDrones(command);
      if (result.status === 'stale') {
        if (!repairCommandAuthorityIsCurrent(checkpoint, command)) return;
        recoveryRef.current = { checkpoint, command };
        setRecoveryEpoch((value) => value + 1);
        const latestSession = useSessionStore.getState().session as GameSession | null;
        const latestCycle = latestSession?.currentTurn ?? 0;
        const latest = parseWarriorRepairDronesLedger(latestSession?.warriorRepairDrones);
        if (!latest || latest.cycle > latestCycle || latest.revision > latestCycle || latestCycle !== result.cycle) {
          setRetry(null);
          setError({ checkpoint, message: 'Repair history is unavailable. Refresh the live session before retrying.' });
          return;
        }
        if (result.repairCycle === latestCycle || latest.cycle === latestCycle) {
          setCompletedCycle(latestCycle);
          setRetry(null);
          setStatus({ checkpoint, message: 'Repair Drones have already been used this cycle. Review the current console damage.' });
          return;
        }
        const expectedRepairRevision = Math.max(result.repairRevision, latest.revision);
        if (!Number.isSafeInteger(expectedRepairRevision) || expectedRepairRevision <= command.expectedRepairRevision) {
          setRetry(null);
          setError({ checkpoint, message: 'Repair history is unavailable. Refresh the live session before retrying.' });
          return;
        }
        setRetry({
          checkpoint,
          stale: true,
          command: { ...command, requestId: window.crypto.randomUUID(), expectedRepairRevision },
        });
        setStatus({ checkpoint, message: 'Repair state changed. Review the selected consoles, then explicitly retry with the current revision.' });
        return;
      }
      if (!isCurrentSessionAuthority(checkpoint)) return;
      recoveryRef.current = null;
      const names = result.systemIds.map((id) =>
        hostShip?.systems?.find((system) => system.id === id)?.name ?? id).join(', ');
      setStatus({
        checkpoint,
        message: result.status === 'replayed'
          ? `This repair was already recorded // ${result.materialsRemaining} materials remain.`
          : `Repaired ${names} on ${findShip(result.hostShipId)?.name ?? result.hostShipId} // ${result.materialsRemaining} materials remain.`,
      });
      setCompletedCycle(result.cycle);
      setRetry(null);
      setSystemIds([]);
    } catch (cause) {
      if (!isCurrentSessionAuthority(checkpoint)) return;
      setError({
        checkpoint,
        message: cause instanceof Error ? cause.message : 'Warrior Repair Drones failed.',
      });
    } finally {
      if (pendingRef.current?.checkpoint === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  if (!session) return null;
  const selectedNames = systemIds.map((id) =>
    hostShip?.systems?.find((system) => system.id === id)?.name ?? id).join(', ');

  return (
    <section className="role-brief__rules warrior-repair-drones" aria-labelledby="warrior-repair-title">
      <p className="eyebrow">Current host // {hostShip?.name ?? 'unavailable'}</p>
      <h3 id="warrior-repair-title">Warrior Repair Drones</h3>
      <p>During Coordination, when charged, spend exactly 6 materials from Warrior’s current docked host to repair one or two damaged consoles. Once per cycle.</p>
      <p role="status">
        Docked host // {hostShip?.name ?? (hostShipId ? 'Host unavailable' : 'Awaiting facilitator docking')} // host materials // {materials}
      </p>
      {!isCaptain && <p>The current Warrior Captain replacement role controls this repair.</p>}
      {!hostIsActive && <p>Warrior must be docked with a current active fleet host before repairing.</p>}
      {!maintenanceReady && <p>Finish current-cycle Warrior Team maintenance and charge Repair Drones before repairing.</p>}
      {!coordinationOpen && <p>Repair Drones are available during the current Coordination cycle.</p>}
      {usedThisCycle && <p>Warrior Repair Drones have already been used this cycle.</p>}
      {hostDamage?.destroyed && <p>A destroyed host cannot receive Repair Drones.</p>}
      {hostIsActive && !hostDamage?.destroyed && eligibleSystemIds.length === 0 &&
        <p>No eligible damaged host consoles are available.</p>}
      {hostIsActive && !hostDamage?.destroyed && materials < 6 &&
        <p>Repair Drones need 6 host materials; this host has {materials}.</p>}
      {!repairHistoryValid && <p>Repair history is unavailable. Refresh the live session before repairing.</p>}
      <fieldset className="maintenance-controls warrior-repair-drones__choices" disabled={!isCaptain ||
        !repairHistoryValid || !hostIsActive || !maintenanceReady || !coordinationOpen || usedThisCycle ||
        hostDamage?.destroyed === true || pendingForCurrentAuthority}>
        <legend>Choose one or two damaged host consoles</legend>
        {eligibleSystemIds.map((id) => {
          const name = hostShip?.systems?.find((system) => system.id === id)?.name ?? id;
          return <label key={id}>
            <input type="checkbox" checked={systemIds.includes(id)}
              disabled={!systemIds.includes(id) && systemIds.length >= 2}
              onChange={() => toggleSystem(id)} />
            <span>{name}</span>
          </label>;
        })}
        <p role="status">Selected // {selectedNames || 'No consoles selected'} // cost // 6 materials</p>
      </fieldset>
      {hostIsActive && materials >= 6 && eligibleSystemIds.length > 0 && !selectedSystemsAreEligible &&
        <p>Select one or two damaged host consoles to continue.</p>}
      <div className="maintenance-controls__confirmation">
        <button className="cic-action-button" type="button"
          disabled={pendingForCurrentAuthority || (retry?.stale ? !canSubmit : !retryCommand && !canSubmit)}
          onClick={() => void submit()}>
          {pendingForCurrentAuthority ? 'Repairing consoles…' : retry?.stale && retryCommand
            ? 'Retry repair with current revision' : retryCommand ? 'Retry exact repair request' : 'Repair selected consoles'}
        </button>
      </div>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {retryCommand && !pendingForCurrentAuthority && <p role="status">{retry?.stale
        ? 'Review the selected consoles before retrying. The retry uses a fresh request id.'
        : 'Retry the last request with its original request id.'}</p>}
      {statusMessage && <p role="status">{statusMessage}</p>}
    </section>
  );
}
