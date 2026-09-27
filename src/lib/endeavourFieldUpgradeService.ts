import { httpsCallable } from 'firebase/functions';
import { SHIPS } from '@/data/ships';
import type { GameSession, ShuttleControlEntry } from '@/types/game';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  hasFreshSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';
import type { EndeavourResearchWorkspace } from './endeavourResearchService';
import { useSessionStore } from '@/store/useSessionStore';

export interface EndeavourFieldUpgradeTarget {
  readonly shipId: string;
  readonly systemId: string;
}

/** Private, server-authored CAS and allowance summary returned with Scientist research data. */
export interface EndeavourFieldUpgradePurchaseState {
  readonly status: 'ready';
  readonly sessionId: string;
  readonly cycle: number;
  readonly researchRevision: number;
  readonly upgradeRevision: number;
  readonly targetsUsedThisCycle: number;
}

export interface EndeavourFieldUpgradeOption extends EndeavourFieldUpgradeTarget {
  readonly shipName: string;
  readonly systemName: string;
  readonly trackId: string;
  readonly trackName: string;
  readonly materialCost: number;
}

export interface EndeavourFieldUpgradeReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'endeavour';
  readonly cycle: number;
  readonly upgradeRevision: number;
  readonly appliedTargets: readonly EndeavourFieldUpgradeTarget[];
}

export interface EndeavourFieldUpgradeStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'endeavour';
  readonly targets: readonly EndeavourFieldUpgradeTarget[];
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedUpgradeRevision: number;
  readonly currentUpgradeRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
}

export type EndeavourFieldUpgradeServiceResult =
  | EndeavourFieldUpgradeReply
  | EndeavourFieldUpgradeStaleReply;

export interface EndeavourFieldUpgradeRetryCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedHostShipId: string;
  readonly expectedControlRevision: number;
  readonly expectedUpgradeRevision: number;
  readonly expectedCycle: number;
  readonly targets: readonly EndeavourFieldUpgradeTarget[];
}

export class EndeavourFieldUpgradeUncertainError extends Error {
  constructor(readonly retryToken: string) {
    super('The upgrade request could not be confirmed. Retry the exact request while the same authority remains active.');
    this.name = 'EndeavourFieldUpgradeUncertainError';
  }
}

interface EndeavourUpgradeAuthorityBinding {
  readonly sessionId: string;
  readonly uid: string;
  readonly assignedRoleId: string | null | undefined;
  readonly seatId: string | null;
  readonly replacementRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly expectedHostShipId: string;
  readonly expectedControlRevision: number;
  readonly expectedCycle: number;
}

interface PendingEndeavourUpgrade {
  readonly command: EndeavourFieldUpgradeRetryCommand;
  readonly authority: EndeavourUpgradeAuthorityBinding;
}

const pendingEndeavourUpgrades = new Map<string, PendingEndeavourUpgrade>();

const TRACK_ALIAS_BY_SYSTEM_ID: Readonly<Record<string, string>> = Object.freeze({
  'advanced-hydroponics-ii': 'advanced-hydroponics',
  'water-production-ii': 'water-production',
  'fuel-refinery-ii': 'fuel-refinery',
});

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

function isBoundScientist(me: NonNullable<ReturnType<typeof useSessionStore.getState>['me']>): boolean {
  if (me.replacementRoleId != null) return false;
  const assignedPress = me.assignedRoleId === 'press-officer';
  const seatPress = me.seatId === 'press-officer';
  const assigned = typeof me.assignedRoleId === 'string' && me.assignedRoleId.length > 0 && !assignedPress
    ? me.assignedRoleId : undefined;
  const seat = typeof me.seatId === 'string' && me.seatId.length > 0 && !seatPress ? me.seatId : undefined;
  if ((assignedPress && seat) || (seatPress && assigned) || (assigned && seat && assigned !== seat)) return false;
  return (assigned ?? seat) === 'shepherd-scientist';
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function currentEndeavourHostShipId(session: GameSession, groupId: string): string | null {
  const dockings = session.shuttleDockings;
  const activeVessels = session.activeVesselIds;
  const projection = session.playerDiscovery;
  if (!groupId || projection?.groupId !== groupId || !Array.isArray(dockings) ||
      !Array.isArray(activeVessels) || !Array.isArray(projection.fleetGroupVesselIds) ||
      dockings.some((entry) => !entry || typeof entry.shuttleId !== 'string' ||
        typeof entry.shipId !== 'string' || typeof entry.dockedAt !== 'string' ||
        !entry.dockedAt.trim() || entry.inTransit === true || entry.transit === true ||
        entry.status === 'in-transit' || entry.state === 'in-transit' ||
        entry.dockingState === 'in-transit')) return null;
  const endeavours = dockings.filter((entry) => entry.shuttleId === 'endeavour');
  const hostShipId = endeavours[0]?.shipId;
  if (endeavours.length !== 1 || typeof hostShipId !== 'string' ||
      !activeVessels.includes(hostShipId) ||
      !projection.fleetGroupVesselIds.includes(hostShipId)) return null;
  return hostShipId;
}

function currentScientistAuthority(): Readonly<{
  session: GameSession;
  me: NonNullable<ReturnType<typeof useSessionStore.getState>['me']>;
  control: ShuttleControlEntry;
  hostShipId: string;
  checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>;
  binding: EndeavourUpgradeAuthorityBinding;
}> {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!session || !me?.uid || me.sessionId !== session.id || me.role !== 'player' ||
      me.activeConsoleRoleId !== 'shepherd-scientist' || !isBoundScientist(me) ||
      !session.activeRoleIds?.includes('shepherd-scientist') ||
      control?.shuttleId !== 'endeavour' || control.ownerRoleId !== 'shepherd-scientist' ||
      control.holderUid !== me.uid || !isCounter(control.revision)) {
    throw new Error('Reconnect as the current Shepherd Scientist holding Endeavour.');
  }
  const fleetGroupId = me.fleetGroupId;
  if (typeof fleetGroupId !== 'string' || !fleetGroupId) {
    throw new Error('The current Endeavour group docking is unavailable. Refresh the Scientist workspace.');
  }
  const hostShipId = currentEndeavourHostShipId(session, fleetGroupId);
  if (!hostShipId) throw new Error('The current Endeavour group docking is unavailable. Refresh the Scientist workspace.');
  requireFreshSessionAuthority();
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before upgrading Endeavour target consoles.');
  const binding: EndeavourUpgradeAuthorityBinding = {
    sessionId: session.id,
    uid: me.uid,
    assignedRoleId: me.assignedRoleId,
    seatId: me.seatId,
    replacementRoleId: me.replacementRoleId,
    activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId,
    expectedHostShipId: hostShipId,
    expectedControlRevision: control.revision,
    expectedCycle: isCounter(session.currentTurn) ? session.currentTurn : 0,
  };
  return { session, me, control, hostShipId, checkpoint, binding };
}

function currentScientistAuthorityMatches(
  binding: EndeavourUpgradeAuthorityBinding,
  requireLiveCoordination: boolean,
): boolean {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  const hostShipId = session && me
    ? currentEndeavourHostShipId(session, me.fleetGroupId ?? '') : null;
  const currentCycle = session?.currentTurn;
  const phase = session?.turnPhase;
  const endsAt = Date.parse(phase?.openAirspaceEndsAt ?? '');
  return hasFreshSessionAuthority() && session?.id === binding.sessionId &&
    me?.sessionId === binding.sessionId && me.uid === binding.uid &&
    me.role === 'player' && isBoundScientist(me) && me.assignedRoleId === binding.assignedRoleId &&
    me.seatId === binding.seatId && me.replacementRoleId === binding.replacementRoleId &&
    me.activeConsoleRoleId === binding.activeConsoleRoleId &&
    me.fleetGroupId === binding.fleetGroupId && hostShipId === binding.expectedHostShipId &&
    session.phase === 'active' && session.activeRoleIds?.includes('shepherd-scientist') === true &&
    control?.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === binding.uid && isCounter(control.revision) &&
    control.revision >= binding.expectedControlRevision && isCounter(currentCycle) &&
    currentCycle >= binding.expectedCycle && (!requireLiveCoordination ||
      (phase?.turn === currentCycle && phase.airspace?.state === 'lifted' &&
        phase.timerPause === undefined && Number.isFinite(endsAt) && Date.now() < endsAt));
}

function hasLiveCoordinationWindow(session: GameSession, expectedCycle: number): boolean {
  const phase = session.turnPhase;
  const endsAt = Date.parse(phase?.openAirspaceEndsAt ?? '');
  return session.phase === 'active' && session.currentTurn === expectedCycle &&
    phase?.turn === expectedCycle && phase.airspace?.state === 'lifted' &&
    phase.timerPause === undefined && Number.isFinite(endsAt) && Date.now() < endsAt;
}

function researchTrackId(systemId: string, workspace: EndeavourResearchWorkspace): string | null {
  const trackId = TRACK_ALIAS_BY_SYSTEM_ID[systemId] ?? systemId;
  return workspace.tracks.some((track) => track.trackId === trackId) ? trackId : null;
}

/** Build display choices from the member-safe current-group vessel projection and printed ship consoles. */
export function availableEndeavourFieldUpgradeOptions(
  session: GameSession,
  groupId: string,
  workspace: EndeavourResearchWorkspace,
): readonly EndeavourFieldUpgradeOption[] {
  const projection = session.playerDiscovery;
  if (!groupId || projection?.groupId !== groupId ||
      !Array.isArray(projection.fleetGroupVesselIds) || !Array.isArray(session.activeVesselIds)) return [];
  const active = new Set(session.activeVesselIds);
  const groupVessels = new Set(projection.fleetGroupVesselIds.filter((shipId) => active.has(shipId)));
  return SHIPS.flatMap((ship) => {
    if (!groupVessels.has(ship.id)) return [];
    const installed = new Set(session.shipUpgrades?.[ship.id] ?? []);
    return (ship.systems ?? []).flatMap((system) => {
      if (installed.has(system.id)) return [];
      const trackId = researchTrackId(system.id, workspace);
      const track = trackId ? workspace.tracks.find((candidate) => candidate.trackId === trackId) : undefined;
      if (!track || track.complete || track.currentMaterialCost === null) return [];
      return [{
        shipId: ship.id,
        shipName: ship.name,
        systemId: system.id,
        systemName: system.name,
        trackId: track.trackId,
        trackName: track.name,
        materialCost: track.currentMaterialCost,
      }];
    });
  });
}

function parseReply(
  value: unknown,
  expected: Readonly<{
    sessionId: string;
    requestId: string;
    cycle: number;
    upgradeRevision: number;
    targets: readonly EndeavourFieldUpgradeTarget[];
  }>,
): EndeavourFieldUpgradeReply | null {
  const raw = record(value);
  if (!raw || !hasExactKeys(raw, [
    'status', 'sessionId', 'requestId', 'shuttleId', 'cycle', 'upgradeRevision', 'appliedTargets',
  ]) || (raw.status !== 'committed' && raw.status !== 'replayed') ||
      raw.sessionId !== expected.sessionId || raw.requestId !== expected.requestId ||
      raw.shuttleId !== 'endeavour' || raw.cycle !== expected.cycle ||
      !isCounter(raw.upgradeRevision) || raw.upgradeRevision < 1 ||
      raw.upgradeRevision !== expected.upgradeRevision + 1 || !Array.isArray(raw.appliedTargets)) return null;

  const appliedTargets: EndeavourFieldUpgradeTarget[] = [];
  for (const candidate of raw.appliedTargets) {
    const target = record(candidate);
    if (!target || !hasExactKeys(target, ['shipId', 'systemId']) ||
        typeof target.shipId !== 'string' || typeof target.systemId !== 'string') return null;
    appliedTargets.push({ shipId: target.shipId, systemId: target.systemId });
  }
  const expectedTargets = [...expected.targets].sort((a, b) =>
    `${a.shipId}:${a.systemId}`.localeCompare(`${b.shipId}:${b.systemId}`));
  if (JSON.stringify(appliedTargets) !== JSON.stringify(expectedTargets)) return null;
  return {
    status: raw.status,
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    shuttleId: 'endeavour',
    cycle: raw.cycle as number,
    upgradeRevision: raw.upgradeRevision,
    appliedTargets,
  };
}

function parseStaleReply(
  value: unknown,
  expected: EndeavourFieldUpgradeRetryCommand,
): EndeavourFieldUpgradeStaleReply | null {
  const raw = record(value);
  if (!raw || !hasExactKeys(raw, [
    'status', 'sessionId', 'requestId', 'shuttleId', 'targets',
    'expectedControlRevision', 'currentControlRevision',
    'expectedUpgradeRevision', 'currentUpgradeRevision', 'expectedCycle', 'currentCycle',
  ]) || raw.status !== 'stale' || raw.sessionId !== expected.sessionId ||
      raw.requestId !== expected.requestId || raw.shuttleId !== 'endeavour' ||
      raw.expectedControlRevision !== expected.expectedControlRevision ||
      raw.expectedUpgradeRevision !== expected.expectedUpgradeRevision ||
      raw.expectedCycle !== expected.expectedCycle ||
      !isCounter(raw.currentControlRevision) ||
      raw.currentControlRevision < expected.expectedControlRevision ||
      !isCounter(raw.currentUpgradeRevision) ||
      raw.currentUpgradeRevision < expected.expectedUpgradeRevision ||
      !isCounter(raw.currentCycle) || raw.currentCycle < expected.expectedCycle ||
      !Array.isArray(raw.targets)) return null;

  const targets: EndeavourFieldUpgradeTarget[] = [];
  for (const candidate of raw.targets) {
    const target = record(candidate);
    if (!target || !hasExactKeys(target, ['shipId', 'systemId']) ||
        typeof target.shipId !== 'string' || typeof target.systemId !== 'string') return null;
    targets.push({ shipId: target.shipId, systemId: target.systemId });
  }
  const expectedTargets = [...expected.targets].sort((a, b) =>
    `${a.shipId}:${a.systemId}`.localeCompare(`${b.shipId}:${b.systemId}`));
  if (JSON.stringify(targets) !== JSON.stringify(expectedTargets) ||
      (raw.currentControlRevision === expected.expectedControlRevision &&
        raw.currentUpgradeRevision === expected.expectedUpgradeRevision &&
        raw.currentCycle === expected.expectedCycle)) return null;
  return {
    status: 'stale', sessionId: raw.sessionId, requestId: raw.requestId,
    shuttleId: 'endeavour', targets,
    expectedControlRevision: raw.expectedControlRevision as number,
    currentControlRevision: raw.currentControlRevision,
    expectedUpgradeRevision: raw.expectedUpgradeRevision as number,
    currentUpgradeRevision: raw.currentUpgradeRevision,
    expectedCycle: raw.expectedCycle as number,
    currentCycle: raw.currentCycle,
  };
}

function callableErrorCode(cause: unknown): string {
  const raw = record(cause);
  if (!raw || typeof raw.code !== 'string') return 'unknown';
  return raw.code.replace(/^functions\//, '');
}

function isUncertainTransportError(cause: unknown): boolean {
  return ['deadline-exceeded', 'internal', 'unknown', 'unavailable'].includes(callableErrorCode(cause));
}

function rememberPendingEndeavourUpgrade(
  command: EndeavourFieldUpgradeRetryCommand,
  authority: EndeavourUpgradeAuthorityBinding,
): void {
  if (!pendingEndeavourUpgrades.has(command.requestId) && pendingEndeavourUpgrades.size >= 16) {
    const oldest = pendingEndeavourUpgrades.keys().next().value as string | undefined;
    if (oldest) pendingEndeavourUpgrades.delete(oldest);
  }
  pendingEndeavourUpgrades.set(command.requestId, { command, authority });
}

async function executeEndeavourUpgrade(
  command: EndeavourFieldUpgradeRetryCommand,
  authority: EndeavourUpgradeAuthorityBinding,
  checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>,
): Promise<EndeavourFieldUpgradeServiceResult> {
  const response = await httpsCallable<EndeavourFieldUpgradeRetryCommand, unknown>(
    functions(), 'upgradeEndeavourFieldTargets',
  )(command).catch((cause: unknown) => {
    if (isUncertainTransportError(cause)) {
      rememberPendingEndeavourUpgrade(command, authority);
      throw new EndeavourFieldUpgradeUncertainError(command.requestId);
    }
    pendingEndeavourUpgrades.delete(command.requestId);
    throw cause;
  });
  const value = response.data;
  if (record(value)?.status === 'stale') {
    const stale = parseStaleReply(value, command);
    if (!stale) {
      rememberPendingEndeavourUpgrade(command, authority);
      throw new EndeavourFieldUpgradeUncertainError(command.requestId);
    }
    if (!currentScientistAuthorityMatches(authority, true)) {
      pendingEndeavourUpgrades.delete(command.requestId);
      throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
    }
    pendingEndeavourUpgrades.delete(command.requestId);
    return stale;
  }
  if (!isCurrentSessionAuthority(checkpoint) || !currentScientistAuthorityMatches(authority, false)) {
    rememberPendingEndeavourUpgrade(command, authority);
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
  const result = parseReply(value, {
    sessionId: command.sessionId,
    requestId: command.requestId,
    cycle: command.expectedCycle,
    upgradeRevision: command.expectedUpgradeRevision,
    targets: command.targets,
  });
  if (!result) {
    rememberPendingEndeavourUpgrade(command, authority);
    throw new EndeavourFieldUpgradeUncertainError(command.requestId);
  }
  pendingEndeavourUpgrades.delete(command.requestId);
  return result;
}

function validatePurchaseState(
  workspace: EndeavourResearchWorkspace,
  purchaseState: EndeavourFieldUpgradePurchaseState,
  session: GameSession,
): void {
  if (purchaseState.status !== 'ready' || purchaseState.sessionId !== session.id ||
      workspace.sessionId !== session.id || purchaseState.cycle !== workspace.cycle ||
      workspace.cycle !== session.currentTurn || purchaseState.researchRevision !== workspace.researchRevision ||
      !isCounter(purchaseState.cycle) || purchaseState.cycle < 1 ||
      !isCounter(purchaseState.researchRevision) || !isCounter(purchaseState.upgradeRevision) ||
      purchaseState.upgradeRevision >= Number.MAX_SAFE_INTEGER ||
      !isCounter(purchaseState.targetsUsedThisCycle)) {
    throw new Error('Research pricing changed. Refresh the Scientist workspace.');
  }
}

/** Submit one atomic batch through the existing server-authoritative purchase callable. */
export async function purchaseEndeavourFieldTargets(input: Readonly<{
  workspace: EndeavourResearchWorkspace;
  purchaseState: EndeavourFieldUpgradePurchaseState;
  targets: readonly EndeavourFieldUpgradeTarget[];
}>): Promise<EndeavourFieldUpgradeServiceResult> {
  const { session, me, control, hostShipId, checkpoint, binding } = currentScientistAuthority();
  validatePurchaseState(input.workspace, input.purchaseState, session);
  if (!hasLiveCoordinationWindow(session, input.workspace.cycle)) {
    throw new Error('Purchases are available during the live Coordination window.');
  }
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new Error('Choose at least one Endeavour target console.');
  }
  const targets = input.targets.map((candidate) => {
    const target = record(candidate);
    if (!target || !hasExactKeys(target, ['shipId', 'systemId']) ||
        typeof target.shipId !== 'string' || typeof target.systemId !== 'string') {
      throw new Error('Choose canonical target consoles from the current fleet group.');
    }
    return { shipId: target.shipId, systemId: target.systemId };
  }).sort((a, b) => `${a.shipId}:${a.systemId}`.localeCompare(`${b.shipId}:${b.systemId}`));
  const targetKeys = targets.map(({ shipId, systemId }) => `${shipId}:${systemId}`);
  if (new Set(targetKeys).size !== targets.length) throw new Error('Choose distinct target consoles.');

  const options = new Set(availableEndeavourFieldUpgradeOptions(
    session, me.fleetGroupId ?? '', input.workspace,
  ).map(({ shipId, systemId }) => `${shipId}:${systemId}`));
  if (targets.some((target) => !options.has(`${target.shipId}:${target.systemId}`))) {
    throw new Error('Choose target consoles from your current fleet group.');
  }
  const limit = session.shuttleFuelled?.endeavour === true ? 4 : 2;
  const remaining = Math.max(0, limit - input.purchaseState.targetsUsedThisCycle);
  if (input.purchaseState.targetsUsedThisCycle > limit || targets.length > remaining) {
    throw new Error(`Choose no more than the ${remaining} remaining Endeavour upgrades this cycle.`);
  }

  const command: EndeavourFieldUpgradeRetryCommand = {
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    expectedHostShipId: hostShipId,
    expectedControlRevision: control.revision,
    expectedUpgradeRevision: input.purchaseState.upgradeRevision,
    expectedCycle: input.workspace.cycle,
    targets,
  };
  return executeEndeavourUpgrade(command, binding, checkpoint);
}

/** Retry an uncertain transport with the original request ID and exact payload. */
export async function retryUncertainEndeavourFieldUpgrade(retryToken: string): Promise<EndeavourFieldUpgradeServiceResult> {
  const pending = pendingEndeavourUpgrades.get(retryToken);
  if (!pending) throw new Error('The exact Endeavour request is no longer available. Refresh before submitting a new request.');
  if (!currentScientistAuthorityMatches(pending.authority, false)) {
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
  const checkpoint = captureSessionAuthority(pending.command.sessionId, pending.authority.uid);
  if (!checkpoint) throw new Error('Reconnect before retrying the exact Endeavour request.');
  return executeEndeavourUpgrade(pending.command, pending.authority, checkpoint);
}
