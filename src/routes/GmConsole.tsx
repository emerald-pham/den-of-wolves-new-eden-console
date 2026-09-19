import DiseaseOutbreakFields from '../components/DiseaseOutbreakFields';
import { populationForShip, populationTrackForShip } from '@/data/shipPopulation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import EmergencyTimerPauseControl from '@/components/EmergencyTimerPauseControl';
import ShipPlot from '@/components/ShipPlot';
import GmStarmapModule from '@/components/GmStarmapModule';
import SmallShipOperations from '@/components/SmallShipOperations';
import PursuitTracker from '@/components/PursuitTracker';
import LiveChangeRegion from '@/components/LiveChangeRegion';
import DecisionAttribution from '@/components/DecisionAttribution';
import RoleConsoleTemplate from '@/components/RoleConsoleTemplate';
import ResourceIcon from '@/components/ResourceIcon';
import { DRADIS_RESIZE_MS } from '@/components/dradisMotion';
import { normalizeDisplayName } from '@/lib/displayName';
import { nextGmClockUpdate } from '@/lib/gmClock';
import { RESOURCE_DEFINITIONS, resourcesForShip, type ResourceId } from '@/data/resources';
import { FIGHTER_WING_IDS } from '@/data/aegisConsoles';
import { SHIPS } from '@/data/ships';
import { ORIGIN_GALACTIC_COORDINATE } from '@/data/ships';
import { activeFleetShipIds, CONSOLE_ROLES, DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
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
  kickGmInstance,
  kickPlayer,
  assignRole,
  releaseRole,
  setReplacementEligibility,
  assignReplacementRole,
  confirmSetup,
  setDebriefMode,
  setPressEnabled,
  setGmControlsLocked,
  setFacilitatorResponsibility,
  setFacilitatorCensusNote,
  deliverWolfCultIntelligence,
  authorUniversalArbourVision,
  authorFacilitatorRuleCall,
  transitionCrisis,
  admitVoyage33,
  recordZealotryResponse,
  recordCivilUnrestResolution,
  applyShipCounterSteps,
  advanceTurn,
  startGame,
  setFighterWingCount,
  extendAirspaceWindow,
  setWolfAttackWindow,
  stageWolfAttackPreparation,
  declareWolfAttack as declareWolfAttackCommand,
  replayTurnStartAnnouncement,
  type ShipCounterBatchResult,
  type TurnStartReplayAudience,
  type CommandDisposition,
} from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { useMotionPreference } from '@/lib/motionPreference';
import { hasActiveTurnTimer, phaseForSession, turnPhaseReadout } from '@/lib/turnPhase';
import { facilitatorQueueFor } from '@/lib/facilitatorQueue';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { normalizeCommandError } from '@/lib/commandErrors';
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
import type {
  AirspaceWindow,
  DamageDraw,
  GameSession,
  GmInstance,
  Player,
  SessionEvent,
  WolfAttackPreparation,
  WolfAttackDeclarationState,
  WolfAttackPreparationModifierId,
  WolfAttackTargetMode,
  WolfAttackWindow,
  WolfAttackWindowStatus,
  WolfAssignment,
  ArbourVision,
  FacilitatorRuleCall,
} from '@/types/game';
import {
  CRISIS_KINDS,
  CRISIS_KIND_LABELS,
  ZEALOTRY_RESPONSE_ACTIONS,
  isCrisisKind,
  nextCrisisStates,
  type CrisisKind,
  type CrisisStateName,
  type ZealotryResponseAction,
} from '@/types/crisis';
import { isWireSafeEntityId } from '@/types/identifiers';
import { REPLACEMENT_ELIGIBILITY_REASONS, REPLACEMENT_ROLE_CATALOG } from '@/data/replacementRoles';

const WOLF_PREPARATION_CARD_TYPES = [
  { id: 'wolf-fighter-wing', label: 'Fighter Wing' },
  { id: 'wolf-assault-transport', label: 'Assault Transport' },
  { id: 'wolf-destroyer', label: 'Destroyer' },
  { id: 'wolf-cruiser', label: 'Cruiser' },
  { id: 'wolf-strikecarrier', label: 'Fleet Strikecarrier' },
  { id: 'wolf-battlestation', label: 'Battlestation' },
] as const;
const WOLF_PREPARATION_MODIFIERS: readonly { id: WolfAttackPreparationModifierId; label: string }[] = [
  { id: 'wolf-commander-target-reroll', label: 'Wolf Commander // targeting reroll' },
  { id: 'aegis-command-and-control', label: 'AEGIS // Command and Control' },
  { id: 'gorgoneion-force-field-projector', label: 'Gorgoneion // Force Field Projector' },
  { id: 'enriched-warheads', label: 'Enriched warheads' },
  { id: 'pallas-boarding-rerolls', label: 'Pallas // boarding rerolls' },
  { id: 'chepu-boarding-support', label: 'Chepu // boarding support' },
  { id: 'engineering-service-shuttle-support', label: 'Engineering/service shuttle support' },
  { id: 'aegis-boarding-rerolls', label: 'AEGIS // boarding rerolls' },
  { id: 'rosal-militia-leader', label: 'Rosal Militia Leader' },
  { id: 'wolf-commander-boarding-lead', label: 'Wolf Commander // boarding lead' },
];

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
  const knownRoleIds = roleIds.filter((roleId) =>
    roleId !== 'press-officer' && KNOWN_CONSOLE_ROLE_IDS.has(roleId));
  const recommendedPlayerCount = recommendedPlayerCountForRoleIds(knownRoleIds);
  if (recommendedPlayerCount !== undefined) return [...recommendedRoleIds(recommendedPlayerCount)];
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
  const setupReceipt = useSessionStore((state) => state.gmSetupReceipt);
  const loyaltyCensus = useSessionStore((state) => state.gmLoyaltyCensus);
  const gmWolfCultIntelligence = useSessionStore((state) => state.gmWolfCultIntelligence);
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
  const [allPlayers, setAllPlayers] = useState<readonly Player[]>([]);
  const [replacementTargetUid, setReplacementTargetUid] = useState('');
  const [replacementReason, setReplacementReason] = useState<typeof REPLACEMENT_ELIGIBILITY_REASONS[number]>('dead');
  const [replacementRoleId, setReplacementRoleId] = useState('wolf-commander');
  const [replacementRevision, setReplacementRevision] = useState(0);
  const [replacementSetupRevision, setReplacementSetupRevision] = useState(0);
  const [replacementMessage, setReplacementMessage] = useState<string | null>(null);
  const [replacementDecisionRecorded, setReplacementDecisionRecorded] = useState(false);
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [castingDraftRoles, setCastingDraftRoles] = useState<Readonly<Record<string, string>>>({});
  const [castingMutationUid, setCastingMutationUid] = useState<string | null>(null);
  const [castingMutationMessage, setCastingMutationMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly SessionEvent[]>([]);
  const [wolfAttackWindow, setWolfAttackWindowState] = useState<WolfAttackWindow | null>(null);
  const [wolfAttackPreparation, setWolfAttackPreparationState] = useState<WolfAttackPreparation | null>(null);
  const [wolfAttackState, setWolfAttackState] = useState<WolfAttackDeclarationState | null>(null);
  const [wolfAssignment, setWolfAssignment] = useState<WolfAssignment | null>(null);
  const [censusNotes, setCensusNotes] = useState<Readonly<Record<string, string>>>({});
  const [censusNoteMutationUid, setCensusNoteMutationUid] = useState<string | null>(null);
  const [wolfCultFortressCoordinate, setWolfCultFortressCoordinate] = useState('');
  const [wolfCultSuppliesCoordinate, setWolfCultSuppliesCoordinate] = useState('');
  const [wolfCultAgentUid, setWolfCultAgentUid] = useState('');
  const [wolfCultCodeWord, setWolfCultCodeWord] = useState('');
  const [wolfCultIntelMutation, setWolfCultIntelMutation] = useState(false);
  const [wolfCultIntelMessage, setWolfCultIntelMessage] = useState<string | null>(null);
  const [arbourVisionTargetUid, setArbourVisionTargetUid] = useState('');
  const [arbourVisionKind, setArbourVisionKind] = useState<ArbourVision['kind']>('location');
  const [arbourVisionText, setArbourVisionText] = useState('');
  const [arbourVisionMutation, setArbourVisionMutation] = useState(false);
  const [arbourVisionMessage, setArbourVisionMessage] = useState<string | null>(null);
  const gmArbourVision = useSessionStore((state) => state.gmArbourVision);
  const [ruleCallAmbiguity, setRuleCallAmbiguity] = useState('');
  const [ruleCallSource, setRuleCallSource] = useState('');
  const [ruleCallDecision, setRuleCallDecision] = useState('');
  const [ruleCallAudience, setRuleCallAudience] = useState<FacilitatorRuleCall['audience']>('gm-only');
  const [ruleCallRecipientUid, setRuleCallRecipientUid] = useState('');
  const [ruleCallSupersedesCallId, setRuleCallSupersedesCallId] = useState('');
  const [ruleCallMutation, setRuleCallMutation] = useState(false);
  const [ruleCallMessage, setRuleCallMessage] = useState<string | null>(null);
  const gmFacilitatorRuleCall = useSessionStore((state) => state.gmFacilitatorRuleCall);
  const gmCrisisState = useSessionStore((state) => state.gmCrisisState);
  const gmZealotryResponse = useSessionStore((state) => state.gmZealotryResponse);
  const gmCivilUnrestResolution = useSessionStore((state) => state.gmCivilUnrestResolution);
  const [crisisIdDraft, setCrisisIdDraft] = useState('crisis-1');
  const [crisisTitleDraft, setCrisisTitleDraft] = useState('');
  const [crisisDetailsDraft, setCrisisDetailsDraft] = useState('');
  const [crisisKindDraft, setCrisisKindDraft] = useState<CrisisKind>('custom');
  const [diseaseShipIds, setDiseaseShipIds] = useState<string[]>([]);
  const [diseaseWork, setDiseaseWork] = useState('');
  const [diseaseRisk, setDiseaseRisk] = useState('');
  const [crisisOverrideDraft, setCrisisOverrideDraft] = useState('');
  const [crisisMutationState, setCrisisMutationState] = useState<CrisisStateName | null>(null);
  const [voyageAdmissionMutation, setVoyageAdmissionMutation] = useState(false);
  const [crisisMessage, setCrisisMessage] = useState<string | null>(null);
  const [zealotryActionsDraft, setZealotryActionsDraft] = useState<ZealotryResponseAction[]>([]);
  const [zealotryCustomDraft, setZealotryCustomDraft] = useState('');
  const [zealotryRationaleDraft, setZealotryRationaleDraft] = useState('');
  const [zealotryMutation, setZealotryMutation] = useState(false);
  const [zealotryMessage, setZealotryMessage] = useState<string | null>(null);
  const [civilUnrestPresidentDraft, setCivilUnrestPresidentDraft] = useState('');
  const [civilUnrestConsequenceDraft, setCivilUnrestConsequenceDraft] = useState('');
  const [civilUnrestRationaleDraft, setCivilUnrestRationaleDraft] = useState('');
  const [civilUnrestMutation, setCivilUnrestMutation] = useState(false);
  const [civilUnrestMessage, setCivilUnrestMessage] = useState<string | null>(null);

  function clearZealotryResponseDraft(): void {
    setZealotryActionsDraft([]);
    setZealotryCustomDraft('');
    setZealotryRationaleDraft('');
  }
  function clearCivilUnrestResolutionDraft(): void {
    setCivilUnrestPresidentDraft('');
    setCivilUnrestConsequenceDraft('');
    setCivilUnrestRationaleDraft('');
  }
  const [wolfWindowMutation, setWolfWindowMutation] = useState<WolfAttackWindowStatus | null>(null);
  const [wolfPreparationMutation, setWolfPreparationMutation] = useState(false);
  const [wolfDeclarationMutation, setWolfDeclarationMutation] = useState(false);
  const [wolfDeclarationMessage, setWolfDeclarationMessage] = useState<string | null>(null);
  const [wolfPreparationMode, setWolfPreparationMode] = useState<WolfAttackTargetMode>('manual');
  const [wolfPreparationCounts, setWolfPreparationCounts] = useState<Readonly<Record<string, string>>>(() => ({
    'wolf-fighter-wing': '10',
    'wolf-assault-transport': '5',
  }));
  const [wolfPreparationTargets, setWolfPreparationTargets] = useState<Readonly<Record<number, string>>>({});
  const [wolfPreparationModifiers, setWolfPreparationModifiers] = useState<Readonly<Record<string, boolean>>>({});
  const [wolfPreparationNotes, setWolfPreparationNotes] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const crisisAuthorityGeneration = useRef(0);
  const verifiedCrisisAuthorityKey = useRef<string | null>(null);
  const [damageDraws, setDamageDraws] = useState<readonly DamageDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipNumberWrite, setShipNumberWrite] = useState(false);
  const [fighterWingDrafts, setFighterWingDrafts] = useState<Readonly<Record<string, string>>>({});
  const [fighterWingMutation, setFighterWingMutation] = useState<string | null>(null);
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
  const capybaraDialogRef = useRef<HTMLElement>(null);
  const capybaraTriggerRef = useRef<HTMLButtonElement>(null);
  const [draftCapybaraEnabled, setDraftCapybaraEnabled] = useState(
    () => session?.capybaraEnabled !== false,
  );
  const [changingDione, setChangingDione] = useState(false);
  const [pendingDioneEnabled, setPendingDioneEnabled] = useState<boolean | null>(null);
  const dioneDialogRef = useRef<HTMLElement>(null);
  const dioneTriggerRef = useRef<HTMLButtonElement>(null);
  const [draftDioneEnabled, setDraftDioneEnabled] = useState(
    () => session?.dioneEnabled !== false,
  );
  const [draftUniversalArbourEnabled, setDraftUniversalArbourEnabled] = useState(
    () => session?.universalArbourEnabled === true,
  );
  const [draftWolfCultEnabled, setDraftWolfCultEnabled] = useState(
    () => session?.wolfCultEnabled === true,
  );
  const [changingPress, setChangingPress] = useState(false);
  const [pendingPressEnabled, setPendingPressEnabled] = useState<boolean | null>(null);
  const [pressMutationState, setPressMutationState] = useState<
    'idle' | 'pending' | 'stale' | 'rejected' | 'committed'
  >('idle');
  const [pressMutationMessage, setPressMutationMessage] = useState<string | null>(null);
  const pressTriggerRef = useRef<HTMLButtonElement>(null);
  const pressDialogRef = useRef<HTMLElement>(null);
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
  const [startingGame, setStartingGame] = useState(false);
  const [confirmGameStart, setConfirmGameStart] = useState(false);
  const [startMutationState, setStartMutationState] = useState<
    'idle' | 'pending' | 'blocked' | 'stale' | 'committed' | 'replayed'
  >('idle');
  const [startMutationMessage, setStartMutationMessage] = useState<string | null>(null);
  const serverChartId = session?.setup?.chartId ?? session?.chartId ?? 'A';
  const chartLocked = session?.chartSelectionLocked === true || session?.configurationLocked === true ||
    (session !== null && !['lobby', 'casting'].includes(session.phase));
  const [draftChartId, setDraftChartId] = useState<'A' | 'B' | 'C'>(serverChartId);
  const [draftRoleIds, setDraftRoleIds] = useState<readonly string[]>(() => normalizedServerRoleIds);
  const [confirmingRoster, setConfirmingRoster] = useState(false);
  const [rosterMutationState, setRosterMutationState] = useState<
    'idle' | 'pending' | 'stale' | 'rejected' | 'committed'
  >('idle');
  const [rosterMutationMessage, setRosterMutationMessage] = useState<string | null>(null);
  const previousServerRoleIds = useRef<readonly string[]>(serverRoleIds);
  const serverCapybaraEnabled = session?.capybaraEnabled !== false;
  const serverDioneEnabled = session?.dioneEnabled !== false;
  const serverUniversalArbourEnabled = session?.universalArbourEnabled === true;
  const serverWolfCultEnabled = session?.wolfCultEnabled === true;
  const capybaraEnabled = draftCapybaraEnabled;
  const dioneEnabled = draftDioneEnabled;
  const universalArbourEnabled = draftUniversalArbourEnabled;
  const wolfCultEnabled = draftWolfCultEnabled;
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
  const endgameEvaluation = session?.phase === 'debrief';
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
  const wolfWindowStatus = wolfAttackWindow?.status ?? 'planned';
  const wolfWindowTurn = wolfAttackWindow?.turn ?? 1;
  const wolfWindowRevision = wolfAttackWindow?.revision ?? 0;
  const wolfWindowDueAvailable = currentTurn === 1
    ? wolfAttackWindow?.status !== 'due' && wolfAttackWindow?.status !== 'resolved' &&
      wolfAttackWindow?.status !== 'deferred'
    : currentTurn === 2 && wolfAttackWindow?.status === 'deferred' && wolfWindowTurn === 2;
  const wolfWindowResolveAvailable = wolfAttackWindow?.status === 'due' &&
    wolfWindowTurn === currentTurn;
  const wolfWindowDeferAvailable = currentTurn === 1 &&
    (wolfAttackWindow === null || wolfAttackWindow.status === 'due');
  const lockQueued = pendingCommands.some(
    (command) => command.kind === 'setGmControlsLocked',
  );
  const debriefQueued = pendingCommands.some(
    (command) => command.kind === 'setDebriefMode',
  );
  const draftRecommendedPlayerCount = recommendedPlayerCountForRoleIds(draftRoleIds);
  const draftPlayerCount = draftRecommendedPlayerCount ?? draftRoleIds.length;
  const hasUnconfirmedRosterChanges = !sameRoleConfiguration(draftRoleIds, serverRoleIds);
  const activeShipIds = activeFleetShipIds(
    hasUnconfirmedRosterChanges ? draftRoleIds : serverRoleIds,
    hasUnconfirmedRosterChanges ? undefined : session?.activeVesselIds,
  );
  const wolfPreparationShipIds = WOLF_PREPARATION_CARD_TYPES.flatMap(({ id }) => {
    const count = Number(wolfPreparationCounts[id] ?? '0');
    return Number.isSafeInteger(count) && count > 0
      ? Array<string>(Math.min(count, 24)).fill(id)
      : [];
  });
  const wolfPreparationRevision = wolfAttackPreparation?.revision ?? 0;
  const wolfDeclarationAvailable = Boolean(
    local && wolfAttackWindow?.status === 'due' && wolfWindowTurn === currentTurn &&
    wolfAttackPreparation?.turn === currentTurn && wolfPreparationRevision > 0 &&
    wolfAttackState === null && currentPhase?.airspace.state === 'lifted' &&
    currentPhase.timerPause === undefined,
  );
  const wolfDeclarationAnnouncement = wolfAttackState
    ? `Declaration // committed // Cycle ${wolfAttackState.turn} // ${wolfAttackState.currentStep} // deadline ${wolfAttackState.deadlineAt}`
    : wolfDeclarationMessage ?? 'Declaration // waiting for a due timing marker and saved private draft';
  const wolfDeclarationAnnouncementKey = wolfAttackState
    ? `state:${wolfAttackState.turn}:${wolfAttackState.revision}:${wolfAttackState.currentStep}:${wolfAttackState.deadlineAt}`
    : wolfDeclarationMessage
      ? `message:${wolfDeclarationMessage}`
      : null;
  const wolfPreparationTargetOptions = activeShipIds.filter((shipId) =>
    ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'].includes(shipId),
  );
  const rosterConfigurationValid = isValidRoleConfiguration(draftRoleIds);
  const rosterQueued = setupQueued;
  const conditionalUnionRoles = JOINT_ENGINEERING_ROLE_IDS.flatMap((roleId) => {
    const role = CONSOLE_ROLES.find((candidate) => candidate.id === roleId);
    return role && canOfferJointEngineeringRole(draftRoleIds, roleId) ? [role] : [];
  });
  const availableShips = SHIPS.filter(
    (ship) =>
      activeShipIds.includes(ship.id) &&
      (capybaraEnabled || ship.id !== 'capybara') &&
      (dioneEnabled || ship.id !== 'dione'),
  );
  const outbreakShips = [...availableShips, ...diseaseShipIds
    .filter(id => !availableShips.some(ship => ship.id === id))
    .map(id => ({ id, name: `${SHIPS.find(ship => ship.id === id)?.name ?? id} (inactive)` }))];
  const viewer = availableShips.find((ship) => ship.id === viewerId) ?? availableShips[0];
  const viewerCoordinate = session?.shipGalacticCoordinates?.[viewer?.id ?? 'aegis'] ??
    ORIGIN_GALACTIC_COORDINATE;
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
  const alertShips = [...new Set([
    ...Object.values(session?.unrestAlerts ?? {}).map((alert) => alert.shipName),
    ...Object.values(session?.populationAlerts ?? {}).map((alert) => alert.shipName),
  ])];
  const pendingActionLabels = pendingCommands.map((command) => {
    switch (command.kind) {
      case 'confirmSetup': return 'Setup confirmation pending';
      case 'setFacilitatorResponsibility': return 'GM lane change pending';
      case 'setGmControlsLocked': return 'GM registration lock pending';
      case 'setDebriefMode': return 'Debrief command pending';
      case 'claimGmInstance': return 'GM instance claim pending';
      case 'kickGmInstance': return 'GM instance removal pending';
      case 'kickPlayer': return 'Player removal pending';
      case 'setPressEnabled': return 'Press availability pending';
      case 'transitionCrisis': return 'Crisis transition pending';
      default: return 'Authoritative command pending';
    }
  });
  const facilitatorQueue = facilitatorQueueFor({
    phase: session?.phase ?? 'lobby',
    currentTurn,
    maxTurn: session?.turnState?.maxTurn ?? session?.turnLimit ?? session?.setup?.turnLimit ?? 6,
    setupSynchronized: session?.setup !== undefined && !hasUnconfirmedRosterChanges,
    productionStartAvailable: currentTurn === 0 && session?.phase === 'casting',
    turnPhase: phaseReadout?.kind,
    timerPaused: Boolean(currentPhase?.timerPause && currentPhase.timerPause.reason !== 'empty-session'),
    wolfAttackStatus: wolfWindowStatus,
    debriefActive: debriefMode.active,
    overdueMaintenance,
    alertShips,
    pendingCommands: pendingActionLabels,
  });
  const connectedPlayerGroups = groupConnectedPlayers(connectedPlayers);
  const assignedCastingRoleIds = new Set(
    connectedPlayers
      .map((player) => player.assignedRoleId)
      .filter((roleId): roleId is string => typeof roleId === 'string'),
  );
  const castingPlayers = connectedPlayers
    .filter((player) => player.role === 'player')
    .sort((left, right) =>
    normalizeDisplayName(left.displayName).localeCompare(normalizeDisplayName(right.displayName)));
  const replacementCandidates = allPlayers
    .filter((player) => player.role === 'player' && !player.replacementRoleId)
    .sort((left, right) => normalizeDisplayName(left.displayName).localeCompare(normalizeDisplayName(right.displayName)));
  const persistedReplacementVesselIds = session?.activeVesselIds;
  const replacementVesselIds = new Set(
    Array.isArray(persistedReplacementVesselIds) &&
    persistedReplacementVesselIds.length > 0 &&
    persistedReplacementVesselIds.every(isWireSafeEntityId) &&
    new Set(persistedReplacementVesselIds).size === persistedReplacementVesselIds.length
      ? persistedReplacementVesselIds
      : [],
  );
  const replacementRoles = REPLACEMENT_ROLE_CATALOG.filter((role) =>
    (!role.baseVesselOnly || session?.expansion !== 'capybara') &&
    (role.vesselId === undefined || replacementVesselIds.has(role.vesselId)),
  );

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

  const toggleDradis = (nextExpanded?: boolean) => {
    const dradis = dradisRef.current;
    if (dradis) dradisPreviousBounds.current = dradis.getBoundingClientRect();
    dradisAnimation.current?.cancel();
    dradisAnimation.current = null;
    setDradisExpanded((expanded) => nextExpanded ?? !expanded);
  };

  useEffect(() => {
    if (!isGm || !sessionId) return;
    const localInstanceId = local?.id;
    const generation = crisisAuthorityGeneration.current + 1;
    crisisAuthorityGeneration.current = generation;
    let active = true;
    let authorityInvalidated = false;
    let crisisSubscribed = false;
    let stopInstances: () => void = () => undefined;
    let stopCrisisState: () => void = () => undefined;
    let stopZealotryResponse: () => void = () => undefined;
    let stopCivilUnrestResolution: () => void = () => undefined;
    let unsubscribe: () => void = () => undefined;
    // A persisted projection is not fresh GM authority. Hold no crisis data
    // while the callable-backed manifest proves this exact instance.
    useSessionStore.getState().setGmCrisisState(null);
    setCrisisMutationState(null);
    setCrisisMessage(null);
    const currentAuthorityKey = (): string | null => {
      const current = useSessionStore.getState();
      const currentInstance = current.gmInstance;
      const currentUid = current.me?.uid;
      if (
        !active || authorityInvalidated ||
        crisisAuthorityGeneration.current !== generation ||
        current.session?.id !== sessionId || current.me?.role !== 'gm' ||
        !currentInstance || !currentUid ||
        currentUid !== currentInstance.uid ||
        currentInstance.sessionId !== sessionId ||
        currentInstance.id !== localInstanceId
      ) return null;
      return `${sessionId}:${currentUid}:${localInstanceId}:${generation}`;
    };
    const revokeAuthority = (): void => {
      if (!active || authorityInvalidated) return;
      authorityInvalidated = true;
      verifiedCrisisAuthorityKey.current = null;
      stopCrisisState();
      stopCrisisState = () => undefined;
      stopZealotryResponse();
      stopZealotryResponse = () => undefined;
      stopCivilUnrestResolution();
      stopCivilUnrestResolution = () => undefined;
      stopInstances();
      stopInstances = () => undefined;
      setInstances([]);
      setLoading(false);
      setCrisisMutationState(null);
      setCrisisMessage(null);
      const store = useSessionStore.getState();
      store.setGmCrisisState(null);
      store.setGmZealotryResponse(null);
      store.setGmCivilUnrestResolution(null);
      clearCivilUnrestResolutionDraft();
      if (
        store.session?.id === sessionId &&
        store.gmInstance?.id === localInstanceId
      ) {
        store.setGmInstance(null);
        store.setMode(null);
        store.setLastRoute('/roles');
      }
    };
    void import('@/lib/firestore').then(({
      subscribeConnectedPlayers,
      subscribeSessionPlayers,
      subscribeDamageDraws,
      subscribeGmInstances,
      subscribeGmWolfAttackPreparation,
      subscribeGmWolfAttackState,
      subscribeGmWolfAttackWindow,
      subscribeGmWolfAssignment,
      subscribeGmWolfCultIntelligence,
      subscribeGmArbourVision,
      subscribeGmFacilitatorRuleCall,
      subscribeGmCrisisState,
      subscribeGmZealotryResponse,
      subscribeGmCivilUnrestResolution,
      subscribeSessionEvents,
    }) => {
      if (!active) return;
      stopInstances = subscribeGmInstances(
        sessionId,
        (next) => {
          if (!active || authorityInvalidated) return;
          setInstances(next);
          setLoading(false);
          const store = useSessionStore.getState();
          const expected = store.gmInstance;
          const verified = next.find((instance) =>
            instance.id === localInstanceId &&
            instance.sessionId === sessionId &&
            instance.uid === store.me?.uid &&
            expected?.id === localInstanceId &&
            expected?.uid === store.me?.uid);
          if (!verified) {
            revokeAuthority();
            return;
          }
          if (store.communicationError?.code === 'gm-manifest-link') {
            store.setCommunicationError(null);
          }
          const authorityKey = currentAuthorityKey();
          if (!authorityKey || crisisSubscribed) return;
          crisisSubscribed = true;
          verifiedCrisisAuthorityKey.current = authorityKey;
          stopCrisisState = typeof subscribeGmCrisisState === 'function'
            ? subscribeGmCrisisState(sessionId, (crisis) => {
              const currentKey = currentAuthorityKey();
              if (!currentKey || currentKey !== verifiedCrisisAuthorityKey.current) return;
              const store = useSessionStore.getState();
              store.setGmCrisisState(crisis);
              if (crisis) {
                setCrisisIdDraft(crisis.crisisId);
                setCrisisTitleDraft(crisis.title);
                setCrisisDetailsDraft(crisis.details);
                setCrisisKindDraft(crisis.crisisKind ?? (isCrisisKind(crisis.crisisId) ? crisis.crisisId : 'custom'));
                setCrisisOverrideDraft(crisis.configurationOverride ?? '');
                setDiseaseShipIds([...(crisis.diseaseOutbreak?.affectedShipIds ?? [])]);
                setDiseaseWork(crisis.diseaseOutbreak?.workRestrictions ?? '');
                setDiseaseRisk(crisis.diseaseOutbreak?.escalationRisk ?? '');
              }
              const response = store.gmZealotryResponse;
              const matchesDebatedCrisis = Boolean(
                crisis && response &&
                crisis.crisisKind === 'religious-zealotry' && crisis.state === 'debated' &&
                response.crisisId === crisis.crisisId && response.crisisRevision === crisis.revision,
              );
              if (matchesDebatedCrisis && response) {
                setZealotryActionsDraft([...response.actions]);
                setZealotryCustomDraft(response.customResponse ?? '');
                setZealotryRationaleDraft(response.rationale);
              } else {
                store.setGmZealotryResponse(null);
                clearZealotryResponseDraft();
              }
              setCrisisMutationState(null);
              const civilResolution = store.gmCivilUnrestResolution;
              const matchesCivilCrisis = Boolean(
                crisis && civilResolution && crisis.crisisKind === 'civil-unrest' && crisis.state === 'debated' &&
                civilResolution.crisisId === crisis.crisisId && civilResolution.crisisRevision === crisis.revision,
              );
              if (matchesCivilCrisis && civilResolution) {
                setCivilUnrestPresidentDraft(civilResolution.presidentResponse);
                setCivilUnrestConsequenceDraft(civilResolution.consequence);
                setCivilUnrestRationaleDraft(civilResolution.rationale);
              } else if (!crisis && civilResolution) {
                // The private resolution listener may win the race with the
                // crisis listener. Hold the parsed record until the exact
                // crisis identity and revision arrive, then validate there.
                // A later mismatched crisis clears it below.
                store.setGmCivilUnrestResolution(civilResolution);
              } else {
                store.setGmCivilUnrestResolution(null);
                clearCivilUnrestResolutionDraft();
              }
            }, () => {
              const currentKey = currentAuthorityKey();
              if (!currentKey || currentKey !== verifiedCrisisAuthorityKey.current) return;
              useSessionStore.getState().setCommunicationError({
                code: 'gm-crisis-link',
                message: 'The facilitator crisis projection could not be refreshed.',
              });
              revokeAuthority();
            })
            : () => undefined;
          stopCivilUnrestResolution = typeof subscribeGmCivilUnrestResolution === 'function'
            ? subscribeGmCivilUnrestResolution(sessionId, (resolution) => {
              const currentKey = currentAuthorityKey();
              if (!currentKey || currentKey !== verifiedCrisisAuthorityKey.current) return;
              const store = useSessionStore.getState();
              const crisis = store.gmCrisisState;
              const matchesCivilCrisis = Boolean(
                crisis && resolution && crisis.crisisKind === 'civil-unrest' && crisis.state === 'debated' &&
                resolution.crisisId === crisis.crisisId && resolution.crisisRevision === crisis.revision,
              );
              if (matchesCivilCrisis && resolution) {
                store.setGmCivilUnrestResolution(resolution);
                setCivilUnrestPresidentDraft(resolution.presidentResponse);
                setCivilUnrestConsequenceDraft(resolution.consequence);
                setCivilUnrestRationaleDraft(resolution.rationale);
              } else if (!resolution) {
                store.setGmCivilUnrestResolution(null);
                clearCivilUnrestResolutionDraft();
              } else if (!crisis) {
                store.setGmCivilUnrestResolution(resolution);
              } else {
                store.setGmCivilUnrestResolution(null);
                clearCivilUnrestResolutionDraft();
              }
              setCivilUnrestMessage(null);
            })
            : () => undefined;
          stopZealotryResponse = typeof subscribeGmZealotryResponse === 'function'
            ? subscribeGmZealotryResponse(sessionId, (response) => {
              const currentKey = currentAuthorityKey();
              if (!currentKey || currentKey !== verifiedCrisisAuthorityKey.current) return;
              const store = useSessionStore.getState();
              store.setGmZealotryResponse(response);
              const crisis = store.gmCrisisState;
              const matchesDebatedCrisis = Boolean(
                crisis && response &&
                crisis.crisisKind === 'religious-zealotry' && crisis.state === 'debated' &&
                response.crisisId === crisis.crisisId && response.crisisRevision === crisis.revision,
              );
              if (matchesDebatedCrisis && response) {
                setZealotryActionsDraft([...response.actions]);
                setZealotryCustomDraft(response.customResponse ?? '');
                setZealotryRationaleDraft(response.rationale);
              } else if (!matchesDebatedCrisis) {
                store.setGmZealotryResponse(null);
                clearZealotryResponseDraft();
              }
              setZealotryMessage(null);
            })
            : () => undefined;
        },
        () => {
          if (!active || authorityInvalidated) return;
          setLoading(false);
          useSessionStore.getState().setCommunicationError({
            code: 'gm-manifest-link',
            message: 'The live GM instance manifest could not be refreshed.',
          });
          revokeAuthority();
        },
      );
      if (!active || authorityInvalidated) {
        stopInstances();
        stopInstances = () => undefined;
        return;
      }
      const stopWolfAttackWindow = subscribeGmWolfAttackWindow(
        sessionId,
        (next) => setWolfAttackWindowState((current) =>
          current && next && next.revision < current.revision ? current : next),
      );
      const stopWolfAttackPreparation = subscribeGmWolfAttackPreparation(
        sessionId,
        (next) => setWolfAttackPreparationState((current) =>
          current && next && next.revision < current.revision ? current : next),
      );
      const stopWolfAttackState = subscribeGmWolfAttackState(
        sessionId,
        (next) => setWolfAttackState((current) =>
          current && next && next.revision < current.revision ? current : next),
      );
      const stopWolfAssignment = subscribeGmWolfAssignment(
        sessionId,
        setWolfAssignment,
      );
      const stopWolfCultIntelligence = subscribeGmWolfCultIntelligence(
        sessionId,
        (next) => {
          if (!active) return;
          useSessionStore.getState().setGmWolfCultIntelligence(next);
        },
      );
      const stopArbourVision = typeof subscribeGmArbourVision === 'function'
        ? subscribeGmArbourVision(sessionId, (next) => {
          setArbourVisionMessage(null);
          useSessionStore.getState().setGmArbourVision(next);
        })
        : () => undefined;
      const stopFacilitatorRuleCall = typeof subscribeGmFacilitatorRuleCall === 'function'
        ? subscribeGmFacilitatorRuleCall(sessionId, (next) => {
          setRuleCallMessage(null);
          useSessionStore.getState().setGmFacilitatorRuleCall(next);
        })
        : () => undefined;
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
      const stopAllPlayers = typeof subscribeSessionPlayers === 'function'
        ? subscribeSessionPlayers(
          sessionId,
          setAllPlayers,
          () => useSessionStore.getState().setCommunicationError({
            code: 'gm-replacement-roster-link',
            message: 'The replacement roster could not be refreshed.',
          }),
        )
        : () => undefined;
      unsubscribe = () => {
        stopInstances();
        stopWolfAttackWindow();
        stopWolfAttackPreparation();
        stopWolfAttackState();
        stopWolfAssignment();
        stopWolfCultIntelligence();
        stopArbourVision();
        stopFacilitatorRuleCall();
        stopCrisisState();
        stopZealotryResponse();
        stopCivilUnrestResolution();
        stopEvents();
        stopDamageDraws();
        stopPlayers();
        stopAllPlayers();
      };
    });
    return () => {
      active = false;
      authorityInvalidated = true;
      crisisAuthorityGeneration.current = Math.max(
        crisisAuthorityGeneration.current,
        generation + 1,
      );
      verifiedCrisisAuthorityKey.current = null;
      unsubscribe();
      stopCrisisState();
      stopZealotryResponse();
      stopCivilUnrestResolution();
      setWolfAssignment(null);
      useSessionStore.getState().setGmWolfCultIntelligence(null);
      useSessionStore.getState().setGmArbourVision(null);
      useSessionStore.getState().setGmFacilitatorRuleCall(null);
      useSessionStore.getState().setGmCrisisState(null);
      useSessionStore.getState().setGmZealotryResponse(null);
      useSessionStore.getState().setGmCivilUnrestResolution(null);
      clearCivilUnrestResolutionDraft();
      setCrisisMutationState(null);
      setCrisisMessage(null);
      setWolfAttackPreparationState(null);
      setWolfAttackState(null);
      setAllPlayers([]);
    };
  }, [isGm, local?.id, local?.uid, sessionId]);

  useEffect(() => {
    setCensusNotes(Object.fromEntries(
      (loyaltyCensus?.entries ?? []).map((entry) => [entry.uid, entry.note ?? '']),
    ));
  }, [loyaltyCensus?.entries, loyaltyCensus?.revision]);

  const wolfCultRecipients = useMemo(
    () => loyaltyCensus?.entries.filter((entry) => entry.kind === 'wolf-cult') ?? [],
    [loyaltyCensus?.entries],
  );
  const wolfAgentRecipients = useMemo(
    () => loyaltyCensus?.entries.filter((entry) => entry.kind === 'wolf-agent') ?? [],
    [loyaltyCensus?.entries],
  );

  useEffect(() => {
    const currentAgent = wolfAgentRecipients[0]?.uid ?? '';
    setWolfCultAgentUid((current) =>
      wolfAgentRecipients.some((entry) => entry.uid === current) ? current : currentAgent);
  }, [wolfAgentRecipients]);

  const arbourVisionRecipients = useMemo(
    () => loyaltyCensus?.entries.filter((entry) => entry.kind === 'universal-arbour') ?? [],
    [loyaltyCensus?.entries],
  );
  const arbourVisionRecipientUids = useMemo(
    () => arbourVisionRecipients.map((entry) => entry.uid),
    [arbourVisionRecipients],
  );

  useEffect(() => {
    if (arbourVisionRecipientUids.length === 0) {
      setArbourVisionTargetUid('');
      return;
    }
    setArbourVisionTargetUid((current) =>
      arbourVisionRecipientUids.includes(current)
        ? current
        : arbourVisionRecipientUids[0]!);
  }, [arbourVisionRecipientUids]);

  useEffect(() => {
    if (!wolfAttackPreparation) return;
    const counts: Record<string, string> = {};
    for (const { id } of WOLF_PREPARATION_CARD_TYPES) counts[id] = '';
    for (const id of wolfAttackPreparation.shipIds) counts[id] = String(Number(counts[id] ?? '0') + 1);
    setWolfPreparationCounts(counts);
    setWolfPreparationMode(wolfAttackPreparation.targetMode);
    setWolfPreparationTargets(Object.fromEntries(
      wolfAttackPreparation.targetAssignments.map(({ cardIndex, targetShipId }) => [cardIndex, targetShipId]),
    ));
    setWolfPreparationModifiers(Object.fromEntries(
      wolfAttackPreparation.modifiers.map((modifier) => [modifier, true]),
    ));
    setWolfPreparationNotes(wolfAttackPreparation.notes);
  }, [wolfAttackPreparation]);

  useEffect(() => {
    if ((!capybaraEnabled || !activeShipIds.includes('capybara')) && viewerId === 'capybara') {
      setViewerId('aegis');
    }
  }, [activeShipIds, capybaraEnabled, viewerId]);

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
    setDraftUniversalArbourEnabled(serverUniversalArbourEnabled);
  }, [serverUniversalArbourEnabled]);

  useEffect(() => {
    setDraftWolfCultEnabled(serverWolfCultEnabled);
  }, [serverWolfCultEnabled]);

  useEffect(() => {
    if (!endgameEvaluation || pendingPressEnabled === null) return;
    setPendingPressEnabled(null);
  }, [endgameEvaluation, pendingPressEnabled]);

  useEffect(() => {
    if (!confirmGameStart) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setConfirmGameStart(false);
    };
    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, [confirmGameStart]);

  useEffect(() => {
    setDraftChartId(serverChartId);
  }, [serverChartId, session?.id, chartLocked]);

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
    if (currentTurn !== 0) setConfirmGameStart(false);
  }, [activeAirspaceWindow, currentTurn]);

  const activeConfirmation = pendingCapybaraEnabled !== null
    ? 'capybara'
    : pendingDioneEnabled !== null
      ? 'dione'
      : pendingPressEnabled !== null
        ? 'press'
        : null;
  const activeConfirmationDialog = activeConfirmation === 'capybara'
    ? capybaraDialogRef
    : activeConfirmation === 'dione'
      ? dioneDialogRef
      : pressDialogRef;
  const activeConfirmationTrigger = activeConfirmation === 'capybara'
    ? capybaraTriggerRef
    : activeConfirmation === 'dione'
      ? dioneTriggerRef
      : pressTriggerRef;
  useDialogFocus({
    open: activeConfirmation !== null,
    dialogRef: activeConfirmationDialog,
    restoreRef: activeConfirmationTrigger,
    onEscape: activeConfirmation === 'press'
      ? closePressDialog
      : () => {
        setPendingCapybaraEnabled(null);
        setPendingDioneEnabled(null);
      },
    dialogKey: activeConfirmation,
  });

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm || !local) return <Navigate to="/console" replace />;

  function castingRoleLabel(roleId: string): string {
    return CONSOLE_ROLES.find((role) => role.id === roleId)?.name ?? roleId;
  }

  function castingRestriction(player: Player): string | null {
    if (
      player.activeConsoleRoleId === 'press-officer' ||
      player.assignedRoleId === 'press-officer' ||
      player.seatId === 'press-officer'
    ) {
      return 'Press station held // release Press on that device before casting.';
    }
    if (
      typeof player.seatId === 'string' &&
      player.seatId.length > 0 &&
      player.seatId !== player.assignedRoleId
    ) {
      return `Station held // ${castingRoleLabel(player.seatId)} // release it before casting.`;
    }
    return null;
  }

  function availableCastingRoles(player: Player): readonly string[] {
    if (castingRestriction(player)) return [];
    return activeRoleIds.filter((roleId) =>
      roleId === player.assignedRoleId || !assignedCastingRoleIds.has(roleId));
  }

  async function changeCastingRole(player: Player, roleId: string | null): Promise<void> {
    setCastingMutationUid(player.uid);
    setCastingMutationMessage(null);
    try {
      const disposition: CommandDisposition = roleId === null
        ? await releaseRole(player.uid)
        : await assignRole(player.uid, roleId);
      setCastingDraftRoles((current) => {
        const next = { ...current };
        if (roleId === null) delete next[player.uid];
        else next[player.uid] = roleId;
        return next;
      });
      setCastingMutationMessage(disposition === 'queued'
        ? 'CASTING CHANGE PENDING // AWAITING RECONNECTION'
        : disposition === 'stale'
          ? 'CASTING CHANGE STALE // REFRESH THE LIVE ROSTER AND RETRY'
          : `CASTING ${roleId === null ? 'RELEASE' : 'ASSIGNMENT'} ${disposition.toUpperCase()}`);
    } catch {
      setCastingMutationMessage('CASTING CHANGE REJECTED // REVIEW THE LIVE ROSTER');
    } finally {
      setCastingMutationUid(null);
    }
  }

  async function adjudicateReplacement(): Promise<void> {
    if (!replacementTargetUid) return;
    setReplacementBusy(true);
    setReplacementMessage(null);
    try {
      const result = await setReplacementEligibility(
        replacementTargetUid, replacementReason, replacementRevision, replacementSetupRevision,
      );
      if (result.status === 'stale') {
        setReplacementRevision(result.revision);
        setReplacementSetupRevision(result.setupRevision);
        setReplacementMessage('ELIGIBILITY STALE // refresh the GM roster and retry');
      } else {
        setReplacementRevision(result.revision);
        setReplacementSetupRevision(result.setupRevision);
        setReplacementDecisionRecorded(true);
        setReplacementMessage(`ELIGIBILITY RECORDED // ${replacementReason.toUpperCase()} // revision ${result.revision}`);
      }
    } catch {
      setReplacementMessage('ELIGIBILITY REJECTED // active GM authority required');
    } finally {
      setReplacementBusy(false);
    }
  }

  async function commitReplacement(): Promise<void> {
    if (!replacementTargetUid || !replacementRoleId) return;
    setReplacementBusy(true);
    setReplacementMessage(null);
    try {
      const result = await assignReplacementRole(
        replacementTargetUid, replacementRoleId, replacementRevision, replacementSetupRevision,
      );
      if (result.status === 'stale') {
        setReplacementRevision(result.revision);
        setReplacementSetupRevision(result.setupRevision);
        setReplacementMessage('ASSIGNMENT STALE // the eligibility record changed');
      } else {
        setReplacementRevision(result.revision);
        setReplacementSetupRevision(result.setupRevision);
        setReplacementDecisionRecorded(true);
        setReplacementMessage(`REPLACEMENT COMMITTED // ${replacementRoleId} // revision ${result.revision}`);
      }
    } catch {
      setReplacementMessage('ASSIGNMENT REJECTED // review eligibility, role availability, and station state');
    } finally {
      setReplacementBusy(false);
    }
  }

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

  function changeUniversalArbour(enabled: boolean): void {
    setDraftUniversalArbourEnabled(enabled);
    if (enabled) setDraftWolfCultEnabled(false);
  }

  function changeWolfCult(enabled: boolean): void {
    setDraftWolfCultEnabled(enabled);
    if (enabled) setDraftUniversalArbourEnabled(false);
  }

  async function changePress(enabled: boolean): Promise<void> {
    if (endgameEvaluation) return;
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
      const error = normalizeCommandError(cause);
      setPressMutationState(error.kind === 'stale-revision' ? 'stale' : 'rejected');
      setPressMutationMessage(
        error.kind === 'stale-revision'
          ? 'Press availability stale // a newer GM revision committed; review the live state and retry.'
          : 'Press availability rejected // the server did not commit this change.',
      );
    } finally {
      setChangingPress(false);
      setPendingPressEnabled(null);
    }
  }

  function openPressDialog(): void {
    if (endgameEvaluation) return;
    setPressMutationState('idle');
    setPressMutationMessage(null);
    setPendingPressEnabled(!pressEnabled);
  }

  function closePressDialog(): void {
    setPendingPressEnabled(null);
  }

  async function toggleLock(): Promise<void> {
    if (endgameEvaluation) return;
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

  function currentCrisisAuthorityKey(): string | null {
    const current = useSessionStore.getState();
    if (
      current.me?.role !== 'gm' || !current.session?.id ||
      !current.gmInstance || current.gmInstance.sessionId !== current.session.id ||
      current.gmInstance.uid !== current.me.uid
    ) return null;
    return `${current.session.id}:${current.me.uid}:${current.gmInstance.id}:${crisisAuthorityGeneration.current}`;
  }

  async function advanceCrisis(state: CrisisStateName): Promise<void> {
    if (crisisMutationState || !nextCrisisStates(gmCrisisState).includes(state)) return;
    const authorityKey = currentCrisisAuthorityKey();
    if (!authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) {
      setCrisisMessage('Live GM authority is still being verified; retry when the manifest is current.');
      return;
    }
    const crisisId = crisisIdDraft.trim();
    const title = (gmCrisisState && gmCrisisState.state !== 'closed'
      ? gmCrisisState.title : crisisTitleDraft).trim();
    const details = (gmCrisisState && gmCrisisState.state !== 'closed'
      ? gmCrisisState.details : crisisDetailsDraft).trim();
    if (!crisisId || !title) {
      setCrisisMessage('Add a crisis identifier and title before creating the draft.');
      return;
    }
    setCrisisMutationState(state);
    setCrisisMessage(null);
    try {
      const locked = gmCrisisState && gmCrisisState.state !== 'closed' ? gmCrisisState : null;
      const disposition = await transitionCrisis(crisisId, state, title, details, {
        crisisKind: locked ? (locked.crisisKind ?? (isCrisisKind(locked.crisisId) ? locked.crisisId : 'custom')) : crisisKindDraft,
        configurationOverride: locked && state !== 'delivered' ? locked.configurationOverride ?? '' : crisisOverrideDraft,
        ...(crisisKindDraft === 'disease-outbreak' && (state !== 'draft' || diseaseShipIds.length || diseaseWork || diseaseRisk)
          ? { diseaseOutbreak: locked && state !== 'delivered' ? locked.diseaseOutbreak : {
              affectedShipIds: diseaseShipIds, workRestrictions: diseaseWork, escalationRisk: diseaseRisk,
            } } : {}),
      });
      if (
        currentCrisisAuthorityKey() !== authorityKey ||
        verifiedCrisisAuthorityKey.current !== authorityKey
      ) return;
      setCrisisMessage(
        disposition === 'queued'
          ? 'Crisis transition queued // waiting for the live facilitator connection.'
          : `Crisis transition committed // ${state}`,
      );
    } catch (cause) {
      if (
        currentCrisisAuthorityKey() !== authorityKey ||
        verifiedCrisisAuthorityKey.current !== authorityKey
      ) return;
      const error = normalizeCommandError(cause);
      setCrisisMessage(
        error.kind === 'stale-revision'
          ? 'Crisis changed // review the live state and retry.'
          : 'Crisis transition rejected // the server did not commit this change.',
      );
    } finally {
      if (
        currentCrisisAuthorityKey() === authorityKey &&
        verifiedCrisisAuthorityKey.current === authorityKey
      ) setCrisisMutationState(null);
    }
  }

  async function admitVoyage33FromCrisis(): Promise<void> {
    const crisis = useSessionStore.getState().gmCrisisState;
    if (voyageAdmissionMutation || !crisis || crisis.crisisKind !== 'approaching-vessel' ||
        crisis.state === 'draft' || crisis.state === 'closed') {
      setCrisisMessage('Admit Voyage 33-0 only while an active Approaching Vessel crisis is open.');
      return;
    }
    if (useSessionStore.getState().session?.voyage33Admission) {
      setCrisisMessage('Voyage 33-0 is already admitted for this session.');
      return;
    }
    const authorityKey = currentCrisisAuthorityKey();
    if (!authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) {
      setCrisisMessage('Live GM authority is still being verified; retry when the manifest is current.');
      return;
    }
    setVoyageAdmissionMutation(true);
    setCrisisMessage(null);
    try {
      const disposition = await admitVoyage33(crisis.crisisId);
      if (currentCrisisAuthorityKey() !== authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) return;
      setCrisisMessage(
        disposition === 'queued'
          ? 'Voyage 33-0 admission queued // waiting for the live facilitator connection.'
          : 'Voyage 33-0 admitted // host docking and maintenance remain pending.',
      );
    } catch (cause) {
      if (currentCrisisAuthorityKey() !== authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) return;
      const error = normalizeCommandError(cause);
      setCrisisMessage(
        error.kind === 'stale-revision'
          ? 'Crisis changed // review the current state and retry the admission.'
          : 'Voyage 33-0 admission rejected // the server did not commit this change.',
      );
    } finally {
      if (currentCrisisAuthorityKey() === authorityKey && verifiedCrisisAuthorityKey.current === authorityKey) {
        setVoyageAdmissionMutation(false);
      }
    }
  }

  function toggleZealotryAction(action: ZealotryResponseAction): void {
    setZealotryActionsDraft((current) => current.includes(action)
      ? current.filter((candidate) => candidate !== action)
      : [...current, action]);
  }

  async function saveZealotryResponse(): Promise<void> {
    const crisis = useSessionStore.getState().gmCrisisState;
    if (zealotryMutation || !crisis || crisis.crisisKind !== 'religious-zealotry' || crisis.state !== 'debated') {
      setZealotryMessage('Record a response only while the Religious Zealotry crisis is debated.');
      return;
    }
    const customResponse = zealotryCustomDraft.trim();
    if (zealotryActionsDraft.length === 0 && !customResponse) {
      setZealotryMessage('Choose a source action or enter a custom response.');
      return;
    }
    const authorityKey = currentCrisisAuthorityKey();
    if (!authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) {
      setZealotryMessage('Live GM authority is still being verified; retry when the manifest is current.');
      return;
    }
    setZealotryMutation(true);
    setZealotryMessage(null);
    try {
      const disposition = await recordZealotryResponse(
        zealotryActionsDraft,
        customResponse,
        zealotryRationaleDraft,
      );
      if (currentCrisisAuthorityKey() !== authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) return;
      setZealotryMessage(
        disposition === 'queued'
          ? 'Zealotry response queued // waiting for the live facilitator connection.'
          : 'Zealotry response recorded privately // publication and law handling remain separate.',
      );
    } catch (cause) {
      if (currentCrisisAuthorityKey() !== authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) return;
      const error = normalizeCommandError(cause);
      setZealotryMessage(
        error.kind === 'stale-revision'
          ? 'Crisis changed // review the current debated state and retry.'
          : 'Zealotry response rejected // the server did not commit this record.',
      );
    } finally {
      if (currentCrisisAuthorityKey() === authorityKey && verifiedCrisisAuthorityKey.current === authorityKey) {
        setZealotryMutation(false);
      }
    }
  }

  async function saveCivilUnrestResolution(): Promise<void> {
    const crisis = useSessionStore.getState().gmCrisisState;
    if (civilUnrestMutation || !crisis || crisis.crisisKind !== 'civil-unrest' || crisis.state !== 'debated') {
      setCivilUnrestMessage('Record a resolution only while Civil Unrest is debated.');
      return;
    }
    const presidentResponse = civilUnrestPresidentDraft.trim();
    const consequence = civilUnrestConsequenceDraft.trim();
    if (!presidentResponse || !consequence) {
      setCivilUnrestMessage('Enter the facilitator-recorded President response and consequence.');
      return;
    }
    const authorityKey = currentCrisisAuthorityKey();
    if (!authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) {
      setCivilUnrestMessage('Live GM authority is still being verified; retry when the manifest is current.');
      return;
    }
    setCivilUnrestMutation(true);
    setCivilUnrestMessage(null);
    try {
      const disposition = await recordCivilUnrestResolution(
        presidentResponse,
        consequence,
        civilUnrestRationaleDraft,
      );
      if (currentCrisisAuthorityKey() !== authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) return;
      setCivilUnrestMessage(
        disposition === 'queued'
          ? 'Civil Unrest resolution queued // waiting for the live facilitator connection.'
          : 'Civil Unrest resolution recorded privately // no fleet change or public publication.',
      );
    } catch (cause) {
      if (currentCrisisAuthorityKey() !== authorityKey || verifiedCrisisAuthorityKey.current !== authorityKey) return;
      const error = normalizeCommandError(cause);
      setCivilUnrestMessage(
        error.kind === 'stale-revision'
          ? 'Crisis changed // review the current debated state and retry.'
          : 'Civil Unrest resolution rejected // the server did not commit this record.',
      );
    } finally {
      if (currentCrisisAuthorityKey() === authorityKey && verifiedCrisisAuthorityKey.current === authorityKey) {
        setCivilUnrestMutation(false);
      }
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

  async function commitProductionStart(): Promise<void> {
    if (startingGame || currentTurn !== 0 || !confirmGameStart) return;
    setConfirmGameStart(false);
    setStartingGame(true);
    setStartMutationState('pending');
    setStartMutationMessage('Start pending // validating live seats, roles, vessels, loyalty, and GM staffing.');
    try {
      const reply = await startGame();
      if (reply.status === 'stale') {
        setStartMutationState('stale');
        setStartMutationMessage(
          `Start stale // setup revision ${reply.currentSetupRevision} superseded the expected ${reply.expectedSetupRevision}. Refresh the live roster and retry.`,
        );
      } else {
        setStartMutationState(reply.status === 'replayed' ? 'replayed' : 'committed');
        setStartMutationMessage(
          reply.status === 'replayed'
            ? 'Start replayed // the existing Cycle 1 result was preserved.'
            : 'Start committed // Cycle 1, pursuit 2, and private setup are live.',
        );
      }
    } catch (cause) {
      const error = normalizeCommandError(cause);
      const stale = error.kind === 'stale-revision';
      setStartMutationState(stale ? 'stale' : 'blocked');
      setStartMutationMessage(
        `${stale ? 'Start stale' : 'Start blocked'} // ${error.message}`,
      );
    } finally {
      setStartingGame(false);
    }
  }

  function requestProductionStart(): void {
    if (startingGame || currentTurn !== 0) return;
    if (!confirmGameStart) {
      setConfirmGameStart(true);
      return;
    }
    void commitProductionStart();
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

  async function changeWolfAttackWindow(status: WolfAttackWindowStatus): Promise<void> {
    if (wolfWindowMutation || !session || !local) return;
    setWolfWindowMutation(status);
    try {
      const next = await setWolfAttackWindow(status, wolfWindowRevision);
      setWolfAttackWindowState(next);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setWolfWindowMutation(null);
    }
  }

  async function saveWolfAttackPreparation(): Promise<void> {
    if (wolfPreparationMutation || !session || !local || wolfPreparationShipIds.length === 0) return;
    setWolfPreparationMutation(true);
    try {
      const next = await stageWolfAttackPreparation({
        turn: currentTurn,
        shipIds: wolfPreparationShipIds,
        targetMode: wolfPreparationMode,
        targetAssignments: wolfPreparationShipIds.flatMap((_, cardIndex) => {
          const targetShipId = wolfPreparationTargets[cardIndex];
          return targetShipId ? [{ cardIndex, targetShipId }] : [];
        }),
        modifiers: WOLF_PREPARATION_MODIFIERS.flatMap(({ id }) =>
          wolfPreparationModifiers[id] ? [id] : []),
        notes: wolfPreparationNotes,
      }, wolfPreparationRevision);
      setWolfAttackPreparationState(next);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setWolfPreparationMutation(false);
    }
  }

  async function declareCurrentWolfAttack(): Promise<void> {
    if (!wolfDeclarationAvailable || wolfDeclarationMutation) return;
    setWolfDeclarationMutation(true);
    setWolfDeclarationMessage(null);
    try {
      const result = await declareWolfAttackCommand(wolfPreparationRevision);
      setWolfDeclarationMessage(
        `Declared // Cycle ${result.turn} // targeting step // airspace locked // ` +
        `${result.parkedCraftCount} craft parked`,
      );
    } catch {
      setWolfDeclarationMessage('Declaration rejected // refresh the live GM state and retry.');
    } finally {
      setWolfDeclarationMutation(false);
    }
  }

  async function saveCensusNote(targetUid: string): Promise<void> {
    if (!loyaltyCensus || censusNoteMutationUid !== null) return;
    setCensusNoteMutationUid(targetUid);
    try {
      await setFacilitatorCensusNote(targetUid, censusNotes[targetUid] ?? '');
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setCensusNoteMutationUid(null);
    }
  }

  async function deliverWolfCultIntel(): Promise<void> {
    if (wolfCultIntelMutation || wolfCultRecipients.length !== 1 || wolfAgentRecipients.length !== 1 ||
        !wolfCultFortressCoordinate.trim() || !wolfCultSuppliesCoordinate.trim() ||
        !wolfCultAgentUid || !wolfCultCodeWord.trim()) return;
    setWolfCultIntelMutation(true);
    setWolfCultIntelMessage(null);
    try {
      const disposition = await deliverWolfCultIntelligence(
        wolfCultFortressCoordinate,
        wolfCultSuppliesCoordinate,
        wolfCultAgentUid,
        wolfCultCodeWord,
      );
      setWolfCultIntelMessage(
        disposition === 'queued'
          ? 'WOLF INTEL QUEUED // awaiting reconnection'
          : disposition === 'stale'
            ? 'INTEL STALE // refresh the live projection and retry'
            : 'WOLF INTEL DELIVERED // Cult leader and facilitator only',
      );
      if (disposition === 'applied') setWolfCultCodeWord('');
    } catch {
      setWolfCultIntelMessage('INTEL REJECTED // current Cult and Wolf assignments are required');
    } finally {
      setWolfCultIntelMutation(false);
    }
  }

  async function saveArbourVision(): Promise<void> {
    if (!arbourVisionTargetUid || !arbourVisionText.trim() || arbourVisionMutation) return;
    setArbourVisionMutation(true);
    setArbourVisionMessage(null);
    try {
      const disposition = await authorUniversalArbourVision(
        arbourVisionTargetUid,
        arbourVisionKind,
        arbourVisionText,
      );
      setArbourVisionMessage(
        disposition === 'queued'
          ? 'FACILITATOR CALL QUEUED // awaiting reconnection'
          : disposition === 'stale'
            ? 'CALL STALE // refresh the private vision and retry'
            : `FACILITATOR CALL ${disposition.toUpperCase()}`,
      );
      if (disposition === 'applied') setArbourVisionText('');
    } catch {
      setArbourVisionMessage('CALL REJECTED // active facilitator authority required');
    } finally {
      setArbourVisionMutation(false);
    }
  }

  async function saveFacilitatorRuleCall(): Promise<void> {
    if (
      ruleCallMutation ||
      !ruleCallAmbiguity.trim() ||
      !ruleCallSource.trim() ||
      !ruleCallDecision.trim() ||
      (ruleCallAudience === 'selected-player' && !ruleCallRecipientUid)
    ) return;
    setRuleCallMutation(true);
    setRuleCallMessage(null);
    try {
      const disposition = await authorFacilitatorRuleCall({
        ambiguity: ruleCallAmbiguity,
        source: ruleCallSource,
        decision: ruleCallDecision,
        audience: ruleCallAudience,
        ...(ruleCallAudience === 'selected-player' ? { recipientUid: ruleCallRecipientUid } : {}),
        ...(ruleCallSupersedesCallId.trim() ? { supersedesCallId: ruleCallSupersedesCallId.trim() } : {}),
      });
      setRuleCallMessage(
        disposition === 'queued'
          ? 'RULE CALL QUEUED // awaiting reconnection'
          : disposition === 'stale'
            ? 'CALL STALE // refresh the current record and retry'
            : `RULE CALL ${disposition.toUpperCase()}`,
      );
      if (disposition === 'applied') {
        setRuleCallDecision('');
        setRuleCallSupersedesCallId('');
      }
    } catch {
      setRuleCallMessage('CALL REJECTED // active facilitator authority required');
    } finally {
      setRuleCallMutation(false);
    }
  }

  async function changeFighterWingCount(wingId: string): Promise<void> {
    if (!shipNumberWrite || fighterWingMutation !== null) return;
    const rawCount = fighterWingDrafts[wingId];
    const count = Number(rawCount);
    if (!Number.isSafeInteger(count) || count < 0 || count > 6) return;
    setFighterWingMutation(wingId);
    try {
      await setFighterWingCount(wingId, count);
    } finally {
      setFighterWingMutation(null);
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

  function resetChecklist(): void {
    resetSessionWaiver();
    window.dispatchEvent(new Event(SESSION_WAIVER_RESET_EVENT));
  }

  function chooseRecommendedRoster(playerCount: number): void {
    setDraftRoleIds(normalizeRoleDraft(recommendedRoleIds(playerCount)));
    if (playerCount < 14) setDraftWolfCultEnabled(false);
    setRosterMutationState('idle');
    setRosterMutationMessage(null);
  }

  function toggleDraftRole(roleId: string, enabled: boolean): void {
    setRosterMutationState('idle');
    setRosterMutationMessage(null);
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

  async function confirmRoster(lockChart = false): Promise<void> {
    if (lockChart && chartLocked) return;
    if (!rosterConfigurationValid) return;
    const activeSession = session;
    if (!activeSession) return;
    setConfirmingRoster(true);
    setRosterMutationState('pending');
    setRosterMutationMessage('Roster confirmation pending // awaiting server receipt.');
    const playerCount = draftRecommendedPlayerCount ?? draftRoleIds.length;
    const persistedExpansion = activeSession.setup?.expansion ?? activeSession.expansion;
    const expansion = playerCount >= 19
      ? 'capybara'
      : persistedExpansion === 'none' ? 'none' : 'base';
    try {
      const disposition = await confirmSetup({
        playerCount,
        chartId: chartLocked ? serverChartId : draftChartId,
        ...(lockChart ? { lockChart: true } : {}),
        expansion,
        turnLimit: activeSession.setup?.turnLimit ?? activeSession.turnLimit ?? 6,
        dioneEnabled: playerCount >= 12 && draftDioneEnabled,
        capybaraEnabled: expansion === 'capybara' ? true : draftCapybaraEnabled,
        universalArbourEnabled: draftUniversalArbourEnabled,
        wolfCultEnabled: draftWolfCultEnabled,
        activeRoleIds: draftRoleIds,
      });
      if (disposition === 'stale') {
        setRosterMutationState('stale');
        setRosterMutationMessage('Roster confirmation stale // refresh the live setup and retry.');
      } else {
        setRosterMutationState('committed');
        setRosterMutationMessage('Roster synchronized // server receipt committed.');
      }
    } catch {
      setRosterMutationState('rejected');
      setRosterMutationMessage('Roster confirmation rejected // review the live setup and retry.');
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
          <section className="gm-console__module gm-next-actions cic-frame" aria-label="Facilitator next actions">
            <h2 className="gm-console__section-title">Next actions</h2>
            <p className="gm-console__status">
              Server-backed facilitator queue // one GM owns every required step; additional GM lanes are optional.
            </p>
            <ol className="gm-next-actions__list">
              {facilitatorQueue.map((item) => (
                <li className="gm-next-actions__item" data-state={item.state} key={item.id}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
              {facilitatorQueue.length === 0 && (
                <li className="gm-next-actions__item" data-state="waiting">
                  <strong>No outstanding facilitator actions</strong>
                  <span>Continue monitoring the live session projection.</span>
                </li>
              )}
            </ol>
          </section>
          <section className="gm-console__module cic-frame" aria-label="Cycle controls">
            <h2 className="gm-console__section-title">Cycle control</h2>
            <p className="gm-console__status">Cycle {currentTurn}</p>
            {confirmTurnOverride && activeTurnTimer && (
              <p className="gm-turn-control__override" role="alert">
                ARE YOU SURE? // ACTIVE PHASE TIMER WILL BE OVERRIDDEN
              </p>
            )}
            <div className="gm-turn-control__actions">
              {endgameEvaluation ? (
                <p className="gm-console__status" role="status">
                  Final cycle complete // Endgame evaluation active. Advance and skip controls are disabled.
                </p>
              ) : currentTurn === 0 ? (
                <p className="gm-console__status" role="status">
                  Cycle 0 // ordinary production start is available in Setup.
                </p>
              ) : (
                <button
                  className={`cic-action-button${confirmTurnAdvance || (confirmTurnOverride && activeTurnTimer) ? ' cic-action-button--confirm' : ''}`}
                  type="button"
                  disabled={changingTurn || replayingTurnAnnouncement !== null}
                  onClick={requestTurnAdvance}
                >
                  {advancingTurn
                    ? `Advancing to Cycle ${currentTurn + 1}…`
                    : confirmTurnAdvance || (confirmTurnOverride && activeTurnTimer)
                      ? `ARE YOU SURE? // Advance to Cycle ${currentTurn + 1}`
                      : `Advance to Cycle ${currentTurn + 1}`}
                </button>
              )}
              {!endgameEvaluation && <button
                className={`cic-action-button${confirmTurnSkip ? ' cic-action-button--confirm' : ''}`}
                type="button"
                disabled={changingTurn || replayingTurnAnnouncement !== null}
                onClick={requestTurnSkip}
              >
                {skippingTurn
                  ? `Skipping to Cycle ${currentTurn + 1}…`
                  : confirmTurnSkip
                    ? `ARE YOU SURE? // Skip to Cycle ${currentTurn + 1}`
                    : `Skip to Cycle ${currentTurn + 1}`}
              </button>}
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
            <section className="gm-turn-control__airspace" aria-label="Wolf attack timing controls">
              <p className="gm-console__status">
                Wolf-attack timing // {wolfWindowStatus === 'planned'
                  ? 'planned // facilitator action required'
                  : `${wolfWindowStatus} // Cycle ${wolfWindowTurn} // revision ${wolfWindowRevision}`}
              </p>
              <p className="gm-console__hint">
                Approximate facilitator marker // no automatic attack, combat resolution, or cycle advance.
              </p>
              <p className="gm-console__hint gm-console__balance-guidance">
                Extra-role balance // For each extra role introduced, consider roughly 3 additional
                Wolf damage capacity per attack. The facilitator chooses the adjustment; this
                reminder does not change attacks.
              </p>
              <div className="gm-turn-control__actions">
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={!wolfWindowDueAvailable || wolfWindowMutation !== null}
                  onClick={() => void changeWolfAttackWindow('due')}
                >
                  {wolfWindowMutation === 'due' ? 'Marking timing due…' : 'Mark timing due'}
                </button>
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={!wolfWindowResolveAvailable || wolfWindowMutation !== null}
                  onClick={() => void changeWolfAttackWindow('resolved')}
                >
                  {wolfWindowMutation === 'resolved' ? 'Resolving timing…' : 'Resolve timing'}
                </button>
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={!wolfWindowDeferAvailable || wolfWindowMutation !== null}
                  onClick={() => void changeWolfAttackWindow('deferred')}
                >
                  {wolfWindowMutation === 'deferred' ? 'Deferring to Cycle 2…' : 'Defer to Cycle 2'}
                </button>
              </div>
            </section>
            <section className="gm-wolf-preparation" aria-label="Private Wolf attack preparation">
              <p className="gm-console__status">
                Private attack draft // {wolfAttackPreparation
                  ? `Cycle ${wolfAttackPreparation.turn} // revision ${wolfAttackPreparation.revision}`
                  : 'no revision saved'}
              </p>
              <p className="gm-console__hint">
                GM-only staging // players receive no cards, targets, modifiers, or notes. Declaration,
                dice, damage, and casualties remain separate server actions.
              </p>
              <fieldset className="gm-wolf-preparation__fieldset">
                <legend>Eligible Wolf cards // Cycle {currentTurn}</legend>
                <div className="gm-wolf-preparation__cards">
                  {WOLF_PREPARATION_CARD_TYPES.map(({ id, label }) => (
                    <label className="gm-wolf-preparation__field" key={id}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        inputMode="numeric"
                        value={wolfPreparationCounts[id] ?? ''}
                        onChange={(event) => setWolfPreparationCounts((current) => ({
                          ...current,
                          [id]: event.target.value,
                        }))}
                        aria-label={`${label} count`}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="gm-wolf-preparation__field">
                <span>Target preparation mode</span>
                <select
                  value={wolfPreparationMode}
                  onChange={(event) => setWolfPreparationMode(event.target.value as WolfAttackTargetMode)}
                  aria-label="Wolf attack target preparation mode"
                >
                  <option value="manual">Manual target plan</option>
                  <option value="pre-rolled">Pre-rolled target plan</option>
                </select>
              </label>
              {wolfPreparationShipIds.length > 0 && (
                <fieldset className="gm-wolf-preparation__fieldset">
                  <legend>Target plan // optional until declaration</legend>
                  <div className="gm-wolf-preparation__targets">
                    {wolfPreparationShipIds.map((shipId, cardIndex) => (
                      <label className="gm-wolf-preparation__field" key={`${shipId}-${cardIndex}`}>
                        <span>{cardIndex + 1}. {WOLF_PREPARATION_CARD_TYPES.find((card) => card.id === shipId)?.label}</span>
                        <select
                          value={wolfPreparationTargets[cardIndex] ?? ''}
                          onChange={(event) => setWolfPreparationTargets((current) => ({
                            ...current,
                            [cardIndex]: event.target.value,
                          }))}
                          aria-label={`Target for Wolf card ${cardIndex + 1}`}
                        >
                          <option value="">Unassigned</option>
                          {wolfPreparationTargetOptions.map((targetId) => (
                            <option value={targetId} key={targetId}>
                              {SHIPS.find((ship) => ship.id === targetId)?.name ?? targetId}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <fieldset className="gm-wolf-preparation__fieldset">
                <legend>Configured preparation markers</legend>
                <div className="gm-wolf-preparation__modifiers">
                  {WOLF_PREPARATION_MODIFIERS.map(({ id, label }) => (
                    <label className="gm-wolf-preparation__check" key={id}>
                      <input
                        type="checkbox"
                        checked={wolfPreparationModifiers[id] === true}
                        onChange={(event) => setWolfPreparationModifiers((current) => ({
                          ...current,
                          [id]: event.target.checked,
                        }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
                <span>Private facilitator notes</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={wolfPreparationNotes}
                  onChange={(event) => setWolfPreparationNotes(event.target.value)}
                  aria-label="Private Wolf attack facilitator notes"
                />
              </label>
              <div className="gm-turn-control__actions">
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={wolfPreparationMutation || !local || currentTurn < 1 || wolfPreparationShipIds.length === 0}
                  onClick={() => void saveWolfAttackPreparation()}
                >
                  {wolfPreparationMutation ? 'Saving private draft…' : 'Save private attack draft'}
                </button>
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={!wolfDeclarationAvailable || wolfDeclarationMutation}
                  onClick={() => void declareCurrentWolfAttack()}
                >
                  {wolfDeclarationMutation ? 'Declaring Wolf attack…' : 'Declare Wolf attack'}
                </button>
              </div>
              <LiveChangeRegion
                as="p"
                className="gm-console__status"
                changeKey={wolfDeclarationAnnouncementKey}
                message={wolfDeclarationAnnouncement}
              />
            </section>
          </section>
          <section className="gm-console__module gm-crisis cic-frame" aria-label="Crisis state machine">
            <h2 className="gm-console__section-title">Crisis state machine</h2>
            <p className="gm-console__status">
              {gmCrisisState
                ? `${gmCrisisState.crisisId} // ${gmCrisisState.state} // revision ${gmCrisisState.revision}`
                : 'No crisis drafted'}
            </p>
            <p className="gm-console__hint">
              Facilitator-authored lifecycle only. Draft and debate notes stay facilitator-private;
              member events carry the state title after delivery decisions commit.
            </p>
            <label className="gm-wolf-preparation__field">
              <span>Crisis kind</span>
              <select aria-label="Crisis kind" value={crisisKindDraft}
                disabled={Boolean(gmCrisisState && gmCrisisState.state !== 'closed') || crisisMutationState !== null}
                onChange={(event) => { if (isCrisisKind(event.target.value)) setCrisisKindDraft(event.target.value); }}>
                {CRISIS_KINDS.map((kind) => <option key={kind} value={kind}>{CRISIS_KIND_LABELS[kind]}</option>)}
              </select>
            </label>
            <p className="gm-console__hint">
              Presidential Election requires the President role. Religious Zealotry requires the Universal Arbour or Wolf Cult configuration.
              Other crisis kinds may be used without the President. Record a private override to adapt an incompatible crisis.
            </p>
            <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
              <span>Facilitator configuration override (optional, private)</span>
              <textarea rows={2} maxLength={1000} aria-label="Crisis configuration override"
                value={crisisOverrideDraft}
                disabled={Boolean(gmCrisisState && gmCrisisState.state !== 'closed' && gmCrisisState.state !== 'draft') || crisisMutationState !== null}
                onChange={(event) => setCrisisOverrideDraft(event.target.value)} />
            </label>
            {crisisKindDraft === 'approaching-vessel' && (
              <p className="gm-console__hint">
                Delivery publishes the scouting report to all session members. Record whether the vessel is real
                or a trap and your difficulty reasoning in the private notes below. Those notes and the
                configuration override are never included in the player report.
              </p>
            )}
            {crisisKindDraft === 'religious-zealotry' && (
              <p className="gm-console__hint">
                Delivery publishes the movement report to all session members. The report does not identify
                any player’s secret loyalty or reveal which loyalty configuration is enabled. Keep private
                context and adjudication notes in the facilitator notes below.
              </p>
            )}
            {crisisKindDraft === 'presidential-election' && (
              <p className="gm-console__hint">
                Delivery introduces the election decision. Voting method, timing and campaign rules still
                need facilitator decisions; this introduction does not open voting or configure a ballot.
              </p>
            )}
            {crisisKindDraft === 'disease-outbreak' && (
              <DiseaseOutbreakFields
                disabled={Boolean(gmCrisisState && gmCrisisState.state !== 'closed' && gmCrisisState.state !== 'draft') || crisisMutationState !== null}
                ships={outbreakShips} diseaseShipIds={diseaseShipIds} diseaseWork={diseaseWork} diseaseRisk={diseaseRisk}
                setDiseaseShipIds={setDiseaseShipIds} setDiseaseWork={setDiseaseWork} setDiseaseRisk={setDiseaseRisk}
              />
            )}
            <label className="gm-wolf-preparation__field">
              <span>Crisis identifier</span>
              <input
                type="text"
                maxLength={80}
                value={crisisIdDraft}
                disabled={Boolean(gmCrisisState && gmCrisisState.state !== 'closed') || crisisMutationState !== null}
                onChange={(event) => setCrisisIdDraft(event.target.value)}
                aria-label="Crisis identifier"
              />
            </label>
            <label className="gm-wolf-preparation__field">
              <span>Crisis title</span>
              <input
                type="text"
                maxLength={160}
                value={crisisTitleDraft}
                disabled={Boolean(gmCrisisState && gmCrisisState.state !== 'closed') || crisisMutationState !== null}
                onChange={(event) => setCrisisTitleDraft(event.target.value)}
                aria-label="Crisis title"
              />
            </label>
            <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
              <span>{crisisKindDraft === 'approaching-vessel' ? 'Vessel reality and difficulty reasoning (private)' : 'Facilitator notes'}</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={crisisDetailsDraft}
                disabled={Boolean(gmCrisisState && gmCrisisState.state !== 'closed') || crisisMutationState !== null}
                onChange={(event) => setCrisisDetailsDraft(event.target.value)}
                aria-label="Crisis facilitator notes"
              />
            </label>
            <div className="gm-turn-control__actions">
              {nextCrisisStates(gmCrisisState).map((state) => (
                <button
                  className="cic-action-button"
                  type="button"
                  key={state}
                  disabled={!local || crisisMutationState !== null}
                  onClick={() => void advanceCrisis(state)}
                >
                  {crisisMutationState === state ? `Committing ${state}…` : `Mark ${state}`}
                </button>
              ))}
            </div>
            {gmCrisisState?.crisisKind === 'approaching-vessel' && gmCrisisState.state !== 'draft' && (
              <section className="gm-crisis__admission" aria-label="Voyage 33-0 admission">
                <h3 className="gm-console__section-title">Voyage 33-0</h3>
                {session?.voyage33Admission ? (
                  <p className="gm-console__hint">
                    Admitted with 40,000 survivors and unrest 0. It must dock with a host whose resources
                    fund maintenance steps 1–4; no host or resource spend has been selected.
                  </p>
                ) : (
                  <>
                    <p className="gm-console__hint">
                      Admit the damaged cruiser after the facilitator accepts this crisis. Admission records
                      40,000 survivors and its printed host-docking and maintenance commitments without
                      choosing a host or spending resources.
                    </p>
                    <button
                      className="cic-action-button"
                      type="button"
                      disabled={!local || voyageAdmissionMutation}
                      onClick={() => void admitVoyage33FromCrisis()}
                    >
                      {voyageAdmissionMutation ? 'Admitting Voyage 33-0…' : 'Admit Voyage 33-0'}
                    </button>
                  </>
                )}
              </section>
            )}
            <p className="gm-console__status" role="status" aria-live="polite">
              {crisisMessage ?? (gmCrisisState
                ? `Next allowed state${nextCrisisStates(gmCrisisState).length === 1 ? '' : 's'}: ${nextCrisisStates(gmCrisisState).join(', ')}`
                : 'Start with a facilitator-authored draft.')}
            </p>
            {gmCrisisState?.crisisKind === 'religious-zealotry' && gmCrisisState.state === 'debated' && (
              <section className="gm-zealotry-response" aria-label="Private Religious Zealotry response">
                <h3 className="gm-console__section-title">Private Zealotry response</h3>
                <p className="gm-console__hint">
                  Record the facilitator&apos;s source-approved response for this debated crisis. This stays GM-only;
                  publication and any binding law announcement are separate decisions.
                </p>
                <fieldset className="gm-zealotry-response__choices">
                  <legend>Response ideas (choose any combination)</legend>
                  {ZEALOTRY_RESPONSE_ACTIONS.map((action) => (
                    <label key={action} className="gm-zealotry-response__choice">
                      <input
                        type="checkbox"
                        checked={zealotryActionsDraft.includes(action)}
                        disabled={zealotryMutation}
                        onChange={() => toggleZealotryAction(action)}
                      />
                      <span>{action[0]!.toUpperCase() + action.slice(1)}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
                  <span>Custom response (optional)</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={zealotryCustomDraft}
                    disabled={zealotryMutation}
                    onChange={(event) => setZealotryCustomDraft(event.target.value)}
                    aria-label="Custom Religious Zealotry response"
                  />
                </label>
                <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
                  <span>Private rationale (optional)</span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={zealotryRationaleDraft}
                    disabled={zealotryMutation}
                    onChange={(event) => setZealotryRationaleDraft(event.target.value)}
                    aria-label="Private Religious Zealotry rationale"
                  />
                </label>
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={zealotryMutation || (zealotryActionsDraft.length === 0 && !zealotryCustomDraft.trim())}
                  onClick={() => void saveZealotryResponse()}
                >
                  {zealotryMutation ? 'Recording response…' : 'Record private response'}
                </button>
                <p className="gm-console__status" role="status" aria-live="polite">
                  {zealotryMessage ?? (gmZealotryResponse
                    ? `Recorded response // revision ${gmZealotryResponse.revision} // census context ${gmZealotryResponse.loyaltyCensusRevision ?? 'absent'}`
                    : 'No private response recorded for this crisis revision.')}
                </p>
                {gmZealotryResponse && (
                  <DecisionAttribution
                    source="Facilitator source-approved Religious Zealotry response"
                    actorUid={gmZealotryResponse.actorUid}
                    recordedAt={gmZealotryResponse.updatedAt}
                  />
                )}
              </section>
            )}
            {gmCrisisState?.crisisKind === 'civil-unrest' && gmCrisisState.state === 'debated' && (
              <section className="gm-civil-unrest-resolution" aria-label="Private Civil Unrest resolution">
                <h3 className="gm-console__section-title">Private Civil Unrest resolution</h3>
                <p className="gm-console__hint">
                  Record the facilitator&apos;s response on behalf of the President. This is a facilitator record and
                  does not impersonate a player&apos;s authorship. The response, consequence, rationale, and current
                  grievance revision links stay GM-only; no fleet change or public publication occurs here.
                </p>
                <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
                  <span>Facilitator-recorded President response</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={civilUnrestPresidentDraft}
                    disabled={civilUnrestMutation}
                    onChange={(event) => setCivilUnrestPresidentDraft(event.target.value)}
                    aria-label="Facilitator-recorded President response"
                  />
                </label>
                <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
                  <span>Facilitator-recorded consequence</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={civilUnrestConsequenceDraft}
                    disabled={civilUnrestMutation}
                    onChange={(event) => setCivilUnrestConsequenceDraft(event.target.value)}
                    aria-label="Facilitator-recorded Civil Unrest consequence"
                  />
                </label>
                <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
                  <span>Private Civil Unrest rationale</span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={civilUnrestRationaleDraft}
                    disabled={civilUnrestMutation}
                    onChange={(event) => setCivilUnrestRationaleDraft(event.target.value)}
                    aria-label="Private Civil Unrest rationale"
                  />
                </label>
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={civilUnrestMutation || !civilUnrestPresidentDraft.trim() || !civilUnrestConsequenceDraft.trim()}
                  onClick={() => void saveCivilUnrestResolution()}
                >
                  {civilUnrestMutation ? 'Recording resolution…' : 'Record private Civil Unrest resolution'}
                </button>
                {gmCivilUnrestResolution && (
                  <p className="gm-console__hint" aria-label="Current Civil Unrest grievance links">
                    Current grievance links // {gmCivilUnrestResolution.grievanceRevisions.map((entry) =>
                      `${entry.shipId}: ${entry.revision === null ? 'absent' : `revision ${entry.revision}`}`,
                    ).join(' // ')}
                  </p>
                )}
                <p className="gm-console__status" role="status" aria-live="polite">
                  {civilUnrestMessage ?? (gmCivilUnrestResolution
                    ? `Recorded resolution // revision ${gmCivilUnrestResolution.revision} // grievance links retained privately`
                    : 'No private resolution recorded for this crisis revision.')}
                </p>
                {gmCivilUnrestResolution && (
                  <DecisionAttribution
                    source="Facilitator response on behalf of the President"
                    actorUid={gmCivilUnrestResolution.actorUid}
                    recordedAt={gmCivilUnrestResolution.updatedAt}
                  />
                )}
              </section>
            )}
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
          <SmallShipOperations />
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
                className="cic-action-button"
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
                    {ship.id === 'aegis' && (
                      <>
                        <h4 className="gm-fleet-resource-ship__category">Fighter wings</h4>
                        <p className="gm-role-setup__note">GM correction only // live strength is separate from bay charge, damage, and upgrade state.</p>
                        <ul>
                          {FIGHTER_WING_IDS.map((wingId) => {
                            const currentWing = session.fighterWingCounts?.[wingId];
                            const capacity = session.shipUpgrades?.aegis?.includes('construction-bay') ? 6 : 4;
                            const draft = fighterWingDrafts[wingId] ?? (currentWing ? String(currentWing.count) : '');
                            const parsedDraft = Number(draft);
                            const validDraft = Number.isSafeInteger(parsedDraft) && parsedDraft >= 0 && parsedDraft <= capacity;
                            return (
                              <li key={wingId} aria-label={`${wingId} fighter count ${currentWing?.count ?? 'unavailable'}`}>
                                <span className="resource-label">{wingId === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo'} // {currentWing ? `${currentWing.count} / ${capacity}` : `Unavailable / ${capacity}`}</span>
                                <div className="ship-counter__controls">
                                  <input
                                    type="number"
                                    min="0"
                                    max={capacity}
                                    value={draft}
                                    aria-label={`Set ${wingId} fighter count`}
                                    onChange={(event) => setFighterWingDrafts((values) => ({ ...values, [wingId]: event.target.value }))}
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Apply ${wingId} fighter count`}
                                    disabled={!shipNumberWrite || !validDraft || fighterWingMutation !== null}
                                    onClick={() => void changeFighterWingCount(wingId)}
                                  >{fighterWingMutation === wingId ? 'Applying…' : 'Apply'}</button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                    <PursuitTracker
                      currentTurn={currentTurn}
                      shipId={ship.id}
                      shipName={ship.name}
                      shipCoordinate={shipCoordinate}
                      {...(session.pursuitDistances?.[ship.id] !== undefined
                        ? { pursuitDistance: session.pursuitDistances[ship.id] }
                        : {})}
                    />
                  </section>
                );
              })}
            </div>
          </section>

          <section className="gm-console__module cic-frame" aria-label="Setup">
            <button
              className="gm-controls-lock cic-action-button"
              type="button"
              aria-expanded={setupOpen}
              onClick={() => setSetupOpen((open) => !open)}
            >
              Setup
            </button>
            {setupOpen && (
              <div className="gm-setup" aria-label="Setup controls">
                <button
                  className="gm-dradis__availability cic-action-button"
                  type="button"
                  aria-label={`Turn Capybara ${capybaraEnabled ? 'off' : 'on'}`}
                  aria-pressed={capybaraEnabled}
                  ref={capybaraTriggerRef}
                  disabled={changingCapybara || capybaraQueued}
                  onClick={() => setPendingCapybaraEnabled(!capybaraEnabled)}
                >
                  Capybara // {capybaraQueued ? 'Change queued' : capybaraEnabled ? 'In convoy' : 'Offline'}
                </button>
                <button
                  className="gm-dradis__availability cic-action-button"
                  type="button"
                  aria-label={`Turn Dione ${dioneEnabled ? 'off' : 'on'}`}
                  aria-pressed={dioneEnabled}
                  ref={dioneTriggerRef}
                  disabled={changingDione || dioneQueued}
                  onClick={() => setPendingDioneEnabled(!dioneEnabled)}
                >
                  Dione // {dioneQueued ? 'Change queued' : dioneEnabled ? 'In convoy' : 'Offline'}
                </button>
                <button
                  className="gm-dradis__availability cic-action-button"
                  type="button"
                  aria-label={`Turn Universal Arbour ${universalArbourEnabled ? 'off' : 'on'}`}
                  aria-pressed={universalArbourEnabled}
                  disabled={confirmingRoster || rosterQueued}
                  onClick={() => changeUniversalArbour(!universalArbourEnabled)}
                >
                  Universal Arbour // {universalArbourEnabled ? 'Configured' : 'Off'}
                </button>
                <button
                  className="gm-dradis__availability cic-action-button"
                  type="button"
                  aria-label={`Turn Wolf Cult ${wolfCultEnabled ? 'off' : 'on'}`}
                  aria-pressed={wolfCultEnabled}
                  disabled={confirmingRoster || rosterQueued || (draftPlayerCount < 14 && !wolfCultEnabled)}
                  onClick={() => changeWolfCult(!wolfCultEnabled)}
                >
                  Wolf Cult // {wolfCultEnabled ? 'Configured' : 'Off'}
                </button>
                <p className="gm-role-setup__note" role="status" aria-label="Optional loyalty configuration">
                  Optional loyalty // {universalArbourEnabled ? 'Universal Arbour leader' : wolfCultEnabled ? 'Wolf Cult replaces the second Wolf Agent' : 'none'}.
                  {draftPlayerCount < 14
                    ? ' Wolf Cult requires the printed two-Wolf player count.'
                    : ' Confirm setup locks this public choice; individual loyalty cards remain private.'}
                </p>
                <button
                  className="gm-dradis__availability cic-action-button"
                  type="button"
                  aria-label={`Turn Press ${pressEnabled ? 'off' : 'on'}`}
                  aria-pressed={pressEnabled}
                  ref={pressTriggerRef}
                  disabled={endgameEvaluation || changingPress || pressQueued}
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
                  {endgameEvaluation
                    ? 'Endgame evaluation // Press availability controls are frozen.'
                    : pressMutationMessage ?? (pressMutationState === 'pending'
                      ? 'Press availability pending // awaiting server confirmation.'
                      : `Press availability // ${pressEnabled ? 'enabled' : 'disabled'} // revision ${session?.pressAvailabilityRevision ?? 0}`)}
                </p>
                <p className="gm-role-setup__note" role="status" aria-label="Press GM projection">
                  {pressProjectionMessage}
                </p>
                <fieldset className="gm-role-setup gm-chart-setup">
                  <legend>Star chart</legend>
                  <label className="gm-role-preset">
                    <span>Star chart</span>
                    <select aria-label="Star chart" value={draftChartId}
                      disabled={chartLocked || confirmingRoster || rosterQueued}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'A' || value === 'B' || value === 'C') setDraftChartId(value);
                      }}>
                      <option value="A">Chart A</option>
                      <option value="B">Chart B</option>
                      <option value="C">Chart C</option>
                    </select>
                  </label>
                  <p className="gm-role-setup__note" role="status" aria-label="Star chart lock status">
                    {`Current chart ${serverChartId} // ${chartLocked ? 'Locked' : 'Not locked'}`}
                    {!chartLocked && draftChartId !== serverChartId ? ` // Chart ${draftChartId} staged` : ''}
                  </p>
                  <p className="gm-role-setup__note">
                    Confirm the staged setup and lock this chart. Other roster choices remain editable until start.
                  </p>
                  <button className="cic-action-button" type="button"
                    disabled={chartLocked || !rosterConfigurationValid || confirmingRoster || rosterQueued}
                    onClick={() => void confirmRoster(true)}>
                    Lock star chart
                  </button>
                </fieldset>
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
                    <p
                      role={rosterMutationMessage ? 'status' : undefined}
                      aria-label={rosterMutationMessage ? 'Roster confirmation status' : undefined}
                      data-state={rosterMutationState}
                    >
                      {confirmingRoster
                        ? 'Confirming roster…'
                        : rosterQueued
                          ? 'Roster command queued // awaiting server'
                          : rosterMutationMessage
                            ? rosterMutationMessage
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
                <fieldset className="gm-production-start" aria-label="Ordinary production start">
                  <legend>Ordinary production start</legend>
                  <p className="gm-role-setup__note">
                    The server derives the routine Wolf count and private loyalty cards from the locked roster.
                    Wolf selection is not a caller-controlled setup step.
                  </p>
                  <p
                    className="gm-role-setup__note"
                    role="status"
                    aria-live="polite"
                    aria-busy={startMutationState === 'pending'}
                    data-state={startMutationState}
                  >
                    {startMutationMessage ?? (
                      currentTurn !== 0
                        ? 'Start unavailable // this session has already left Cycle 0.'
                        : session.phase !== 'casting'
                          ? 'Start blocked // confirm the locked roster before production start.'
                          : 'Ready // validate the live roster, reciprocal seats, vessels, loyalty, and GM staffing.'
                    )}
                  </p>
                  <button
                    className={`cic-action-button${confirmGameStart ? ' cic-action-button--confirm' : ''}`}
                    type="button"
                    disabled={startingGame || currentTurn !== 0 || session.phase !== 'casting'}
                    onClick={requestProductionStart}
                  >
                    {startingGame
                      ? 'Starting production // awaiting server receipt…'
                      : confirmGameStart
                        ? 'ARE YOU SURE? // ADVANCE TO CYCLE 1'
                      : 'Start production // Advance to Cycle 1'}
                  </button>
                  {setupReceipt && (
                    <section className="gm-start-receipt" aria-label="Production start receipt">
                      <h3 className="gm-console__section-title">Production start receipt</h3>
                      <dl className="gm-start-receipt__list">
                        <div><dt>Disposition</dt><dd>{startMutationState}</dd></div>
                        <div><dt>Source</dt><dd>{setupReceipt.source}</dd></div>
                        <div><dt>Locked configuration</dt><dd>{setupReceipt.mode} // {setupReceipt.playerCount} core</dd></div>
                        <div><dt>Wolf rule / result</dt><dd>{setupReceipt.wolfRule} // {setupReceipt.wolfCount} // {setupReceipt.resultCount} private cards</dd></div>
                        <div><dt>Press input</dt><dd>
                          {setupReceipt.pressEligibility.enabled === false ? 'disabled' : 'enabled'} // {
                            typeof setupReceipt.pressEligibility.activeClaimCount === 'number'
                              ? setupReceipt.pressEligibility.activeClaimCount
                              : 0
                          } live claim(s) // {
                            setupReceipt.pressEligibility.claimed === true ? 'claimed' : 'not claimed'
                          }
                        </dd></div>
                        <div><dt>Excluded GMs</dt><dd>{setupReceipt.excludedGmCount}</dd></div>
                        <div><dt>Modifiers</dt><dd>{setupReceipt.orderedModifiers.length === 0 ? 'none' : JSON.stringify(setupReceipt.orderedModifiers)}</dd></div>
                        <div><dt>Setup revisions</dt><dd>{setupReceipt.expectedSetupRevision} → {setupReceipt.committedSetupRevision}</dd></div>
                      </dl>
                    </section>
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
            {currentTurn === 0 && (session.phase === 'lobby' || session.phase === 'casting') && (
              <section className="gm-casting-board" aria-label="Facilitator casting">
                <header className="gm-casting-board__header">
                  <div>
                    <p className="eyebrow">Facilitator casting</p>
                    <h3>Assign printed roles</h3>
                  </div>
                  <span>{castingPlayers.length} eligible players</span>
                </header>
                <p className="gm-player-roster__hint">
                  Assigning a role clears that player’s device console selection. Releasing a role also opens its canonical station.
                </p>
                {castingPlayers.length === 0 ? (
                  <p className="gm-console__status">No eligible players are connected.</p>
                ) : (
                  <ul className="gm-casting-board__list">
                    {castingPlayers.map((player) => {
                      const name = normalizeDisplayName(player.displayName);
                      const options = availableCastingRoles(player);
                      const restriction = castingRestriction(player);
                      const draftedRole = castingDraftRoles[player.uid];
                      const draftRole = draftedRole && options.includes(draftedRole)
                        ? draftedRole
                        : options[0] ?? '';
                      return (
                        <li className="gm-casting-board__player" key={player.uid}>
                          <div>
                            <strong>{name}</strong>
                            <span>
                              {player.assignedRoleId
                                ? `Assigned // ${castingRoleLabel(player.assignedRoleId)}`
                                : 'Unassigned'}
                            </span>
                          </div>
                          {player.assignedRoleId && !restriction ? (
                            <button
                              className="gm-casting-board__action cic-action-button"
                              type="button"
                              disabled={castingMutationUid !== null}
                              onClick={() => void changeCastingRole(player, null)}
                            >
                              {castingMutationUid === player.uid ? 'Releasing…' : `Release role from ${name}`}
                            </button>
                          ) : restriction ? (
                            <p className="gm-casting-board__restriction" role="status">
                              {restriction}
                            </p>
                          ) : (
                            <div className="gm-casting-board__assign">
                              <label htmlFor={`casting-role-${player.uid}`}>Role for {name}</label>
                              <select
                                id={`casting-role-${player.uid}`}
                                value={draftRole}
                                disabled={castingMutationUid !== null || options.length === 0}
                                onChange={(event) => setCastingDraftRoles((current) => ({
                                  ...current,
                                  [player.uid]: event.target.value,
                                }))}
                              >
                                {options.map((roleId) => (
                                  <option key={roleId} value={roleId}>{castingRoleLabel(roleId)}</option>
                                ))}
                              </select>
                              <button
                                className="gm-casting-board__action cic-action-button"
                                type="button"
                                disabled={castingMutationUid !== null || draftRole.length === 0}
                                onClick={() => void changeCastingRole(player, draftRole)}
                              >
                                {castingMutationUid === player.uid ? 'Assigning…' : `Assign role to ${name}`}
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="gm-player-roster__note" role="status" aria-live="polite">
                  {castingMutationMessage ?? 'Role assignments commit through the authoritative casting service.'}
                </p>
              </section>
            )}
            {(session.phase === 'briefing' || session.phase === 'active') && (
              <section className="gm-casting-board gm-casting-board--replacement" aria-label="Facilitator replacement roles">
                <header className="gm-casting-board__header">
                  <div>
                    <p className="eyebrow">Live adjudication</p>
                    <h3>Assign replacement role</h3>
                  </div>
                  <span>{replacementCandidates.length} player records</span>
                </header>
                <p className="gm-player-roster__hint">
                  Record dead, arrested, removed, or late status explicitly before assigning one available source role.
                  Connectivity never creates eligibility. The original role and loyalty card remain private history;
                  the old station is released atomically.
                </p>
                <div className="gm-casting-board__assign">
                  <label htmlFor="replacement-target">Player record</label>
                  <select
                    id="replacement-target"
                    value={replacementTargetUid}
                    disabled={replacementBusy || replacementCandidates.length === 0}
                    onChange={(event) => {
                      setReplacementTargetUid(event.target.value);
                      setReplacementRevision(0);
                      setReplacementSetupRevision(session.setupRevision ?? 0);
                      setReplacementDecisionRecorded(false);
                      setReplacementMessage(null);
                    }}
                  >
                    <option value="">Select a player</option>
                    {replacementCandidates.map((player) => (
                      <option key={player.uid} value={player.uid}>
                        {normalizeDisplayName(player.displayName)}
                        {player.escapeState ? ` // ESCAPE ${player.escapeState.status.toUpperCase()}` : ''}
                        {player.connected === false ? ' // offline' : ''}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="replacement-reason">Eligibility reason</label>
                  <select
                    id="replacement-reason"
                    value={replacementReason}
                    disabled={replacementBusy}
                    onChange={(event) => setReplacementReason(
                      event.target.value as typeof replacementReason,
                    )}
                  >
                    {REPLACEMENT_ELIGIBILITY_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                  <button
                    className="gm-casting-board__action cic-action-button"
                    type="button"
                    disabled={replacementBusy || !replacementTargetUid}
                    onClick={() => void adjudicateReplacement()}
                  >
                    {replacementBusy ? 'Recording…' : 'Record eligibility'}
                  </button>
                  <label htmlFor="replacement-role">Replacement role</label>
                  <select
                    id="replacement-role"
                    value={replacementRoleId}
                    disabled={replacementBusy || replacementRoles.length === 0}
                    onChange={(event) => setReplacementRoleId(event.target.value)}
                  >
                    {replacementRoles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name} // {role.vesselName}</option>
                    ))}
                  </select>
                  <button
                    className="gm-casting-board__action cic-action-button"
                    type="button"
                    disabled={replacementBusy || !replacementTargetUid || !replacementRoleId || replacementRevision === 0}
                    onClick={() => void commitReplacement()}
                  >
                    {replacementBusy ? 'Assigning…' : 'Assign replacement role'}
                  </button>
                </div>
                <p className="gm-player-roster__note" role="status" aria-live="polite">
                  {replacementMessage ?? 'No eligibility decision recorded for the selected player.'}
                </p>
                {replacementDecisionRecorded && (
                  <DecisionAttribution
                    source="Facilitator replacement decision"
                    actorVisibility="unavailable"
                  />
                )}
              </section>
            )}
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

          {isGm && loyaltyCensus && (
            <section
              className="gm-console__module cic-frame gm-loyalty-census"
              aria-label="Private loyalty census"
            >
              <h2 className="gm-console__section-title">Private loyalty census</h2>
              <p className="gm-player-roster__hint">
                Facilitator-only readout // revision {loyaltyCensus.revision}
              </p>
              {loyaltyCensus.entries.length === 0 ? (
                <p className="gm-console__status">No private loyalty cards are currently projected.</p>
              ) : (
                <div className="gm-loyalty-census__table-wrap">
                  <table className="gm-loyalty-census__table">
                    <caption className="sr-only">Private loyalty cards by player identity</caption>
                    <thead>
                      <tr><th scope="col">Player</th><th scope="col">Loyalty</th><th scope="col">Suspicion</th><th scope="col">Facilitator note</th></tr>
                    </thead>
                    <tbody>
                      {loyaltyCensus.entries.map((entry) => (
                        <tr key={entry.uid}>
                          <th scope="row">{entry.uid}</th>
                          <td>{entry.kind}</td>
                          <td>{entry.suspicion === null ? 'none' : entry.suspicion}</td>
                          <td>
                            <label className="sr-only" htmlFor={`census-note-${entry.uid}`}>
                              Facilitator note for {entry.uid}
                            </label>
                            <textarea
                              id={`census-note-${entry.uid}`}
                              maxLength={240}
                              rows={2}
                              value={censusNotes[entry.uid] ?? ''}
                              onChange={(event) => setCensusNotes((current) => ({
                                ...current,
                                [entry.uid]: event.target.value,
                              }))}
                            />
                            <button
                              className="gm-census-note__save cic-action-button"
                              type="button"
                              disabled={censusNoteMutationUid !== null}
                              onClick={() => void saveCensusNote(entry.uid)}
                            >
                              {censusNoteMutationUid === entry.uid ? 'Saving…' : 'Save note'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {isGm && (
            <section className="gm-console__module cic-frame gm-wolf-cult-intelligence" aria-label="Wolf Cult intelligence delivery">
              <h2 className="gm-console__section-title">Wolf Cult // private intelligence</h2>
              <p className="gm-player-roster__hint">
                Deliver the four source-defined facts to the current Cult leader. The server checks the live loyalty assignments and keeps this projection private.
              </p>
              {wolfCultRecipients.length !== 1 || wolfAgentRecipients.length !== 1 ? (
                <p className="gm-console__status">A current Wolf Cult leader and one Wolf agent are required before delivery.</p>
              ) : (
                <div className="gm-wolf-cult-intelligence__form">
                  <p className="gm-player-roster__note">Cult leader // {wolfCultRecipients[0]!.uid}</p>
                  <label htmlFor="wolf-cult-fortress">Active Wolf fortress coordinate</label>
                  <input
                    id="wolf-cult-fortress"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={wolfCultFortressCoordinate}
                    disabled={wolfCultIntelMutation}
                    onChange={(event) => setWolfCultFortressCoordinate(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  />
                  <label htmlFor="wolf-cult-supplies">Abandoned supplies coordinate</label>
                  <input
                    id="wolf-cult-supplies"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={wolfCultSuppliesCoordinate}
                    disabled={wolfCultIntelMutation}
                    onChange={(event) => setWolfCultSuppliesCoordinate(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  />
                  <label htmlFor="wolf-cult-agent">Other Wolf agent</label>
                  <select
                    id="wolf-cult-agent"
                    value={wolfCultAgentUid}
                    disabled={wolfCultIntelMutation}
                    onChange={(event) => setWolfCultAgentUid(event.target.value)}
                  >
                    {wolfAgentRecipients.map((entry) => <option key={entry.uid} value={entry.uid}>{entry.uid}</option>)}
                  </select>
                  <label htmlFor="wolf-cult-code-word">Code word</label>
                  <input
                    id="wolf-cult-code-word"
                    maxLength={80}
                    value={wolfCultCodeWord}
                    disabled={wolfCultIntelMutation}
                    onChange={(event) => setWolfCultCodeWord(event.target.value)}
                  />
                  <button
                    className="gm-census-note__save cic-action-button"
                    type="button"
                    disabled={wolfCultIntelMutation || !wolfCultFortressCoordinate || !wolfCultSuppliesCoordinate || !wolfCultAgentUid || !wolfCultCodeWord.trim()}
                    onClick={() => void deliverWolfCultIntel()}
                  >
                    {wolfCultIntelMutation ? 'Delivering…' : 'Deliver private Wolf intel'}
                  </button>
                  <p className="gm-player-roster__note" role="status" aria-live="polite">
                    {wolfCultIntelMessage ?? (gmWolfCultIntelligence
                      ? `Current delivery // revision ${gmWolfCultIntelligence.revision} // ${gmWolfCultIntelligence.recipientUid}`
                      : 'No Wolf Cult intelligence has been delivered.')}
                  </p>
                </div>
              )}
            </section>
          )}

          {isGm && (
            <section className="gm-console__module cic-frame gm-arbour-vision" aria-label="Universal Arbour facilitator call">
              <h2 className="gm-console__section-title">Universal Arbour // facilitator call</h2>
              <p className="gm-player-roster__hint">
                Write one private call for the current Universal Arbour holder. The recipient sees the category and your text in their private brief.
              </p>
              {arbourVisionRecipients.length === 0 ? (
                <p className="gm-console__status">No current Universal Arbour holder is projected.</p>
              ) : (
                <div className="gm-arbour-vision__form">
                  <label htmlFor="arbour-vision-recipient">Recipient</label>
                  <select
                    id="arbour-vision-recipient"
                    value={arbourVisionTargetUid}
                    disabled={arbourVisionMutation}
                    onChange={(event) => setArbourVisionTargetUid(event.target.value)}
                  >
                    {arbourVisionRecipients.map((entry) => (
                      <option key={entry.uid} value={entry.uid}>{entry.uid}</option>
                    ))}
                  </select>
                  <label htmlFor="arbour-vision-kind">Call type</label>
                  <select
                    id="arbour-vision-kind"
                    value={arbourVisionKind}
                    disabled={arbourVisionMutation}
                    onChange={(event) => setArbourVisionKind(event.target.value as ArbourVision['kind'])}
                  >
                    <option value="location">Location</option>
                    <option value="danger">Danger</option>
                    <option value="suspicion">Suspicion</option>
                  </select>
                  <label htmlFor="arbour-vision-text">Facilitator call</label>
                  <textarea
                    id="arbour-vision-text"
                    value={arbourVisionText}
                    maxLength={240}
                    rows={3}
                    disabled={arbourVisionMutation}
                    onChange={(event) => setArbourVisionText(event.target.value)}
                  />
                  <button
                    className="gm-census-note__save cic-action-button"
                    type="button"
                    disabled={arbourVisionMutation || !arbourVisionText.trim()}
                    onClick={() => void saveArbourVision()}
                  >
                    {arbourVisionMutation ? 'Publishing…' : 'Publish private call'}
                  </button>
                  <p className="gm-player-roster__note" role="status" aria-live="polite">
                    {arbourVisionMessage ?? (gmArbourVision
                      ? `Current call // revision ${gmArbourVision.revision} // ${gmArbourVision.recipientUid}`
                      : 'No facilitator call published yet.')}
                  </p>
                </div>
              )}
            </section>
          )}

          {isGm && (
            <section className="gm-console__module cic-frame gm-arbour-vision" aria-label="Facilitator rule call">
              <h2 className="gm-console__section-title">Facilitator rule call</h2>
              <p className="gm-player-roster__hint">
                Record a durable ruling when the table needs an ambiguity resolved. This call is labeled separately from random or dice results.
              </p>
              <div className="gm-arbour-vision__form">
                <label htmlFor="rule-call-ambiguity">Question or ambiguity</label>
                <textarea
                  id="rule-call-ambiguity"
                  value={ruleCallAmbiguity}
                  maxLength={240}
                  rows={2}
                  disabled={ruleCallMutation}
                  onChange={(event) => setRuleCallAmbiguity(event.target.value)}
                />
                <label htmlFor="rule-call-source">Source or reference</label>
                <textarea
                  id="rule-call-source"
                  value={ruleCallSource}
                  maxLength={240}
                  rows={2}
                  disabled={ruleCallMutation}
                  onChange={(event) => setRuleCallSource(event.target.value)}
                />
                <label htmlFor="rule-call-decision">Decision</label>
                <textarea
                  id="rule-call-decision"
                  value={ruleCallDecision}
                  maxLength={500}
                  rows={3}
                  disabled={ruleCallMutation}
                  onChange={(event) => setRuleCallDecision(event.target.value)}
                />
                <label htmlFor="rule-call-audience">Audience</label>
                <select
                  id="rule-call-audience"
                  value={ruleCallAudience}
                  disabled={ruleCallMutation}
                  onChange={(event) => setRuleCallAudience(event.target.value as FacilitatorRuleCall['audience'])}
                >
                  <option value="gm-only">Facilitator only</option>
                  <option value="selected-player">One selected player</option>
                </select>
                {ruleCallAudience === 'selected-player' && (
                  <>
                    <label htmlFor="rule-call-recipient">Recipient</label>
                    <select
                      id="rule-call-recipient"
                      value={ruleCallRecipientUid}
                      disabled={ruleCallMutation}
                      onChange={(event) => setRuleCallRecipientUid(event.target.value)}
                    >
                      <option value="">Choose a player</option>
                      {allPlayers
                        .filter((player) => player.role === 'player')
                        .map((player) => (
                          <option key={player.uid} value={player.uid}>
                            {normalizeDisplayName(player.displayName)} // {player.uid}
                          </option>
                        ))}
                    </select>
                  </>
                )}
                <label htmlFor="rule-call-supersedes">Supersedes call ID (optional)</label>
                <input
                  id="rule-call-supersedes"
                  value={ruleCallSupersedesCallId}
                  maxLength={120}
                  disabled={ruleCallMutation}
                  onChange={(event) => setRuleCallSupersedesCallId(event.target.value)}
                />
                <button
                  className="gm-census-note__save cic-action-button"
                  type="button"
                  disabled={ruleCallMutation || !ruleCallAmbiguity.trim() || !ruleCallSource.trim() || !ruleCallDecision.trim() || (ruleCallAudience === 'selected-player' && !ruleCallRecipientUid)}
                  onClick={() => void saveFacilitatorRuleCall()}
                >
                  {ruleCallMutation ? 'Recording…' : 'Record rule call'}
                </button>
                <p className="gm-player-roster__note" role="status" aria-live="polite">
                  {ruleCallMessage ?? (gmFacilitatorRuleCall
                    ? `Current call // revision ${gmFacilitatorRuleCall.revision} // ${gmFacilitatorRuleCall.callId}`
                    : 'No facilitator rule call recorded yet.')}
                </p>
                {gmFacilitatorRuleCall && (
                  <DecisionAttribution
                    source={gmFacilitatorRuleCall.source}
                    actorUid={gmFacilitatorRuleCall.actorUid}
                    recordedAt={gmFacilitatorRuleCall.createdAt}
                  />
                )}
              </div>
            </section>
          )}

          {isGm && wolfAssignment && (
            <section className="gm-console__module cic-frame gm-wolf-assignment" aria-label="Private Wolf assignment">
              <h2 className="gm-console__section-title">Private Wolf assignment</h2>
              <p className="gm-player-roster__hint">Facilitator-only setup secret // hidden role cards</p>
              <ul>
                {wolfAssignment.roleIds.map((roleId) => (
                  <li key={roleId}>{CONSOLE_ROLES.find((role) => role.id === roleId)?.name ?? roleId}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="gm-console__module cic-frame" aria-label="GM instances">
            <h2 className="gm-console__section-title">GM instances</h2>
            <button
              className="gm-controls-lock cic-action-button"
              type="button"
              aria-label={`${controlsLocked ? 'Unlock' : 'Lock'} GM registration`}
              aria-pressed={controlsLocked}
              disabled={endgameEvaluation || changingLock || lockQueued}
              onClick={() => void toggleLock()}
            >
              <span aria-hidden="true">{controlsLocked ? '🔒' : '🔓'}</span>
              GM registration // {lockQueued ? 'Change queued' : controlsLocked ? 'Locked' : 'Unlocked'}
            </button>
            {endgameEvaluation && <p className="gm-console__status" role="status">
              Endgame evaluation // GM registration controls are frozen.
            </p>}
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
                        ? `${event.reason === 'empty-session' ? 'Session timer' : 'Emergency timer'} // ${event.action === 'paused' ? 'paused' : 'resumed'} // Cycle ${event.turn} // ${event.window} // ${event.actorName}`
                        : event.type === 'android-proof-disclosed'
                          ? 'Android proof disclosed to the fleet'
                          : event.type === 'crisis-state'
                            ? `Crisis // ${event.state} // ${event.title}`
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
            <ShipPlot
              layout="gm"
              hostile={false}
              aboard
              viewerId={viewer?.id ?? 'aegis'}
              expanded={dradisExpanded}
              onExpandedChange={toggleDradis}
              capybaraEnabled={capybaraEnabled}
              dioneEnabled={dioneEnabled}
              shipGalacticCoordinates={session?.shipGalacticCoordinates}
              shipDamage={session?.shipDamage}
              shipJumpTransitions={session?.shipJumpTransitions}
              activeRoleIds={hasUnconfirmedRosterChanges ? draftRoleIds : serverRoleIds}
              activeVesselIds={hasUnconfirmedRosterChanges ? undefined : session?.activeVesselIds}
              ambientSession={session ?? undefined}
              turnPhase={currentPhase}
            />
            <div className="gm-dradis__controls">
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
            ref={capybaraDialogRef}
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
              className="settings-dialog__disconnect cic-action-button cic-action-button--confirm"
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
            ref={dioneDialogRef}
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
              className="settings-dialog__disconnect cic-action-button cic-action-button--confirm"
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
              disabled={endgameEvaluation || changingPress}
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
