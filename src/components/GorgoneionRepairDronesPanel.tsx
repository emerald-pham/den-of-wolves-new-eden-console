import GorgoneionRepairDronesView from './GorgoneionRepairDronesView';
import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import { damageSystemIdsForShip } from '@/lib/chacauRepairLedger';
import { parseGorgoneionRepairDronesLedger } from '@/lib/gorgoneionRepairDronesLedger';
import {
  repairWithGorgoneionDrones,
  type GorgoneionRepairDronesCommand,
} from '@/lib/gorgoneionRepairDronesService';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

const ROLE_ID = 'gorgoneion-captain';

function repairCommandAuthorityIsCurrent(
  checkpoint: SessionAuthorityCheckpoint | null | undefined,
  command: GorgoneionRepairDronesCommand,
): boolean {
  if (!checkpoint) return false;
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  const ship = session?.smallShipStates?.gorgoneion;
  const phase = phaseForSession(session);
  const deadline = phase ? Date.parse(phase.openAirspaceEndsAt) : Number.NaN;
  return session?.id === checkpoint.sessionId && me?.sessionId === checkpoint.sessionId &&
    me?.uid === checkpoint.uid && me.role === 'player' && me.replacementRoleId === ROLE_ID &&
    me.replacementStatus == null && me.activeConsoleRoleId === null && me.seatId === null &&
    current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
    window.navigator.onLine && session.phase === 'active' && session.currentTurn === command.expectedCycle &&
    phase?.airspace.state === 'lifted' && phase.timerPause === undefined &&
    Number.isFinite(deadline) && Date.now() < deadline &&
    ship?.hostShipId === command.expectedHostShipId &&
    ship.dockingRevision === command.expectedDockingRevision;
}

export default function GorgoneionRepairDronesPanel() {
  const session = useSessionStore((state) => state.session) as GameSession | null;
  const me = useSessionStore((state) => state.me);
  const [systemId, setSystemId] = useState('');
  const [pending, setPending] = useState(false);
  const [completedCycle, setCompletedCycle] = useState<number | null>(null);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const [status, setStatus] = useState<{ checkpoint: SessionAuthorityCheckpoint; message: string } | null>(null);
  const [error, setError] = useState<{ checkpoint: SessionAuthorityCheckpoint; message: string } | null>(null);
  const [retry, setRetry] = useState<{
    command: GorgoneionRepairDronesCommand;
    checkpoint: SessionAuthorityCheckpoint;
    stale: boolean;
  } | null>(null);
  const pendingRef = useRef<{
    checkpoint: SessionAuthorityCheckpoint;
    command: GorgoneionRepairDronesCommand;
  } | null>(null);
  const recoveryRef = useRef<{
    checkpoint: SessionAuthorityCheckpoint;
    command: GorgoneionRepairDronesCommand;
  } | null>(null);
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const identity = JSON.stringify([
    session?.id, me?.uid, me?.role, me?.replacementRoleId, me?.replacementStatus,
    me?.activeConsoleRoleId, me?.seatId,
  ]);

  const currentCycle = session?.currentTurn ?? 0;
  const ledger = parseGorgoneionRepairDronesLedger(session?.gorgoneionRepairDrones);
  const repairHistoryValid = ledger !== null && ledger.cycle <= currentCycle &&
    (currentCycle === 0 ? ledger.revision === 0 : ledger.revision <= ledger.cycle);
  const repairRevision = repairHistoryValid ? ledger!.revision : 0;
  const gorgoneion = session?.smallShipStates?.gorgoneion;
  const hostShipId = gorgoneion?.hostShipId ?? null;
  const hostShip = hostShipId ? findShip(hostShipId) : undefined;
  const hostIsActive = Boolean(hostShipId && hostShip && session?.activeVesselIds?.includes(hostShipId));
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
  const maintenance = gorgoneion?.cycle;
  const teamMaintenanceClosed = maintenance?.step === 0 &&
    typeof maintenance.completedAt === 'string' && maintenance.completedAt.length > 0;
  const teamMaintenanceOpenAtFinalStep = maintenance?.step === 5 && maintenance.completedAt === undefined;
  const maintenanceReady = Boolean(maintenance && maintenance.turn === currentCycle &&
    (teamMaintenanceClosed || teamMaintenanceOpenAtFinalStep) && maintenance.chargingSkipped === false &&
    typeof maintenance.startedAt === 'string' && maintenance.startedAt.length > 0 &&
    Object.keys(maintenance.results).sort().join(',') === '1,2,3,4' &&
    maintenance.charges.includes('repair-drones'));
  const usedThisCycle = (repairHistoryValid && ledger!.cycle === currentCycle) || completedCycle === currentCycle;
  const isCaptain = me?.role === 'player' && me.replacementRoleId === 'gorgoneion-captain' &&
    me.replacementStatus == null && me.activeConsoleRoleId === null && me.seatId === null;
  const canSubmit = isCaptain && repairHistoryValid && hostIsActive && maintenanceReady &&
    coordinationOpen && !usedThisCycle && !hostDamage?.destroyed && materials >= 3 &&
    eligibleSystemIds.includes(systemId);
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
      const latest = parseGorgoneionRepairDronesLedger(currentSession?.gorgoneionRepairDrones);
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
    setSystemId('');
    setRetry(null);
    setError(null);
    setStatus(null);
    setCompletedCycle(null);
  }, [hostShipId, currentCycle, gorgoneion?.dockingRevision, repairRevision, damageIdentity, identity,
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

  function chooseSystem(nextSystemId: string): void {
    recoveryRef.current = null;
    setSystemId(nextSystemId);
    setRetry(null);
    setError(null);
    setStatus(null);
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
    const command: GorgoneionRepairDronesCommand = activeRetry?.command ?? {
      requestId: window.crypto.randomUUID(),
      expectedCycle: currentCycle,
      expectedRepairRevision: repairRevision,
      expectedDockingRevision: gorgoneion?.dockingRevision ?? -1,
      expectedHostShipId: hostShipId ?? '',
      systemId,
    };
    if ((!activeRetry || activeRetry.stale) && !canSubmit) return;

    pendingRef.current = { checkpoint, command };
    setPending(true);
    setRetry({ command, checkpoint, stale: false });
    setError(null);
    setStatus(null);
    try {
      const result = await repairWithGorgoneionDrones(command);
      if (result.status === 'stale') {
        if (!repairCommandAuthorityIsCurrent(checkpoint, command)) return;
        recoveryRef.current = { checkpoint, command };
        setRecoveryEpoch((value) => value + 1);
        const latestSession = useSessionStore.getState().session as GameSession | null;
        const latestCycle = latestSession?.currentTurn ?? 0;
        const latest = parseGorgoneionRepairDronesLedger(latestSession?.gorgoneionRepairDrones);
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
        setStatus({ checkpoint, message: 'Repair state changed. Review the selected console, then explicitly retry with the current revision.' });
        return;
      }
      if (!isCurrentSessionAuthority(checkpoint)) return;
      recoveryRef.current = null;
      setStatus({
        checkpoint,
        message: result.status === 'replayed'
          ? `This repair was already recorded // ${result.materialsRemaining} materials remain.`
          : `Repaired ${result.systemId} on ${findShip(result.hostShipId)?.name ?? result.hostShipId} // ${result.materialsRemaining} materials remain.`,
      });
      setRetry(null);
      setSystemId('');
    } catch (cause) {
      if (!isCurrentSessionAuthority(checkpoint)) return;
      setError({
        checkpoint,
        message: cause instanceof Error ? cause.message : 'Gorgoneion Repair Drones failed.',
      });
    } finally {
      if (pendingRef.current?.checkpoint === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  if (!session) return null;
  const selectedName = hostShip?.systems?.find((system) => system.id === systemId)?.name ??
    systemId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  return <GorgoneionRepairDronesView
    hostName={hostShip?.name}
    hostDescription={hostShip?.name ?? (hostShipId ? 'Host unavailable' : 'Awaiting facilitator docking')}
    materials={materials} isCaptain={isCaptain} hostIsActive={hostIsActive}
    maintenanceReady={maintenanceReady} coordinationOpen={coordinationOpen}
    usedThisCycle={usedThisCycle} hostDestroyed={hostDamage?.destroyed === true}
    repairHistoryValid={repairHistoryValid}
    eligibleSystems={eligibleSystemIds.map((id) => ({ id, name: hostShip?.systems?.find((system) => system.id === id)?.name ?? id }))}
    systemId={systemId} selectedName={selectedName} pending={pendingForCurrentAuthority}
    submitDisabled={pendingForCurrentAuthority || (retry?.stale ? !canSubmit : !retryCommand && !canSubmit)}
    submitLabel={pendingForCurrentAuthority ? 'Repairing console…' : retry?.stale && retryCommand
      ? 'Retry repair with current revision' : retryCommand ? 'Retry exact repair request' : 'Repair one console'}
    errorMessage={errorMessage} statusMessage={statusMessage}
    retryMessage={retryCommand && !pendingForCurrentAuthority ? retry?.stale
      ? 'Review the selected console before retrying. The retry uses a fresh request id.'
      : 'Retry the last request with its original request id.' : undefined}
    onChooseSystem={chooseSystem} onSubmit={() => void submit()}
  />;
}
