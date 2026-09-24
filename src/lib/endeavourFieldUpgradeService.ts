import { httpsCallable } from 'firebase/functions';
import { SHIPS } from '@/data/ships';
import type { GameSession, ShuttleControlEntry } from '@/types/game';
import { functions } from './firebase';
import {
  captureSessionAuthority,
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

const TRACK_ALIAS_BY_SYSTEM_ID: Readonly<Record<string, string>> = Object.freeze({
  'advanced-hydroponics-ii': 'advanced-hydroponics',
  'water-production-ii': 'water-production',
  'fuel-refinery-ii': 'fuel-refinery',
});

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function currentScientistAuthority(): Readonly<{
  session: GameSession;
  me: NonNullable<ReturnType<typeof useSessionStore.getState>['me']>;
  control: ShuttleControlEntry;
  checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>;
}> {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!session || !me?.uid || me.sessionId !== session.id || me.role !== 'player' ||
      me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') ||
      control?.shuttleId !== 'endeavour' || control.ownerRoleId !== 'shepherd-scientist' ||
      control.holderUid !== me.uid || !Number.isSafeInteger(control.revision) || control.revision < 0) {
    throw new Error('Reconnect as the current Shepherd Scientist holding Endeavour.');
  }
  requireFreshSessionAuthority();
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before upgrading Endeavour target consoles.');
  return { session, me, control, checkpoint };
}

function assertCurrentScientistAuthority(sessionId: string, uid: string): void {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!isCurrentSessionAuthority(captureSessionAuthority(sessionId, uid)) ||
      session?.id !== sessionId || me?.sessionId !== sessionId || me.uid !== uid ||
      me.role !== 'player' || me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') ||
      control?.shuttleId !== 'endeavour' || control.ownerRoleId !== 'shepherd-scientist' ||
      control.holderUid !== uid) {
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
}

function hasLiveCoordinationWindow(session: GameSession, expectedCycle: number): boolean {
  const phase = session.turnPhase;
  const endsAt = Date.parse(phase?.openAirspaceEndsAt ?? '');
  return session.phase === 'active' && session.currentTurn === expectedCycle &&
    phase?.turn === expectedCycle && phase.airspace.state === 'lifted' &&
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
}>): Promise<EndeavourFieldUpgradeReply> {
  const { session, me, control, checkpoint } = currentScientistAuthority();
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

  const requestId = window.crypto.randomUUID();
  const payload = {
    sessionId: session.id,
    requestId,
    expectedControlRevision: control.revision,
    expectedUpgradeRevision: input.purchaseState.upgradeRevision,
    expectedCycle: input.workspace.cycle,
    targets,
  };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'upgradeEndeavourFieldTargets',
  )(payload);
  if (!isCurrentSessionAuthority(checkpoint)) {
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
  assertCurrentScientistAuthority(session.id, me.uid);
  const result = parseReply(response.data, {
    sessionId: session.id,
    requestId,
    cycle: input.workspace.cycle,
    upgradeRevision: input.purchaseState.upgradeRevision,
    targets,
  });
  if (!result) throw new Error('The server returned invalid Endeavour field-upgrade data.');
  return result;
}
