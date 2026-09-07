import { populationForShip, populationTrackForShip } from '@/data/shipPopulation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ContactPlot from '@/components/ContactPlot';
import DradisEffectControls from '@/components/DradisEffectControls';
import DradisRangeBands from '@/components/DradisRangeBands';
import { DradisAirspaceTimer } from '@/components/TurnPhaseTimer';
import GmStarmapModule from '@/components/GmStarmapModule';
import RoleConsoleTemplate from '@/components/RoleConsoleTemplate';
import ResourceIcon from '@/components/ResourceIcon';
import { DRADIS_RESIZE_MS } from '@/components/dradisMotion';
import { normalizeDisplayName } from '@/lib/displayName';
import { fleetViewFrom } from '@/data/fleetFormation';
import { nextGmClockUpdate } from '@/lib/gmClock';
import { RESOURCE_DEFINITIONS, resourcesForShip, type ResourceId } from '@/data/resources';
import { SHIPS } from '@/data/ships';
import { ORIGIN_GALACTIC_COORDINATE } from '@/data/ships';
import { CONSOLE_ROLES, DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import {
  canOfferJointEngineeringRole,
  isJointEngineeringRoleId,
  isValidRoleConfiguration,
  JOINT_ENGINEERING_ROLE_IDS,
  MAX_PLAYER_PRESET,
  MIN_PLAYER_PRESET,
  recommendedPlayerCountForRoleIds,
  recommendedRoleIds,
} from '@/data/rolePresets';
import {
  assignWolves,
  assignWolfRoles,
  resetWolves,
  kickGmInstance,
  setCapybaraEnabled,
  setDebriefMode,
  setDioneEnabled,
  setGmControlsLocked,
  setActiveRoleConfiguration,
  applyShipCounterSteps,
  advanceTurn,
  type ShipCounterBatchResult,
} from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { useMotionPreference } from '@/lib/motionPreference';
import { hasActiveTurnTimer, phaseForSession } from '@/lib/turnPhase';
import {
  COUNTER_COMMAND_COALESCE_MS,
  previewPopulationChange,
  previewResourceChange,
  previewUnrestChange,
  type CounterPreview,
  type CounterStep,
} from '@/lib/counterPreview';
import type { DamageDraw, GameSession, GmInstance, Player, SessionEvent } from '@/types/game';

interface PlayerRoleGroup {
  readonly id: string;
  readonly label: string;
  readonly players: readonly Player[];
}

interface ShipRoleGroupsProps {
  readonly roles: typeof CONSOLE_ROLES;
  readonly renderRole: (role: typeof CONSOLE_ROLES[number]) => ReactNode;
}

const KNOWN_CONSOLE_ROLE_IDS = new Set(CONSOLE_ROLES.map((role) => role.id));

type CounterTarget =
  | { readonly counter: 'resource'; readonly shipId: string; readonly resourceId: ResourceId }
  | { readonly counter: 'unrest' | 'population'; readonly shipId: string };

interface StagedCounter {
  readonly target: CounterTarget;
  /** The authoritative number shown when this local run began. */
  readonly baseAmount: number;
  readonly steps: readonly CounterStep[];
  readonly sending: boolean;
}

function counterKey(target: CounterTarget): string {
  return target.counter === 'resource'
    ? `${target.counter}:${target.shipId}:${target.resourceId}`
    : `${target.counter}:${target.shipId}`;
}

function previewCounter(target: CounterTarget, amount: number, steps: readonly CounterStep[]): CounterPreview {
  if (target.counter === 'resource') return previewResourceChange(amount, steps);
  if (target.counter === 'unrest') return previewUnrestChange(amount, steps);
  return previewPopulationChange(target.shipId, amount, steps);
}

function hasAuthoritativeCounterAlert(
  session: GameSession | null | undefined,
  target: CounterTarget,
): boolean {
  if (target.counter === 'unrest') return Boolean(session?.unrestAlerts?.[target.shipId]);
  if (target.counter === 'population') return Boolean(session?.populationAlerts?.[target.shipId]);
  return false;
}

function sendStagedCounter(staged: StagedCounter): Promise<ShipCounterBatchResult | null> {
  const { target, steps } = staged;
  if (target.counter === 'resource') {
    return applyShipCounterSteps(
      target.shipId,
      { counter: 'resource', resourceId: target.resourceId },
      steps,
    );
  }
  return applyShipCounterSteps(target.shipId, { counter: target.counter }, steps);
}

function ShipRoleGroups({ roles, renderRole }: ShipRoleGroupsProps) {
  const shipRoleIds = new Set<string>(SHIPS.map((ship) => ship.id));
  const independentRoles = roles.filter((role) => !shipRoleIds.has(role.shipId));

  return (
    <div className="gm-role-groups">
      {SHIPS.map((ship) => {
        const rolesAboard = roles.filter((role) => role.shipId === ship.id);
        if (rolesAboard.length === 0) return null;
        return (
          <section className="gm-role-group" role="group" aria-label={`${ship.name} roles`} key={ship.id}>
            <header className="gm-role-group__header">
              <img src={ship.flag} alt={`${ship.name} flag`} />
              <span>{ship.name}</span>
            </header>
            <div className="gm-role-group__roles">{rolesAboard.map(renderRole)}</div>
          </section>
        );
      })}
      {independentRoles.length > 0 && (
        <section className="gm-role-group gm-role-group--independent" role="group" aria-label="Independent roles">
          <header className="gm-role-group__header"><span>Independent stations</span></header>
          <div className="gm-role-group__roles">{independentRoles.map(renderRole)}</div>
        </section>
      )}
    </div>
  );
}

function groupConnectedPlayers(players: readonly Player[]): readonly PlayerRoleGroup[] {
  const assignedRoleIds = new Set(CONSOLE_ROLES.map((role) => role.id));
  const groups: PlayerRoleGroup[] = CONSOLE_ROLES.map((role) => {
    const shipName = SHIPS.find((ship) => ship.id === role.shipId)?.name ??
      role.shipId.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    return {
      id: role.id,
      label: `${shipName} // ${role.name}`,
      players: players.filter((player) => player.activeConsoleRoleId === role.id),
    };
  });
  groups.push(
    {
      id: 'gm',
      label: 'GM',
      players: players.filter((player) => player.role === 'gm' && !player.activeConsoleRoleId),
    },
    {
      id: 'observer',
      label: 'Observer',
      players: players.filter((player) => player.role === 'observer' && !player.activeConsoleRoleId),
    },
    {
      id: 'unassigned',
      label: 'Unassigned',
      players: players.filter((player) => player.role === 'player' &&
        (!player.activeConsoleRoleId || !assignedRoleIds.has(player.activeConsoleRoleId))),
    },
  );
  return groups
    .filter((group) => group.players.length > 0)
    .map((group) => ({
      ...group,
      players: [...group.players].sort((left, right) =>
        normalizeDisplayName(left.displayName).localeCompare(normalizeDisplayName(right.displayName))),
    }));
}

function knownRoleIds(roleIds: readonly string[]): readonly string[] {
  return roleIds.filter((roleId) => KNOWN_CONSOLE_ROLE_IDS.has(roleId));
}

function normalizeRoleDraft(roleIds: readonly string[]): readonly string[] {
  const selected = new Set(roleIds);
  const knownRoleIds = CONSOLE_ROLES.filter((role) => selected.has(role.id)).map((role) => role.id);
  return knownRoleIds.filter((roleId) =>
    !isJointEngineeringRoleId(roleId) ||
    canOfferJointEngineeringRole(knownRoleIds, roleId));
}

function sameRoleConfiguration(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<string, number>();
  for (const roleId of left) counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
  for (const roleId of right) {
    const count = counts.get(roleId);
    if (!count) return false;
    if (count === 1) counts.delete(roleId);
    else counts.set(roleId, count - 1);
  }
  return counts.size === 0;
}

export default function GmConsole() {
  const { reducedMotion } = useMotionPreference();
  const session = useSessionStore((state) => state.session);
  const sessionId = session?.id;
  const activeRoleIds = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const serverRoleIds = knownRoleIds(activeRoleIds);
  const normalizedServerRoleIds = normalizeRoleDraft(serverRoleIds);
  const me = useSessionStore((state) => state.me);
  const local = useSessionStore((state) => state.gmInstance);
  const isGm = useSessionStore(selectIsGm);
  const pendingCommands = useSessionStore((state) => state.pendingCommands);
  const queuedKicks = new Set(
    pendingCommands.flatMap((command) =>
      command.kind === 'kickGmInstance' ? [command.payload.targetInstanceId] : []),
  );
  const [instances, setInstances] = useState<readonly GmInstance[]>([]);
  const [connectedPlayers, setConnectedPlayers] = useState<readonly Player[]>([]);
  const [events, setEvents] = useState<readonly SessionEvent[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [damageDraws, setDamageDraws] = useState<readonly DamageDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipNumberWrite, setShipNumberWrite] = useState(false);
  const [stagedCounters, setStagedCounters] = useState<Readonly<Record<string, StagedCounter>>>({});
  const stagedCountersRef = useRef<Readonly<Record<string, StagedCounter>>>({});
  const counterTimers = useRef(new Map<string, number>());
  const [thresholdHolds, setThresholdHolds] = useState<Readonly<Record<string, CounterTarget>>>({});
  const [setupOpen, setSetupOpen] = useState(false);
  const [dradisExpanded, setDradisExpanded] = useState(false);
  const dradisRef = useRef<HTMLElement>(null);
  const dradisPreviousBounds = useRef<DOMRect | null>(null);
  const dradisAnimation = useRef<Animation | null>(null);
  const [viewerId, setViewerId] = useState('aegis');
  const [changingCapybara, setChangingCapybara] = useState(false);
  const [pendingCapybaraEnabled, setPendingCapybaraEnabled] = useState<boolean | null>(null);
  const [changingDione, setChangingDione] = useState(false);
  const [pendingDioneEnabled, setPendingDioneEnabled] = useState<boolean | null>(null);
  const [changingLock, setChangingLock] = useState(false);
  const [advancingTurn, setAdvancingTurn] = useState(false);
  const [confirmTurnOverride, setConfirmTurnOverride] = useState(false);
  const [changingDebrief, setChangingDebrief] = useState(false);
  const [confirmFinale, setConfirmFinale] = useState(false);
  const [assigningWolves, setAssigningWolves] = useState(false);
  const [manualWolfRoleIds, setManualWolfRoleIds] = useState<readonly string[]>([]);
  const [assignedWolfRoleIds, setAssignedWolfRoleIds] = useState<readonly string[]>([]);
  const [draftRoleIds, setDraftRoleIds] = useState<readonly string[]>(() => normalizedServerRoleIds);
  const [confirmingRoster, setConfirmingRoster] = useState(false);
  const previousServerRoleIds = useRef<readonly string[]>(serverRoleIds);
  const capybaraEnabled = session?.capybaraEnabled !== false;
  const capybaraQueued = pendingCommands.some(
    (command) => command.kind === 'setCapybaraEnabled',
  );
  const dioneEnabled = session?.dioneEnabled !== false;
  const dioneQueued = pendingCommands.some(
    (command) => command.kind === 'setDioneEnabled',
  );
  const controlsLocked = session?.gmControlsLocked === true;
  const debriefMode = session?.debriefMode ?? { active: false, revision: 0 };
  const currentTurn = session?.currentTurn ?? 1;
  const currentPhase = phaseForSession(session);
  const activeTurnTimer = hasActiveTurnTimer(currentPhase, clock);
  const lockQueued = pendingCommands.some(
    (command) => command.kind === 'setGmControlsLocked',
  );
  const debriefQueued = pendingCommands.some(
    (command) => command.kind === 'setDebriefMode',
  );
  const draftRecommendedPlayerCount = recommendedPlayerCountForRoleIds(draftRoleIds);
  const hasUnconfirmedRosterChanges = !sameRoleConfiguration(draftRoleIds, serverRoleIds);
  const rosterConfigurationValid = isValidRoleConfiguration(draftRoleIds);
  const rosterQueued = pendingCommands.some(
    (command) => command.kind === 'setActiveRoleConfiguration',
  );
  const conditionalUnionRoles = JOINT_ENGINEERING_ROLE_IDS.flatMap((roleId) => {
    const role = CONSOLE_ROLES.find((candidate) => candidate.id === roleId);
    return role && canOfferJointEngineeringRole(draftRoleIds, roleId) ? [role] : [];
  });
  const wolvesLockedByRoster = hasUnconfirmedRosterChanges || confirmingRoster || rosterQueued;
  const availableShips = SHIPS.filter(
    (ship) =>
      (capybaraEnabled || ship.id !== 'capybara') &&
      (dioneEnabled || ship.id !== 'dione'),
  );
  const viewer = availableShips.find((ship) => ship.id === viewerId) ?? availableShips[0];
  const viewerCoordinate = session?.shipGalacticCoordinates?.[viewer?.id ?? 'aegis'] ??
    ORIGIN_GALACTIC_COORDINATE;
  const contacts = fleetViewFrom(
    viewer?.id ?? 'aegis',
    capybaraEnabled,
    session?.shipGalacticCoordinates,
    dioneEnabled,
  ).map((ship) => ({
    tag: ship.name.toUpperCase(),
    x: ship.x,
    y: ship.y,
    z: ship.z,
    color: ship.color,
    combatRange: ship.combatRange,
    showCombatRange: ship.showCombatRange,
  }));
  const latestAlert = events.find((event) => event.type === 'fullscreen-alert');
  const nextClockUpdate = nextGmClockUpdate(session, clock);
  const overdueMaintenance = Object.entries(session?.maintenanceCycles ?? {}).flatMap(([shipId, cycle]) => {
    const startedAt = cycle.startedAt ? Date.parse(cycle.startedAt) : Number.NaN;
    const elapsed = clock - startedAt;
    if (cycle.step === 0 || !Number.isFinite(startedAt) || elapsed < 5 * 60_000) return [];
    return [{
      shipId,
      shipName: SHIPS.find((ship) => ship.id === shipId)?.name ?? shipId,
      minutes: Math.floor(elapsed / 60_000),
    }];
  });
  const connectedPlayerGroups = groupConnectedPlayers(connectedPlayers);

  useLayoutEffect(() => {
    const dradis = dradisRef.current;
    const previous = dradisPreviousBounds.current;
    dradisPreviousBounds.current = null;
    if (!dradis || !previous || typeof dradis.animate !== 'function') return;
    if (reducedMotion) return;

    const next = dradis.getBoundingClientRect();
    if (next.width === 0 || next.height === 0) return;
    dradisAnimation.current = dradis.animate([
      {
        transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) ` +
          `scale(${previous.width / next.width}, ${previous.height / next.height})`,
      },
      { transform: 'none' },
    ], {
      duration: DRADIS_RESIZE_MS,
      easing: 'ease-in-out',
    });
  }, [dradisExpanded, reducedMotion]);

  const toggleDradis = () => {
    const dradis = dradisRef.current;
    if (dradis) dradisPreviousBounds.current = dradis.getBoundingClientRect();
    dradisAnimation.current?.cancel();
    dradisAnimation.current = null;
    setDradisExpanded((expanded) => !expanded);
  };

  useEffect(() => {
    if (!isGm || !sessionId) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({
      subscribeConnectedPlayers,
      subscribeDamageDraws,
      subscribeGmInstances,
      subscribeSessionEvents,
    }) => {
      if (!active) return;
      const stopInstances = subscribeGmInstances(
        sessionId,
        (next) => {
          setInstances(next);
          setLoading(false);
        },
        () => {
          setLoading(false);
          useSessionStore.getState().setCommunicationError({
            code: 'gm-manifest-link',
            message: 'The live GM instance manifest could not be refreshed.',
          });
        },
      );
      const stopEvents = subscribeSessionEvents(
        sessionId,
        setEvents,
        () => useSessionStore.getState().setCommunicationError({
          code: 'gm-event-log-link',
          message: 'The live GM event log could not be refreshed.',
        }),
      );
      const stopDamageDraws = subscribeDamageDraws(
        sessionId,
        setDamageDraws,
        () => useSessionStore.getState().setCommunicationError({
          code: 'gm-damage-log-link',
          message: 'The damage draw log could not be refreshed.',
        }),
      );
      const stopPlayers = subscribeConnectedPlayers(
        sessionId,
        setConnectedPlayers,
        () => useSessionStore.getState().setCommunicationError({
          code: 'gm-player-roster-link',
          message: 'The connected player roster could not be refreshed.',
        }),
      );
      unsubscribe = () => {
        stopInstances();
        stopEvents();
        stopDamageDraws();
        stopPlayers();
      };
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isGm, sessionId]);

  useEffect(() => {
    if (!capybaraEnabled && viewerId === 'capybara') setViewerId('aegis');
  }, [capybaraEnabled, viewerId]);

  useEffect(() => {
    if (!dioneEnabled && viewerId === 'dione') setViewerId('aegis');
  }, [dioneEnabled, viewerId]);

  useEffect(() => {
    const nextServerRoleIds = knownRoleIds(activeRoleIds);
    const nextDraftRoleIds = normalizeRoleDraft(nextServerRoleIds);
    setDraftRoleIds((current) =>
      sameRoleConfiguration(current, previousServerRoleIds.current)
        ? nextDraftRoleIds
        : current);
    previousServerRoleIds.current = nextServerRoleIds;
  }, [activeRoleIds]);

  useEffect(() => {
    setThresholdHolds((holds) => {
      const remaining = Object.entries(holds).filter(([, target]) =>
        !hasAuthoritativeCounterAlert(session, target));
      return remaining.length === Object.keys(holds).length
        ? holds
        : Object.fromEntries(remaining);
    });
  }, [session, thresholdHolds]);

  useEffect(() => () => {
    for (const timer of counterTimers.current.values()) window.clearTimeout(timer);
    counterTimers.current.clear();
    const outstanding = Object.values(stagedCountersRef.current)
      .filter((staged) => !staged.sending);
    stagedCountersRef.current = {};
    for (const staged of outstanding) void sendStagedCounter(staged);
  }, []);

  useEffect(() => {
    if (nextClockUpdate === undefined) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.max(1, nextClockUpdate - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [nextClockUpdate]);

  useEffect(() => {
    setConfirmTurnOverride(false);
  }, [currentTurn]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm || !local) return <Navigate to="/console" replace />;

  function replaceStagedCounters(next: Readonly<Record<string, StagedCounter>>): void {
    stagedCountersRef.current = next;
    setStagedCounters(next);
  }

  function flushStagedCounter(key: string): void {
    const queued = stagedCountersRef.current[key];
    if (!queued || queued.sending) return;
    const timer = counterTimers.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    counterTimers.current.delete(key);
    const sending = { ...queued, sending: true };
    replaceStagedCounters({ ...stagedCountersRef.current, [key]: sending });
    void (async () => {
      try {
        const result = await sendStagedCounter(sending);
        if (result?.alertRaised) {
          setThresholdHolds((holds) => ({ ...holds, [key]: sending.target }));
        }
      } catch {
        // The shared interception notice reports the server rejection.
      } finally {
        if (stagedCountersRef.current[key] === sending) {
          const remaining = { ...stagedCountersRef.current };
          delete remaining[key];
          replaceStagedCounters(remaining);
        }
      }
    })();
  }

  function stageCounterChange(target: CounterTarget, amount: number, step: CounterStep): void {
    const key = counterKey(target);
    const existing = stagedCountersRef.current[key];
    if (thresholdHolds[key] || existing?.sending || existing?.steps.length === 12) return;
    const baseAmount = existing?.baseAmount ?? amount;
    const previous = previewCounter(target, baseAmount, existing?.steps ?? []);
    if (previous.alertRaised) return;
    const steps = [...(existing?.steps ?? []), step];
    const next = previewCounter(target, baseAmount, steps);
    if (next.amount === previous.amount || next.appliedSteps.length !== steps.length) return;
    const staged: StagedCounter = {
      target,
      baseAmount,
      steps: next.appliedSteps,
      sending: false,
    };
    replaceStagedCounters({ ...stagedCountersRef.current, [key]: staged });
    const timer = counterTimers.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    counterTimers.current.set(key, window.setTimeout(
      () => flushStagedCounter(key),
      COUNTER_COMMAND_COALESCE_MS,
    ));
  }

  function stagedCounterPreview(target: CounterTarget, amount: number): {
    readonly staged: StagedCounter | undefined;
    readonly preview: CounterPreview;
  } {
    const staged = stagedCounters[counterKey(target)];
    return {
      staged,
      preview: staged
        ? previewCounter(target, staged.baseAmount, staged.steps)
        : { amount, appliedSteps: [], alertRaised: false },
    };
  }

  async function kick(instance: GmInstance): Promise<void> {
    try {
      const disposition = await kickGmInstance(instance.id);
      if (disposition !== 'queued') {
        setInstances((current) => current.filter((item) => item.id !== instance.id));
      }
    } catch {
      // The shared interception notice reports the server rejection.
    }
  }

  async function changeCapybara(enabled: boolean): Promise<void> {
    setChangingCapybara(true);
    try {
      await setCapybaraEnabled(enabled);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingCapybara(false);
      setPendingCapybaraEnabled(null);
    }
  }

  async function changeDione(enabled: boolean): Promise<void> {
    setChangingDione(true);
    try {
      await setDioneEnabled(enabled);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingDione(false);
      setPendingDioneEnabled(null);
    }
  }

  async function toggleLock(): Promise<void> {
    setChangingLock(true);
    try {
      await setGmControlsLocked(!controlsLocked);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingLock(false);
    }
  }

  async function changeDebriefMode(active: boolean): Promise<void> {
    setChangingDebrief(true);
    try {
      await setDebriefMode(active);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingDebrief(false);
    }
  }

  function requestFinale(): void {
    if (debriefMode.active) {
      setConfirmFinale(false);
      void changeDebriefMode(false);
      return;
    }
    if (!confirmFinale) {
      setConfirmFinale(true);
      return;
    }
    setConfirmFinale(false);
    void changeDebriefMode(true);
  }

  async function moveToNextTurn(overridePhaseTimer = false): Promise<void> {
    setAdvancingTurn(true);
    try {
      await (overridePhaseTimer ? advanceTurn({ overridePhaseTimer: true }) : advanceTurn());
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAdvancingTurn(false);
    }
  }

  function requestTurnAdvance(): void {
    if (activeTurnTimer && !confirmTurnOverride) {
      setConfirmTurnOverride(true);
      return;
    }
    const override = activeTurnTimer && confirmTurnOverride;
    setConfirmTurnOverride(false);
    void moveToNextTurn(override);
  }

  async function randomizeWolves(count: 1 | 2): Promise<void> {
    setAssigningWolves(true);
    setAssignedWolfRoleIds([]);
    try {
      setAssignedWolfRoleIds(await assignWolves(count));
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAssigningWolves(false);
    }
  }

  async function assignSelectedWolves(): Promise<void> {
    setAssigningWolves(true);
    setAssignedWolfRoleIds([]);
    try {
      setAssignedWolfRoleIds(await assignWolfRoles(manualWolfRoleIds));
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAssigningWolves(false);
    }
  }

  async function resetWolfAssignment(): Promise<void> {
    setAssigningWolves(true);
    try {
      await resetWolves();
      setAssignedWolfRoleIds([]);
      setManualWolfRoleIds([]);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAssigningWolves(false);
    }
  }

  function chooseRecommendedRoster(playerCount: number): void {
    setDraftRoleIds(normalizeRoleDraft(recommendedRoleIds(playerCount)));
  }

  function toggleDraftRole(roleId: string, enabled: boolean): void {
    setDraftRoleIds((current) => {
      if (isJointEngineeringRoleId(roleId) && enabled && !canOfferJointEngineeringRole(current, roleId)) {
        return current;
      }
      const next = enabled
        ? [...current, roleId]
        : current.filter((activeRoleId) => activeRoleId !== roleId);
      return normalizeRoleDraft(next);
    });
  }

  async function confirmRoster(): Promise<void> {
    if (!hasUnconfirmedRosterChanges || !rosterConfigurationValid) return;
    setConfirmingRoster(true);
    try {
      await setActiveRoleConfiguration(draftRoleIds);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setConfirmingRoster(false);
    }
  }

  return (
    <main className="ship-console ship-console--gameplay gm-console">
      <section className="ship-console__identity" aria-label="GM command">
        <Link className="ship-console__back cic-text-button" to="/console">
          Back to role selection
        </Link>
        <p className="ship-console__nation">{session.name} // Game master</p>
        <h1 className="ship-console__name">GM Console</h1>
        <p className="ship-console__type">Fleet command oversight</p>

        <RoleConsoleTemplate
          label="GM operations console"
          eyebrow="Game master // Session operations"
          title="Fleet oversight"
          telemetry={<>
            <div><dt>Available ships</dt><dd>{availableShips.length}</dd></div>
            <div><dt>Active roles</dt><dd>{activeRoleIds.length}</dd></div>
            <div><dt>Connected players</dt><dd>{connectedPlayers.length}</dd></div>
            <div><dt>GM registration</dt><dd>{controlsLocked ? 'Locked' : 'Unlocked'}</dd></div>
          </>}
        >
        <div className="gm-console__grid">
          <section className="gm-console__module cic-frame" aria-label="Turn controls">
            <h2 className="gm-console__section-title">Turn control</h2>
            <p className="gm-console__status">Turn {currentTurn}</p>
            {confirmTurnOverride && activeTurnTimer && (
              <p className="gm-turn-control__override" role="alert">
                ARE YOU SURE? // ACTIVE PHASE TIMER WILL BE OVERRIDDEN
              </p>
            )}
            {currentTurn === 0 ? (
              <div className="gm-turn-control__actions">
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={advancingTurn}
                  onClick={() => void moveToNextTurn()}
                >
                  {advancingTurn ? 'Skipping to Turn 1…' : 'Skip to Turn 1'}
                </button>
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={advancingTurn}
                  onClick={requestTurnAdvance}
                >
                  {advancingTurn ? 'Advancing to Turn 1…' : 'Advance to Turn 1'}
                </button>
              </div>
            ) : (
              <button
                className="cic-action-button"
                type="button"
                disabled={advancingTurn}
                onClick={requestTurnAdvance}
              >
                {advancingTurn
                  ? 'Advancing turn…'
                  : confirmTurnOverride && activeTurnTimer
                    ? `ARE YOU SURE? // Advance to Turn ${currentTurn + 1}`
                    : `Advance to Turn ${currentTurn + 1}`}
              </button>
            )}
          </section>
          <section className="gm-console__module gm-finale cic-frame" aria-label="Finale controls">
            <h2 className="gm-console__section-title">Finale</h2>
            <p className="gm-console__status">
              Debrief mode // {debriefMode.active ? 'Live across every console' : 'Standing by'}
            </p>
            {confirmFinale && !debriefMode.active && (
              <p className="gm-finale__confirm" role="alert">
                ARE YOU SURE? // LOWER THE DEBRIEF BALL AND BEGIN THE CONFETTI STREAM
              </p>
            )}
            <button
              className="cic-action-button"
              type="button"
              aria-pressed={debriefMode.active}
              disabled={changingDebrief || debriefQueued}
              onClick={requestFinale}
            >
              {changingDebrief
                ? debriefMode.active ? 'Retracting finale…' : 'Enabling finale…'
                : debriefQueued
                  ? 'Finale command queued'
                  : debriefMode.active
                    ? 'Retract finale // Stop confetti'
                    : confirmFinale
                      ? 'ARE YOU SURE? // Enable finale'
                      : 'Finale // Enable debrief mode'}
            </button>
          </section>
          <GmStarmapModule session={session} />
          <section
            className="gm-console__module gm-fleet-resources cic-frame"
            aria-label="Fleet resource controls"
          >
            <h2 className="gm-console__section-title">Fleet resource stores</h2>
            <div className="gm-fleet-resources__access">
              <p className="gm-fleet-resources__status">
                Ship number access // {shipNumberWrite ? 'Write mode' : 'Read only'}
              </p>
              <button
                className="cic-text-button"
                type="button"
                aria-label="Ship numbers write mode"
                aria-pressed={shipNumberWrite}
                onClick={() => setShipNumberWrite((enabled) => !enabled)}
              >
                Write mode // {shipNumberWrite ? 'On' : 'Off'}
              </button>
            </div>
            <div className="gm-fleet-resources__ships">
              {SHIPS.map((ship) => {
                const resources = resourcesForShip(ship.id, session.shipResources);
                const population = populationForShip(ship.id, session.shipSurvivors);
                const populationTrack = populationTrackForShip(ship.id);
                const populationTarget: CounterTarget = { counter: 'population', shipId: ship.id };
                const populationCounter = population === undefined
                  ? undefined
                  : stagedCounterPreview(populationTarget, population);
                const visiblePopulation = populationCounter?.preview.amount ?? population ?? 0;
                const populationBlocked = Boolean(session.populationAlerts?.[ship.id]) ||
                  Boolean(thresholdHolds[counterKey(populationTarget)]) ||
                  populationCounter?.preview.alertRaised === true ||
                  populationCounter?.staged?.sending === true;
                const unrestAmount = session.shipUnrest?.[ship.id] ?? 0;
                const unrestTarget: CounterTarget = { counter: 'unrest', shipId: ship.id };
                const unrestCounter = stagedCounterPreview(unrestTarget, unrestAmount);
                const visibleUnrest = unrestCounter.preview.amount;
                const unrestBlocked = Boolean(session.unrestAlerts?.[ship.id]) ||
                  Boolean(thresholdHolds[counterKey(unrestTarget)]) ||
                  unrestCounter.preview.alertRaised || unrestCounter.staged?.sending === true;
                if (!resources) return null;
                return (
                  <section
                    className="gm-fleet-resource-ship"
                    role="group"
                    aria-label={`${ship.name} resource controls`}
                    key={ship.id}
                  >
                    <header className="gm-fleet-resource-ship__header">
                      <img src={ship.flag} alt={`${ship.name} flag`} />
                      <h3>{ship.name}</h3>
                    </header>
                    <h4 className="gm-fleet-resource-ship__category">Resource stores</h4>
                    <ul>
                      {RESOURCE_DEFINITIONS.map((resource) => {
                        const amount = resources[resource.id];
                        const target: CounterTarget = {
                          counter: 'resource', shipId: ship.id, resourceId: resource.id,
                        };
                        const counter = stagedCounterPreview(target, amount ?? 0);
                        const visibleAmount = counter.preview.amount;
                        return amount === undefined ? null : (
                          <li
                            key={resource.id}
                            aria-label={`${resource.label}: ${visibleAmount}${counter.staged ? ', pending transmission' : ''}`}
                          >
                            <span className="resource-label">
                              <ResourceIcon id={resource.id} label={resource.label} />
                              <span>{resource.label}</span>
                            </span>
                            <div className="ship-counter__controls" aria-busy={Boolean(counter.staged)}>
                              <button
                                type="button"
                                aria-label={`Decrease ${resource.label}`}
                                disabled={!shipNumberWrite || counter.staged?.sending === true || visibleAmount === 0}
                                onClick={() => stageCounterChange(target, amount, -1)}
                              >−</button>
                              <strong>{visibleAmount}</strong>
                              <button
                                type="button"
                                aria-label={`Increase ${resource.label}`}
                                disabled={!shipNumberWrite || counter.staged?.sending === true}
                                onClick={() => stageCounterChange(target, amount, 1)}
                              >+</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <h4 className="gm-fleet-resource-ship__category">Census</h4>
                    <ul>
                      {population !== undefined && (
                        <li
                          aria-label={`Survivor Population: ${visiblePopulation}${populationCounter?.staged ? ', pending transmission' : ''}`}
                        >
                          <span className="resource-label">Survivor Population</span>
                          <div className="ship-counter__controls" aria-busy={Boolean(populationCounter?.staged)}>
                            <button type="button" aria-label="Decrease Survivor Population"
                              disabled={!shipNumberWrite || !populationTrack || visiblePopulation === 0 || populationBlocked}
                              onClick={() => stageCounterChange(populationTarget, population, -1)}>−</button>
                            <strong>{visiblePopulation.toLocaleString('en-US')}</strong>
                            <button type="button" aria-label="Increase Survivor Population"
                              disabled={!shipNumberWrite || !populationTrack || visiblePopulation === populationTrack.steps[0] || populationBlocked}
                              onClick={() => stageCounterChange(populationTarget, population, 1)}>+</button>
                          </div>
                        </li>
                      )}
                      <li aria-label={`Civil Unrest: ${visibleUnrest}${unrestCounter.staged ? ', pending transmission' : ''}`}>
                        <span className="resource-label">
                          <ResourceIcon id="unrest" label="Civil Unrest" />
                          <span>Civil Unrest</span>
                        </span>
                        <div className="ship-counter__controls" aria-busy={Boolean(unrestCounter.staged)}>
                          <button
                            type="button"
                            aria-label="Decrease Civil Unrest"
                            disabled={!shipNumberWrite || visibleUnrest === 0 || unrestBlocked}
                            onClick={() => stageCounterChange(unrestTarget, unrestAmount, -1)}
                          >−</button>
                          <strong>{visibleUnrest}</strong>
                          <button
                            type="button"
                            aria-label="Increase Civil Unrest"
                            disabled={!shipNumberWrite || visibleUnrest === 10 || unrestBlocked}
                            onClick={() => stageCounterChange(unrestTarget, unrestAmount, 1)}
                          >+</button>
                        </div>
                      </li>
                    </ul>
                  </section>
                );
              })}
            </div>
          </section>

          <section className="gm-console__module cic-frame" aria-label="Setup">
            <button
              className="gm-controls-lock"
              type="button"
              aria-expanded={setupOpen}
              onClick={() => setSetupOpen((open) => !open)}
            >
              Setup
            </button>
            {setupOpen && (
              <div className="gm-setup" aria-label="Setup controls">
                <button
                  className="gm-dradis__availability"
                  type="button"
                  aria-label={`Turn Capybara ${capybaraEnabled ? 'off' : 'on'}`}
                  aria-pressed={capybaraEnabled}
                  disabled={changingCapybara || capybaraQueued}
                  onClick={() => setPendingCapybaraEnabled(!capybaraEnabled)}
                >
                  Capybara // {capybaraQueued ? 'Change queued' : capybaraEnabled ? 'In convoy' : 'Offline'}
                </button>
                <button
                  className="gm-dradis__availability"
                  type="button"
                  aria-label={`Turn Dione ${dioneEnabled ? 'off' : 'on'}`}
                  aria-pressed={dioneEnabled}
                  disabled={changingDione || dioneQueued}
                  onClick={() => setPendingDioneEnabled(!dioneEnabled)}
                >
                  Dione // {dioneQueued ? 'Change queued' : dioneEnabled ? 'In convoy' : 'Offline'}
                </button>
                <fieldset className="gm-role-setup">
                  <legend>Active roles</legend>
                  <label className="gm-role-preset">
                    <span>Recommended player count</span>
                    <select
                      aria-label="Recommended player count"
                      value={draftRecommendedPlayerCount?.toString() ?? 'custom'}
                      disabled={confirmingRoster || rosterQueued}
                      onChange={(event) => chooseRecommendedRoster(Number(event.target.value))}
                    >
                      <option value="custom" disabled>Custom roster</option>
                      {Array.from(
                        { length: MAX_PLAYER_PRESET - MIN_PLAYER_PRESET + 1 },
                        (_, offset) => MIN_PLAYER_PRESET + offset,
                      ).map((playerCount) => (
                        <option value={playerCount} key={playerCount}>{playerCount} players</option>
                      ))}
                    </select>
                    <output>{draftRoleIds.length} roles staged</output>
                  </label>
                  <p className="gm-role-template-status" aria-live="polite">
                    {draftRecommendedPlayerCount === undefined ? 'Custom' : 'Recommended'}
                  </p>
                  <p className="gm-role-setup__note">
                    Edit the roster locally, then confirm it once. Nothing is sent while you are choosing roles.
                  </p>
                  <p className="gm-role-setup__note">
                    Union replacements are available only in their printed low-count roster rows, after both
                    paired Engineer roles are disabled.
                  </p>
                  <div className="gm-roster-draft" aria-live="polite">
                    <p>
                      {confirmingRoster
                        ? 'Confirming roster…'
                        : rosterQueued
                          ? 'Roster command queued // awaiting server'
                          : hasUnconfirmedRosterChanges
                            ? `Unconfirmed changes // ${draftRoleIds.length} roles staged`
                            : `Roster synchronized // ${normalizedServerRoleIds.length} roles active`}
                    </p>
                    {!rosterConfigurationValid && (
                      <p role="alert">Roster must use valid Union replacement pairs before confirmation.</p>
                    )}
                    <button
                      className="cic-action-button"
                      type="button"
                      disabled={
                        !hasUnconfirmedRosterChanges || !rosterConfigurationValid ||
                        confirmingRoster || rosterQueued
                      }
                      onClick={() => void confirmRoster()}
                    >
                      {confirmingRoster ? 'Confirming roster…' : 'Confirm roster'}
                    </button>
                  </div>
                  <ShipRoleGroups
                    roles={CONSOLE_ROLES.filter((role) => !isJointEngineeringRoleId(role.id))}
                    renderRole={(role) => {
                      const enabled = draftRoleIds.includes(role.id);
                      return (
                        <label className="gm-wolf-role" key={role.id}>
                          <span>{role.name}</span>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`${role.name} role availability`}
                            checked={enabled}
                            disabled={confirmingRoster || rosterQueued}
                            onChange={() => toggleDraftRole(role.id, !enabled)}
                          />
                        </label>
                      );
                    }}
                  />
                  {conditionalUnionRoles.length > 0 && (
                    <section className="gm-role-group gm-role-group--independent" aria-label="Conditional Union replacements">
                      <header className="gm-role-group__header"><span>Conditional Union replacements</span></header>
                      <div className="gm-role-group__roles">
                        {conditionalUnionRoles.map((role) => {
                          const enabled = draftRoleIds.includes(role.id);
                          return (
                            <label className="gm-wolf-role gm-union-role" key={role.id}>
                              <span>
                                {role.name.replace(/ Engineer$/, '')}
                                <span className="gm-union-role__station"> // Engineer</span>
                              </span>
                              <input
                                type="checkbox"
                                role="switch"
                                aria-label={`${role.name} role availability`}
                                checked={enabled}
                                disabled={confirmingRoster || rosterQueued}
                                onChange={() => toggleDraftRole(role.id, !enabled)}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  <p className="gm-role-setup__note">
                    Wobbly and Ally are available only with their confirmed Union replacement station.
                  </p>
                </fieldset>
                <fieldset className="gm-wolf-setup">
                  <legend>Wolf assignment</legend>
                  {wolvesLockedByRoster && (
                    <p className="gm-role-setup__note" role="status">
                      Confirm the roster before assigning wolves.
                    </p>
                  )}
                  <div className="gm-wolf-actions" aria-label="Random wolf assignment">
                    <button
                      className="gm-controls-lock"
                      type="button"
                      disabled={
                        assignedWolfRoleIds.length > 0 || assigningWolves ||
                        activeRoleIds.length < 1 || wolvesLockedByRoster
                      }
                      onClick={() => void randomizeWolves(1)}
                    >
                      {assigningWolves ? 'Assigning wolves…' : 'Randomly assign 1 wolf'}
                    </button>
                    <button
                      className="gm-controls-lock"
                      type="button"
                      disabled={
                        assignedWolfRoleIds.length > 0 || assigningWolves ||
                        activeRoleIds.length < 2 || wolvesLockedByRoster
                      }
                      onClick={() => void randomizeWolves(2)}
                    >
                      {assigningWolves ? 'Assigning wolves…' : 'Randomly assign 2 wolves'}
                    </button>
                  </div>
                  <fieldset className="gm-wolf-manual">
                    <legend>Manual wolf assignment</legend>
                    <ShipRoleGroups
                      roles={CONSOLE_ROLES.filter((role) => normalizedServerRoleIds.includes(role.id))}
                      renderRole={(role) => (
                      <label className="gm-wolf-role" key={role.id}>
                        <span>{role.name}</span>
                        <input
                          type="checkbox"
                          aria-label={`${role.name} manual wolf assignment`}
                          checked={(assignedWolfRoleIds.length > 0
                            ? assignedWolfRoleIds
                            : manualWolfRoleIds).includes(role.id)}
                          disabled={assignedWolfRoleIds.length > 0 || assigningWolves || wolvesLockedByRoster ||
                            (!manualWolfRoleIds.includes(role.id) && manualWolfRoleIds.length === 2)}
                          onChange={() => setManualWolfRoleIds((selected) =>
                            selected.includes(role.id)
                              ? selected.filter((id) => id !== role.id)
                              : [...selected, role.id])}
                        />
                      </label>
                      )}
                    />
                    <button
                      className="gm-controls-lock"
                      type="button"
                      disabled={
                        assignedWolfRoleIds.length > 0 || assigningWolves || wolvesLockedByRoster ||
                        manualWolfRoleIds.length === 0
                      }
                      onClick={() => void assignSelectedWolves()}
                    >
                      {assigningWolves ? 'Assigning wolves…' : 'Assign selected wolves'}
                    </button>
                  </fieldset>
                  {assignedWolfRoleIds.length > 0 && (
                    <>
                      <p className="gm-wolf-result" role="status">
                        Assigned // {assignedWolfRoleIds.map((roleId) =>
                          CONSOLE_ROLES.find((role) => role.id === roleId)?.name ?? roleId).join(', ')}
                      </p>
                      <button
                        className="gm-controls-lock"
                        type="button"
                        disabled={assigningWolves}
                        onClick={() => void resetWolfAssignment()}
                      >
                        {assigningWolves ? 'Resetting wolves…' : 'Reset wolves'}
                      </button>
                    </>
                  )}
                </fieldset>
              </div>
            )}
          </section>

          <section
            className="gm-console__module cic-frame"
            aria-label="Connected players by role"
          >
            <h2 className="gm-console__section-title">Connected players</h2>
            <p className="gm-player-roster__count">
              Live manifest // {connectedPlayers.length} connected
            </p>
            {connectedPlayerGroups.length === 0 ? (
              <p className="gm-console__status">No connected players.</p>
            ) : (
              <ul className="gm-player-roster">
                {connectedPlayerGroups.map((group) => (
                  <li className="gm-player-roster__group" key={group.id}>
                    <div className="gm-player-roster__role">
                      <strong>{group.label}</strong>
                      <span>{group.players.length}</span>
                    </div>
                    <ul aria-label={`${group.label} players`}>
                      {group.players.map((player) => (
                        <li key={player.uid}>{normalizeDisplayName(player.displayName)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="gm-console__module cic-frame" aria-label="GM instances">
            <h2 className="gm-console__section-title">GM instances</h2>
            <button
              className="gm-controls-lock"
              type="button"
              aria-label={`${controlsLocked ? 'Unlock' : 'Lock'} GM registration`}
              aria-pressed={controlsLocked}
              disabled={changingLock || lockQueued}
              onClick={() => void toggleLock()}
            >
              <span aria-hidden="true">{controlsLocked ? '🔒' : '🔓'}</span>
              GM registration // {lockQueued ? 'Change queued' : controlsLocked ? 'Locked' : 'Unlocked'}
            </button>
            {loading ? <p className="gm-console__status">Receiving instance manifest…</p> : (
              <ul className="gm-instance-list">
                {instances.map((instance) => {
                  const own = instance.id === local.id;
                  return (
                    <li className="gm-instance cic-frame" key={instance.id}>
                      <div>
                        <strong>{instance.name}</strong>
                        <span>{instance.deviceLabel}</span>
                        {own && <span>THIS DEVICE</span>}
                      </div>
                      {!own && (
                        <button
                          type="button"
                          disabled={queuedKicks.has(instance.id)}
                          onClick={() => void kick(instance)}
                        >
                          {queuedKicks.has(instance.id) ? `Kick queued: ${instance.name}` : `Kick ${instance.name}`}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="gm-console__module gm-console__module--event-log cic-frame">
            <h2 className="gm-console__section-title">Event log</h2>
            {overdueMaintenance.length > 0 && (
              <div className="gm-event-alert gm-event-alert--critical" role="alert" aria-label="Overdue maintenance">
                {overdueMaintenance.map((cycle) => (
                  <p key={cycle.shipId}>
                    {cycle.shipName} // Maintenance incomplete for {cycle.minutes} minutes
                  </p>
                ))}
              </div>
            )}
            {latestAlert?.type === 'fullscreen-alert' && (
              <div className="gm-event-alert gm-event-alert--critical" role="alert">
                {latestAlert.sourceRoleName} // {latestAlert.message}
              </div>
            )}
            <ul className="gm-event-log" aria-label="GM event log">
              {events.length === 0 && damageDraws.length === 0
                ? <li>No logged events.</li>
                : <>
                  {damageDraws.map((draw) => {
                    const shipName = SHIPS.find((ship) => ship.id === draw.shipId)?.name ?? draw.shipId;
                    return <li key={`damage-${draw.id}`}>
                      <time dateTime={draw.createdAt}>{new Date(draw.createdAt).toLocaleTimeString()}</time>
                      <span>{shipName} // {draw.type === 'ship-destroyed'
                        ? 'Destroyed'
                        : <>Damage draw // <span
                          className="gm-damage-draw__secret"
                          tabIndex={0}
                          aria-label={`Concealed damage draw: ${draw.card}, ${draw.systemName}. Focus or hover to reveal.`}
                        >{draw.card} // {draw.systemName}{draw.recycled ? ' // recycled' : ''}</span></>}</span>
                    </li>;
                  })}
                  {events.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString()}</time>
                  <span>{event.type === 'fullscreen-alert'
                    ? `${event.sourceRoleName} // FULLSCREEN ALERT // ${event.message}`
                    : event.type === 'maintenance'
                      ? `${event.shipName} // Maintenance cycle ${event.action === 'begin' ? 'started' : 'completed'}`
                      : `${event.shipName} // Emergency Bridge Confetti Dispenser // ${event.actorRoleName} // ${event.actorName}`}</span>
                </li>
                  ))}
                </>}
            </ul>
          </section>
        </div>
        </RoleConsoleTemplate>
      </section>
      <aside className="gm-console__instruments" aria-label="GM instruments">
          <section
            ref={dradisRef}
            className="gm-console__module gm-dradis"
            aria-label="Fleet DRADIS"
            data-expanded={String(dradisExpanded)}
          >
            <div className="gm-dradis__viewport dradis-outline">
              <ContactPlot
                key={`${viewer?.id ?? 'aegis'}-${String(capybaraEnabled)}-${String(dioneEnabled)}`}
                placement="inset"
                size={dradisExpanded ? 'min(92vmin, 128vw)' : 'min(92cqi, 92cqb)'}
                contacts={contacts}
                ambientSession={session}
                centerLabel={viewer?.name.toUpperCase() ?? 'AEGIS'}
              />
              <DradisAirspaceTimer phase={currentPhase} />
              <span className="gm-dradis__label dradis-label" aria-hidden="true">
                DRADIS // FLEET PLOT
              </span>
              {dradisExpanded ? <DradisRangeBands className="gm-dradis__range-bands" /> : null}
              <button
                className="gm-dradis__toggle"
                type="button"
                aria-label={`${dradisExpanded ? 'Collapse' : 'Expand'} DRADIS display`}
                aria-pressed={dradisExpanded}
                onClick={toggleDradis}
              />
            </div>
            <div className="gm-dradis__controls">
              <DradisEffectControls expanded={dradisExpanded} />
              <p className="gm-dradis__perspective">
                DRADIS perspective // {viewer?.name ?? 'AEGIS'} // GALACTIC COORDINATES // {viewerCoordinate}
              </p>
              <div className="gm-dradis__ships" aria-label="DRADIS perspectives">
                {availableShips.map((ship) => (
                  <button
                    type="button"
                    key={ship.id}
                    aria-label={`View DRADIS from ${ship.name}`}
                    aria-pressed={ship.id === viewer?.id}
                    onClick={() => setViewerId(ship.id)}
                  >
                    {ship.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

      </aside>
      {pendingCapybaraEnabled !== null && (
        <div
          className="settings-backdrop"
          onMouseDown={() => setPendingCapybaraEnabled(null)}
        >
          <section
            className="settings-dialog cic-frame"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="convoy-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-dialog__header">
              <h2 id="convoy-confirm-title">Change convoy manifest</h2>
            </div>
            <p>
              {pendingCapybaraEnabled
                ? 'Add Capybara back to the convoy and every DRADIS view?'
                : 'Remove Capybara from the convoy and every DRADIS view?'}
            </p>
            <button
              className="cic-text-button"
              type="button"
              autoFocus
              onClick={() => setPendingCapybaraEnabled(null)}
            >
              Cancel convoy change
            </button>
            <button
              className="settings-dialog__disconnect"
              type="button"
              disabled={changingCapybara}
              onClick={() => void changeCapybara(pendingCapybaraEnabled)}
            >
              Confirm {pendingCapybaraEnabled ? 'add' : 'remove'} Capybara
            </button>
          </section>
        </div>
      )}
      {pendingDioneEnabled !== null && (
        <div
          className="settings-backdrop"
          onMouseDown={() => setPendingDioneEnabled(null)}
        >
          <section
            className="settings-dialog cic-frame"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dione-convoy-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-dialog__header">
              <h2 id="dione-convoy-confirm-title">Change convoy manifest</h2>
            </div>
            <p>
              {pendingDioneEnabled
                ? 'Add Dione back to the convoy and every DRADIS view?'
                : 'Remove Dione from the convoy and every DRADIS view?'}
            </p>
            <button
              className="cic-text-button"
              type="button"
              autoFocus
              onClick={() => setPendingDioneEnabled(null)}
            >
              Cancel convoy change
            </button>
            <button
              className="settings-dialog__disconnect"
              type="button"
              disabled={changingDione}
              onClick={() => void changeDione(pendingDioneEnabled)}
            >
              Confirm {pendingDioneEnabled ? 'add' : 'remove'} Dione
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
