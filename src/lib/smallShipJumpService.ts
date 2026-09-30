import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import type { SmallShipId } from '@/types/game';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';
import { runSmallShipMaintenance } from './smallShipService';

export type SmallCraftJumpId = Extract<SmallShipId, 'gorgoneion' | 'capybara-small'>;

export interface SmallShipJumpDestination {
  readonly coordinate: string;
  readonly length: 'short' | 'medium' | 'long';
  readonly fuelCost: number;
}

export interface SmallShipJumpWorkspaceProjection {
  readonly viewer: 'captain' | 'gm';
  readonly sessionId: string;
  readonly smallShipId: SmallCraftJumpId;
  readonly hostShipId: string | null;
  readonly currentCoordinate: string | null;
  readonly movementRevision: number;
  readonly dockingRevision: number;
  readonly currentTurn: number;
  readonly phase: string;
  readonly cycleRevision?: number;
  readonly cycleStep?: number;
  readonly cycleTurn?: number | null;
  readonly cycleCharges?: readonly string[];
  readonly charged?: boolean;
  readonly hostFuel?: number | null;
  readonly knownDestinations?: readonly SmallShipJumpDestination[];
  readonly arrivalCoordinates?: readonly string[];
}

export interface SmallShipJumpCommand {
  readonly smallShipId: SmallCraftJumpId;
  readonly hostShipId: string;
  readonly destination: string;
  readonly expectedOrigin: string;
  readonly expectedMovementRevision: number;
  readonly expectedDockingRevision: number;
  readonly expectedCycleRevision: number;
  readonly requestId: string;
}

export interface SmallShipJumpChargeCommand {
  readonly expectedCycleRevision: number;
  readonly requestId: string;
  readonly consoles: readonly string[];
}

const CAPTAIN_ROLE: Readonly<Record<SmallCraftJumpId, string>> = {
  gorgoneion: 'gorgoneion-captain',
  'capybara-small': 'capybara-small-captain',
};

function requireBaseMode(session: { readonly expansion?: string; readonly capybaraEnabled?: boolean }, id: SmallCraftJumpId): void {
  if (id === 'capybara-small' &&
      (session.expansion === 'capybara' || session.expansion === 'none' || session.capybaraEnabled === false)) {
    throw new Error('Base small-ship Capybara controls are unavailable in this Capybara mode.');
  }
}

function requireCaptain(id: SmallCraftJumpId) {
  const { session, me } = useSessionStore.getState();
  if (!session || !me || me.role !== 'player' || me.replacementRoleId !== CAPTAIN_ROLE[id] ||
      me.replacementStatus != null || me.activeConsoleRoleId != null) {
    throw new Error('The current small-craft Captain replacement role is required.');
  }
  requireBaseMode(session, id);
  requireFreshSessionAuthority();
  return { session, me };
}

function actorContextChanged(
  expected: ReturnType<typeof useSessionStore.getState>['me'],
  expectedGmInstanceId?: string,
): boolean {
  const current = useSessionStore.getState();
  return current.me?.role !== expected?.role ||
    current.me?.replacementRoleId !== expected?.replacementRoleId ||
    current.me?.replacementStatus !== expected?.replacementStatus ||
    current.me?.activeConsoleRoleId !== expected?.activeConsoleRoleId ||
    (expectedGmInstanceId !== undefined && current.gmInstance?.id !== expectedGmInstanceId);
}

function requireCraftState(
  session: NonNullable<ReturnType<typeof useSessionStore.getState>['session']>,
  id: SmallCraftJumpId,
  requireDocked = true,
) {
  const state = session.smallShipStates?.[id];
  if (!state || (requireDocked && !state.hostShipId) || !Number.isSafeInteger(state.dockingRevision) ||
      !Number.isSafeInteger(state.cycle.revision)) {
    throw new Error('Dock this craft with an active host and refresh its server projection before using the Jump Drive.');
  }
  return state;
}

export async function getSmallShipJumpWorkspace(
  smallShipId: SmallCraftJumpId,
): Promise<SmallShipJumpWorkspaceProjection> {
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before loading the small-craft Jump Drive workspace.');
  requireFreshSessionAuthority();
  requireBaseMode(session, smallShipId);
  let instanceId: string | undefined;
  if (me.role === 'gm') {
    if (!gmInstance) throw new Error('An active GM instance is required for small-craft movement diagnostics.');
    instanceId = gmInstance.id;
  } else {
    requireCaptain(smallShipId);
    requireCraftState(session, smallShipId, false);
  }
  const payload = {
    sessionId: session.id,
    smallShipId,
    ...(instanceId ? { instanceId } : {}),
  };
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  const projection = (await httpsCallable<typeof payload, SmallShipJumpWorkspaceProjection>(
    functions(), 'getSmallShipJumpWorkspace',
  )(payload)).data;
  if (!isCurrentSessionAuthority(checkpoint)) {
    throw new Error('Captain or facilitator authority changed while movement diagnostics were loading. Refresh.');
  }
  if (actorContextChanged(me, instanceId)) {
    throw new Error('Captain or facilitator authority changed while movement diagnostics were loading. Refresh.');
  }
  return projection;
}

export async function jumpSmallShip(
  command: SmallShipJumpCommand,
  retryExactRequest = false,
): Promise<Record<string, unknown>> {
  const { session, me } = requireCaptain(command.smallShipId);
  const state = retryExactRequest ? undefined : requireCraftState(session, command.smallShipId);
  if ((!retryExactRequest && state?.hostShipId !== command.hostShipId) ||
      !Number.isSafeInteger(command.expectedMovementRevision) ||
      command.expectedMovementRevision < 0 ||
      (!retryExactRequest && command.expectedDockingRevision !== state?.dockingRevision) ||
      (!retryExactRequest && command.expectedCycleRevision !== state?.cycle.revision) ||
      typeof command.expectedOrigin !== 'string' || !/^\d{4}$/.test(command.expectedOrigin) ||
      typeof command.destination !== 'string' || !/^\d{4}$/.test(command.destination) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(command.requestId)) {
    throw new Error('The small-craft Jump Drive projection changed. Refresh before departing.');
  }
  const payload = {
    sessionId: session.id,
    smallShipId: command.smallShipId,
    hostShipId: command.hostShipId,
    destination: command.destination,
    expectedOrigin: command.expectedOrigin,
    expectedMovementRevision: command.expectedMovementRevision,
    expectedDockingRevision: command.expectedDockingRevision,
    expectedCycleRevision: command.expectedCycleRevision,
    requestId: command.requestId,
  };
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  const result = (await httpsCallable<typeof payload, Record<string, unknown>>(
    functions(), 'jumpSmallShip',
  )(payload)).data;
  // Do not apply a delayed result after the player, connection, or accepted
  // server snapshot changed while the callable was in flight.
  if (!isCurrentSessionAuthority(checkpoint) || actorContextChanged(me) ||
      useSessionStore.getState().me?.replacementRoleId !== CAPTAIN_ROLE[command.smallShipId] ||
      useSessionStore.getState().me?.replacementStatus != null ||
      useSessionStore.getState().me?.activeConsoleRoleId != null) {
    throw new Error('Captain authority changed while the jump result was returning. Reconnect and refresh.');
  }
  requireFreshSessionAuthority();
  return result;
}

/** Charge Jump Drive alongside the other chosen consoles during Team Phase. */
export async function chargeSmallShipJumpDrive(
  smallShipId: SmallCraftJumpId,
  command: SmallShipJumpChargeCommand,
  retryExactRequest = false,
): Promise<unknown> {
  const { session, me } = requireCaptain(smallShipId);
  if (!Number.isSafeInteger(command.expectedCycleRevision) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(command.requestId) ||
      !Array.isArray(command.consoles) || command.consoles.length < 1 || command.consoles.length > 2 ||
      command.consoles.at(-1) !== 'jump-drive' || new Set(command.consoles).size !== command.consoles.length ||
      command.consoles.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error('The small-craft Jump Drive charge request is malformed.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (retryExactRequest) {
    const result = await runSmallShipMaintenance(
      smallShipId, 'reactor', command.expectedCycleRevision,
      { consoles: [...command.consoles] }, command.requestId,
    );
    if (!isCurrentSessionAuthority(checkpoint)) {
      throw new Error('Captain authority changed while the charge result was returning. Reconnect and refresh.');
    }
    if (actorContextChanged(me)) {
      throw new Error('Captain authority changed while the charge result was returning. Reconnect and refresh.');
    }
    return result;
  }
  const state = requireCraftState(session, smallShipId);
  const phase = session.turnPhase;
  if (command.expectedCycleRevision !== state.cycle.revision ||
      state.cycle.step !== 4 || state.cycle.turn !== session.currentTurn ||
      !phase || phase.turn !== session.currentTurn || phase.airspace.state !== 'restricted') {
    throw new Error('Charge Jump Drive only during this craft’s current Team Phase. Refresh before charging.');
  }
  const expectedConsoles = [...state.cycle.charges, 'jump-drive'];
  if (command.consoles.length !== expectedConsoles.length ||
      command.consoles.some((id, index) => id !== expectedConsoles[index])) {
    throw new Error('The small-craft reactor charge selection changed. Refresh before charging.');
  }
  const result = await runSmallShipMaintenance(
    smallShipId, 'reactor', command.expectedCycleRevision,
    { consoles: [...command.consoles] }, command.requestId,
  );
  if (!isCurrentSessionAuthority(checkpoint)) {
    throw new Error('Captain authority changed while the charge result was returning. Reconnect and refresh.');
  }
  if (actorContextChanged(me)) {
    throw new Error('Captain authority changed while the charge result was returning. Reconnect and refresh.');
  }
  return result;
}
