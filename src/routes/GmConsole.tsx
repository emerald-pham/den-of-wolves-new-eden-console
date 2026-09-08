import { populationForShip, populationTrackForShip } from '@/data/shipPopulation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ContactPlot from '@/components/ContactPlot';
import DradisEffectControls from '@/components/DradisEffectControls';
import EmergencyTimerPauseControl from '@/components/EmergencyTimerPauseControl';
import { DradisAirspaceTimer } from '@/components/TurnPhaseTimer';
import GmStarmapModule from '@/components/GmStarmapModule';
import PursuitTracker from '@/components/PursuitTracker';
import RoleConsoleTemplate from '@/components/RoleConsoleTemplate';
import ResourceIcon from '@/components/ResourceIcon';
import { DRADIS_RESIZE_MS } from '@/components/dradisMotion';
import { normalizeDisplayName } from '@/lib/displayName';
import { fleetOriginFor, fleetViewFrom } from '@/data/fleetFormation';
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
  kickPlayer,
  confirmSetup,
  setDebriefMode,
  setPressEnabled,
  setGmControlsLocked,
  setFacilitatorResponsibility,
  applyShipCounterSteps,
  advanceTurn,
  extendAirspaceWindow,
  replayTurnStartAnnouncement,
  type ShipCounterBatchResult,
  type TurnStartReplayAudience,
} from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { useMotionPreference } from '@/lib/motionPreference';
import { hasActiveTurnTimer, phaseForSession, turnPhaseReadout } from '@/lib/turnPhase';
import {
  resetSessionWaiver,
  SESSION_WAIVER_RESET_EVENT,
} from '@/lib/sessionWaiver';
import {
  COUNTER_COMMAND_COALESCE_MS,
  previewPopulationChange,
  previewResourceChange,
  previewUnrestChange,
  type CounterPreview,
  type CounterStep,
} from '@/lib/counterPreview';
import type { AirspaceWindow, DamageDraw, GameSession, GmInstance, Player, SessionEvent } from '@/types/game';

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
  return roleIds.filter((roleId) => roleId !== 'press-officer' && KNOWN_CONSOLE_ROLE_IDS.has(roleId));
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
  const activeRoleIds = useMemo(
    () => (session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS)
      .filter((roleId) => roleId !== 'press-officer'),
    [session?.activeRoleIds],
  );
  const serverRoleIds = knownRoleIds(activeRoleIds);
  const normalizedServerRoleIds = normalizeRoleDraft(serverRoleIds);
  const me = useSessionStore((state) => state.me);
  const local = useSessionStore((state) => state.gmInstance);
  const isGm = useSessionStore(selectIsGm);
  const pendingCommands = useSessionStore((state) => state.pendingCommands);
  const connection = useSessionStore((state) => state.connection);
  const queuedKicks = new Set(
    pendingCommands.flatMap((command) =>
      command.kind === 'kickGmInstance' ? [command.payload.targetInstanceId] : []),
  );
  const queuedPlayerKicks = new Set(
    pendingCommands.flatMap((command) =>
      command.kind === 'kickPlayer' ? [command.payload.targetUid] : []),
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
  const [draftCapybaraEnabled, setDraftCapybaraEnabled] = useState(
    () => session?.capybaraEnabled !== false,
  );
  const [changingDione, setChangingDione] = useState(false);
  const [pendingDioneEnabled, setPendingDioneEnabled] = useState<boolean | null>(null);
  const [draftDioneEnabled, setDraftDioneEnabled] = useState(
    () => session?.dioneEnabled !== false,
  );
  const [changingPress, setChangingPress] = useState(false);
  const [pendingPressEnabled, setPendingPressEnabled] = useState<boolean | null>(null);
  const [pressMutationState, setPressMutationState] = useState<
    'idle' | 'pending' | 'stale' | 'rejected' | 'committed'
  >('idle');
  const [pressMutationMessage, setPressMutationMessage] = useState<string | null>(null);
  const pressTriggerRef = useRef<HTMLButtonElement>(null);
  const pressDialogRef = useRef<HTMLElement>(null);
  const restorePressTriggerFocus = useRef(false);
  const [changingLock, setChangingLock] = useState(false);
  const [advancingTurn, setAdvancingTurn] = useState(false);
  const [skippingTurn, setSkippingTurn] = useState(false);
  const [confirmTurnAdvance, setConfirmTurnAdvance] = useState(false);
  const [confirmTurnOverride, setConfirmTurnOverride] = useState(false);
  const [confirmTurnSkip, setConfirmTurnSkip] = useState(false);
  const [confirmAirspaceExtension, setConfirmAirspaceExtension] = useState<AirspaceWindow | null>(null);
  const [extendingAirspace, setExtendingAirspace] = useState<AirspaceWindow | null>(null);
  const [replayingTurnAnnouncement, setReplayingTurnAnnouncement] =
    useState<TurnStartReplayAudience | null>(null);
  const [changingDebrief, setChangingDebrief] = useState(false);
  const [confirmFinale, setConfirmFinale] = useState(false);
  const [assigningWolves, setAssigningWolves] = useState(false);
  const [manualWolfRoleIds, setManualWolfRoleIds] = useState<readonly string[]>([]);
  const [assignedWolfRoleIds, setAssignedWolfRoleIds] = useState<readonly string[]>([]);
  const [draftRoleIds, setDraftRoleIds] = useState<readonly string[]>(() => normalizedServerRoleIds);
  const [confirmingRoster, setConfirmingRoster] = useState(false);
  const previousServerRoleIds = useRef<readonly string[]>(serverRoleIds);
  const serverCapybaraEnabled = session?.capybaraEnabled !== false;
  const serverDioneEnabled = session?.dioneEnabled !== false;
  const capybaraEnabled = draftCapybaraEnabled;
  const dioneEnabled = draftDioneEnabled;
  const setupQueued = pendingCommands.some(
    (command) => command.kind === 'confirmSetup',
  );
  // The convoy controls stage into the same atomic setup command now. Keep
  // their existing queued presentation while that command is in flight.
  const capybaraQueued = setupQueued;
  const dioneQueued = setupQueued;
  const pressEnabled = session?.pressEnabled !== false;
  const pressQueued = pendingCommands.some(
    (command) => command.kind === 'setPressEnabled',
  );
  const pressProjectionMessage = instances.length > 1
    ? `Shared Press projection // ${instances.length} active GM instances`
    : 'Shared Press projection // one active GM is sufficient; additional GMs are optional';
  const controlsLocked = session?.gmControlsLocked === true;
  const debriefMode = session?.debriefMode ?? { active: false, revision: 0 };
  const currentTurn = session?.currentTurn ?? 1;
  const canReplayTurnAnnouncement = Boolean(
    session?.turnStartAnnouncement && session.turnStartAnnouncement.turn === currentTurn && currentTurn >= 1,
  );
  const changingTurn = advancingTurn || skippingTurn;
  const currentPhase = phaseForSession(session);
  const phaseReadout = turnPhaseReadout(currentPhase, clock);
  const activeAirspaceWindow: AirspaceWindow | null = !currentPhase?.timerPause && phaseReadout?.kind === 'team' &&
    currentPhase?.airspace.state === 'restricted'
    ? 'restricted'
    : !currentPhase?.timerPause && phaseReadout?.kind === 'open' && currentPhase?.airspace.state === 'lifted'
      ? 'open'
      : null;
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
  const rosterQueued = setupQueued;
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
  const viewerOrigin = fleetOriginFor(viewer?.id ?? 'aegis');
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
    setDraftCapybaraEnabled(serverCapybaraEnabled);
  }, [serverCapybaraEnabled]);

  useEffect(() => {
    setDraftDioneEnabled(serverDioneEnabled);
  }, [serverDioneEnabled]);

  useEffect(() => {
    if (pendingPressEnabled === null) {
      if (restorePressTriggerFocus.current) {
        restorePressTriggerFocus.current = false;
        pressTriggerRef.current?.focus();
      }
      return;
    }
    const dialog = pressDialogRef.current;
    if (!dialog) return;
    const focusableElements = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    )];
    const focusFirst = () => {
      const first = focusableElements()[0];
      if (first) first.focus();
      else dialog.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) focusFirst();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restorePressTriggerFocus.current = true;
        setPendingPressEnabled(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    focusFirst();
    document.addEventListener('focusin', onFocusIn);
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      dialog.removeEventListener('keydown', onKeyDown);
    };
  }, [pendingPressEnabled]);

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
    setConfirmTurnAdvance(false);
    setConfirmTurnOverride(false);
    setConfirmTurnSkip(false);
    setConfirmAirspaceExtension(null);
  }, [activeAirspaceWindow, currentTurn]);

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

  async function changeFacilitatorResponsibility(
    responsibility: 'main' | 'assistant',
    mode: 'share' | 'handoff' | 'drop',
    targetInstanceId?: string,
  ): Promise<void> {
    try {
      await setFacilitatorResponsibility({
        responsibility,
        mode,
        ...(targetInstanceId ? { targetInstanceId } : {}),
      });
    } catch {
      // The shared interception notice reports the server rejection.
    }
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

  async function kickPlayerFromRoster(player: Player): Promise<void> {
    try {
      const disposition = await kickPlayer(player.uid);
      if (disposition !== 'queued') {
        setConnectedPlayers((current) => current.filter((item) => item.uid !== player.uid));
      }
    } catch {
      // The shared interception notice reports the server rejection.
    }
  }

  async function changeCapybara(enabled: boolean): Promise<void> {
    setChangingCapybara(true);
    try {
      // Capybara is part of the authoritative setup tuple. Stage the local
      // choice here; only Confirm setup can send it with the revisioned CAS.
      setDraftCapybaraEnabled(enabled);
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
      // Dione is part of the authoritative setup tuple. Stage the local
      // choice here; only Confirm setup can send it with the revisioned CAS.
      setDraftDioneEnabled(enabled);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingDione(false);
      setPendingDioneEnabled(null);
    }
  }

  async function changePress(enabled: boolean): Promise<void> {
    setChangingPress(true);
    setPressMutationState('pending');
    setPressMutationMessage(null);
    try {
      const disposition = await setPressEnabled(enabled);
      const committed = disposition === 'applied';
      setPressMutationState(committed ? 'committed' : 'pending');
      setPressMutationMessage(
        !committed
          ? 'Press availability pending // queued for reconnection.'
          : 'Press availability committed by the server.',
      );
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause &&
        typeof cause.code === 'string' ? cause.code : '';
      setPressMutationState(code.includes('failed-precondition') ? 'stale' : 'rejected');
      setPressMutationMessage(
        code.includes('failed-precondition')
          ? 'Press availability stale // a newer GM revision committed; review the live state and retry.'
          : 'Press availability rejected // the server did not commit this change.',
      );
    } finally {
      setChangingPress(false);
      restorePressTriggerFocus.current = true;
      setPendingPressEnabled(null);
    }
  }

  function openPressDialog(): void {
    setPressMutationState('idle');
    setPressMutationMessage(null);
    setPendingPressEnabled(!pressEnabled);
  }

  function closePressDialog(): void {
    restorePressTriggerFocus.current = true;
    setPendingPressEnabled(null);
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

  async function moveToNextTurn(
    overridePhaseTimer = false,
    skipTurnStartAnnouncement = false,
  ): Promise<void> {
    setConfirmTurnAdvance(false);
    setConfirmTurnOverride(false);
    setConfirmTurnSkip(false);
    setAdvancingTurn(!skipTurnStartAnnouncement);
    setSkippingTurn(skipTurnStartAnnouncement);
    try {
      if (overridePhaseTimer || skipTurnStartAnnouncement) {
        await advanceTurn({
          ...(overridePhaseTimer ? { overridePhaseTimer: true } : {}),
          ...(skipTurnStartAnnouncement ? { skipTurnStartAnnouncement: true } : {}),
        });
      } else {
        await advanceTurn();
      }
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAdvancingTurn(false);
      setSkippingTurn(false);
    }
  }

  function requestTurnAdvance(): void {
    if (currentTurn === 0 && !confirmTurnAdvance) {
      setConfirmTurnAdvance(true);
      return;
    }
    if (activeTurnTimer && !confirmTurnOverride) {
      setConfirmTurnOverride(true);
      return;
    }
    const override = activeTurnTimer && confirmTurnOverride;
    setConfirmTurnOverride(false);
    void moveToNextTurn(override);
  }

  function requestTurnSkip(): void {
    if (!confirmTurnSkip) {
      setConfirmTurnSkip(true);
      return;
    }
    void moveToNextTurn(false, true);
  }

  async function requestAirspaceExtension(window: AirspaceWindow): Promise<void> {
    if (activeAirspaceWindow !== window || extendingAirspace !== null) return;
    if (confirmAirspaceExtension !== window) {
      setConfirmAirspaceExtension(window);
      return;
    }
    setConfirmAirspaceExtension(null);
    setExtendingAirspace(window);
    try {
      await extendAirspaceWindow(window);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setExtendingAirspace(null);
    }
  }

  function airspaceWindowLabel(window: AirspaceWindow): string {
    return window === 'restricted' ? 'Airspace restricted' : 'Airspace open';
  }

  async function replayTurnAnnouncement(audience: TurnStartReplayAudience): Promise<void> {
    setReplayingTurnAnnouncement(audience);
    try {
      await replayTurnStartAnnouncement(audience);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setReplayingTurnAnnouncement(null);
    }
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

  function resetChecklist(): void {
    resetSessionWaiver();
    window.dispatchEvent(new Event(SESSION_WAIVER_RESET_EVENT));
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
    if (!rosterConfigurationValid) return;
    const activeSession = session;
    if (!activeSession) return;
    setConfirmingRoster(true);
    try {
      await confirmSetup({
        playerCount: activeSession.playerCount ?? draftRecommendedPlayerCount ?? draftRoleIds.length,
        chartId: activeSession.setup?.chartId ?? activeSession.chartId ?? 'A',
        expansion: activeSession.setup?.expansion ?? activeSession.expansion ??
          (draftCapybaraEnabled ? 'capybara' : 'base'),
        turnLimit: activeSession.setup?.turnLimit ?? activeSession.turnLimit ?? 6,
        dioneEnabled: draftDioneEnabled,
        capybaraEnabled: draftCapybaraEnabled,
        activeRoleIds: draftRoleIds,
      });
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
            <div className="gm-turn-control__actions">
              <button
                className={`cic-action-button${confirmTurnAdvance || (confirmTurnOverride && activeTurnTimer) ? ' cic-action-button--confirm' : ''}`}
                type="button"
                disabled={changingTurn || replayingTurnAnnouncement !== null}
                onClick={requestTurnAdvance}
              >
                {advancingTurn
                  ? `Advancing to Turn ${currentTurn + 1}…`
                  : confirmTurnAdvance || (confirmTurnOverride && activeTurnTimer)
                    ? `ARE YOU SURE? // Advance to Turn ${currentTurn + 1}`
                    : `Advance to Turn ${currentTurn + 1}`}
              </button>
              <button
                className={`cic-action-button${confirmTurnSkip ? ' cic-action-button--confirm' : ''}`}
                type="button"
                disabled={changingTurn || replayingTurnAnnouncement !== null}
                onClick={requestTurnSkip}
              >
                {skippingTurn
                  ? `Skipping to Turn ${currentTurn + 1}…`
                  : confirmTurnSkip
                    ? `ARE YOU SURE? // Skip to Turn ${currentTurn + 1}`
                    : `Skip to Turn ${currentTurn + 1}`}
              </button>
              <button
                className="cic-action-button"
                type="button"
                disabled={
                  !canReplayTurnAnnouncement || changingTurn || replayingTurnAnnouncement !== null
                }
                onClick={() => void replayTurnAnnouncement('gm')}
              >
                {replayingTurnAnnouncement === 'gm'
                  ? 'Replaying transmission // GM only…'
                  : 'Replay last transmission // GM only'}
              </button>
              <button
                className="cic-action-button"
                type="button"
                disabled={
                  !canReplayTurnAnnouncement || changingTurn || replayingTurnAnnouncement !== null
                }
                onClick={() => void replayTurnAnnouncement('everyone')}
              >
                {replayingTurnAnnouncement === 'everyone'
                  ? 'Replaying transmission // Everyone…'
                  : 'Replay last transmission // Everyone'}
              </button>
            </div>
            <section className="gm-turn-control__airspace" aria-label="Airspace time controls">
              <p className="gm-console__status">Airspace extension // +5 minutes</p>
              <div className="gm-turn-control__actions">
                {(['restricted', 'open'] as const).map((window) => {
                  const label = airspaceWindowLabel(window);
                  const confirming = confirmAirspaceExtension === window;
                  return (
                    <button
                      className={`cic-action-button${confirming ? ' cic-action-button--confirm' : ''}`}
                      type="button"
                      key={window}
                      disabled={
                        currentPhase?.timerPause !== undefined ||
                        activeAirspaceWindow !== window ||
                        extendingAirspace !== null ||
                        changingTurn ||
                        replayingTurnAnnouncement !== null
                      }
                      onClick={() => void requestAirspaceExtension(window)}
                    >
                      {extendingAirspace === window
                        ? `Adding 5 minutes // ${label}…`
                        : confirming
                          ? `ARE YOU SURE? // Add 5 minutes // ${label}`
                          : `Add 5 minutes // ${label}`}
                    </button>
                  );
                })}
              </div>
            </section>
          </section>
          <EmergencyTimerPauseControl
            phase={currentPhase}
            connection={connection}
            busy={changingTurn || replayingTurnAnnouncement !== null}
          />
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
              className={`cic-action-button${confirmFinale && !debriefMode.active ? ' cic-action-button--confirm' : ''}`}
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
          <section className="gm-console__module gm-session-access cic-frame" aria-label="Session access controls">
            <h2 className="gm-console__section-title">Session access</h2>
            <p className="gm-console__status">
              Code of Conduct acknowledgement // Browser-local for this device
            </p>
            <p>
              Reset the local checklist to reopen the full Code of Conduct review instrument.
            </p>
            <button
              className="cic-action-button"
              type="button"
              onClick={resetChecklist}
            >
              Reset code of conduct checklist
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
                const shipCoordinate = session.shipGalacticCoordinates?.[ship.id] ??
                  ORIGIN_GALACTIC_COORDINATE;
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
                    <PursuitTracker
                      currentTurn={currentTurn}
                      shipId={ship.id}
                      shipName={ship.name}
                      shipCoordinate={shipCoordinate}
                    />
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
                <button
                  className="gm-dradis__availability"
                  type="button"
                  aria-label={`Turn Press ${pressEnabled ? 'off' : 'on'}`}
                  aria-pressed={pressEnabled}
                  ref={pressTriggerRef}
                  disabled={changingPress || pressQueued}
                  onClick={openPressDialog}
                >
                  Press // {pressQueued ? 'Change queued' : pressEnabled ? 'Available' : 'Offline'}
                </button>
                <p
                  className="gm-role-setup__note"
                  role="status"
                  aria-live="polite"
                  aria-label="Press availability status"
                  aria-busy={pressMutationState === 'pending' && changingPress}
                  data-state={pressMutationState}
                >
                  {pressMutationMessage ?? (pressMutationState === 'pending'
                    ? 'Press availability pending // awaiting server confirmation.'
                    : `Press availability // ${pressEnabled ? 'enabled' : 'disabled'} // revision ${session?.pressAvailabilityRevision ?? 0}`)}
                </p>
                <p className="gm-role-setup__note" role="status" aria-label="Press GM projection">
                  {pressProjectionMessage}
                </p>
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
                      aria-label="Confirm setup // Confirm roster"
                      disabled={
                        !rosterConfigurationValid ||
                        confirmingRoster || rosterQueued
                      }
                      onClick={() => void confirmRoster()}
                    >
                      {confirmingRoster ? 'Confirming setup…' : 'Confirm setup'}
                    </button>
                  </div>
                    <ShipRoleGroups
                      roles={CONSOLE_ROLES.filter((role) =>
                        role.id !== 'press-officer' && !isJointEngineeringRoleId(role.id))}
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
                      roles={CONSOLE_ROLES.filter((role) =>
                        normalizedServerRoleIds.includes(role.id) ||
                        (role.id === 'press-officer' && pressEnabled &&
                          connectedPlayers.some((player) => player.activeConsoleRoleId === 'press-officer')))}
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
            <p className="gm-player-roster__hint">
              Kick removes one browser from this session only; it does not block that network or other sessions.
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
                      {group.players.map((player) => {
                        const name = normalizeDisplayName(player.displayName);
                        const queued = queuedPlayerKicks.has(player.uid);
                        return (
                          <li className="gm-player-roster__player" key={player.uid}>
                            <span>{name}</span>
                            {player.role !== 'gm' && (
                              <button
                                type="button"
                                disabled={queued}
                                onClick={() => void kickPlayerFromRoster(player)}
                              >
                                {queued ? `Kick queued: ${name}` : `Kick ${name}`}
                              </button>
                            )}
                          </li>
                        );
                      })}
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
                  const otherInstance = instances.find((candidate) => candidate.id !== instance.id);
                  const normalizedResponsibilities = instance.responsibilities?.length
                    ? instance.responsibilities
                    : instances.length === 1 && instance.responsibility
                      ? ['main', 'assistant'] as const
                      : instance.responsibility
                        ? [instance.responsibility]
                        : [];
                  return (
                    <li className="gm-instance cic-frame" key={instance.id}>
                      <div>
                        <strong>{instance.name}</strong>
                        <span>{instance.deviceLabel}</span>
                        {own && <span>THIS DEVICE</span>}
                        <div className="gm-responsibility-board" aria-label={`${instance.name} facilitator responsibilities`}>
                          {(['main', 'assistant'] as const).map((responsibility) => {
                            const label = responsibility === 'main'
                              ? 'MAIN FACILITATOR'
                              : 'ASSISTANT FACILITATOR';
                            const held = normalizedResponsibilities.includes(responsibility);
                            return (
                              <div className="gm-responsibility-lane" key={responsibility}>
                                <span className={held ? 'gm-responsibility-lane__held' : undefined}>
                                  {label} // {held ? 'HELD' : 'AVAILABLE'}
                                </span>
                                {own && otherInstance && held && (
                                  <div className="gm-responsibility-actions">
                                    <button
                                      className="cic-action-button"
                                      type="button"
                                      onClick={() => void changeFacilitatorResponsibility(
                                        responsibility, 'share', otherInstance.id,
                                      )}
                                    >
                                      Share {responsibility} facilitator
                                    </button>
                                    <button
                                      className="cic-action-button"
                                      type="button"
                                      onClick={() => void changeFacilitatorResponsibility(
                                        responsibility, 'handoff', otherInstance.id,
                                      )}
                                    >
                                      Hand off {responsibility} facilitator
                                    </button>
                                    <button
                                      className="cic-text-button"
                                      type="button"
                                      onClick={() => void changeFacilitatorResponsibility(
                                        responsibility, 'drop', otherInstance.id,
                                      )}
                                    >
                                      Drop {responsibility} facilitator
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
                      : event.type === 'timer-pause'
                        ? `Emergency timer // ${event.action === 'paused' ? 'paused' : 'resumed'} // Turn ${event.turn} // ${event.window} // ${event.actorName}`
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
                origin={viewerOrigin}
              />
              <DradisAirspaceTimer phase={currentPhase} />
              <span className="gm-dradis__label dradis-label" aria-hidden="true">
                DRADIS // FLEET PLOT
              </span>
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
      {pendingPressEnabled !== null && (
        <div
          className="settings-backdrop"
          onMouseDown={closePressDialog}
        >
          <section
            className="settings-dialog cic-frame"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="press-availability-confirm-title"
            aria-describedby="press-availability-confirm-copy"
            ref={pressDialogRef}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-dialog__header">
              <h2 id="press-availability-confirm-title">Change Press availability</h2>
            </div>
            <p id="press-availability-confirm-copy">
              {pendingPressEnabled
                ? 'Enable Press discovery and the SNN shuttle console?'
                : 'Disable Press discovery and revoke every live SNN shuttle claim?'}
            </p>
            <button
              className="cic-text-button"
              type="button"
              autoFocus
              onClick={closePressDialog}
            >
              Cancel Press change
            </button>
            <button
              className="settings-dialog__disconnect cic-action-button cic-action-button--confirm"
              type="button"
              disabled={changingPress}
              onClick={() => void changePress(pendingPressEnabled)}
            >
              ARE YOU SURE? // {pendingPressEnabled ? 'Enable' : 'Disable'} Press
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
