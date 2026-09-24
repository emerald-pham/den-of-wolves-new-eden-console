import { useEffect, useRef, useState } from 'react';
import { SHIPS } from '@/data/ships';
import { BASE_CAPYBARA_CARGO_TYPES, parseBaseCapybaraCargoState } from '@/lib/baseCapybaraCargoLedger';
import {
  transferBaseCapybaraCargo,
  type BaseCapybaraCargoTransferCommand,
} from '@/lib/baseCapybaraCargoService';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';

const LABELS: Readonly<Record<(typeof BASE_CAPYBARA_CARGO_TYPES)[number], string>> = {
  securityTeams: 'Security Teams',
  ore: 'Ore',
  fuel: 'Fuel',
  food: 'Food',
  water: 'Water',
  materials: 'Materials',
};

function captainAuthorityIdentity(session: GameSession | null | undefined, me: Player | null | undefined): string {
  return JSON.stringify([
    session?.id, me?.uid, me?.role, me?.replacementRoleId, me?.activeConsoleRoleId, me?.seatId,
  ]);
}

function isBaseCapybaraCaptain(me: Player | null | undefined): boolean {
  return me?.role === 'player' && me.replacementRoleId === 'capybara-small-captain' &&
    me.activeConsoleRoleId === null && me.seatId === null;
}

function isCurrentCaptainAuthority(
  checkpoint: SessionAuthorityCheckpoint | undefined,
  expectedIdentity: string,
): boolean {
  const current = useSessionStore.getState();
  return isCurrentSessionAuthority(checkpoint) &&
    captainAuthorityIdentity(current.session, current.me) === expectedIdentity &&
    isBaseCapybaraCaptain(current.me);
}

export default function BaseCapybaraCargoTransferPanel() {
  const session = useSessionStore((state) => state.session) as GameSession | null;
  const me = useSessionStore((state) => state.me);
  const [resourceId, setResourceId] = useState<(typeof BASE_CAPYBARA_CARGO_TYPES)[number]>('food');
  const [direction, setDirection] = useState<'load' | 'unload'>('load');
  const [amountText, setAmountText] = useState('1');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ checkpoint: SessionAuthorityCheckpoint; message: string } | null>(null);
  const [error, setError] = useState<{ checkpoint: SessionAuthorityCheckpoint; message: string } | null>(null);
  const [retry, setRetry] = useState<{
    command: BaseCapybaraCargoTransferCommand;
    checkpoint: SessionAuthorityCheckpoint;
    authorityIdentity: string;
  } | null>(null);
  const pendingRef = useRef<{
    checkpoint: SessionAuthorityCheckpoint;
    authorityIdentity: string;
  } | null>(null);
  const identity = captainAuthorityIdentity(session, me);

  const currentCycle = session?.currentTurn ?? 0;
  const isBaseMode = session?.expansion === 'base' && session.capybaraEnabled === true;
  const cargo = session?.baseCapybaraCargo === undefined
    ? null : parseBaseCapybaraCargoState(session.baseCapybaraCargo);
  const ship = session?.smallShipStates?.['capybara-small'];
  const hostShipId = ship?.hostShipId ?? null;
  const hostName = hostShipId ? SHIPS.find((entry) => entry.id === hostShipId)?.name ?? hostShipId : null;
  const coreRosterValid = Boolean(session?.activeVesselIds?.length &&
    session.activeVesselIds.every((id) => SHIPS.some((entry) => entry.id === id)) &&
    !session.activeVesselIds.includes('capybara-small') && !session.activeVesselIds.includes('capybara'));
  const hostIsActive = Boolean(coreRosterValid && ship && ship.dockingRevision >= 1 &&
    hostShipId && session?.activeVesselIds?.includes(hostShipId));
  const hostDamage = hostShipId ? session?.shipDamage?.[hostShipId] : undefined;
  const hostCanTransfer = hostDamage?.destroyed === false;
  const hostInventory = hostIsActive && hostShipId ? session?.shipResources?.[hostShipId] : undefined;
  const resourceAvailable = direction === 'load'
    ? hostInventory?.[resourceId]
    : cargo?.inventory[resourceId];
  const amount = amountText.trim() === '' ? Number.NaN : Number(amountText);
  const phase = phaseForSession(session);
  const coordinationOpen = session?.phase === 'active' && currentCycle >= 1 &&
    phase?.airspace.state === 'lifted' && phase.timerPause === undefined &&
    Date.now() < Date.parse(phase.openAirspaceEndsAt);
  const isCaptain = isBaseCapybaraCaptain(me);
  const canSubmit = isCaptain && isBaseMode && cargo !== null && hostIsActive && hostCanTransfer && coordinationOpen &&
    Number.isSafeInteger(amount) && amount >= 1 &&
    Number.isSafeInteger(resourceAvailable) && (resourceAvailable as number) >= amount;
  const statusMessage = status !== null && status.checkpoint.sessionId === session?.id && status.checkpoint.uid === me?.uid
    ? status.message : '';
  const errorMessage = error !== null && error.checkpoint.sessionId === session?.id && error.checkpoint.uid === me?.uid
    ? error.message : '';
  const retryCommand = retry && isCurrentCaptainAuthority(retry.checkpoint, retry.authorityIdentity)
    ? retry.command : null;
  const pendingForCurrentAuthority = pending && pendingRef.current !== null &&
    isCurrentCaptainAuthority(pendingRef.current.checkpoint, pendingRef.current.authorityIdentity);

  useEffect(() => {
    setResourceId('food');
    setDirection('load');
    setAmountText('1');
    setRetry(null);
    setError(null);
    setStatus(null);
  }, [hostShipId, currentCycle, ship?.dockingRevision, identity]);

  useEffect(() => {
    pendingRef.current = null;
    setPending(false);
    setRetry(null);
    setError(null);
    setStatus(null);
  }, [identity]);

  function clearAttempt(): void {
    setRetry(null);
    setError(null);
    setStatus(null);
  }

  async function submit(): Promise<void> {
    const current = useSessionStore.getState();
    const currentIdentity = captainAuthorityIdentity(current.session, current.me);
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    if (!checkpoint || !isCurrentCaptainAuthority(checkpoint, currentIdentity)) return;
    if (pendingRef.current &&
        isCurrentCaptainAuthority(pendingRef.current.checkpoint, pendingRef.current.authorityIdentity)) return;
    const activeRetry = retry &&
      isCurrentCaptainAuthority(retry.checkpoint, retry.authorityIdentity) ? retry : null;
    const command: BaseCapybaraCargoTransferCommand = activeRetry?.command ?? {
      requestId: window.crypto.randomUUID(),
      expectedCycle: currentCycle,
      expectedRevision: cargo?.revision ?? -1,
      expectedDockingRevision: ship?.dockingRevision ?? -1,
      expectedHostShipId: hostShipId ?? '',
      resourceId,
      direction,
      amount,
    };
    if (!activeRetry && !canSubmit) return;

    pendingRef.current = { checkpoint, authorityIdentity: currentIdentity };
    setPending(true);
    setRetry({ command, checkpoint, authorityIdentity: currentIdentity });
    setError(null);
    setStatus(null);
    try {
      const result = await transferBaseCapybaraCargo(command);
      if (!isCurrentCaptainAuthority(checkpoint, currentIdentity)) return;
      const resourceName = LABELS[result.resourceId];
      setStatus({
        checkpoint,
        message: result.status === 'replayed'
          ? 'This cargo request was already recorded.'
          : result.direction === 'load'
            ? `${result.amount} ${resourceName} loaded onto Capybara from ${hostName ?? result.hostShipId}.`
            : `${result.amount} ${resourceName} unloaded from Capybara to ${hostName ?? result.hostShipId}.`,
      });
      setRetry(null);
      setAmountText('1');
    } catch (cause) {
      if (!isCurrentCaptainAuthority(checkpoint, currentIdentity)) return;
      setError({
        checkpoint,
        message: cause instanceof Error ? cause.message : 'Capybara Cargo Transfer failed.',
      });
    } finally {
      if (isCurrentCaptainAuthority(checkpoint, currentIdentity) &&
          pendingRef.current?.checkpoint === checkpoint &&
          pendingRef.current.authorityIdentity === currentIdentity) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  if (!session) return null;
  return (
    <section className="role-brief__rules base-capybara-cargo" aria-labelledby="base-capybara-cargo-title">
      <p className="eyebrow">Current host // {hostName ?? 'unavailable'}</p>
      <h3 id="base-capybara-cargo-title">Cargo Transfer</h3>
      <p>During Coordination, move a positive whole amount of security teams, ore, fuel, food, water, or materials between base Capybara and its current docked host.</p>
      <p role="status">
        Docked host // {hostName ?? (hostShipId ? 'Host unavailable' : 'Awaiting facilitator docking')} // cargo revision // {cargo?.revision ?? 'unavailable'}
      </p>
      {!isCaptain && <p>The current base Capybara Captain replacement role controls this transfer.</p>}
      {!isBaseMode && <p>Base Capybara Cargo Transfer is unavailable in the current vessel mode.</p>}
      {!hostIsActive && <p>Capybara must be admitted and docked with a current active core host before transferring cargo.</p>}
      {hostIsActive && !hostCanTransfer &&
        <p>Cargo Transfer is unavailable because the current host damage status is unknown or the host is destroyed.</p>}
      {!coordinationOpen && <p>Cargo Transfer is available during the current Coordination cycle.</p>}
      {cargo === null && <p>Cargo inventory is unavailable. Refresh the live session after facilitator docking.</p>}
      {cargo && (
        <dl className="base-capybara-cargo__inventory" aria-label="Cargo inventory">
          {BASE_CAPYBARA_CARGO_TYPES.map((id) => (
            <div key={id}>
              <dt>Capybara {LABELS[id]}</dt>
              <dd>{cargo.inventory[id]}</dd>
            </div>
          ))}
        </dl>
      )}
      <fieldset className="maintenance-controls" disabled={!isCaptain || !isBaseMode || !hostIsActive ||
        !hostCanTransfer ||
        cargo === null || !coordinationOpen || pendingForCurrentAuthority}>
        <legend>Choose a cargo transfer</legend>
        <label htmlFor="base-capybara-cargo-resource">Resource</label>
        <select id="base-capybara-cargo-resource" value={resourceId} onChange={(event) => {
          setResourceId(event.target.value as typeof resourceId);
          clearAttempt();
        }}>
          {BASE_CAPYBARA_CARGO_TYPES.map((id) => <option key={id} value={id}>{LABELS[id]}</option>)}
        </select>
        <label htmlFor="base-capybara-cargo-direction">Direction</label>
        <select id="base-capybara-cargo-direction" value={direction} onChange={(event) => {
          setDirection(event.target.value as typeof direction);
          clearAttempt();
        }}>
          <option value="load">Load from host</option>
          <option value="unload">Unload to host</option>
        </select>
        <label htmlFor="base-capybara-cargo-amount">Positive whole amount</label>
        <input id="base-capybara-cargo-amount" type="number" min="1" step="1" inputMode="numeric"
          value={amountText} onChange={(event) => {
            setAmountText(event.target.value);
            clearAttempt();
          }} />
        <p role="status">
          Available at source // {resourceAvailable ?? 0} {LABELS[resourceId]}
        </p>
      </fieldset>
      <div className="maintenance-controls__confirmation">
        <button className="cic-action-button" type="button"
          disabled={pendingForCurrentAuthority || (!retryCommand && !canSubmit)}
          onClick={() => void submit()}>
          {pendingForCurrentAuthority ? 'Transferring cargo…' : retryCommand ? 'Retry exact cargo request' : 'Transfer cargo'}
        </button>
      </div>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {retryCommand && !pendingForCurrentAuthority &&
        <p role="status">Retry the last request with its original request id.</p>}
      {statusMessage && <p role="status">{statusMessage}</p>}
    </section>
  );
}
