import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ShipSpecifications from '@/components/ShipSpecifications';
import PopulationTrack from '@/components/PopulationTrack';
import FleetConsoleWorkspace from '@/components/FleetConsoleWorkspace';
import { populationForShip } from '@/data/shipPopulation';
import OverflowTicker from '@/components/OverflowTicker';
import ResourceIcon from '@/components/ResourceIcon';
import RoleAssignment from '@/components/RoleAssignment';
import { findShip, SHIP_ORIGIN_LABELS } from '@/data/ships';
import { RESOURCE_DEFINITIONS, resourcesForShip } from '@/data/resources';
import { findConsoleRole } from '@/data/roles';
import { DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import { shuttlebayForShip } from '@/data/shuttles';
import {
  popShipConfetti,
  selectConsoleRole,
} from '@/lib/sessionService';
import { consoleRoleRoute } from '@/lib/consoleRole';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import type { DamageDraw } from '@/types/game';

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
  const mode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);
  const pendingCommands = useSessionStore((state) => state.pendingCommands);
  const ship = findShip(shipId);
  const consoleRole = findConsoleRole(roleId);
  const validRole = !roleId || consoleRole?.shipId === ship?.id;
  const roleEnabled = !roleId || (session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS).includes(roleId);
  const [coverOpen, setCoverOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [burst, setBurst] = useState(0);
  const [burstSource, setBurstSource] = useState<string | null>(null);
  const [confettiActor, setConfettiActor] = useState<{
    roleName: string;
    name: string;
  } | null>(null);
  const [awaitingSecondOfficer, setAwaitingSecondOfficer] = useState(false);
  const [observerWrite, setObserverWrite] = useState(false);
  const [damageDraws, setDamageDraws] = useState<readonly DamageDraw[]>([]);
  const spent = Boolean(ship && session?.confettiUsedShipIds?.includes(ship.id));
  const queued = Boolean(ship && session && pendingCommands.some(
    (command) => command.kind === 'popShipConfetti' &&
      command.payload.sessionId === session.id && command.payload.shipId === ship.id,
  ));
  const shuttlebay = ship && session ? shuttlebayForShip(session, ship.id) : null;
  const resources = ship ? resourcesForShip(ship.id, session?.shipResources) : undefined;
  const population = ship ? populationForShip(ship.id, session?.shipSurvivors) : undefined;
  const unrest = ship ? (session?.shipUnrest?.[ship.id] ?? 0) : 0;
  const hasConsoleWorkspace = Boolean(ship && consoleRole && ship.roles.some(role => role.id === consoleRole.id));

  useEffect(() => {
    if (!consoleRole || observer) return;
    void selectConsoleRole(consoleRole.id).catch(() => undefined);
  }, [consoleRole, observer]);

  useEffect(() => setObserverWrite(false), [ship?.id, observer]);

  useEffect(() => {
    if (!isGm || !session?.id) {
      setDamageDraws([]);
      return;
    }
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeDamageDraws }) => {
      if (!active) return;
      unsubscribe = subscribeDamageDraws(
        session.id,
        setDamageDraws,
        () => useSessionStore.getState().setCommunicationError({
          code: 'gm-damage-log-link',
          message: 'The private damage draw log could not be refreshed.',
        }),
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isGm, session?.id]);

  useEffect(() => {
    if (!session?.id || !ship) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeShipConfetti }) => {
      if (!active) return;
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
    };
  }, [session?.id, ship]);

  useEffect(() => {
    if (burst === 0) return;
    const timer = window.setTimeout(() => setBurst(0), 3_500);
    return () => window.clearTimeout(timer);
  }, [burst]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (observer && !isGm) return <Navigate to="/console" replace />;
  if (!observer && !isGm && me.activeConsoleRoleId && me.activeConsoleRoleId !== roleId) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }
  if (
    mode !== 'console' || !ship || !validRole ||
    (!roleEnabled && me.activeConsoleRoleId !== roleId) ||
    (ship.id === 'capybara' && session.capybaraEnabled === false) ||
    (ship.id === 'dione' && session.dioneEnabled === false)
  ) return <Navigate to="/console" replace />;

  async function activate(): Promise<void> {
    if (!ship || !consoleRole || spent || queued || activating) return;
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

  return (
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
      data-unrest-critical={unrest > 7 ? 'true' : undefined}
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
        {(isGm || !consoleRole) && (
          <Link
            className="ship-console__back cic-text-button"
            to={(roleId || observer) ? `/ships/${ship.id}/roles` : '/console'}
          >
            {(roleId || observer) ? 'Change role' : 'Leave ship'}
          </Link>
        )}
        <p className="ship-console__nation">
          {SHIP_ORIGIN_LABELS[ship.origin]} // {ship.nation} // {ship.nationShort}
        </p>
        <h1 className="ship-console__name" id="ship-name">{ship.name}</h1>
        <p className="ship-console__type">{ship.vesselType}</p>
        <p className="ship-console__description">{ship.description}</p>
        <ShipSpecifications shipId={ship.id} shipName={ship.name} population={population} />
        {(consoleRole || observer) && (
          <RoleAssignment value={observer ? 'Observer' : consoleRole?.name ?? ''} />
        )}
        {!observer && (
          <FleetConsoleWorkspace
            ship={ship}
            role={consoleRole}
            galacticCoordinate={session.shipGalacticCoordinates?.[ship.id] ?? '0000'}
            fuel={resources?.fuel ?? 0}
            damage={session.shipDamage?.[ship.id]}
          />
        )}
        {isGm && damageDraws.some(
          (draw) => draw.shipId === ship.id && draw.type === 'ship-damage',
        ) && (
          <section className="ship-damage-cards cic-frame" aria-label={`${ship.name} ship systems`}>
            <p className="ship-resources__eyebrow">Ship systems // damage cards</p>
            <ul>
              {damageDraws.flatMap((draw) =>
                draw.shipId === ship.id && draw.type === 'ship-damage' ? [(
                  <li key={draw.id}>
                    <span>{draw.systemName}</span>
                    <strong
                      className="ship-damage-card"
                      tabIndex={0}
                      aria-label={`${draw.card}, ${draw.systemName} damage card`}
                    >{draw.card}</strong>
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
              <ul>
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
              </ul>
            </section>
          )}
          <section
            className="ship-census cic-frame"
            aria-label={`${ship.name} census`}
            data-critical={unrest > 7 ? 'true' : 'false'}
          >
            <p className="ship-resources__eyebrow">Census // tracked conditions</p>
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
          </section>
        </div>
      </section>
      <aside className="ship-console__instruments" aria-label={`${ship.name} instruments`}>
        {observer && (
          <section className="observer-access cic-frame" aria-label="Observer access">
            <p className="ship-shuttlebay__eyebrow">
              Observer access // {observerWrite ? 'Write mode' : 'Read only'}
            </p>
            <button
              className="cic-text-button"
              type="button"
              aria-label="Observer write mode"
              aria-pressed={observerWrite}
              onClick={() => setObserverWrite((current) => !current)}
            >
              Write mode // {observerWrite ? 'On' : 'Off'}
            </button>
          </section>
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
            disabled={!coverOpen || !consoleRole || observer || spent || queued || activating}
            onClick={() => void activate()}
          >
            {spent ? 'EMPTY' : queued ? 'QUEUED' : activating ? 'FIRING' : 'POP'}
          </button>
          <button
            className="confetti-dispenser__cover"
            type="button"
            aria-label={`${coverOpen ? 'Close' : 'Open'} confetti activation cover`}
            aria-pressed={coverOpen}
            disabled={observer || spent || queued}
            onClick={() => setCoverOpen((current) => !current)}
          >
            {coverOpen ? 'COVER OPEN' : 'COMMAND LOCK'}
          </button>
        </div>
        <p className="confetti-dispenser__status">
          ONE USE // {spent ? 'EMPTY' : queued ? 'QUEUED' : activating ? 'FIRING' : 'ARMED'}
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
  );
}
