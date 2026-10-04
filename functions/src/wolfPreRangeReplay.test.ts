import { describe, expect, it } from 'vitest';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import { startTurnPhase } from './turnZero';
import { INITIAL_SHIP_SURVIVORS } from './shipPopulation';
import {
  CORE_WOLF_TARGET_RING, finalizeWolfAttack, replayWolfPreRangeMutations,
  resolveWolfTargeting, resolveWolfRange, wolfCombatRoster,
  type WolfFighterAceActionReceipt, type FleetCombatState, type WolfFleetTargetId,
} from './wolfCombatMath';

function fixture(commanderFirst: boolean) {
  const attackId = 'ordered-pre-range-attack';
  const turn = 10;
  const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, CORE_WOLF_TARGET_RING, () => 0);
  const roster = wolfCombatRoster(targeting);
  const permission = { type: 'pdf-fighter-ace-permission' as const, attackId, turn,
    sourceId: 'pdf-escort-fighter-wing' as const, fighterIndex: 0, aceUid: 'ace-1', actorUid: 'colonel-1',
    actorRoleId: 'refinery-124-pdf-colonel' as const, requestId: 'ordered-permission-1', revision: 2 };
  const before = { sourceId: permission.sourceId, fighters: 4, losses: 0, revision: 1,
    durableRevision: 1, launched: true, attackId, cycle: turn };
  const aceBefore = roster.map((ship, index) => index === 10 && commanderFirst
    ? { ...ship, target: 'dione' as const } : ship);
  const ace: WolfFighterAceActionReceipt = {
    type: 'pdf-fighter-ace-action', attackId, turn, revision: commanderFirst ? 6 : 5,
    requestId: 'ordered-ace-1', actorUid: 'ace-1', actorRoleId: 'pdf-fighter-ace', fighterUid: 'ace-1',
    sourceId: permission.sourceId, fighterIndex: 0, permissionActor: permission,
    permissionActorUid: permission.actorUid, permissionActorRoleId: permission.actorRoleId,
    permissionRequestId: permission.requestId, permissionRevision: permission.revision,
    range: 'medium', submittedTargetId: 'contact-11', extraTargetId: null, submittedTargetShift: 1,
    resolvedTargetShift: { instanceId: roster[10]!.instanceId, from: commanderFirst ? 2 : 1,
      to: commanderFirst ? 3 : 2, shift: 1 }, rosterBefore: aceBefore,
    targetResults: [{ instanceId: roster[10]!.instanceId, shipId: 'wolf-assault-transport', damage: 1, destroyed: false }],
    sourceStateBefore: before, sourceStateAfter: { ...before },
    outcome: { damage: 1, targetDestroyed: false, fighterDestroyed: false, aceDied: false, escaped: false },
    rolls: [], committedAt: '2026-10-04T12:00:00.000Z',
  };
  const commander = { type: 'wolf-commander-range-target-adjustment', status: 'committed', attackId, turn,
    revision: commanderFirst ? 5 : 6, range: 'medium-range', rosterIndex: 10,
    instanceId: roster[10]!.instanceId, shipId: 'wolf-assault-transport',
    fromTarget: commanderFirst ? 'aegis' : 'dione', toTarget: commanderFirst ? 'dione' : 'icebreaker',
    fromTargetNumber: commanderFirst ? 1 : 2, toTargetNumber: commanderFirst ? 2 : 3,
    delta: 1, actorUid: 'commander-1', actorRoleId: 'wolf-commander', requestId: 'ordered-dial-1' };
  return { attackId, turn, targeting, roster, ace, commander, permission };
}

describe('attack-bound pre-range mutation composition', () => {
  it.each([true, false])('retains both same-contact choices when Commander first is %s', (commanderFirst) => {
    const f = fixture(commanderFirst);
    const replay = replayWolfPreRangeMutations(f.roster, { attackId: f.attackId, turn: f.turn,
      range: 'medium-range', targetRing: CORE_WOLF_TARGET_RING,
      fighterAceAction: f.ace, persistedPermission: f.permission, commanderAdjustment: f.commander });
    expect(replay.roster[10]).toEqual({ ...f.roster[10], target: 'icebreaker', damageTaken: 1, destroyed: false });
    expect(f.roster[10]).toMatchObject({ target: 'aegis', damageTaken: 0 });
    const long = resolveWolfRange('long-range', [], [], f.roster);
    const medium = resolveWolfRange('medium-range', [], [], replay.roster, undefined, {
      ring: CORE_WOLF_TARGET_RING,
      choices: [{ sourceId: 'maliades', choiceIndex: 0, rosterIndex: 10, shift: 1 }],
    });
    const short = resolveWolfRange('short-range', [], [], medium.roster);
    const resolved = finalizeWolfAttack({
      requestId: 'ordered-final-1', attackId: f.attackId, targeting: f.targeting, roster: short.roster,
      fighterAceAction: f.ace, fighterAcePermissions: { [f.permission.sourceId]: f.permission },
      commanderRangeAdjustments: { 'medium-range': f.commander },
      ranges: [long.receipt, medium.receipt, short.receipt], phase: startTurnPhase(f.turn, 1_000), now: 2_000,
      targetRing: CORE_WOLF_TARGET_RING, boardingDefence: ['aegis', 'quellon'].map(target => ({ target, securityTeams: 0 })), forceFieldTargetId: null,
      fleetState: Object.fromEntries(CORE_WOLF_TARGET_RING.map(target => [target, {
        damage: { damagedSystemIds: [], destroyed: false }, population: INITIAL_SHIP_SURVIVORS[target]!,
      }])) as Record<WolfFleetTargetId, FleetCombatState>, randomInt: () => 0,
    } as unknown as Parameters<typeof finalizeWolfAttack>[0]);
    expect(resolved.boarding).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'quellon', baseBoardingParties: 4 })]));
    expect(resolved.fighterAce).toMatchObject({ requestId: f.ace.requestId, rosterBefore: f.ace.rosterBefore });
  });

  it('preserves a later Ace action after an ordinary earlier range overkills another contact', () => {
    const f = fixture(false);
    const current = f.roster.map((ship, index) => index === 0 ? { ...ship, damageTaken: 4, destroyed: true } : ship);
    const ace = { ...f.ace, rosterBefore: current };
    const replay = replayWolfPreRangeMutations(current, { attackId: f.attackId, turn: f.turn,
      range: 'medium-range', targetRing: CORE_WOLF_TARGET_RING, fighterAceAction: ace,
      persistedPermission: f.permission });
    expect(replay.roster[0]).toEqual(current[0]);
    expect(replay.roster[10]).toMatchObject({ target: 'dione', damageTaken: 1, destroyed: false });
  });

  it.each(['attackId', 'turn', 'revision', 'instanceId', 'fromTarget', 'toTarget', 'fromTargetNumber', 'actorRoleId'])
  ('rejects a forged or stale Commander %s before advancing combat', (key) => {
    const f = fixture(true);
    expect(() => replayWolfPreRangeMutations(f.roster, { attackId: f.attackId, turn: f.turn,
      range: 'medium-range', targetRing: CORE_WOLF_TARGET_RING,
      commanderAdjustment: { ...f.commander, [key]: key === 'turn' || key === 'revision' || key === 'fromTargetNumber' ? -1 : 'wrong' },
    })).toThrow(/Commander|binding|adjustment/);
  });

  it('rejects two pre-range mutations with the same revision rather than inventing their order', () => {
    const f = fixture(true);
    expect(() => replayWolfPreRangeMutations(f.roster, { attackId: f.attackId, turn: f.turn,
      range: 'medium-range', targetRing: CORE_WOLF_TARGET_RING, fighterAceAction: f.ace,
      persistedPermission: f.permission, commanderAdjustment: { ...f.commander, revision: f.ace.revision },
    })).toThrow(/revision|order/);
  });
});
