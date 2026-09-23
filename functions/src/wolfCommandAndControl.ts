import type { WolfTargetingReceipt, WolfTargetingRollReceipt } from './wolfCombatMath';

export type CommanderRerollCompletion = Readonly<{
  status: 'finished' | 'no-commander';
  turn: number;
  /** State revision at which this completion is authoritative. */
  revision: number;
  actorUid: string;
  requestId: string;
}>;

export type CommanderRerollsCompletionDecision =
  | 'finished'
  | 'pending'
  | 'record-no-commander';

type PlayerRoleAssignment = Readonly<{
  uid?: unknown;
  role?: unknown;
  replacementRoleId?: unknown;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCompletion(value: unknown): CommanderRerollCompletion | undefined {
  if (!isRecord(value) || (value.status !== 'finished' && value.status !== 'no-commander') ||
      Object.keys(value).some((key) => !['status', 'turn', 'revision', 'actorUid', 'requestId'].includes(key)) ||
      !Number.isSafeInteger(value.turn) || (value.turn as number) < 1 ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      typeof value.actorUid !== 'string' || value.actorUid.length === 0 ||
      typeof value.requestId !== 'string' || value.requestId.length === 0) return undefined;
  return {
    status: value.status,
    turn: value.turn as number,
    revision: value.revision as number,
    actorUid: value.actorUid,
    requestId: value.requestId,
  };
}

export function commanderCompletionMarkerIsMalformed(value: unknown): boolean {
  return value !== undefined && value !== null && parseCompletion(value) === undefined;
}

/** Actual assignment is read from server player documents; connection state is irrelevant. */
export function assignedWolfCommanderUids(
  players: readonly PlayerRoleAssignment[],
): readonly string[] {
  return players.flatMap((player) => player.role === 'player' &&
      player.replacementRoleId === 'wolf-commander' &&
      typeof player.uid === 'string' && player.uid.length > 0
    ? [player.uid]
    : []);
}

/**
 * A Commander finish is valid only for the exact targeting revision the XO
 * will consume. With no assigned Commander, the XO transaction must create
 * an auditable `no-commander` completion together with the redirect.
 */
export function commanderRerollsCompletionDecision(
  value: unknown,
  turn: number,
  revision: number,
  assignedCommanderUids: readonly string[],
): CommanderRerollsCompletionDecision {
  const completion = parseCompletion(value);
  if (completion && completion.turn === turn && completion.revision <= revision) {
    // The server-created finish marker proves its actor held Commander
    // authority when they committed it. A later reassignment does not reopen
    // a reroll window that has already been explicitly closed.
    if (completion.status === 'finished') return 'finished';
    if (completion.status === 'no-commander' && assignedCommanderUids.length === 0) return 'finished';
  }
  if (assignedCommanderUids.length > 1) return 'pending';
  return assignedCommanderUids.length > 0 ? 'pending' : 'record-no-commander';
}

export function commanderRerollsAreClosed(value: unknown, turn: number): boolean {
  const completion = parseCompletion(value);
  return completion?.turn === turn;
}

/** Apply the single authorized C&C redirect to the existing server receipt. */
export function applyWolfCommandAndControlRedirect(
  receipt: WolfTargetingReceipt,
  rosterIndex: number,
): WolfTargetingReceipt {
  if (!Number.isSafeInteger(rosterIndex) || rosterIndex < 0 || rosterIndex >= receipt.rolls.length) {
    throw new Error('Command and Control must select one current Wolf ship.');
  }
  if (receipt.rolls.some((roll) => roll.modifiers.includes('command-and-control-redirect'))) {
    throw new Error('Command and Control has already been used for this Wolf attack.');
  }

  const rolls: readonly WolfTargetingRollReceipt[] = receipt.rolls.map((roll) =>
    roll.rosterIndex === rosterIndex
      ? {
        ...roll,
        target: 'aegis',
        modifiers: [...roll.modifiers, 'command-and-control-redirect'],
      }
      : roll);
  return { ...receipt, rolls };
}
