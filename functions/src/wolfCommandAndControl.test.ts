import { expect, it } from 'vitest';
import type { WolfTargetingReceipt } from './wolfCombatMath';
import {
  applyWolfCommandAndControlRedirect,
  assignedWolfCommanderUids,
  commanderCompletionMarkerIsMalformed,
  commanderRerollsAreClosed,
  commanderRerollsCompletionDecision,
  type CommanderRerollCompletion,
} from './wolfCommandAndControl';

const receipt: WolfTargetingReceipt = {
  ring: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
  rolls: [
    {
      rosterIndex: 0, shipId: 'wolf-fighter-wing', initialDie: 2,
      finalDie: 2, target: 'dione', modifiers: [],
    },
    {
      rosterIndex: 1, shipId: 'wolf-cruiser', initialDie: 3,
      finalDie: 3, target: 'icebreaker', modifiers: [],
    },
  ],
  modifierOrder: ['commander-reroll', 'target-shift', 'command-and-control-redirect'],
};

const finished: CommanderRerollCompletion = {
  status: 'finished', turn: 4, revision: 7, actorUid: 'commander-1', requestId: 'finish-4',
};

it('counts actual assigned Commander players even while disconnected and ignores configured-role hints', () => {
  expect(assignedWolfCommanderUids([
    { uid: 'commander-1', role: 'player', replacementRoleId: 'wolf-commander', connected: false },
    { uid: 'gm-1', role: 'gm', replacementRoleId: 'wolf-commander', connected: true },
    { uid: 'former-commander', role: 'player', replacementRoleId: null, connected: true },
  ])).toEqual(['commander-1']);
  expect(assignedWolfCommanderUids([])).toEqual([]);
});

it('requires a current-turn, current-revision committed finish when a Commander is assigned', () => {
  expect(commanderRerollsCompletionDecision(finished, 4, 7, ['commander-1'])).toBe('finished');
  expect(commanderRerollsCompletionDecision(finished, 4, 8, ['commander-1'])).toBe('pending');
  expect(commanderRerollsCompletionDecision({ ...finished, turn: 3 }, 4, 7, ['commander-1'])).toBe('pending');
  expect(commanderRerollsCompletionDecision(undefined, 4, 7, ['commander-1'])).toBe('pending');
  expect(commanderRerollsCompletionDecision(finished, 4, 7, ['commander-1', 'commander-2']))
    .toBe('finished');
});

it('does not reopen a committed finish after the Commander assignment later changes', () => {
  expect(commanderRerollsCompletionDecision({ ...finished, actorUid: 'commander-old' }, 4, 7,
    ['commander-new'])).toBe('finished');
  expect(commanderRerollsCompletionDecision({ ...finished, actorUid: 'commander-old' }, 4, 7,
    ['commander-new', 'duplicate-commander'])).toBe('finished');
  expect(commanderRerollsCompletionDecision({ ...finished, actorUid: 'commander-old' }, 4, 7, []))
    .toBe('finished');
});

it('requests auditable no-Commander completion only when no player holds that authority', () => {
  expect(commanderRerollsCompletionDecision(undefined, 4, 7, [])).toBe('record-no-commander');
  expect(commanderRerollsCompletionDecision({
    ...finished, status: 'no-commander', actorUid: 'executive-1', requestId: 'redirect-4',
  }, 4, 7, ['commander-1'])).toBe('pending');
  expect(commanderRerollsCompletionDecision({
    ...finished, status: 'no-commander', actorUid: 'executive-1', requestId: 'redirect-4',
  }, 4, 7, [])).toBe('finished');
});

it('keeps both completion markers closed for the remainder of their turn', () => {
  expect(commanderRerollsAreClosed(finished, 4)).toBe(true);
  expect(commanderRerollsAreClosed({ ...finished, status: 'no-commander' }, 4)).toBe(true);
  expect(commanderRerollsAreClosed(finished, 5)).toBe(false);
  expect(commanderRerollsAreClosed(undefined, 4)).toBe(false);
});

it('fails closed on a malformed stored completion marker', () => {
  expect(commanderCompletionMarkerIsMalformed(undefined)).toBe(false);
  expect(commanderCompletionMarkerIsMalformed(finished)).toBe(false);
  expect(commanderCompletionMarkerIsMalformed({ ...finished, revision: 0 })).toBe(true);
  expect(commanderCompletionMarkerIsMalformed({ ...finished, targetingReceipt: { rolls: [] } })).toBe(true);
});

it('redirects only the selected receipt target and preserves the server dice and all other rolls', () => {
  const result = applyWolfCommandAndControlRedirect(receipt, 1);
  expect(result.rolls[1]).toEqual({
    ...receipt.rolls[1], target: 'aegis', modifiers: ['command-and-control-redirect'],
  });
  expect(result.rolls[0]).toBe(receipt.rolls[0]);
  expect(result.rolls[1]?.finalDie).toBe(3);
  expect(result.modifierOrder).toEqual(receipt.modifierOrder);
});

it.each([-1, 2, 0.5, Number.NaN])('rejects an invalid redirect roster index: %s', (index) => {
  expect(() => applyWolfCommandAndControlRedirect(receipt, index)).toThrow();
});

it('permits only one C&C redirect in an attack', () => {
  const redirected = applyWolfCommandAndControlRedirect(receipt, 0);
  expect(() => applyWolfCommandAndControlRedirect(redirected, 1)).toThrow(/already been used/i);
});
