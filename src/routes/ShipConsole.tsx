import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ShipSpecifications from '@/components/ShipSpecifications';
import PopulationTrack from '@/components/PopulationTrack';
import FleetConsoleWorkspace from '@/components/FleetConsoleWorkspace';
import FleetAlertControl from '@/components/FleetAlertControl';
import PursuitTracker from '@/components/PursuitTracker';
import OverflowTicker from '@/components/OverflowTicker';
import ResourceIcon from '@/components/ResourceIcon';
import RoleAssignment from '@/components/RoleAssignment';
import { findShip, SHIP_ORIGIN_LABELS } from '@/data/ships';
import { RESOURCE_DEFINITIONS } from '@/data/resources';
import { activeFleetShipIds, findConsoleRole } from '@/data/roles';
import { DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import { shuttlebayForShip } from '@/data/shuttles';
import {
  popShipConfetti,
  selectConsoleRole,
  setGmShipConsoleWriteGrant,
  setShipConsoleLock,
  type GmShipConsoleWriteGrantAuthority,
} from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import { JUMP_FLASH_MS } from '@/lib/jumpDrive';
import { projectShipState } from '@/lib/shipStateProjection';
import type { Player, DamageDraw } from '@/types/game';
import DioneVipCards from '@/components/DioneVipCards';
import CommissarPurgePanel from '@/components/CommissarPurgePanel';
import { useDialogFocus } from '@/hooks/useDialogFocus';

type ConfettiStyle = CSSProperties & Record<`--${string}`, string | number>;
const CONFETTI_PIECES = Array.from({ length: 48 }, (_, index) => ({
  index,
  style: {
    '--confetti-x': `${((index * 47) % 101) - 50}vw`,
    '--confetti-y': `${-35 - ((index * 29) % 55)}vh`,
    '--confetti-turn': `${180 + ((index * 83) % 720)}deg`,
    '--confetti-delay': `${(index % 8) * 24}ms`,
    '--confetti-hue': (index * 67) % 360,
  } as ConfettiStyle,
}));

export default function ShipConsole({ observer = false }: { observer?: boolean }) {
  const { shipId, roleId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const fleetGroupId = useSessionStore((state) => state.me?.fleetGroupId);
  const playerRole = useSessionStore((state) => state.me?.role);
  const gmInstanceId = useSessionStore((state) => state.gmInstance?.id);
  const gmInstanceClaimedAt = useSessionStore((state) => state.gmInstance?.claimedAt);
  const mode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);
  const pendingCommands = useSessionStore((state) => state.pendingCommands);
  const seats = useSessionStore((state) => state.seats);
  const ship = findShip(shipId);
  const shipState = ship && session ? projectShipState(session, ship.id) : undefined;
  const [crew, setCrew] = useState<readonly Player[] | null>(null);
  const ownShip = findConsoleRole(me?.activeConsoleRoleId ?? undefined)?.shipId;
  const replacementVipHost = Boolean(
    !isGm && me?.replacementRoleId === 'vip-host' && me?.activeConsoleRoleId === null &&
    ship?.id === 'dione' && roleId === 'vip-host',
  );
  const replacementCommissar = Boolean(
    !isGm && me?.replacementRoleId === 'commissar' && me?.activeConsoleRoleId === null &&
    ship?.id === 'icebreaker' && roleId === 'commissar',
  );
  const visiting = Boolean(!isGm && me?.activeConsoleRoleId && me.activeConsoleRoleId !== roleId);
  const [observerRoleId, setObserverRoleId] = useState<string | null>(null);
  const [observerWrite, setObserverWrite] = useState(false);
  const [observerWritePending, setObserverWritePending] = useState(false);
  const [observerWriteConfirm, setObserverWriteConfirm] = useState<GmShipConsoleWriteGrantAuthority | null>(null);
  const observerWriteDialogRef = useRef<HTMLElement | null>(null);
  const observerWriteConfirmRef = useRef<HTMLButtonElement | null>(null);
  const observerWriteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const observerWriteCommandRef = useRef<Promise<void>>(Promise.resolve());
  const grantedShipId = useSessionStore((state) => state.gmInstance?.shipConsoleWriteGrant?.shipId);
  const viewedRoleId = observer ? (ship?.roles.some(role => role.id === observerRoleId) ? observerRoleId! : ship?.roles[0]?.id) : roleId;
  const consoleRole = findConsoleRole(viewedRoleId);
  // The base ship route is also a valid return path after a player has
  // claimed a station. Keep the Admiral instrument discoverable there while
  // retaining the explicit role segment as the stronger route selection.
  const effectiveRoleId = consoleRole?.id ?? (!observer && roleId === undefined
    ? me?.activeConsoleRoleId
    : undefined);
  const hasConfirmedRole = !observer && (
    me?.activeConsoleRoleId === consoleRole?.id || replacementVipHost || replacementCommissar
  );
  const activeRoleIds = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const activeShipIds = activeFleetShipIds(activeRoleIds, session?.activeVesselIds);
  const configuredShipRoles = ship?.roles.filter(role => activeRoleIds.includes(role.id)) ?? [];
  const roleEnabled = !roleId || activeRoleIds.includes(roleId) || replacementVipHost || replacementCommissar;
  const canCoverShortStaffedShip = Boolean(
    !observer && visiting && crew && ship && ownShip === ship.id &&
    configuredShipRoles.length > 0 && !configuredShipRoles.every(role => crew.some(player =>
      ['player', 'gm'].includes(player.role) && player.activeConsoleRoleId === role.id)),
  );
  const writable = observer ? observerWrite : roleEnabled && (hasConfirmedRole || canCoverShortStaffedShip);
  const consoleLocked = shipState?.consoleLocked ?? false;
  const gameplayFrozen = ['success', 'failure', 'debrief', 'closed'].includes(session?.phase ?? '');
  const effectiveWritable = writable && !consoleLocked && !gameplayFrozen;
  const validRole = !roleId || consoleRole?.shipId === ship?.id || replacementVipHost || replacementCommissar;
  const [coverOpen, setCoverOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [hideResources, setHideResources] = useState(false);
  const [hideCensus, setHideCensus] = useState(false);
  const [lockPending, setLockPending] = useState(false);
  const [burst, setBurst] = useState(0);
  const [burstSource, setBurstSource] = useState<string | null>(null);
  const [confettiActor, setConfettiActor] = useState<{
    roleName: string;
    name: string;
  } | null>(null);
  const [awaitingSecondOfficer, setAwaitingSecondOfficer] = useState(false);
  const consoleEntryAttemptRef = useRef<string | null>(null);
  const [damageDraws, setDamageDraws] = useState<readonly DamageDraw[]>([]);
  const jumpTransition = shipState?.jumpTransition;
  const [jumpFlashId, setJumpFlashId] = useState<string | null>(null);
  const spent = Boolean(ship && session?.confettiUsedShipIds?.includes(ship.id));
  const queued = Boolean(ship && session && pendingCommands.some(
    (command) => command.kind === 'popShipConfetti' &&
      command.payload.sessionId === session.id && command.payload.shipId === ship.id,
  ));
  const shuttlebay = ship && session ? shuttlebayForShip(session, ship.id) : null;
  const resources = shipState?.resources;
  const population = shipState?.population;
  const unrest = shipState?.unrest ?? 0;
  const hasConsoleWorkspace = Boolean(ship && consoleRole && ship.roles.some(role => role.id === consoleRole.id));
  const canClaimConsoleRole = Boolean(
    session && me && mode === 'console' && ship && consoleRole && validRole && roleEnabled &&
    activeShipIds.includes(ship.id) &&
    !(ship.id === 'capybara' && session.capybaraEnabled === false) &&
    !(ship.id === 'dione' && session.dioneEnabled === false),
  );

  const captureObserverWriteAuthority = useCallback((targetShipId = ship?.id): GmShipConsoleWriteGrantAuthority | null => {
    const current = useSessionStore.getState();
    if (
      !targetShipId ||
      !current.session?.id ||
      !current.me?.uid ||
      !current.gmInstance?.id ||
      current.gmInstance.claimedAt === undefined
    ) return null;
    return {
      sessionId: current.session.id,
      uid: current.me.uid,
      instanceId: current.gmInstance.id,
      claimedAt: current.gmInstance.claimedAt,
      shipId: targetShipId,
    };
  }, [ship?.id]);

  function currentObserverWriteAuthorityMatches(authority: GmShipConsoleWriteGrantAuthority): boolean {
    const current = useSessionStore.getState();
    return Boolean(
      observer &&
      ship?.id === authority.shipId &&
      current.session?.id === authority.sessionId &&
      current.me?.uid === authority.uid &&
      current.gmInstance?.id === authority.instanceId &&
      current.gmInstance.claimedAt === authority.claimedAt,
    );
  }

  function queueObserverWriteCommand(action: () => Promise<boolean>): Promise<boolean> {
    const next = observerWriteCommandRef.current.catch(() => undefined).then(action);
    observerWriteCommandRef.current = next.then(() => undefined, () => undefined);
    return next;
  }

  function dismissObserverWriteConfirmation(): void {
    setObserverWriteConfirm(null);
  }

  useEffect(() => {
    if (!consoleRole || !canClaimConsoleRole || observer || visiting) return;
    const entryKey = `${session?.id ?? ''}:${consoleRole.id}`;
    if (consoleEntryAttemptRef.current === entryKey) return;
    const current = useSessionStore.getState();
    const seatRequired = consoleRole.shipId !== 'press';
    if (
      seatRequired && current.session?.setupRevision !== undefined &&
      !current.seats.some((seat) => (seat.roleId ?? seat.id) === consoleRole.id)
    ) return;
    consoleEntryAttemptRef.current = entryKey;
    void Promise.resolve(selectConsoleRole(consoleRole.id)).catch(() => undefined);
  }, [canClaimConsoleRole, consoleRole, observer, session?.id, seats, visiting]);

  useEffect(() => {
    setObserverWrite(observer && grantedShipId === ship?.id);
    setObserverWritePending(false);
    setObserverWriteConfirm(null);
  }, [ship?.id, observer, grantedShipId]);

  const observerWriteAuthorityIsCurrent = Boolean(
    observerWriteConfirm &&
    observerWriteConfirm.sessionId === session?.id &&
    observerWriteConfirm.uid === me?.uid &&
    observerWriteConfirm.instanceId === gmInstanceId &&
    observerWriteConfirm.claimedAt === gmInstanceClaimedAt &&
    observerWriteConfirm.shipId === ship?.id,
  );

  useEffect(() => {
    if (!observerWriteConfirm || observerWriteAuthorityIsCurrent) return;
    dismissObserverWriteConfirmation();
  }, [
    gmInstanceClaimedAt,
    gmInstanceId,
    me?.uid,
    observerWriteAuthorityIsCurrent,
    observerWriteConfirm,
    session?.id,
    ship?.id,
  ]);

  useDialogFocus({
    open: observerWriteConfirm !== null,
    dialogRef: observerWriteDialogRef,
    restoreRef: observerWriteTriggerRef,
    initialFocusRef: observerWriteConfirmRef,
    onEscape: dismissObserverWriteConfirmation,
    dialogKey: observerWriteConfirm?.instanceId ?? null,
  });

  useEffect(() => {
    const authority = observer ? captureObserverWriteAuthority() : null;
    if (!authority) return;
    return () => {
      void queueObserverWriteCommand(() =>
        setGmShipConsoleWriteGrant(authority.shipId, false, authority),
      ).catch(() => undefined);
    };
  }, [captureObserverWriteAuthority, gmInstanceClaimedAt, gmInstanceId, me?.uid, observer, session?.id, ship?.id]);

  useEffect(() => {
    setHideResources(false);
    setHideCensus(false);
  }, [ship?.id]);

  useEffect(() => {
    setCrew(null);
    setDamageDraws([]);
    if (!session?.id || !ship) return;
    let unsubscribeCrew: (() => void) | undefined;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    let unsubscribeDamage: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeShipConfetti, subscribeConnectedPlayers, subscribeDamageDraws }) => {
      if (!active) return;
      unsubscribeCrew = subscribeConnectedPlayers(session.id, (next) => {
        if (active) setCrew(next);
      }, () => { if (active) setCrew(null); });
      unsubscribeDamage = subscribeDamageDraws(
        session.id,
        setDamageDraws,
        () => useSessionStore.getState().setCommunicationError({
          code: 'gm-damage-log-link',
          message: 'The damage draw log could not be refreshed.',
        }),
      );
      unsubscribe = subscribeShipConfetti(
        session.id,
        ship.id,
        (sourceShipId, actorRoleName, actorName) => {
          setBurstSource(sourceShipId);
          setConfettiActor(sourceShipId === 'snn-press-shuttle' ? null : {
            roleName: actorRoleName ?? 'Unknown role',
            name: actorName ?? 'Unknown operator',
          });
          setBurst((current) => current + 1);
        },
        () => useSessionStore.getState().setCommunicationError({
          code: 'confetti-signal-link',
          message: 'The Emergency Bridge Confetti Dispenser signal link was lost.',
        }),
      );
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribeDamage();
      unsubscribeCrew?.();
    };
  }, [fleetGroupId, gmInstanceId, playerRole, session?.id, ship]);

  useEffect(() => {
    if (burst === 0) return;
    const timer = window.setTimeout(() => setBurst(0), 3_500);
    return () => window.clearTimeout(timer);
  }, [burst]);

  useEffect(() => {
    if (!jumpTransition?.id) return;
    const occurredAt = Date.parse(jumpTransition.occurredAt);
    if (!Number.isFinite(occurredAt)) return;
    const elapsed = Date.now() - occurredAt;
    if (elapsed > JUMP_FLASH_MS + 500) return;
    setJumpFlashId(jumpTransition.id);
    const timer = window.setTimeout(
      () => setJumpFlashId((current) => current === jumpTransition.id ? null : current),
      Math.max(0, JUMP_FLASH_MS - Math.max(0, elapsed)),
    );
    return () => window.clearTimeout(timer);
  }, [jumpTransition?.id, jumpTransition?.occurredAt]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (observer && !isGm) return <Navigate to="/console" replace />;
  if (
    mode !== 'console' || !ship || !validRole ||
    (!roleEnabled && me.activeConsoleRoleId !== roleId && ownShip !== ship.id) ||
    !activeShipIds.includes(ship.id) ||
    (ship.id === 'capybara' && session.capybaraEnabled === false) ||
    (ship.id === 'dione' && session.dioneEnabled === false)
  ) return <Navigate to="/console" replace />;

  const shipCoordinate = shipState?.galacticCoordinate ?? '0000';

  async function activate(): Promise<void> {
    if (!ship || !consoleRole || !effectiveWritable || spent || queued || activating) return;
    setActivating(true);
    try {
      const result = await popShipConfetti(ship.id, consoleRole.id);
      setAwaitingSecondOfficer(result === 'awaiting-officer');
      if (result !== 'awaiting-officer') setCoverOpen(false);
    } catch {
      // The shared interception notice reports races and connectivity failures.
    } finally {
      setActivating(false);
    }
  }

  async function toggleObserverWrite(): Promise<void> {
    if (!ship?.id || !gmInstanceId || observerWritePending) return;
    if (!observerWrite) {
      const authority = captureObserverWriteAuthority();
      if (authority) setObserverWriteConfirm(authority);
      return;
    }
    const authority = captureObserverWriteAuthority();
    if (!authority) return;
    setObserverWritePending(true);
    try {
      const granted = await queueObserverWriteCommand(() =>
        setGmShipConsoleWriteGrant(authority.shipId, false, authority),
      );
      setObserverWrite(granted);
    } catch {
      setObserverWrite(false);
    } finally {
      setObserverWritePending(false);
    }
  }

  async function confirmObserverWrite(): Promise<void> {
    const authority = observerWriteConfirm;
    if (!authority || !ship?.id || !gmInstanceId || observerWritePending ||
        !currentObserverWriteAuthorityMatches(authority)) {
      dismissObserverWriteConfirmation();
      return;
    }
    setObserverWriteConfirm(null);
    setObserverWritePending(true);
    try {
      const granted = await queueObserverWriteCommand(() =>
        setGmShipConsoleWriteGrant(authority.shipId, true, authority),
      );
      setObserverWrite(granted);
    } catch {
      setObserverWrite(false);
    } finally {
      setObserverWritePending(false);
    }
  }

  async function toggleConsoleLock(): Promise<void> {
    if (!ship || !writable || gameplayFrozen || lockPending) return;
    setLockPending(true);
    try {
      await setShipConsoleLock(ship.id, !consoleLocked);
    } catch {
      // The shared communication notice reports a rejected or offline lock.
    } finally {
      setLockPending(false);
    }
  }

  return (
    <ConsoleAccessContext.Provider value={{ writable: effectiveWritable, ...(viewedRoleId ? { roleId: viewedRoleId } : {}) }}>
    <main
      className={`ship-console ship-console--${ship.id}${
        hasConsoleWorkspace
          ? ' ship-console--gameplay'
          : ''
      }`}
      style={{
        '--ship-accent': ship.color,
        '--ship-secondary': ship.secondaryColor ?? 'var(--cic-ink)',
      } as CSSProperties}
      data-observer-mode={observer ? (observerWrite ? 'write' : 'read') : undefined}
      data-unrest-critical={!hideCensus && unrest > 7 ? 'true' : undefined}
      data-jump-flash={jumpFlashId === jumpTransition?.id ? 'true' : undefined}
    >
      <img
        className="ship-console__flag"
        src={ship.flag}
        alt={`${ship.nation} flag`}
        data-shared-flag={ship.id}
        data-shared-flag-layer="background"
        style={{ viewTransitionName: 'shared-ship-flag' }}
      />
      <section className="ship-console__identity" aria-labelledby="ship-name">
        {(
          <Link
            className="ship-console__back cic-text-button"
            to={(roleId || observer) ? `/ships/${ship.id}/roles` : '/console'}
          >
            {!isGm && consoleRole ? 'View ship consoles' : (roleId || observer) ? 'Change role' : 'Leave ship'}
          </Link>
        )}
        <p className="ship-console__nation">
          {SHIP_ORIGIN_LABELS[ship.origin]} // {ship.nation} // {ship.nationShort}
        </p>
        <h1 className="ship-console__name" id="ship-name">{ship.name}</h1>
        <p className="ship-console__type">{ship.vesselType}</p>
        <p className="ship-console__description">{ship.description}</p>
        {gameplayFrozen && (
          <p className="ship-console__status" role="status">
            {session?.gameOutcome?.cause === 'total-fleet-loss'
              ? `All full fleet ships lost in Cycle ${session.gameOutcome.cycle} // Survivors, escape pods, and small craft remain available for endgame evaluation. Gameplay controls are frozen.`
              : 'Final cycle complete // Endgame evaluation in progress. Gameplay controls are frozen.'}
          </p>
        )}
        <ShipSpecifications shipId={ship.id} shipName={ship.name} population={hideCensus ? undefined : population} />
        {!observer && (consoleRole || replacementVipHost || replacementCommissar) && (
          <RoleAssignment value={replacementVipHost
              ? 'VIP Host'
              : replacementCommissar ? 'Commissar' : consoleRole?.name ?? ''} />
        )}
        <section className="ship-console__travel-lock cic-frame" aria-label="ICN console lock">
          <p className="ship-resources__eyebrow">ICN console lock // {consoleLocked ? 'engaged' : 'clear'}</p>
          <p>{consoleLocked ? 'Console actions are locked while travelling.' : 'Lock this console before a ship travels.'}</p>
          <button
            className="cic-action-button"
            type="button"
            disabled={!writable || gameplayFrozen || lockPending}
            onClick={() => void toggleConsoleLock()}
          >
            {consoleLocked ? 'Release ICN console lock' : 'Engage ICN console lock'}
          </button>
        </section>
        {(visiting || (!observer && !roleEnabled)) && (
          <p className="cic-overline ship-console__access">Console access // {writable ? 'Write // crew incomplete' : 'Read only'}</p>
        )}
        {observer && <label className="maintenance-controls">View ship console role
          <select aria-label="View ship console role" value={viewedRoleId ?? ''} onChange={event => setObserverRoleId(event.target.value)}>
            {ship.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>}
        {(
          <>
          <FleetConsoleWorkspace
            ship={ship}
            role={consoleRole}
            galacticCoordinate={shipCoordinate}
            fuel={resources?.fuel ?? 0}
            damage={shipState?.damage}
            damageDraws={damageDraws}
            navigationLogs={shipState?.navigationLogs}
            knownCoordinates={session.playerDiscovery?.knownCoordinates}
            knownSystems={session.playerDiscovery?.knownSystems}
            consoleLocked={consoleLocked}
            shipState={shipState}
          />
          {(replacementCommissar || (me.replacementRoleId == null &&
            me.activeConsoleRoleId === (ship.id === 'aegis' ? 'admiral' : `${ship.id}-captain`))) && (
            <CommissarPurgePanel shipId={ship.id} />
          )}
          </>
        )}
        <DioneVipCards
          shipId={ship.id}
          cycle={ship.id === 'dione' ? shipState?.maintenanceCycle : undefined}
          damaged={ship.id === 'dione' && (shipState?.damage?.damagedSystemIds.includes('vip-lounge') ?? false)}
        />
        {damageDraws.some((draw) => draw.shipId === ship.id) && (
          <section className="ship-damage-cards cic-frame" aria-label={`${ship.name} ship systems`}>
            <p className="ship-resources__eyebrow">Ship systems // damage cards</p>
            <ul>
              {damageDraws.flatMap((draw) =>
                draw.shipId === ship.id ? [(
                  <li key={draw.id}>
                    {draw.type === 'ship-destroyed'
                      ? <span>Ship destroyed // no damage card remained</span>
                      : <>
                        <span>{draw.systemName} // {draw.recycled ? 'damage absorbed // card recycled' : 'damaged'}</span>
                        <strong
                          className="ship-damage-card"
                          aria-label={`${draw.card}, ${draw.systemName} damage card`}
                        >{draw.card}</strong>
                      </>}
                  </li>
                )] : [])}
            </ul>
          </section>
        )}
        <div className="ship-console__counters">
          {resources && (
            <section
              className="ship-resources cic-frame"
              aria-label={`${ship.name} resource stores`}
            >
              <p className="ship-resources__eyebrow">Resource stores</p>
              {hideResources ? <p>Resource stores // hidden from ship view</p> : <ul>
                {RESOURCE_DEFINITIONS.map((resource) => {
                  const amount = resources[resource.id];
                  return amount === undefined ? null : (
                    <li key={resource.id} aria-label={`${resource.label}: ${amount}`}>
                      <span className="resource-label">
                        <ResourceIcon id={resource.id} label={resource.label} />
                        <span>{resource.label}</span>
                      </span>
                      <strong>{amount}</strong>
                    </li>
                  );
                })}
              </ul>}
            </section>
          )}
          <section
            className="ship-census cic-frame"
            aria-label={`${ship.name} census`}
            data-critical={!hideCensus && unrest > 7 ? 'true' : 'false'}
          >
            <p className="ship-resources__eyebrow">Census // tracked conditions</p>
            {hideCensus ? <p>Unrest and population // hidden from ship view</p> : <>
              {population !== undefined && <PopulationTrack shipId={ship.id} population={population} />}
              <div className="ship-census__counter" aria-label={`Civil Unrest: ${unrest}`}>
                <span className="resource-label">
                  <ResourceIcon id="unrest" label="Civil Unrest" />
                  <OverflowTicker text="Civil Unrest" />
                </span>
                {unrest > 7 ? (
                  <div className="ship-unrest__failure">
                    <strong>Unrest telemetry failure</strong>
                    <span>Reading exceeds rated maximum // console functions nominal</span>
                  </div>
                ) : <strong>{unrest} / 7</strong>}
              </div>
            </>}
          </section>
        </div>
        <section className="ship-console__privacy-controls cic-frame" aria-label="Ship view privacy controls">
          <p className="ship-resources__eyebrow">Ship view privacy</p>
          <button className="cic-action-button" type="button" aria-pressed={hideResources}
            onClick={() => setHideResources((current) => !current)}>
            {hideResources ? 'Show resource stores' : 'Hide resource stores'}
          </button>
          <button className="cic-action-button" type="button" aria-pressed={hideCensus}
            onClick={() => setHideCensus((current) => !current)}>
            {hideCensus ? 'Show unrest and population' : 'Hide unrest and population'}
          </button>
        </section>
      </section>
      <aside className="ship-console__instruments" aria-label={`${ship.name} instruments`}>
        <PursuitTracker
          currentTurn={session.currentTurn ?? 1}
          shipId={ship.id}
          shipName={ship.name}
          shipCoordinate={shipCoordinate}
          redAlertActive={session.fleetRedAlert?.active === true}
          {...(fleetGroupId && session.playerDiscovery?.groupId === fleetGroupId &&
            session.playerDiscovery.pursuitValue !== undefined
            ? { pursuitValue: session.playerDiscovery.pursuitValue }
            : {})}
          {...(session.playerDiscovery?.pursuitDistance !== undefined
            ? { pursuitDistance: session.playerDiscovery.pursuitDistance }
            : {})}
        />
        {observer && (
          <section className="gm-ship-access cic-frame" aria-label="GM ship console access">
            <p className="ship-shuttlebay__eyebrow">
              GM ship console access // {observerWrite ? 'Read / Write' : 'Read only'}
            </p>
            <button
              className="cic-action-button"
              type="button"
              aria-label="GM ship console read write access"
              aria-pressed={observerWrite}
              disabled={observerWritePending}
              ref={observerWriteTriggerRef}
              onClick={() => void toggleObserverWrite()}
            >
              GM ship console read write access // {observerWrite ? 'Read / Write' : 'Read only'}
            </button>
          </section>
        )}
        {observer && observerWriteConfirm && (
          <div className="gm-write-confirm-backdrop" role="presentation" onClick={dismissObserverWriteConfirmation}>
            <section
              ref={observerWriteDialogRef}
              className="gm-write-confirm cic-frame"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="gm-write-confirm-title"
              aria-describedby="gm-write-confirm-copy"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="gm-write-confirm-title">Are you sure?</h2>
              <p id="gm-write-confirm-copy">
                Enable scoped GM ship console write access for this ship? The grant is server-authorized and will be revoked when you leave this view or change ships.
              </p>
              <div className="gm-write-confirm__actions">
                <button
                  ref={observerWriteConfirmRef}
                  className="cic-action-button cic-action-button--confirm"
                  type="button"
                  disabled={observerWritePending}
                  onClick={() => void confirmObserverWrite()}
                >
                  ARE YOU SURE?
                </button>
                <button
                  className="cic-text-button"
                  type="button"
                  disabled={observerWritePending}
                  onClick={dismissObserverWriteConfirmation}
                >
                  Cancel
                </button>
              </div>
            </section>
          </div>
        )}
        <section className="ship-shuttlebay cic-frame" aria-label={`${ship.name} shuttlebay`}>
          <p className="ship-shuttlebay__eyebrow">Shuttlebay // docking manifest</p>
          <h2>Shuttle docking history</h2>
          {shuttlebay?.visits.some((visit) => visit.action === 'docked') ? (
            <ol className="ship-shuttlebay__log" aria-label="Shuttle docking history">
              {shuttlebay.visits.filter((visit) => visit.action === 'docked').map((visit) => (
                <li key={visit.id}>
                  <strong>{visit.shuttle.name}</strong>
                  <span>{visit.shuttleport}</span>
                </li>
              ))}
            </ol>
          ) : <p>No recorded shuttle dockings</p>}
        </section>
        {ship.id === 'aegis' && effectiveRoleId === 'admiral' ? (
          <FleetAlertControl />
        ) : ship.id !== 'aegis' ? (
          <section className="confetti-dispenser" aria-label="Emergency Bridge Confetti Dispenser">
            <p className="confetti-dispenser__label">Emergency Bridge Confetti Dispenser</p>
            <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
              <button
                className="confetti-dispenser__trigger"
                type="button"
                aria-label={spent
                  ? 'Emergency Bridge Confetti Dispenser spent'
                  : queued
                    ? 'Emergency Bridge Confetti Dispenser activation queued'
                    : 'Activate Emergency Bridge Confetti Dispenser'}
                disabled={!effectiveWritable || !coverOpen || !consoleRole || spent || queued || activating}
                onClick={() => void activate()}
              >
                {spent ? 'EMPTY' : queued ? 'QUEUED' : activating ? 'FIRING' : 'POP'}
              </button>
              <button
                className="confetti-dispenser__cover"
                type="button"
                aria-label={`${coverOpen ? 'Close' : 'Open'} confetti activation cover`}
                aria-pressed={coverOpen}
                disabled={!effectiveWritable || spent || queued}
                onClick={() => setCoverOpen((current) => !current)}
              >
                {coverOpen ? 'COVER OPEN' : 'COMMAND LOCK'}
              </button>
            </div>
            <p className="confetti-dispenser__status">
              ONE USE // {gameplayFrozen
                ? 'ENDGAME EVALUATION // COMMAND FROZEN'
                : spent ? 'EMPTY' : queued ? 'QUEUED' : activating ? 'FIRING' : 'ARMED'}
            </p>
            {confettiActor && (
              <p className="confetti-dispenser__notice" role="status">
                DISCHARGED BY // {confettiActor.roleName} // {confettiActor.name}
              </p>
            )}
            {!spent && !queued && !confettiActor && (
              <p className="confetti-dispenser__notice" role="status">
                {awaitingSecondOfficer
                  ? 'AUTHORIZATION HELD // SECOND PERSON MUST PRESS TO FIRE THE CANNON'
                  : consoleRole
                    ? 'COMMAND CODES // CAPTAIN AUTHORITY REQUIRED // TWO OFFICERS MAY OVERRIDE'
                    : 'SELECT A COMMAND ROLE TO OPERATE THE CANNON'}
              </p>
            )}
          </section>
        ) : null}
      </aside>
      {burst > 0 && (
        <div className="confetti-burst" key={burst} aria-hidden="true">
          {CONFETTI_PIECES.map((piece) => (
            <i
              className={`confetti-burst__piece${
                burstSource === 'snn-press-shuttle' ? ' confetti-burst__piece--newspaper' : ''
              }`}
              key={piece.index}
              style={piece.style}
            />
          ))}
        </div>
      )}
    </main>
    </ConsoleAccessContext.Provider>
  );
}
