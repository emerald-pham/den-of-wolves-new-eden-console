import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeConnectedPlayers, subscribeShuttleDeparture } from '@/lib/firestore';
import { transferShuttleControl } from '@/lib/shuttleControlService';
import {
  beginShuttleTransit,
  completeShuttleArrival,
  requestShuttleDeparture,
  retargetShuttleTransit,
} from '@/lib/shuttleDepartureService';
import { transferShuttleCargo } from '@/lib/shuttleCargoService';
import {
  captureServiceShuttleRechargeAuthority,
  hasCurrentServiceShuttleRechargeReplayAuthority,
  rechargeHostConsoleFromShuttle,
  replayServiceShuttleRecharge,
} from '@/lib/serviceShuttleRechargeService';
import type {
  ServiceShuttleRechargeAuthorityBinding,
  ServiceShuttleRechargeCommand,
  ServiceShuttleRechargeStaleResult,
} from '@/lib/serviceShuttleRechargeService';
import {
  evacuateShuttleSurvivors,
  MAX_SHUTTLE_EVACUATION_PER_CYCLE,
  validShuttleEvacuationAmounts,
} from '@/lib/shuttleEvacuationService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player, ShuttleControlEntry, ShuttleMovementState } from '@/types/game';
import { findShip } from '@/data/ships';
import { dockingForShuttle, SHUTTLECRAFT, shuttleDestinationIsAllowed } from '@/data/shuttles';
import { RESOURCE_DEFINITIONS, type ResourceId } from '@/data/resources';
import { SERVICE_SHUTTLE_IDS, serviceRechargeConsoleOptions } from '@/data/serviceShuttleRecharge';
import { normalizeCommandError } from '@/lib/commandErrors';
import {
  captureBlacksmithRepairAuthority,
  hasCurrentBlacksmithRepairAuthority,
  repairConsolesFromBlacksmith,
} from '@/lib/blacksmithRepairService';
import type {
  BlacksmithRepairAuthorityBinding,
  BlacksmithRepairStaleResult,
} from '@/lib/blacksmithRepairService';
import './ShuttleControl.css';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  hasFreshSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';

interface Props {
  readonly control: ShuttleControlEntry;
}

interface ArrivalAttempt {
  readonly key: string;
  readonly checkpoint: SessionAuthorityCheckpoint;
}

interface RetargetAttempt {
  readonly key: string;
  readonly checkpoint: SessionAuthorityCheckpoint;
}

interface CargoAttemptAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly replacementRoleId: string | null | undefined;
  readonly seatId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly ownerUid: string;
  readonly hostShipId: string;
  readonly expectedControlRevision: number;
}

interface CargoRetry {
  readonly authority: CargoAttemptAuthority;
  readonly resourceId: ResourceId;
  readonly direction: 'load' | 'unload';
  readonly amount: number;
  readonly currentControlRevision: number;
}

interface CargoTransferAttempt {
  readonly authority: CargoAttemptAuthority;
  readonly resourceId: ResourceId;
  readonly direction: 'load' | 'unload';
  readonly amount: number;
}

interface BlacksmithRepairRecovery {
  readonly stale: BlacksmithRepairStaleResult;
  readonly authority: BlacksmithRepairAuthorityBinding;
}

type ServiceShuttleRechargeRecovery =
  | {
      readonly kind: 'stale';
      readonly stale: ServiceShuttleRechargeStaleResult;
      readonly authority: ServiceShuttleRechargeAuthorityBinding;
      readonly command: ServiceShuttleRechargeCommand;
    }
  | {
      readonly kind: 'uncertain';
      readonly authority: ServiceShuttleRechargeAuthorityBinding;
      readonly command: ServiceShuttleRechargeCommand;
    };

const EMPTY_SYSTEM_IDS: readonly string[] = Object.freeze([]);
const AMBIGUOUS_RECHARGE_OUTCOME_CODES = new Set([
  'unavailable', 'deadline-exceeded',
]);

function hasAmbiguousServiceShuttleRechargeOutcome(cause: unknown): boolean {
  const failure = normalizeCommandError(cause);
  if (!AMBIGUOUS_RECHARGE_OUTCOME_CODES.has(failure.code) || failure.kind !== 'unavailable-service') {
    return false;
  }
  if (typeof cause !== 'object' || cause === null) return false;

  // A server response with details is a classified outcome, even when its
  // transport wrapper uses an ambiguous code. Keep exact replay only for a
  // bare transport failure with no server-declared result.
  if ('kind' in cause && cause.kind !== undefined) return false;
  if ('details' in cause && cause.details !== undefined) return false;
  if (!('customData' in cause) || typeof cause.customData !== 'object' || cause.customData === null) {
    return true;
  }
  const customData = cause.customData as Record<string, unknown>;
  return customData.serverResponse === undefined;
}

function captureCargoAttemptAuthority(
  shuttleId: string,
  expectedControlRevision: number,
): CargoAttemptAuthority | undefined {
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  const authority = session?.shuttleControl?.[shuttleId];
  const docking = session ? dockingForShuttle(session, shuttleId) : undefined;
  if (!hasFreshSessionAuthority() || !session || !me || me.role !== 'player' ||
      me.sessionId !== session.id || !me.uid || typeof me.fleetGroupId !== 'string' ||
      !me.fleetGroupId.trim() || !authority || authority.shuttleId !== shuttleId ||
      authority.holderUid !== me.uid || authority.revision !== expectedControlRevision || !docking?.shipId) {
    return undefined;
  }
  return {
    sessionId: session.id,
    uid: me.uid,
    role: me.role,
    assignedRoleId: me.assignedRoleId,
    activeConsoleRoleId: me.activeConsoleRoleId,
    replacementRoleId: me.replacementRoleId,
    seatId: me.seatId,
    fleetGroupId: me.fleetGroupId,
    shuttleId,
    ownerRoleId: authority.ownerRoleId,
    ownerUid: authority.ownerUid,
    hostShipId: docking.shipId,
    expectedControlRevision,
  };
}

function cargoAttemptAuthorityIsCurrent(
  attempt: CargoAttemptAuthority,
  minimumControlRevision = attempt.expectedControlRevision,
): boolean {
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  const authority = session?.shuttleControl?.[attempt.shuttleId];
  const docking = session ? dockingForShuttle(session, attempt.shuttleId) : undefined;
  return hasFreshSessionAuthority() && session?.id === attempt.sessionId &&
    me?.sessionId === attempt.sessionId && me.uid === attempt.uid && me.role === attempt.role &&
    me.assignedRoleId === attempt.assignedRoleId && me.activeConsoleRoleId === attempt.activeConsoleRoleId &&
    me.replacementRoleId === attempt.replacementRoleId && me.seatId === attempt.seatId &&
    me.fleetGroupId === attempt.fleetGroupId &&
    authority?.shuttleId === attempt.shuttleId && authority.ownerRoleId === attempt.ownerRoleId &&
    authority.ownerUid === attempt.ownerUid && authority.holderUid === attempt.uid &&
    Number.isSafeInteger(authority.revision) && authority.revision >= minimumControlRevision &&
    docking?.shipId === attempt.hostShipId;
}

function arrivalContextKey(
  checkpoint: SessionAuthorityCheckpoint | undefined,
  shuttleId: string,
  transitRequestId: string | undefined,
  connection: string,
  snapshotFreshness: string,
): string {
  return JSON.stringify([
    checkpoint?.sessionId ?? null,
    checkpoint?.uid ?? null,
    checkpoint?.version ?? null,
    connection,
    snapshotFreshness,
    shuttleId,
    transitRequestId ?? null,
  ]);
}

export default function ShuttleControl({ control }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const me = useSessionStore((state) => state.me)!;
  const connection = useSessionStore((state) => state.connection);
  const snapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [deadlineClock, setDeadlineClock] = useState(() => Date.now());
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [targetUid, setTargetUid] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [destinationShipId, setDestinationShipId] = useState('');
  const [departure, setDeparture] = useState<ShuttleMovementState | null>(null);
  const [arrivalReadyKey, setArrivalReadyKey] = useState<string | null>(null);
  const [arrivalCompleteKey, setArrivalCompleteKey] = useState<string | null>(null);
  const [arrivalPendingKey, setArrivalPendingKey] = useState<string | null>(null);
  const [arrivalStatus, setArrivalStatus] = useState<{ key: string; message: string } | null>(null);
  const arrivalAttemptRef = useRef<ArrivalAttempt | null>(null);
  const arrivalPendingKeyRef = useRef<string | null>(null);
  const retargetAttemptRef = useRef<RetargetAttempt | null>(null);
  const retargetPendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const [cargoResourceId, setCargoResourceId] = useState<ResourceId | ''>('');
  const [cargoAmount, setCargoAmount] = useState(1);
  const [cargoRetry, setCargoRetry] = useState<CargoRetry | null>(null);
  const [rechargeConsoleId, setRechargeConsoleId] = useState('');
  const [rechargeProductionScrap, setRechargeProductionScrap] = useState(false);
  const [rechargeProductionOreAmount, setRechargeProductionOreAmount] = useState(1);
  const [rechargeRecovery, setRechargeRecovery] = useState<ServiceShuttleRechargeRecovery | null>(null);
  const [evacuationDestinationShipId, setEvacuationDestinationShipId] = useState('');
  const [evacuationAmount, setEvacuationAmount] = useState(0);
  const [repairSystemIds, setRepairSystemIds] = useState<string[]>([]);
  const [repairRecovery, setRepairRecovery] = useState<BlacksmithRepairRecovery | null>(null);
  const canTransfer = me.role === 'gm' || me.uid === control.ownerUid;
  const canRequestDeparture = me.role === 'player' && me.uid === control.holderUid;
  const transit = departure?.status === 'in-transit' ? departure : null;
  const renderAuthority = captureSessionAuthority(session.id, me.uid);
  const currentArrivalKey = arrivalContextKey(
    renderAuthority,
    control.shuttleId,
    transit?.transitRequestId,
    connection,
    snapshotFreshness,
  );
  const currentArrivalKeyRef = useRef(currentArrivalKey);
  currentArrivalKeyRef.current = currentArrivalKey;
  const retargetContextKey = JSON.stringify([
    renderAuthority?.sessionId ?? null,
    renderAuthority?.uid ?? null,
    renderAuthority?.version ?? null,
    connection,
    snapshotFreshness,
  ]);
  const retargetContextKeyRef = useRef(retargetContextKey);
  retargetContextKeyRef.current = retargetContextKey;
  const arrivalReady = arrivalReadyKey === currentArrivalKey;
  const arrivalComplete = arrivalCompleteKey === currentArrivalKey;
  const arrivalPending = arrivalPendingKey === currentArrivalKey;
  const arrivalAttempt = arrivalAttemptRef.current;
  const arrivalAttempted = arrivalAttempt?.key === currentArrivalKey &&
    isCurrentSessionAuthority(arrivalAttempt.checkpoint);
  const arrivalStatusMessage = arrivalStatus?.key === currentArrivalKey
    ? arrivalStatus.message : '';
  const busy = pending || arrivalPending;
  const docking = dockingForShuttle(session, control.shuttleId);
  const cargoTypes = SHUTTLECRAFT.find((shuttle) => shuttle.id === control.shuttleId)
    ?.cargoTransferTypes ?? [];
  const cargoAmountIsValid = Number.isSafeInteger(cargoAmount) && cargoAmount >= 1;
  const cargoRetryMatchesDraft = Boolean(cargoRetry &&
    cargoRetry.resourceId === cargoResourceId && cargoRetry.amount === cargoAmount);
  const cargoRetryReady = Boolean(cargoRetryMatchesDraft && cargoRetry &&
    cargoAttemptAuthorityIsCurrent(cargoRetry.authority, cargoRetry.currentControlRevision));
  const cargoRetryWaiting = Boolean(cargoRetryMatchesDraft && cargoRetry &&
    cargoAttemptAuthorityIsCurrent(cargoRetry.authority) && !cargoRetryReady);
  const serviceShuttle = SERVICE_SHUTTLE_IDS.includes(
    control.shuttleId as typeof SERVICE_SHUTTLE_IDS[number],
  );
  const hostCycle = docking ? session.maintenanceCycles?.[docking.shipId] : undefined;
  const hostDamage = docking ? session.shipDamage?.[docking.shipId] : undefined;
  const hostMaintenanceReady = Boolean(hostCycle && hostCycle.turn === session.currentTurn && hostCycle.completedAt);
  const hostRechargeEligible = hostMaintenanceReady && hostDamage?.destroyed !== true;
  const rechargeOptions = docking && hostRechargeEligible
    ? serviceRechargeConsoleOptions(docking.shipId).filter((option) =>
    !hostCycle?.charges.includes(option.id) &&
    (option.id === 'jump-drive' || !hostDamage?.damagedSystemIds.includes(option.id))) : [];
  const selectedRechargeOption = rechargeOptions.find((option) => option.id === rechargeConsoleId);
  const hostResources = docking ? session.shipResources?.[docking.shipId] : undefined;
  const refineryMax = docking && session.shipUpgrades?.[docking.shipId]?.includes(rechargeConsoleId) ? 15 : 10;
  const invalidRechargeOre = selectedRechargeOption?.fuelRefinery === true &&
    (!Number.isSafeInteger(rechargeProductionOreAmount) || rechargeProductionOreAmount < 1 ||
      rechargeProductionOreAmount > refineryMax || rechargeProductionOreAmount > (hostResources?.ore ?? 0));
  const rechargeEntry = session.serviceShuttleRecharges?.[control.shuttleId];
  const rechargedThisCycle = rechargeEntry?.cycle === session.currentTurn;
  const rechargeWindowOpen = session.phase === 'active' &&
    (session.currentTurn ?? 0) >= 1 && session.turnPhase?.turn === session.currentTurn &&
    session.turnPhase?.airspace.state === 'lifted' && session.turnPhase.timerPause === undefined;
  const rechargeRecoveryOption = rechargeRecovery
    ? serviceRechargeConsoleOptions(rechargeRecovery.command.expectedHostShipId)
      .find((option) => option.id === rechargeRecovery.command.consoleId)
    : undefined;
  const rechargeRecoveryMatchesDraft = Boolean(rechargeRecovery &&
    rechargeRecovery.command.consoleId === rechargeConsoleId &&
    rechargeRecovery.command.productionScrap ===
      (rechargeRecoveryOption?.capybaraScrapChoice ? rechargeProductionScrap : undefined) &&
    rechargeRecovery.command.productionOreAmount ===
      (rechargeRecoveryOption?.fuelRefinery ? rechargeProductionOreAmount : undefined));
  const rechargeRecoveryAuthorityCurrent = Boolean(rechargeRecovery &&
    hasCurrentServiceShuttleRechargeReplayAuthority(rechargeRecovery.authority));
  const staleRechargeRecovery = rechargeRecovery?.kind === 'stale' ? rechargeRecovery : null;
  const uncertainRechargeRecovery = rechargeRecovery?.kind === 'uncertain' ? rechargeRecovery : null;
  const rechargeRecoveryCycleChanged = Boolean(staleRechargeRecovery &&
    session.currentTurn !== staleRechargeRecovery.stale.currentCycle);
  const rechargeRecoveryProjectionCurrent = Boolean(staleRechargeRecovery && rechargeRecoveryAuthorityCurrent &&
    Number.isSafeInteger(control.revision) && control.revision >= staleRechargeRecovery.stale.currentControlRevision &&
    Number.isSafeInteger(hostCycle?.revision) &&
    (hostCycle?.revision ?? -1) >= staleRechargeRecovery.stale.currentMaintenanceRevision &&
    Number.isSafeInteger(session.currentTurn) &&
    session.currentTurn === staleRechargeRecovery.stale.currentCycle);
  const rechargeRetryEligible = Boolean(rechargeRecoveryMatchesDraft && selectedRechargeOption &&
    hostMaintenanceReady && rechargeWindowOpen && session.shuttleFuelled?.[control.shuttleId] === true &&
    hostRechargeEligible && !rechargedThisCycle && !invalidRechargeOre &&
    (!rechargeProductionScrap || (hostResources?.scrap ?? 0) >= 1));
  const rechargeRetryReady = Boolean(staleRechargeRecovery && rechargeRecoveryAuthorityCurrent &&
    rechargeRecoveryProjectionCurrent && rechargeRetryEligible);
  const rechargeRetryWaiting = Boolean(staleRechargeRecovery && rechargeRecoveryMatchesDraft &&
    rechargeRecoveryAuthorityCurrent && !rechargeRecoveryProjectionCurrent && !rechargeRecoveryCycleChanged);
  const rechargeExactReplayReady = Boolean(uncertainRechargeRecovery && rechargeRecoveryMatchesDraft &&
    rechargeRecoveryAuthorityCurrent);
  const destinations = (session.activeVesselIds ?? [])
    .filter((shipId) => shipId !== docking?.shipId && findShip(shipId) !== undefined &&
      shuttleDestinationIsAllowed(control.shuttleId, shipId));
  const retargetDestinations = transit
    ? destinations.filter((shipId) => shipId !== transit.destinationShipId)
    : [];
  const projectedFleetVesselIds = session.playerDiscovery &&
    session.playerDiscovery.groupId === me.fleetGroupId
    ? session.playerDiscovery.fleetGroupVesselIds ?? [] : [];
  const evacuationDestinations = projectedFleetVesselIds
    .filter((shipId) => shipId !== docking?.shipId && destinations.includes(shipId) &&
      !session.populationAlerts?.[shipId]);
  const pressMovementException = control.shuttleId === 'snn-press-shuttle' &&
    session.pressEnabled !== false &&
    session.turnPhase?.airspace.state === 'restricted' &&
    session.turnPhase.airspace.pressAccess;
  const airspaceDeadline = session.turnPhase?.openAirspaceEndsAt
    ? Date.parse(session.turnPhase.openAirspaceEndsAt) : Number.NaN;
  useEffect(() => {
    if (!Number.isFinite(airspaceDeadline)) return;
    let timer: number | undefined;
    const refreshAtDeadline = () => {
      const remaining = airspaceDeadline - Date.now();
      if (remaining <= 0) {
        setDeadlineClock(Date.now());
        return;
      }
      timer = window.setTimeout(refreshAtDeadline, Math.min(remaining, 2_147_000_000));
    };
    refreshAtDeadline();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [airspaceDeadline]);
  const currentClockTime = Math.max(deadlineClock, Date.now());
  const departureWindowOpen = session.phase === 'active' &&
    (session.turnPhase?.airspace.state === 'lifted' || pressMovementException) &&
    !session.turnPhase?.timerPause &&
    currentClockTime < airspaceDeadline;
  const evacuationLedger = session.shuttleEvacuations?.[control.shuttleId];
  const evacuatedThisCycle = evacuationLedger && evacuationLedger.cycle === session.currentTurn
    ? evacuationLedger.moved : 0;
  const evacuationRemaining = Math.max(0, MAX_SHUTTLE_EVACUATION_PER_CYCLE - evacuatedThisCycle);
  const evacuationWindowOpen = session.phase === 'active' &&
    session.turnPhase?.turn === session.currentTurn &&
    session.turnPhase?.airspace.state === 'lifted';
  const sourcePopulationAlertPending = Boolean(docking && session.populationAlerts?.[docking.shipId]);
  const evacuationAvailable = evacuationWindowOpen && !sourcePopulationAlertPending;
  const sourcePopulation = docking ? session.shipSurvivors?.[docking.shipId] : undefined;
  const destinationPopulation = evacuationDestinationShipId
    ? session.shipSurvivors?.[evacuationDestinationShipId] : undefined;
  const evacuationAmounts = docking && typeof sourcePopulation === 'number' &&
    typeof destinationPopulation === 'number'
    ? validShuttleEvacuationAmounts({
      sourceShipId: docking.shipId, destinationShipId: evacuationDestinationShipId,
      sourcePopulation, destinationPopulation, remaining: evacuationRemaining,
    }) : [];
  const blacksmithRepair = session.blacksmithRepairs;
  const blacksmithRepairRevision = blacksmithRepair?.revision ?? 0;
  const repairHostsThisCycle = blacksmithRepair && blacksmithRepair.cycle === session.currentTurn
    ? blacksmithRepair.hosts : [];
  const repairedOnHost = docking
    ? repairHostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? EMPTY_SYSTEM_IDS
    : EMPTY_SYSTEM_IDS;
  const repairHostAlreadyUsed = Boolean(docking &&
    repairHostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = repairHostAlreadyUsed || repairHostsThisCycle.length === 0 ||
    (repairHostsThisCycle.length < 2 && session.shuttleFuelled?.blacksmith === true);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const repairOptions = useMemo(() => docking && control.shuttleId === 'blacksmith'
    ? (hostDamage?.damagedSystemIds ?? []).filter((id) => !repairedOnHost.includes(id)) : [],
  [control.shuttleId, docking, hostDamage?.damagedSystemIds, repairedOnHost]);
  const repairMaterials = docking ? session.shipResources?.[docking.shipId]?.materials ?? 0 : 0;
  const repairDeadline = airspaceDeadline;
  const repairWindowOpen = session.phase === 'active' &&
    session.turnPhase?.turn === session.currentTurn && session.turnPhase?.airspace.state === 'lifted' &&
    session.turnPhase.timerPause === undefined && Number.isFinite(repairDeadline) &&
    currentClockTime < repairDeadline;
  const repairResetKey = JSON.stringify([
    blacksmithRepairRevision, control.revision, control.shuttleId, docking?.shipId, session.currentTurn,
  ]);
  const repairResetKeyRef = useRef(repairResetKey);
  const repairRecoveryAuthorityCurrent = Boolean(repairRecovery &&
    hasCurrentBlacksmithRepairAuthority(repairRecovery.authority));
  const repairRecoveryProjectionCurrent = Boolean(repairRecoveryAuthorityCurrent && repairRecovery &&
    control.revision >= repairRecovery.stale.currentControlRevision &&
    blacksmithRepairRevision >= repairRecovery.stale.currentRepairRevision &&
    Number.isSafeInteger(session.currentTurn) &&
    (session.currentTurn as number) >= repairRecovery.stale.currentCycle);
  const repairSelectionEligible = repairSystemIds.length > 0 &&
    repairSystemIds.length <= repairSlotsRemaining &&
    repairSystemIds.every((systemId) => repairOptions.includes(systemId)) &&
    repairWindowOpen && repairShipAvailable && repairMaterials >= repairSystemIds.length * 4 &&
    hostDamage?.destroyed !== true;
  const repairRetryReady = Boolean(repairRecovery && repairRecoveryAuthorityCurrent &&
    repairRecoveryProjectionCurrent && repairSelectionEligible);
  const repairRetryWaiting = Boolean(repairRecovery && repairRecoveryAuthorityCurrent &&
    !repairRecoveryProjectionCurrent);

  useEffect(() => {
    const contextChanged = repairResetKeyRef.current !== repairResetKey;
    repairResetKeyRef.current = repairResetKey;
    if (repairRecovery) {
      if (!repairRecoveryAuthorityCurrent) {
        setRepairRecovery(null);
        setRepairSystemIds([]);
        setStatus('Blacksmith repair authority changed. Refresh the live console before retrying.');
        return;
      }
      setRepairSystemIds((current) => {
        const eligible = current.filter((systemId) => repairOptions.includes(systemId));
        return eligible.length === current.length ? current : eligible;
      });
    } else if (contextChanged) {
      setRepairSystemIds([]);
    }
  }, [repairOptions, repairRecovery, repairRecoveryAuthorityCurrent, repairResetKey]);

  useEffect(() => subscribeConnectedPlayers(session.id, setPlayers), [
    me.fleetGroupId, me.role, me.sessionId, me.uid, session.id,
  ]);
  useEffect(() => subscribeShuttleDeparture(
    session.id,
    control.shuttleId,
    setDeparture,
  ), [control.shuttleId, me.fleetGroupId, session.id]);
  useEffect(() => {
    if (!retargetAttemptRef.current) return;
    retargetAttemptRef.current = null;
    retargetPendingRef.current = null;
    setPending(false);
  }, [retargetContextKey]);
  const isCurrentArrivalAttempt = useCallback((attempt: ArrivalAttempt): boolean => {
    return arrivalAttemptRef.current === attempt &&
      currentArrivalKeyRef.current === attempt.key &&
      isCurrentSessionAuthority(attempt.checkpoint);
  }, []);

  const isCurrentRetargetAttempt = useCallback((attempt: RetargetAttempt): boolean => {
    return retargetAttemptRef.current === attempt &&
      retargetContextKeyRef.current === attempt.key &&
      retargetPendingRef.current === attempt.checkpoint &&
      isCurrentSessionAuthority(attempt.checkpoint);
  }, []);

  const startArrivalAttempt = useCallback((
    checkpoint: SessionAuthorityCheckpoint,
    key: string,
    automatic: boolean,
  ): void => {
    if (key !== currentArrivalKeyRef.current || !isCurrentSessionAuthority(checkpoint) ||
        arrivalPendingKeyRef.current === key) return;
    const previousAttempt = arrivalAttemptRef.current;
    if (automatic && previousAttempt?.key === key &&
        isCurrentSessionAuthority(previousAttempt.checkpoint)) return;
    const attempt: ArrivalAttempt = { key, checkpoint };
    arrivalAttemptRef.current = attempt;
    arrivalPendingKeyRef.current = key;
    setArrivalPendingKey(key);
    setStatus('');
    setArrivalStatus(null);
    void completeShuttleArrival(
      control.shuttleId,
      transit?.transitRequestId ?? '',
      control.revision,
    ).then((result) => {
      if (!isCurrentArrivalAttempt(attempt)) return;
      setArrivalCompleteKey(key);
      setArrivalStatus({
        key,
        message: `Shuttle arrived at ${findShip(result.hostShipId)?.name ?? result.hostShipId}.`,
      });
    }).catch((cause) => {
      if (!isCurrentArrivalAttempt(attempt)) return;
      setArrivalStatus({
        key,
        message: cause instanceof Error ? cause.message : 'Shuttle arrival could not be confirmed.',
      });
    }).finally(() => {
      if (!isCurrentArrivalAttempt(attempt)) return;
      if (arrivalPendingKeyRef.current === key) arrivalPendingKeyRef.current = null;
      setArrivalPendingKey((current) => current === key ? null : current);
    });
  }, [control.revision, control.shuttleId, isCurrentArrivalAttempt, transit?.transitRequestId]);

  useEffect(() => {
    if (!transit || !canRequestDeparture || transit.holderUid !== me.uid) {
      return;
    }
    const checkpoint = captureSessionAuthority(session.id, me.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint) ||
        arrivalContextKey(checkpoint, control.shuttleId, transit.transitRequestId,
          connection, snapshotFreshness) !== currentArrivalKey) return;
    const arrivesAt = Date.parse(transit.arrivesAt);
    if (!Number.isFinite(arrivesAt)) return;
    let timer: number | undefined;
    const checkArrivalTime = () => {
      const remaining = arrivesAt - Date.now();
      if (remaining <= 0) {
        if (currentArrivalKeyRef.current === currentArrivalKey &&
            isCurrentSessionAuthority(checkpoint)) setArrivalReadyKey(currentArrivalKey);
        return;
      }
      timer = window.setTimeout(checkArrivalTime, Math.min(remaining, 2_147_000_000));
    };
    checkArrivalTime();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [canRequestDeparture, connection, control.shuttleId, currentArrivalKey,
    me.uid, session.id, snapshotFreshness, transit]);
  useEffect(() => {
    if (!arrivalReady || !transit || !canRequestDeparture ||
        transit.holderUid !== me.uid || arrivalComplete || busy) return;
    const checkpoint = captureSessionAuthority(session.id, me.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint) ||
        arrivalContextKey(checkpoint, control.shuttleId, transit.transitRequestId,
          connection, snapshotFreshness) !== currentArrivalKey) return;
    startArrivalAttempt(checkpoint, currentArrivalKey, true);
  }, [arrivalComplete, arrivalReady, busy, canRequestDeparture, connection, control.revision,
    control.shuttleId, currentArrivalKey, me.uid, session.id, snapshotFreshness, startArrivalAttempt, transit]);
  const holder = players.find((player) => player.uid === control.holderUid);
  const targets = useMemo(() => players.filter((player) =>
    player.role === 'player' && player.uid !== control.holderUid), [control.holderUid, players]);

  async function submit(action: 'handoff' | 'reclaim'): Promise<void> {
    if (busy) return;
    setPending(true);
    setStatus('');
    try {
      await transferShuttleControl(
        control.shuttleId,
        action,
        control.revision,
        action === 'handoff' ? targetUid : undefined,
      );
      setStatus(action === 'reclaim' ? 'Shuttle control reclaimed.' : 'Shuttle control handed off.');
      setTargetUid('');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle control transfer failed.');
    } finally {
      setPending(false);
    }
  }

  async function submitDeparture(): Promise<void> {
    if (busy || !destinationShipId || !session.turnPhase) return;
    setPending(true);
    setStatus('');
    try {
      await requestShuttleDeparture(
        control.shuttleId,
        destinationShipId,
        control.revision,
        session.turnPhase.turn,
      );
      setStatus(`Departure requested to ${findShip(destinationShipId)?.name ?? destinationShipId}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle departure request failed.');
    } finally {
      setPending(false);
    }
  }

  async function submitTransit(): Promise<void> {
    if (busy || !departure || departure.status !== 'requested') return;
    setPending(true);
    setStatus('');
    try {
      await beginShuttleTransit(
        control.shuttleId,
        departure.requestId,
        control.revision,
        departure.cycle,
      );
      setStatus(`Transit begun to ${findShip(departure.destinationShipId)?.name ?? departure.destinationShipId}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle transit failed.');
    } finally {
      setPending(false);
    }
  }

  async function submitRetarget(): Promise<void> {
    if (busy || !transit || !destinationShipId || !departureWindowOpen) return;
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    const key = retargetContextKeyRef.current;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint) ||
        current.session?.id !== session.id || current.me?.uid !== me.uid) return;
    const destination = destinationShipId;
    const attempt: RetargetAttempt = { key, checkpoint };
    retargetAttemptRef.current = attempt;
    retargetPendingRef.current = checkpoint;
    setPending(true);
    setStatus('');
    void retargetShuttleTransit(
      control.shuttleId,
      transit.transitRequestId,
      destination,
      control.revision,
      transit.cycle,
    ).then(() => {
      if (!isCurrentRetargetAttempt(attempt)) return;
      setStatus(`Course changed to ${findShip(destination)?.name ?? destination}.`);
      setDestinationShipId('');
    }).catch((cause) => {
      if (!isCurrentRetargetAttempt(attempt)) return;
      setStatus(cause instanceof Error ? cause.message : 'Shuttle course change failed.');
    }).finally(() => {
      if (!isCurrentRetargetAttempt(attempt)) return;
      retargetPendingRef.current = null;
      retargetAttemptRef.current = null;
      setPending(false);
    });
  }

  function submitArrival(): void {
    if (busy || !transit || !arrivalReady || arrivalComplete) return;
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    const key = currentArrivalKeyRef.current;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint) ||
        current.session?.id !== session.id || current.me?.uid !== me.uid ||
        transit.holderUid !== current.me.uid ||
        arrivalContextKey(checkpoint, control.shuttleId, transit.transitRequestId,
          current.connection, current.sessionSnapshotFreshness) !== key) return;
    startArrivalAttempt(checkpoint, key, false);
  }

  async function performCargoTransfer(attempt: CargoTransferAttempt): Promise<void> {
    setPending(true);
    setStatus('');
    try {
      const result = await transferShuttleCargo(
        attempt.authority.shuttleId,
        attempt.resourceId,
        attempt.direction,
        attempt.amount,
        attempt.authority.expectedControlRevision,
      );
      if (!cargoAttemptAuthorityIsCurrent(attempt.authority)) return;
      if (result?.status === 'stale') {
        if (result.hostShipId !== attempt.authority.hostShipId ||
            !Number.isSafeInteger(result.currentControlRevision) ||
            result.currentControlRevision <= attempt.authority.expectedControlRevision) {
          setStatus('Shuttle cargo state could not be confirmed. Refresh the live session before retrying.');
          return;
        }
        setCargoRetry({ ...attempt, currentControlRevision: result.currentControlRevision });
        return;
      }
      setCargoRetry(null);
      setStatus(`${attempt.direction === 'load' ? 'Loaded' : 'Unloaded'} ${attempt.amount} ${RESOURCE_DEFINITIONS.find((resource) => resource.id === attempt.resourceId)?.label ?? attempt.resourceId}.`);
    } catch (cause) {
      if (cargoAttemptAuthorityIsCurrent(attempt.authority)) {
        setStatus(cause instanceof Error ? cause.message : 'Shuttle cargo transfer failed.');
      }
    } finally {
      setPending(false);
    }
  }

  async function submitCargo(direction: 'load' | 'unload'): Promise<void> {
    if (busy || cargoRetry || !docking || !cargoResourceId ||
        !Number.isSafeInteger(cargoAmount) || cargoAmount < 1) return;
    const authority = captureCargoAttemptAuthority(control.shuttleId, control.revision);
    if (!authority) {
      setStatus('Refresh the live shuttle control and docking state before transferring cargo.');
      return;
    }
    await performCargoTransfer({
      authority, resourceId: cargoResourceId, direction, amount: cargoAmount,
    });
  }

  async function retryCargoTransfer(): Promise<void> {
    if (busy || !cargoRetry || !cargoRetryReady ||
        !cargoAttemptAuthorityIsCurrent(cargoRetry.authority, cargoRetry.currentControlRevision)) return;
    const currentSession = useSessionStore.getState().session;
    const currentRevision = currentSession?.shuttleControl?.[cargoRetry.authority.shuttleId]?.revision;
    if (!Number.isSafeInteger(currentRevision) ||
        (currentRevision as number) < cargoRetry.currentControlRevision) return;
    const authority = captureCargoAttemptAuthority(cargoRetry.authority.shuttleId, currentRevision as number);
    if (!authority || authority.sessionId !== cargoRetry.authority.sessionId ||
        authority.uid !== cargoRetry.authority.uid || authority.ownerRoleId !== cargoRetry.authority.ownerRoleId ||
        authority.ownerUid !== cargoRetry.authority.ownerUid || authority.fleetGroupId !== cargoRetry.authority.fleetGroupId ||
        authority.hostShipId !== cargoRetry.authority.hostShipId) return;
    const attempt: CargoTransferAttempt = {
      authority,
      resourceId: cargoRetry.resourceId,
      direction: cargoRetry.direction,
      amount: cargoRetry.amount,
    };
    setCargoRetry(null);
    await performCargoTransfer(attempt);
  }

  async function submitEvacuation(): Promise<void> {
    if (busy || !evacuationAvailable ||
        !evacuationDestinations.includes(evacuationDestinationShipId) ||
        !evacuationAmounts.includes(evacuationAmount)) return;
    setPending(true);
    setStatus('');
    try {
      await evacuateShuttleSurvivors(
        control.shuttleId, evacuationDestinationShipId, evacuationAmount, control.revision,
        evacuationLedger?.revision ?? 0,
      );
      setStatus(`Moved ${evacuationAmount.toLocaleString()} survivors to ${findShip(evacuationDestinationShipId)?.name ?? evacuationDestinationShipId}.`);
      setEvacuationAmount(0);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Survivor evacuation failed.');
    } finally {
      setPending(false);
    }
  }

  async function submitRecharge(mode: 'fresh' | 'stale-retry' | 'exact-replay' = 'fresh'): Promise<void> {
    if (busy || (mode === 'fresh' && (!rechargeConsoleId || !selectedRechargeOption ||
        rechargeRecoveryMatchesDraft)) ||
        (mode === 'stale-retry' && (!rechargeRetryReady || !staleRechargeRecovery)) ||
        (mode === 'exact-replay' && (!rechargeExactReplayReady || !uncertainRechargeRecovery))) return;
    const current = useSessionStore.getState();
    const liveSession = current.session;
    const liveMe = current.me;
    if (!liveSession || !liveMe) return;
    let command: ServiceShuttleRechargeCommand;
    let authority: ServiceShuttleRechargeAuthorityBinding;
    if (mode === 'exact-replay' && uncertainRechargeRecovery) {
      command = uncertainRechargeRecovery.command;
      authority = uncertainRechargeRecovery.authority;
      if (!hasCurrentServiceShuttleRechargeReplayAuthority(authority)) return;
    } else {
      const liveDocking = dockingForShuttle(liveSession, control.shuttleId);
      const liveControl = liveSession.shuttleControl?.[control.shuttleId];
      const liveCycle = liveSession.currentTurn;
      const liveHostCycle = liveDocking
        ? liveSession.maintenanceCycles?.[liveDocking.shipId] : undefined;
      if (!liveDocking || !liveControl || !Number.isSafeInteger(liveCycle) || !liveHostCycle) return;
      if (mode === 'stale-retry' && staleRechargeRecovery &&
          (liveDocking.shipId !== staleRechargeRecovery.stale.hostShipId ||
           !Number.isSafeInteger(liveControl.revision) ||
           liveControl.revision < staleRechargeRecovery.stale.currentControlRevision ||
           !Number.isSafeInteger(liveHostCycle.revision) ||
           liveHostCycle.revision < staleRechargeRecovery.stale.currentMaintenanceRevision ||
           liveCycle !== staleRechargeRecovery.stale.currentCycle)) return;
      command = mode === 'stale-retry' && staleRechargeRecovery
        ? {
            ...staleRechargeRecovery.command,
            requestId: window.crypto.randomUUID(),
            expectedControlRevision: liveControl.revision,
            expectedMaintenanceRevision: liveHostCycle.revision,
            expectedCycle: liveCycle as number,
            expectedHostShipId: liveDocking.shipId,
          }
        : {
            requestId: window.crypto.randomUUID(),
            shuttleId: control.shuttleId,
            consoleId: rechargeConsoleId,
            expectedControlRevision: liveControl.revision,
            expectedMaintenanceRevision: liveHostCycle.revision,
            expectedCycle: liveCycle as number,
            expectedHostShipId: liveDocking.shipId,
            ...(selectedRechargeOption?.capybaraScrapChoice ? { productionScrap: rechargeProductionScrap } : {}),
            ...(selectedRechargeOption?.fuelRefinery ? { productionOreAmount: rechargeProductionOreAmount } : {}),
          };
      try {
        authority = captureServiceShuttleRechargeAuthority(liveSession, liveMe, command);
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : 'Refresh the live service-shuttle authority before recharging.');
        return;
      }
    }
    setPending(true);
    setStatus('');
    try {
      const result = mode === 'exact-replay'
        ? await replayServiceShuttleRecharge(command)
        : await rechargeHostConsoleFromShuttle(command);
      if (result.status === 'stale') {
        setRechargeRecovery({ kind: 'stale', stale: result, authority, command });
        return;
      }
      setRechargeRecovery(null);
      setStatus(result.message);
      setRechargeConsoleId('');
      setRechargeProductionScrap(false);
      setRechargeProductionOreAmount(1);
    } catch (cause) {
      if (!hasAmbiguousServiceShuttleRechargeOutcome(cause)) {
        const failure = normalizeCommandError(cause);
        setRechargeRecovery(null);
        setStatus(failure.kind === 'stale-revision'
          ? 'The Coordination cycle changed before this request could be accepted. The old recharge request cannot carry into this cycle; change the selection before starting a new request.'
          : failure.message);
      } else if (hasCurrentServiceShuttleRechargeReplayAuthority(authority)) {
        setRechargeRecovery({ kind: 'uncertain', authority, command });
        setStatus(cause instanceof Error ? cause.message : 'Service-shuttle recharge result could not be confirmed.');
      } else {
        setRechargeRecovery(null);
      }
    } finally {
      setPending(false);
    }
  }

  async function submitBlacksmithRepair(retry = false): Promise<void> {
    if (busy || !docking || control.shuttleId !== 'blacksmith' ||
        !Number.isSafeInteger(session.currentTurn) || !repairSelectionEligible ||
        (retry ? !repairRetryReady : repairRecovery !== null)) return;
    const command = {
      requestId: window.crypto.randomUUID(),
      systemIds: [...repairSystemIds],
      expectedControlRevision: control.revision,
      expectedRepairRevision: blacksmithRepairRevision,
      expectedCycle: session.currentTurn as number,
      expectedHostShipId: docking.shipId,
    };
    let authority: BlacksmithRepairAuthorityBinding;
    try {
      authority = captureBlacksmithRepairAuthority(session as GameSession, me as Player, command);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Refresh the live Blacksmith authority before repairing.');
      return;
    }
    if (retry) setRepairRecovery(null);
    setPending(true);
    setStatus('');
    try {
      const result = await repairConsolesFromBlacksmith(command);
      if (result.status === 'stale') {
        setRepairRecovery({ stale: result, authority });
        setRepairSystemIds([...command.systemIds]);
        setStatus('');
      } else {
        setRepairRecovery(null);
        setStatus(`Repaired ${result.systemIds.length} console${result.systemIds.length === 1 ? '' : 's'} // ${result.materialsRemaining} materials remain.`);
        setRepairSystemIds([]);
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Blacksmith repair failed.');
    } finally {
      setPending(false);
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Shuttle control">
    <p className="console-workspace__eyebrow">Custody // server authorised</p>
    <h3>Shuttle control</h3>
    <p>Current holder // {holder?.displayName ?? (control.holderUid === me.uid ? me.displayName : 'Connected player')}</p>
    {canTransfer && <>
      <label htmlFor={`shuttle-recipient-${control.shuttleId}`}>Hand off to</label>
      <select className="shuttle-control__touch-target" id={`shuttle-recipient-${control.shuttleId}`} value={targetUid}
        disabled={busy} onChange={(event) => setTargetUid(event.target.value)}>
        <option value="">Choose connected player</option>
        {targets.map((player) => <option value={player.uid} key={player.uid}>{player.displayName}</option>)}
      </select>
      <div className="console-workspace__actions">
        <button className="cic-action-button shuttle-control__touch-target" type="button" disabled={busy || !targetUid}
          onClick={() => void submit('handoff')}>Hand off control</button>
        {control.holderUid !== control.ownerUid && <button className="cic-action-button shuttle-control__touch-target" type="button" disabled={busy}
          onClick={() => void submit('reclaim')}>Reclaim control</button>}
      </div>
    </>}
    {canRequestDeparture && <section aria-label="Shuttle departure">
      <p className="console-workspace__eyebrow">Flight plan // server authorised</p>
      <h4>Request departure</h4>
      {transit ? <>
        <p>
          In transit to {findShip(transit.destinationShipId)?.name ?? transit.destinationShipId}.
          {' '}Arrival will be completed when the shuttle reaches the ship.
        </p>
        <label htmlFor={`shuttle-retarget-destination-${control.shuttleId}`}>New destination ship</label>
        <select className="shuttle-control__touch-target" id={`shuttle-retarget-destination-${control.shuttleId}`} value={destinationShipId}
          disabled={busy || !departureWindowOpen}
          onChange={(event) => setDestinationShipId(event.target.value)}>
          <option value="">Keep current course</option>
          {retargetDestinations.map((shipId) => <option value={shipId} key={shipId}>
            {findShip(shipId)?.name ?? shipId}
          </option>)}
        </select>
        <div className="console-workspace__actions">
          <button className="cic-action-button shuttle-control__touch-target" type="button"
            disabled={busy || !departureWindowOpen || !destinationShipId}
            onClick={() => void submitRetarget()}>Retarget shuttle</button>
        </div>
        {!departureWindowOpen && <p>{control.shuttleId === 'snn-press-shuttle'
          ? 'Course changes open when airspace is open or AEGIS grants Press access.'
          : 'Course changes open when airspace is open.'}</p>}
        {arrivalReady && !arrivalComplete && <div className="console-workspace__actions">
          <button className="cic-action-button shuttle-control__touch-target" type="button" disabled={busy}
            onClick={() => void submitArrival()}>
            {arrivalAttempted ? 'Retry arrival' : 'Complete arrival'}
          </button>
        </div>}
      </> : departure ? <>
        <p>
          Departure requested to {findShip(departure.destinationShipId)?.name ?? departure.destinationShipId};
          ready to begin transit.
        </p>
        <div className="console-workspace__actions">
          <button className="cic-action-button shuttle-control__touch-target" type="button" disabled={busy || !departureWindowOpen}
            onClick={() => void submitTransit()}>Begin transit</button>
        </div>
        {!departureWindowOpen && <p>{control.shuttleId === 'snn-press-shuttle'
          ? 'Transit may begin when airspace is open or AEGIS grants Press access.'
          : 'Transit may begin when airspace is open.'}</p>}
      </> : <>
        <label htmlFor={`shuttle-destination-${control.shuttleId}`}>Destination ship</label>
        <select className="shuttle-control__touch-target" id={`shuttle-destination-${control.shuttleId}`} value={destinationShipId}
          disabled={busy || !departureWindowOpen}
          onChange={(event) => setDestinationShipId(event.target.value)}>
          <option value="">Choose local ship</option>
          {destinations.map((shipId) => <option value={shipId} key={shipId}>
            {findShip(shipId)?.name ?? shipId}
          </option>)}
        </select>
        <div className="console-workspace__actions">
          <button className="cic-action-button shuttle-control__touch-target" type="button" disabled={busy || !departureWindowOpen || !destinationShipId}
            onClick={() => void submitDeparture()}>Request departure</button>
        </div>
        {!departureWindowOpen && <p>{control.shuttleId === 'snn-press-shuttle'
          ? 'Departure requests open when airspace is open or AEGIS grants Press access.'
          : 'Departure requests open when airspace is open.'}</p>}
      </>}
    </section>}
    {canRequestDeparture && docking && cargoTypes.length > 0 && <section aria-label="Shuttle cargo transfer">
      <p className="console-workspace__eyebrow">Cargo // docked transfer</p>
      <h4>Transfer cargo</h4>
      <p>Docked at {findShip(docking.shipId)?.name ?? docking.shipId}.</p>
      <label htmlFor={`shuttle-cargo-resource-${control.shuttleId}`}>Resource</label>
      <select className="shuttle-control__touch-target" id={`shuttle-cargo-resource-${control.shuttleId}`} value={cargoResourceId}
        disabled={busy} onChange={(event) => {
          setCargoResourceId(event.target.value as ResourceId);
          setCargoRetry(null);
          setStatus('');
        }}>
        <option value="">Choose permitted cargo</option>
        {cargoTypes.map((resourceId) => <option value={resourceId} key={resourceId}>
          {RESOURCE_DEFINITIONS.find((resource) => resource.id === resourceId)?.label ?? resourceId}
        </option>)}
      </select>
      <label htmlFor={`shuttle-cargo-amount-${control.shuttleId}`}>Amount</label>
      <input className="shuttle-control__touch-target" id={`shuttle-cargo-amount-${control.shuttleId}`} type="number" min="1" step="1"
        value={cargoAmount} disabled={busy}
        onChange={(event) => {
          setCargoAmount(Number(event.target.value));
          setCargoRetry(null);
          setStatus('');
        }} />
      {cargoResourceId && <p>
        Host // {session.shipResources?.[docking.shipId]?.[cargoResourceId] ?? 0}
        {' // '}Shuttle // {session.shuttleCargo?.[control.shuttleId]?.[cargoResourceId] ?? 0}
      </p>}
      <div className="console-workspace__actions">
        <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy || cargoRetryMatchesDraft || !cargoResourceId || !cargoAmountIsValid}
          onClick={() => void submitCargo('load')}>Load shuttle</button>
        <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy || cargoRetryMatchesDraft || !cargoResourceId || !cargoAmountIsValid}
          onClick={() => void submitCargo('unload')}>Unload shuttle</button>
        {cargoRetryMatchesDraft && cargoRetryReady && <button
          className="cic-action-button shuttle-control__touch-target" type="button" disabled={busy}
          onClick={() => void retryCargoTransfer()}>Retry cargo transfer with current revision</button>}
      </div>
      {cargoRetryMatchesDraft && cargoRetryWaiting && <p role="status">
        Shuttle control changed. Waiting for the live shuttle control revision before retrying.
      </p>}
      {cargoRetryMatchesDraft && cargoRetryReady && <p role="status">
        Cargo state changed. Review the selected transfer, then explicitly retry with a fresh request ID.
      </p>}
    </section>}
    {canRequestDeparture && docking && serviceShuttle && <section aria-label="Service shuttle recharge">
      <p className="console-workspace__eyebrow">Service power // docked host</p>
      <h4>Recharge host console</h4>
      <p>Fuelled service shuttles add one charge during Coordination. Production effects resolve immediately.</p>
      {!session.shuttleFuelled?.[control.shuttleId] && <p>Fuel this shuttle during maintenance first.</p>}
      {!rechargeWindowOpen && <p>Service recharge opens during Coordination Phase.</p>}
      {!hostMaintenanceReady && <p>Complete host maintenance for this cycle before recharging.</p>}
      {hostDamage?.destroyed && <p>A destroyed host cannot receive a console charge.</p>}
      {rechargedThisCycle && rechargeEntry && <p>
        Recharged {rechargeEntry.consoleId} on {findShip(rechargeEntry.hostShipId)?.name ?? rechargeEntry.hostShipId} this cycle.
      </p>}
      <label htmlFor={`service-recharge-console-${control.shuttleId}`}>Host console</label>
      <select className="shuttle-control__touch-target" id={`service-recharge-console-${control.shuttleId}`} value={rechargeConsoleId}
        disabled={busy || !session.shuttleFuelled?.[control.shuttleId] ||
          !rechargeWindowOpen || !hostRechargeEligible || rechargedThisCycle || rechargeOptions.length === 0}
        onChange={(event) => {
          setRechargeRecovery(null);
          setRechargeConsoleId(event.target.value);
          setRechargeProductionScrap(false);
          setRechargeProductionOreAmount(1);
        }}>
        <option value="">Choose eligible console</option>
        {rechargeOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
      </select>
      {selectedRechargeOption?.immediate && <p>
        This console’s maintenance effect resolves immediately with the recharge.
      </p>}
      {selectedRechargeOption?.capybaraScrapChoice && rechargeConsoleId === 'scrap-refinery' && <label>
        Scrap Refinery outcome
        <select className="shuttle-control__touch-target" aria-label="Service recharge Scrap Refinery outcome"
          value={rechargeProductionScrap ? 'convert' : 'generate'}
          onChange={(event) => {
            setRechargeRecovery(null);
            setRechargeProductionScrap(event.target.value === 'convert');
          }}>
          <option value="generate">Generate 1 Scrap</option>
          <option value="convert">Spend 1 Scrap for 3 materials</option>
        </select>
      </label>}
      {selectedRechargeOption?.capybaraScrapChoice && rechargeConsoleId !== 'scrap-refinery' && <label className="shuttle-control__check-target">
        <input type="checkbox" aria-label={`Spend 1 Scrap on ${selectedRechargeOption.name}`}
          checked={rechargeProductionScrap}
          disabled={rechargeProductionScrap === false && (hostResources?.scrap ?? 0) < 1}
          onChange={(event) => {
            setRechargeRecovery(null);
            setRechargeProductionScrap(event.target.checked);
          }} />
        Spend 1 Scrap for +6 output
      </label>}
      {selectedRechargeOption?.fuelRefinery && <label>
        Ore to refine
        <input className="shuttle-control__touch-target" type="number" min={1} max={refineryMax} aria-label="Service recharge ore to refine"
          value={rechargeProductionOreAmount}
          onChange={(event) => {
            setRechargeRecovery(null);
            setRechargeProductionOreAmount(Number(event.target.value));
          }} />
        {' '}of {Math.min(hostResources?.ore ?? 0, refineryMax)} available
      </label>}
      <div className="console-workspace__actions">
        <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy || !rechargeConsoleId || !session.shuttleFuelled?.[control.shuttleId] ||
            !rechargeWindowOpen || !hostRechargeEligible || rechargedThisCycle || !hostCycle ||
            invalidRechargeOre || (rechargeProductionScrap && (hostResources?.scrap ?? 0) < 1) ||
            rechargeRecoveryMatchesDraft}
          onClick={() => void submitRecharge()}>Recharge console</button>
        {rechargeRetryReady && <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy} onClick={() => void submitRecharge('stale-retry')}>Retry recharge with current revisions</button>}
        {rechargeExactReplayReady && <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy} onClick={() => void submitRecharge('exact-replay')}>Retry exact recharge request</button>}
      </div>
      {uncertainRechargeRecovery && rechargeRecoveryAuthorityCurrent && <p role="status">
        Recharge result could not be confirmed. Retry the exact request; its request ID prevents a second charge.
      </p>}
      {rechargeRetryWaiting && <p role="status">
        Service recharge state changed. Waiting for the live service recharge state before retrying.
      </p>}
      {rechargeRecoveryCycleChanged && rechargeRecoveryMatchesDraft && rechargeRecoveryAuthorityCurrent && <p role="status">
        The Coordination cycle changed before recovery. The old recharge request cannot carry into this cycle; change the selection before starting a new request.
      </p>}
      {rechargeRetryReady && <p role="status">
        Service recharge state changed. Review the selected console and production choices, then explicitly retry with a fresh request ID.
      </p>}
      {staleRechargeRecovery && rechargeRecoveryMatchesDraft && rechargeRecoveryAuthorityCurrent && rechargeRecoveryProjectionCurrent &&
        !rechargeRetryReady && <p role="status">
          The selected console is no longer eligible for recharge. Choose an eligible console or update its production choice.
        </p>}
    </section>}
    {canRequestDeparture && docking && control.shuttleId === 'blacksmith' && <section aria-label="Blacksmith console repair">
      <p className="console-workspace__eyebrow">Repair rig // docked host</p>
      <h4>Repair damaged consoles</h4>
      <p>Spend 4 materials for each of up to 2 consoles on this ship. A fuelled Blacksmith may repair a second ship in the same cycle.</p>
      <p>Docked host materials // {repairMaterials} // repair slots remaining // {repairSlotsRemaining}</p>
      {!repairWindowOpen && <p>Blacksmith repairs open during Coordination Phase.</p>}
      {!repairShipAvailable && <p>Fuel Blacksmith before repairing a second ship this cycle.</p>}
      {repairOptions.length === 0 && <p>No damaged consoles are eligible on this ship.</p>}
      <fieldset disabled={busy || !repairWindowOpen || !repairShipAvailable || repairSlotsRemaining === 0 || hostDamage?.destroyed}>
        <legend>Damaged consoles</legend>
        {repairOptions.map((systemId) => {
          const checked = repairSystemIds.includes(systemId);
          const atCapacity = repairSystemIds.length >= repairSlotsRemaining;
          const name = findShip(docking.shipId)?.systems?.find((system) => system.id === systemId)?.name ??
            systemId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          return <label className="shuttle-control__check-target" key={systemId}>
            <input type="checkbox" checked={checked} disabled={!checked && atCapacity}
              onChange={(event) => {
                setRepairRecovery(null);
                setStatus('');
                setRepairSystemIds((current) => event.target.checked
                  ? [...current, systemId] : current.filter((id) => id !== systemId));
              }} /> {name}
          </label>;
        })}
      </fieldset>
      <div className="console-workspace__actions">
        <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy || repairRecovery !== null || !repairSelectionEligible}
          onClick={() => void submitBlacksmithRepair()}>Repair selected consoles</button>
        {repairRetryReady && <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy} onClick={() => void submitBlacksmithRepair(true)}>
          Retry repair with current revisions
        </button>}
      </div>
      {repairRetryWaiting && <p role="status">
        Blacksmith repair state changed. Waiting for the current live projection before retrying.
      </p>}
      {repairRecovery && repairRecoveryAuthorityCurrent && repairRecoveryProjectionCurrent &&
        !repairSelectionEligible && <p role="status">
        The selected consoles are no longer eligible. Review the current damaged consoles and choose again.
      </p>}
    </section>}
    {canRequestDeparture && docking && cargoTypes.length > 0 && <section aria-label="Survivor evacuation">
      <p className="console-workspace__eyebrow">Evacuation // server authorised</p>
      <h4>Move survivors</h4>
      <p>
        {evacuationRemaining.toLocaleString()} of 5,000 survivors remain available for this shuttle this cycle.
      </p>
      {!evacuationWindowOpen && <p>Survivor transfers open during Coordination Phase.</p>}
      {sourcePopulationAlertPending && <p>Resolve this ship&apos;s survivor alert before another transfer.</p>}
      <label htmlFor={`shuttle-evacuation-destination-${control.shuttleId}`}>Receiving ship</label>
      <select className="shuttle-control__touch-target" id={`shuttle-evacuation-destination-${control.shuttleId}`}
        value={evacuationDestinationShipId}
        disabled={busy || !evacuationAvailable || evacuationRemaining === 0}
        onChange={(event) => {
          setEvacuationDestinationShipId(event.target.value);
          setEvacuationAmount(0);
        }}>
        <option value="">Choose fleet ship</option>
        {evacuationDestinations.map((shipId) => <option value={shipId} key={shipId}>
          {findShip(shipId)?.name ?? shipId}
        </option>)}
      </select>
      <label htmlFor={`shuttle-evacuation-amount-${control.shuttleId}`}>Survivors</label>
      <select className="shuttle-control__touch-target" id={`shuttle-evacuation-amount-${control.shuttleId}`}
        value={evacuationAmount || ''}
        disabled={busy || !evacuationAvailable || evacuationAmounts.length === 0}
        onChange={(event) => setEvacuationAmount(Number(event.target.value))}>
        <option value="">Choose a printed-track transfer</option>
        {evacuationAmounts.map((amount) => <option value={amount} key={amount}>
          {amount.toLocaleString()}
        </option>)}
      </select>
      {evacuationDestinationShipId && evacuationAmounts.length === 0 && <p>
        No valid printed-track transfer fits both ships and the remaining cycle limit.
      </p>}
      <div className="console-workspace__actions">
        <button className="cic-action-button shuttle-control__touch-target" type="button"
          disabled={busy || !evacuationAvailable ||
            !evacuationDestinations.includes(evacuationDestinationShipId) ||
            !evacuationAmounts.includes(evacuationAmount)}
          onClick={() => void submitEvacuation()}>Move survivors</button>
      </div>
    </section>}
    {arrivalStatusMessage && <p role="status">{arrivalStatusMessage}</p>}
    {status && <p role="status">{status}</p>}
  </section>;
}
