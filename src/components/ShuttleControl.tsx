import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeConnectedPlayers, subscribeShuttleDeparture } from '@/lib/firestore';
import { transferShuttleControl } from '@/lib/shuttleControlService';
import {
  beginShuttleTransit,
  completeShuttleArrival,
  requestShuttleDeparture,
} from '@/lib/shuttleDepartureService';
import { transferShuttleCargo } from '@/lib/shuttleCargoService';
import { rechargeHostConsoleFromShuttle } from '@/lib/serviceShuttleRechargeService';
import {
  evacuateShuttleSurvivors,
  MAX_SHUTTLE_EVACUATION_PER_CYCLE,
  validShuttleEvacuationAmounts,
} from '@/lib/shuttleEvacuationService';
import { useSessionStore } from '@/store/useSessionStore';
import type { Player, ShuttleControlEntry, ShuttleMovementState } from '@/types/game';
import { findShip } from '@/data/ships';
import { dockingForShuttle, SHUTTLECRAFT, shuttleDestinationIsAllowed } from '@/data/shuttles';
import { RESOURCE_DEFINITIONS, type ResourceId } from '@/data/resources';
import { SERVICE_SHUTTLE_IDS, serviceRechargeConsoleOptions } from '@/data/serviceShuttleRecharge';
import { repairConsolesFromBlacksmith } from '@/lib/blacksmithRepairService';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';

interface Props {
  readonly control: ShuttleControlEntry;
}

interface ArrivalAttempt {
  readonly key: string;
  readonly checkpoint: SessionAuthorityCheckpoint;
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
  const [cargoResourceId, setCargoResourceId] = useState<ResourceId | ''>('');
  const [cargoAmount, setCargoAmount] = useState(1);
  const [rechargeConsoleId, setRechargeConsoleId] = useState('');
  const [rechargeProductionScrap, setRechargeProductionScrap] = useState(false);
  const [rechargeProductionOreAmount, setRechargeProductionOreAmount] = useState(1);
  const [evacuationDestinationShipId, setEvacuationDestinationShipId] = useState('');
  const [evacuationAmount, setEvacuationAmount] = useState(0);
  const [repairSystemIds, setRepairSystemIds] = useState<string[]>([]);
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
    session.turnPhase?.airspace.state === 'lifted';
  const destinations = (session.activeVesselIds ?? [])
    .filter((shipId) => shipId !== docking?.shipId && findShip(shipId) !== undefined &&
      shuttleDestinationIsAllowed(control.shuttleId, shipId));
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
  const departureWindowOpen = session.phase === 'active' &&
    (session.turnPhase?.airspace.state === 'lifted' || pressMovementException) &&
    !session.turnPhase?.timerPause &&
    Date.now() < Date.parse(session.turnPhase?.openAirspaceEndsAt ?? '');
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
    ? repairHostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const repairHostAlreadyUsed = Boolean(docking &&
    repairHostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = repairHostAlreadyUsed || repairHostsThisCycle.length === 0 ||
    (repairHostsThisCycle.length < 2 && session.shuttleFuelled?.blacksmith === true);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const repairOptions = docking && control.shuttleId === 'blacksmith'
    ? (hostDamage?.damagedSystemIds ?? []).filter((id) => !repairedOnHost.includes(id)) : [];
  const repairMaterials = docking ? session.shipResources?.[docking.shipId]?.materials ?? 0 : 0;
  const repairDeadline = session.turnPhase?.openAirspaceEndsAt
    ? Date.parse(session.turnPhase.openAirspaceEndsAt) : Number.NaN;
  const repairWindowOpen = session.phase === 'active' &&
    session.turnPhase?.turn === session.currentTurn && session.turnPhase?.airspace.state === 'lifted' &&
    session.turnPhase.timerPause === undefined && Number.isFinite(repairDeadline) &&
    Date.now() < repairDeadline;

  useEffect(() => setRepairSystemIds([]), [
    blacksmithRepairRevision, control.revision, control.shuttleId, docking?.shipId, session.currentTurn,
  ]);

  useEffect(() => subscribeConnectedPlayers(session.id, setPlayers), [session.id, me.fleetGroupId]);
  useEffect(() => subscribeShuttleDeparture(
    session.id,
    control.shuttleId,
    setDeparture,
  ), [control.shuttleId, me.fleetGroupId, session.id]);
  const isCurrentArrivalAttempt = useCallback((attempt: ArrivalAttempt): boolean => {
    return arrivalAttemptRef.current === attempt &&
      currentArrivalKeyRef.current === attempt.key &&
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

  async function submitCargo(direction: 'load' | 'unload'): Promise<void> {
    if (busy || !docking || !cargoResourceId || !Number.isSafeInteger(cargoAmount) || cargoAmount < 1) return;
    setPending(true);
    setStatus('');
    try {
      await transferShuttleCargo(
        control.shuttleId,
        cargoResourceId,
        direction,
        cargoAmount,
        control.revision,
      );
      setStatus(`${direction === 'load' ? 'Loaded' : 'Unloaded'} ${cargoAmount} ${RESOURCE_DEFINITIONS.find((resource) => resource.id === cargoResourceId)?.label ?? cargoResourceId}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle cargo transfer failed.');
    } finally {
      setPending(false);
    }
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

  async function submitRecharge(): Promise<void> {
    if (busy || !docking || !rechargeConsoleId || !hostCycle || !session.currentTurn) return;
    setPending(true);
    setStatus('');
    try {
      const result = await rechargeHostConsoleFromShuttle(
        control.shuttleId, rechargeConsoleId, control.revision,
        hostCycle.revision, session.currentTurn,
        selectedRechargeOption?.capybaraScrapChoice ? rechargeProductionScrap : undefined,
        selectedRechargeOption?.fuelRefinery ? rechargeProductionOreAmount : undefined,
      );
      setStatus(result.message);
      setRechargeConsoleId('');
      setRechargeProductionScrap(false);
      setRechargeProductionOreAmount(1);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Service-shuttle recharge failed.');
    } finally {
      setPending(false);
    }
  }

  async function submitBlacksmithRepair(): Promise<void> {
    if (busy || !docking || control.shuttleId !== 'blacksmith' || !session.currentTurn ||
        repairSystemIds.length < 1 || repairSystemIds.length > repairSlotsRemaining) return;
    setPending(true);
    setStatus('');
    try {
      const result = await repairConsolesFromBlacksmith(
        repairSystemIds, control.revision, blacksmithRepairRevision, session.currentTurn,
        docking.shipId,
      );
      setStatus(`Repaired ${repairSystemIds.length} console${repairSystemIds.length === 1 ? '' : 's'} // ${result.materialsRemaining} materials remain.`);
      setRepairSystemIds([]);
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
      <select id={`shuttle-recipient-${control.shuttleId}`} value={targetUid}
        disabled={busy} onChange={(event) => setTargetUid(event.target.value)}>
        <option value="">Choose connected player</option>
        {targets.map((player) => <option value={player.uid} key={player.uid}>{player.displayName}</option>)}
      </select>
      <div className="console-workspace__actions">
        <button className="cic-action-button" type="button" disabled={busy || !targetUid}
          onClick={() => void submit('handoff')}>Hand off control</button>
        {control.holderUid !== control.ownerUid && <button className="cic-action-button" type="button" disabled={busy}
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
        {arrivalReady && !arrivalComplete && <div className="console-workspace__actions">
          <button className="cic-action-button" type="button" disabled={busy}
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
          <button className="cic-action-button" type="button" disabled={busy || !departureWindowOpen}
            onClick={() => void submitTransit()}>Begin transit</button>
        </div>
        {!departureWindowOpen && <p>{control.shuttleId === 'snn-press-shuttle'
          ? 'Transit may begin when airspace is open or AEGIS grants Press access.'
          : 'Transit may begin when airspace is open.'}</p>}
      </> : <>
        <label htmlFor={`shuttle-destination-${control.shuttleId}`}>Destination ship</label>
        <select id={`shuttle-destination-${control.shuttleId}`} value={destinationShipId}
          disabled={busy || !departureWindowOpen}
          onChange={(event) => setDestinationShipId(event.target.value)}>
          <option value="">Choose local ship</option>
          {destinations.map((shipId) => <option value={shipId} key={shipId}>
            {findShip(shipId)?.name ?? shipId}
          </option>)}
        </select>
        <div className="console-workspace__actions">
          <button className="cic-action-button" type="button" disabled={busy || !departureWindowOpen || !destinationShipId}
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
      <select id={`shuttle-cargo-resource-${control.shuttleId}`} value={cargoResourceId}
        disabled={busy} onChange={(event) => setCargoResourceId(event.target.value as ResourceId)}>
        <option value="">Choose permitted cargo</option>
        {cargoTypes.map((resourceId) => <option value={resourceId} key={resourceId}>
          {RESOURCE_DEFINITIONS.find((resource) => resource.id === resourceId)?.label ?? resourceId}
        </option>)}
      </select>
      <label htmlFor={`shuttle-cargo-amount-${control.shuttleId}`}>Amount</label>
      <input id={`shuttle-cargo-amount-${control.shuttleId}`} type="number" min="1" step="1"
        value={cargoAmount} disabled={busy}
        onChange={(event) => setCargoAmount(Number(event.target.value))} />
      {cargoResourceId && <p>
        Host // {session.shipResources?.[docking.shipId]?.[cargoResourceId] ?? 0}
        {' // '}Shuttle // {session.shuttleCargo?.[control.shuttleId]?.[cargoResourceId] ?? 0}
      </p>}
      <div className="console-workspace__actions">
        <button className="cic-action-button" type="button" disabled={busy || !cargoResourceId || !cargoAmountIsValid}
          onClick={() => void submitCargo('load')}>Load shuttle</button>
        <button className="cic-action-button" type="button" disabled={busy || !cargoResourceId || !cargoAmountIsValid}
          onClick={() => void submitCargo('unload')}>Unload shuttle</button>
      </div>
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
      <select id={`service-recharge-console-${control.shuttleId}`} value={rechargeConsoleId}
        disabled={busy || !session.shuttleFuelled?.[control.shuttleId] ||
          !rechargeWindowOpen || !hostRechargeEligible || rechargedThisCycle || rechargeOptions.length === 0}
        onChange={(event) => {
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
        <select aria-label="Service recharge Scrap Refinery outcome"
          value={rechargeProductionScrap ? 'convert' : 'generate'}
          onChange={(event) => setRechargeProductionScrap(event.target.value === 'convert')}>
          <option value="generate">Generate 1 Scrap</option>
          <option value="convert">Spend 1 Scrap for 3 materials</option>
        </select>
      </label>}
      {selectedRechargeOption?.capybaraScrapChoice && rechargeConsoleId !== 'scrap-refinery' && <label>
        <input type="checkbox" aria-label={`Spend 1 Scrap on ${selectedRechargeOption.name}`}
          checked={rechargeProductionScrap}
          disabled={rechargeProductionScrap === false && (hostResources?.scrap ?? 0) < 1}
          onChange={(event) => setRechargeProductionScrap(event.target.checked)} />
        Spend 1 Scrap for +6 output
      </label>}
      {selectedRechargeOption?.fuelRefinery && <label>
        Ore to refine
        <input type="number" min={1} max={refineryMax} aria-label="Service recharge ore to refine"
          value={rechargeProductionOreAmount}
          onChange={(event) => setRechargeProductionOreAmount(Number(event.target.value))} />
        {' '}of {Math.min(hostResources?.ore ?? 0, refineryMax)} available
      </label>}
      <div className="console-workspace__actions">
        <button className="cic-action-button" type="button"
          disabled={busy || !rechargeConsoleId || !session.shuttleFuelled?.[control.shuttleId] ||
            !rechargeWindowOpen || !hostRechargeEligible || rechargedThisCycle || !hostCycle ||
            invalidRechargeOre || (rechargeProductionScrap && (hostResources?.scrap ?? 0) < 1)}
          onClick={() => void submitRecharge()}>Recharge console</button>
      </div>
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
          return <label key={systemId}>
            <input type="checkbox" checked={checked} disabled={!checked && atCapacity}
              onChange={(event) => setRepairSystemIds((current) => event.target.checked
                ? [...current, systemId] : current.filter((id) => id !== systemId))} /> {name}
          </label>;
        })}
      </fieldset>
      <div className="console-workspace__actions">
        <button className="cic-action-button" type="button"
          disabled={busy || !repairWindowOpen || !repairShipAvailable || repairSystemIds.length < 1 ||
            repairSystemIds.length > repairSlotsRemaining || repairMaterials < repairSystemIds.length * 4 ||
            hostDamage?.destroyed}
          onClick={() => void submitBlacksmithRepair()}>Repair selected consoles</button>
      </div>
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
      <select id={`shuttle-evacuation-destination-${control.shuttleId}`}
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
      <select id={`shuttle-evacuation-amount-${control.shuttleId}`}
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
        <button className="cic-action-button" type="button"
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
