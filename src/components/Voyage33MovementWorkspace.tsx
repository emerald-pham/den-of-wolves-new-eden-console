import { useEffect, useMemo, useState } from 'react';
import { SHIPS } from '@/data/ships';
import { STAR_CHART_SYSTEMS } from '@/data/starChartTopology';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  GameSession,
  Voyage33MovementState,
} from '@/types/game';
import { jumpLengthBetween } from '../../functions/src/jumpDrive';
import { voyage33JumpFuelCost } from '../../functions/src/voyage33Movement';
import { parseVoyage33Admission, VOYAGE_33_ID } from '../../functions/src/voyageAdmission';
import { parseVoyage33MovementState } from '../../functions/src/voyage33Movement';
import {
  emptyVoyage33MaintenanceState,
  parseVoyage33MaintenanceState,
  type Voyage33MaintenanceState as Voyage33MaintenanceRuntimeState,
} from '../../functions/src/voyage33Maintenance';
import {
  Voyage33MovementRejectedError,
  Voyage33MovementUncertainError,
  dockVoyage33Movement,
  jumpVoyage33Movement,
} from '@/lib/voyage33MovementService';
import { phaseForSession, turnPhaseReadout } from '@/lib/turnPhase';
import Voyage33MovementPanel, {
  type Voyage33JumpLength,
  type Voyage33MovementConnection,
  type Voyage33MovementHost,
  type Voyage33MovementPanelProps,
} from './Voyage33MovementPanel';
import Voyage33MaintenancePanel from './Voyage33MaintenancePanel';

type Outcome = Voyage33MovementPanelProps['outcome'];
type Notice = Readonly<{ role: 'status' | 'alert'; message: string }>;
type ProjectionGuard = Readonly<{
  kind: 'stale' | 'committed';
  sessionId: string;
  movementRevision: number;
  dockingRevision: number;
}>;
type UncertainAction = Readonly<{
  action: 'dock' | 'jump';
  value: string;
  sessionId: string;
  instanceId: string;
  expectedMovementRevision: number;
  expectedDockingRevision: number;
}>;

function maintenanceFor(session: GameSession): Voyage33MaintenanceRuntimeState | undefined {
  if (session.voyage33Maintenance === undefined) return emptyVoyage33MaintenanceState();
  return parseVoyage33MaintenanceState(session.voyage33Maintenance);
}

function movementFor(session: GameSession): Voyage33MovementState | undefined {
  if (session.voyage33Movement === undefined) return undefined;
  return parseVoyage33MovementState(session.voyage33Movement);
}

function isSafeFuel(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function labelFor(session: GameSession, coordinate: string): string {
  const site = session.organiserSites?.[coordinate];
  return typeof site?.name === 'string' && site.name.trim() ? site.name : coordinate;
}

function connectionFor(connection: string): Voyage33MovementConnection {
  return connection === 'live' ? 'live' : connection === 'connecting' ? 'connecting' : 'offline';
}

function phaseFor(session: GameSession, now: number): {
  readonly kind: 'team' | 'coordination' | 'other';
  readonly paused: boolean;
} {
  const phase = phaseForSession(session);
  const readout = turnPhaseReadout(phase, now);
  if (!phase || !readout) return { kind: 'other', paused: false };
  if (phase.timerPause) return { kind: 'other', paused: true };
  if (readout.kind === 'team') return { kind: 'team', paused: false };
  if (readout.kind === 'open') return { kind: 'coordination', paused: false };
  return { kind: 'other', paused: false };
}

function sameCurrentGm(
  session: GameSession | null,
  me: ReturnType<typeof useSessionStore.getState>['me'],
  instance: ReturnType<typeof useSessionStore.getState>['gmInstance'],
): boolean {
  return !!session && me?.role === 'gm' && me.sessionId === session.id &&
    !!instance && instance.sessionId === session.id && instance.uid === me.uid;
}

function currentDamageStatus(session: GameSession, shipId: string): Voyage33MovementHost['status'] {
  const damage = session.shipDamage?.[shipId];
  if (!damage) return 'operational';
  if (damage.destroyed) return 'destroyed';
  return damage.damagedSystemIds.length > 0 ? 'damaged' : 'operational';
}

export default function Voyage33MovementWorkspace() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const connection = useSessionStore((state) => state.connection);
  const snapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uncertainAction, setUncertainAction] = useState<UncertainAction | null>(null);
  const [projectionGuard, setProjectionGuard] = useState<ProjectionGuard | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() =>
    typeof window !== 'undefined' && window.navigator.onLine,
  );

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const updateOnline = () => setOnline(window.navigator.onLine);
    const timer = window.setInterval(tick, 1_000);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!projectionGuard || session?.id !== projectionGuard.sessionId) return;
    const movementRevision = session.voyage33Movement?.revision ?? 0;
    const dockingRevision = session.voyage33Maintenance?.dockingRevision ?? 0;
    if (movementRevision >= projectionGuard.movementRevision && dockingRevision >= projectionGuard.dockingRevision) {
      setProjectionGuard(null);
      setOutcome({ status: 'idle' });
    }
  }, [session, projectionGuard]);

  const maintenance = session ? maintenanceFor(session) : undefined;
  const movement = session ? movementFor(session) : undefined;
  const admission = !!session &&
    !!parseVoyage33Admission(session.voyage33Admission, session.id) &&
    session.admittedVesselIds?.includes(VOYAGE_33_ID) === true;
  const gmCurrent = sameCurrentGm(session, me, gmInstance);
  const fresh = snapshotFreshness === 'server' && connection === 'live' && online;
  const phase = session ? phaseFor(session, now) : { kind: 'other' as const, paused: false };
  const turn = session?.currentTurn ?? 1;
  const activeMultiplayer = session?.phase === 'active' && session.singlePlayerDemo == null;
  const projectedCoordinates = useMemo(() => {
    const known = session?.organiserSystems ?? {};
    return new Set(Object.entries(known).flatMap(([nodeId, coordinate]) =>
      STAR_CHART_SYSTEMS.some((system) => system.id === nodeId) &&
      typeof coordinate === 'string' && /^\d{4}$/.test(coordinate)
        ? [coordinate]
        : []));
  }, [session?.organiserSystems]);

  const currentCoordinate = movement?.coordinate;
  const currentLocation = movement
    ? {
      coordinate: movement.coordinate,
      label: labelFor(session!, movement.coordinate),
    }
    : {
      coordinate: '—',
      label: 'No origin recorded yet',
    };

  const rawHostId = maintenance?.hostShipId ?? null;
  const hostShip = rawHostId ? SHIPS.find((ship) => ship.id === rawHostId) : undefined;
  const hostCoordinate = rawHostId ? session?.shipGalacticCoordinates?.[rawHostId] : undefined;
  const hostFuelValue = rawHostId ? session?.shipResources?.[rawHostId]?.fuel : undefined;
  const hostOnActiveRoster = !!rawHostId && !!session?.activeVesselIds?.includes(rawHostId);
  const hostLocationMatches = !!currentCoordinate && hostCoordinate === currentCoordinate;
  const hostBaseStatus = rawHostId && session ? currentDamageStatus(session, rawHostId) : 'unavailable';
  const hostProjectionValid = !!rawHostId && !!hostShip && hostOnActiveRoster &&
    typeof hostCoordinate === 'string' && /^\d{4}$/.test(hostCoordinate) &&
    isSafeFuel(hostFuelValue) && hostBaseStatus !== 'destroyed' && hostLocationMatches;
  const host: Voyage33MovementHost | null = rawHostId && session
    ? {
      shipId: rawHostId,
      name: hostShip?.name ?? rawHostId,
      coordinate: typeof hostCoordinate === 'string' ? hostCoordinate : 'Unknown',
      fuel: isSafeFuel(hostFuelValue) ? hostFuelValue : 0,
      status: hostProjectionValid ? hostBaseStatus : hostBaseStatus === 'destroyed' ? 'destroyed' : 'unavailable',
    }
    : null;

  const dockableHosts = useMemo(() => {
    if (!session || !maintenance || maintenance.hostShipId !== null) return [];
    return (session.activeVesselIds ?? []).flatMap((shipId) => {
      const ship = SHIPS.find((candidate) => candidate.id === shipId);
      const coordinate = session.shipGalacticCoordinates?.[shipId];
      const damage = session.shipDamage?.[shipId];
      if (!ship || typeof coordinate !== 'string' || !/^\d{4}$/.test(coordinate) ||
          !projectedCoordinates.has(coordinate) ||
          damage?.destroyed === true ||
          damage !== undefined && (damage.destroyed !== false || !Array.isArray(damage.damagedSystemIds)) ||
          currentCoordinate && coordinate !== currentCoordinate) return [];
      return [{ shipId, name: `${ship.name} // ${coordinate}` }];
    });
  }, [session, maintenance, currentCoordinate, projectedCoordinates]);

  const alreadyJumped = movement?.jumpState.lastJumpTurn === turn;
  const visibleLegalRoutes = useMemo((): readonly {
    coordinate: string;
    label: string;
    length: Voyage33JumpLength;
  }[] => {
    if (!session || !movement || !hostProjectionValid || alreadyJumped ||
        !currentCoordinate || !projectedCoordinates.has(currentCoordinate)) return [];
    return STAR_CHART_SYSTEMS.flatMap((system) => {
      const coordinate = session.organiserSystems?.[system.id];
      if (typeof coordinate !== 'string' || !projectedCoordinates.has(coordinate) ||
          coordinate === currentCoordinate) return [];
      const length = jumpLengthBetween(currentCoordinate, coordinate);
      return length ? [{ coordinate, label: labelFor(session, coordinate), length }] : [];
    });
  }, [
    session, movement, hostProjectionValid, alreadyJumped,
    currentCoordinate, projectedCoordinates,
  ]);
  const hostFuel = isSafeFuel(hostFuelValue) ? hostFuelValue : 0;
  const projectedDestinations = visibleLegalRoutes.filter((destination) =>
    hostFuel >= voyage33JumpFuelCost(destination.length));


  let jumpBlockReason: string | undefined;
  if (phase.kind === 'coordination' && !phase.paused) {
    if (!movement) jumpBlockReason = 'Dock Voyage 33-0 with a live core ship during Team Phase before departure.';
    else if (!maintenance?.hostShipId) jumpBlockReason = 'Dock Voyage 33-0 with a live core ship before departure.';
    else if (!hostProjectionValid) jumpBlockReason = 'The assigned host position, damage, or fuel projection is unavailable.';
    else if (hostCoordinate !== movement.coordinate) jumpBlockReason = 'Voyage 33-0 and its host must share the same location.';
    else if (alreadyJumped) jumpBlockReason = 'Voyage 33-0 has already jumped this cycle.';
    else if (!projectedCoordinates.has(movement.coordinate)) {
      jumpBlockReason = 'The current system is not present in the facilitator navigation projection.';
    } else if (visibleLegalRoutes.length === 0) {
      jumpBlockReason = 'No legal destinations are available in the current facilitator navigation projection.';
    } else if (projectedDestinations.length === 0) {
      jumpBlockReason = 'Current host fuel cannot cover any jump in the facilitator navigation projection.';
    }
  }

  const uncertainFrom = (error: Voyage33MovementUncertainError): UncertainAction => ({
    action: error.attempt.action,
    value: error.attempt.action === 'dock' ? error.attempt.hostShipId : error.attempt.destination!,
    sessionId: error.attempt.sessionId,
    instanceId: error.attempt.instanceId,
    expectedMovementRevision: error.attempt.expectedMovementRevision,
    expectedDockingRevision: error.attempt.expectedDockingRevision,
  });

  const retryStillMatchesProjection = (attempt: UncertainAction): boolean => {
    const current = useSessionStore.getState();
    const movementRevision = current.session?.voyage33Movement?.revision ?? 0;
    const dockingRevision = current.session?.voyage33Maintenance?.dockingRevision ?? 0;
    return current.session?.id === attempt.sessionId &&
      current.gmInstance?.id === attempt.instanceId &&
      movementRevision === attempt.expectedMovementRevision &&
      dockingRevision === attempt.expectedDockingRevision;
  };

  const handleDock = async (hostShipId: string) => {
    setNotice(null);
    setOutcome({ status: 'pending', message: 'Waiting for the authenticated docking command receipt.' });
    try {
      const receipt = await dockVoyage33Movement(hostShipId);
      if (receipt.status === 'stale') {
        setUncertainAction(null);
        setProjectionGuard({
          kind: 'stale',
          sessionId: useSessionStore.getState().session?.id ?? '',
          movementRevision: receipt.currentMovementRevision,
          dockingRevision: receipt.currentDockingRevision,
        });
        setOutcome({
          status: 'stale',
          message: 'The movement or docking revision changed. Wait for the current server session projection, then retry.',
        });
      } else {
        setUncertainAction(null);
        setProjectionGuard({
          kind: 'committed',
          sessionId: useSessionStore.getState().session?.id ?? '',
          movementRevision: receipt.movementState.revision,
          dockingRevision: receipt.maintenanceState.dockingRevision,
        });
        setOutcome({
          status: 'committed',
          message: 'Server receipt confirmed. Waiting for the live session projection to reflect the host assignment.',
        });
      }
    } catch (error) {
      if (error instanceof Voyage33MovementUncertainError) {
        setUncertainAction(uncertainFrom(error));
        setOutcome({ status: 'pending', message: 'The command result is uncertain. Retry only the exact action below.' });
        setNotice({
          role: 'alert',
          message: `UNCERTAIN // ${error.message}`,
        });
      } else {
        setUncertainAction(null);
        const message = error instanceof Voyage33MovementRejectedError
          ? error.message
          : error instanceof Error ? error.message : 'The docking command was rejected.';
        setOutcome({ status: 'denied', message });
      }
    }
  };

  const handleJump = async (destination: string) => {
    setNotice(null);
    setOutcome({ status: 'pending', message: 'Waiting for the authenticated jump command receipt.' });
    try {
      const receipt = await jumpVoyage33Movement(destination);
      if (receipt.status === 'stale') {
        setUncertainAction(null);
        setProjectionGuard({
          kind: 'stale',
          sessionId: useSessionStore.getState().session?.id ?? '',
          movementRevision: receipt.currentMovementRevision,
          dockingRevision: receipt.currentDockingRevision,
        });
        setOutcome({
          status: 'stale',
          message: 'The movement or docking revision changed. Wait for the current server session projection, then retry.',
        });
      } else if (receipt.status === 'jumped' ||
          receipt.status === 'replayed' && 'transition' in receipt && receipt.transition !== undefined) {
        setUncertainAction(null);
        setProjectionGuard({
          kind: 'committed',
          sessionId: useSessionStore.getState().session?.id ?? '',
          movementRevision: receipt.movementState.revision,
          dockingRevision: receipt.maintenanceState.dockingRevision,
        });
        setOutcome({
          status: 'committed',
          message: 'Server receipt confirmed. Waiting for the live session projection to reflect position and host fuel.',
        });
      } else {
        setUncertainAction(null);
        setOutcome({ status: 'idle' });
        setNotice({
          role: 'status',
          message: `SERVER RECEIPT // ${receipt.status.toUpperCase()} // review the refreshed movement readout before another jump.`,
        });
      }
    } catch (error) {
      if (error instanceof Voyage33MovementUncertainError) {
        setUncertainAction(uncertainFrom(error));
        setOutcome({ status: 'pending', message: 'The command result is uncertain. Retry only the exact action below.' });
        setNotice({
          role: 'alert',
          message: `UNCERTAIN // ${error.message}`,
        });
      } else {
        setUncertainAction(null);
        const message = error instanceof Voyage33MovementRejectedError
          ? error.message
          : error instanceof Error ? error.message : 'The jump command was rejected.';
        setOutcome({ status: 'denied', message });
      }
    }
  };

  const retryExactAction = () => {
    if (!uncertainAction) return;
    if (!retryStillMatchesProjection(uncertainAction)) {
      setUncertainAction(null);
      setOutcome({
        status: 'stale',
        message: 'The live movement or docking projection changed. Review the current session state before choosing another action.',
      });
      setNotice(null);
      return;
    }
    if (uncertainAction.action === 'dock') void handleDock(uncertainAction.value);
    else void handleJump(uncertainAction.value);
  };

  const connectionState = connectionFor(connection);
  const invalidProjection = !!session && (!maintenance || session.voyage33Movement !== undefined && !movement);
  const commonBoundary = (
    <p className="gm-console__status">
      Server-authorized movement // location and host fuel readouts follow the current session projection.
    </p>
  );

  return (
    <section className="gm-console__module cic-frame" aria-label="Voyage 33-0 movement workspace">
      <h2 className="gm-console__section-title">Voyage 33-0 // movement and host fuel</h2>
      {commonBoundary}
      {!session ? (
        <p role="status">No current session projection is available.</p>
      ) : !gmCurrent ? (
        <p role="status">The current GM instance changed. Reopen the facilitator console before controlling Voyage 33-0.</p>
      ) : !admission ? (
        <p role="status">Voyage 33-0 is not admitted in the current session.</p>
      ) : !fresh ? (
        <p role="status">Waiting for a current live server snapshot. Movement actions remain unavailable.</p>
      ) : invalidProjection ? (
        <p role="status">The Voyage 33-0 host or movement projection is malformed. Refresh the live session before acting.</p>
      ) : (
        <>
          {!movement && maintenance?.hostShipId === null && (
            <p className="gm-console__status">
              Origin will be set by the selected host's current location when docking is confirmed.
            </p>
          )}
          {phase.paused && (
            <p className="gm-console__status" role="status">
              Movement is paused until the facilitator resumes the current cycle.
            </p>
          )}
          {session.phase !== 'active' || session.singlePlayerDemo != null ? (
            <p className="gm-console__status" role="status">
              Voyage 33-0 movement is available only in an active multiplayer session.
            </p>
          ) : null}
          {jumpBlockReason && (
            <p className="gm-console__status" role="status">{jumpBlockReason}</p>
          )}
          {notice && (
            <p className="gm-console__status" role={notice.role} aria-live={notice.role === 'alert' ? 'assertive' : 'polite'}>
              {notice.message}
            </p>
          )}
          {rawHostId && maintenance && host && hostProjectionValid && (
            <Voyage33MaintenancePanel
              session={session}
              state={maintenance}
              hostShipId={rawHostId}
              hostName={host.name}
              hostResources={session.shipResources?.[rawHostId]}
              currentTurn={turn}
              phase={phase.kind}
              authorityReady={admission && gmCurrent && fresh && activeMultiplayer &&
                !phase.paused && phase.kind === 'team' && !projectionGuard &&
                outcome.status !== 'pending' && connectionState === 'live' && online}
            />
          )}
          {projectionGuard ? (
            <p className="gm-console__status" role="status">
              {projectionGuard.kind === 'stale' ? 'STALE' : 'COMMITTED'} // Waiting for live movement revision {projectionGuard.movementRevision} and docking revision {projectionGuard.dockingRevision}. Actions are held until the session projection catches up.
            </p>
          ) : rawHostId && !hostProjectionValid ? (
            <p className="gm-console__status" role="status">
              Assigned host projection is incomplete or unavailable. Host fuel and movement controls are hidden until it refreshes.
            </p>
          ) : (
            <Voyage33MovementPanel
              admitted={admission}
              connection={connectionState}
              phase={activeMultiplayer ? phase.kind : 'other'}
              currentLocation={currentLocation}
              host={host}
              dockableHosts={dockableHosts}
              legalDestinations={jumpBlockReason ? [] : projectedDestinations}
              outcome={outcome}
              onDock={(hostShipId) => { void handleDock(hostShipId); }}
              onJump={(destination) => { void handleJump(destination); }}
            />
          )}
          {uncertainAction && (
            <button className="cic-action-button" type="button" onClick={retryExactAction}>
              Retry exact {uncertainAction.action === 'dock' ? 'host docking' : 'jump'}
              {' // '}{uncertainAction.value}
            </button>
          )}
        </>
      )}
    </section>
  );
}
