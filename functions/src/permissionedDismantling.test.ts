import { describe, expect, it } from 'vitest';
import { resolvePermissionedDismantling } from './permissionedDismantling';

const proposal = {
  craftId: 'philia',
  targetShipId: 'dione',
  targetConsoleId: 'reactor',
  targetRevision: 7,
  materialGain: 3,
} as const;

const consent = {
  id: 'consent-1',
  status: 'granted',
  actorUid: 'target-player',
  ...proposal,
} as const;

const base = {
  proposal,
  consent,
  activeTargetShipPlayerUids: ['target-player'],
  currentTargetRevision: 7,
  targetDamage: { damagedSystemIds: ['storage'], destroyed: false },
  targetResources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 5, securityTeams: 2 },
} as const;

describe('permissioned dismantling', () => {
  it('damages only the consented console and credits its exact printed material gain', () => {
    expect(resolvePermissionedDismantling(base)).toEqual({
      targetDamage: { damagedSystemIds: ['storage', 'reactor'], destroyed: false },
      targetResources: { ...base.targetResources, materials: 8 },
      consumedConsent: { ...consent, status: 'consumed' },
    });
  });

  it.each([
    ['missing consent', { consent: undefined }],
    ['revoked consent', { consent: { ...consent, status: 'revoked' } }],
    ['already consumed consent', { consent: { ...consent, status: 'consumed' } }],
    ['actor no longer assigned to target ship', { activeTargetShipPlayerUids: ['another-player'] }],
    ['stale target revision', { currentTargetRevision: 8 }],
    ['different craft', { proposal: { ...proposal, craftId: 'blacksmith' } }],
    ['different target ship', { proposal: { ...proposal, targetShipId: 'aegis' } }],
    ['different console', { proposal: { ...proposal, targetConsoleId: 'storage' } }],
    ['different material amount', { proposal: { ...proposal, materialGain: 4 } }],
    ['different proposal revision', { proposal: { ...proposal, targetRevision: 6 } }],
    ['unknown engineering craft', { proposal: { ...proposal, craftId: 'macaw' } }],
    ['destroyed target', { targetDamage: { damagedSystemIds: [], destroyed: true } }],
    ['already damaged console', { targetDamage: { damagedSystemIds: ['reactor'], destroyed: false } }],
    ['malformed damage', { targetDamage: { damagedSystemIds: ['unknown-system'], destroyed: false } }],
    ['unsafe material overflow', { targetResources: { ...base.targetResources, materials: Number.MAX_SAFE_INTEGER } }],
  ])('rejects %s without a partial result', (_label, change) => {
    expect(() => resolvePermissionedDismantling({ ...base, ...change } as never)).toThrow();
  });

  it('requires consent to bind all proposal fields to one current actor-bound receipt', () => {
    expect(() => resolvePermissionedDismantling({
      ...base,
      consent: { ...consent, actorUid: 'foreign-player' },
    })).toThrow(/active player assigned to the target ship/i);

    expect(() => resolvePermissionedDismantling({
      ...base,
      consent: { ...consent, targetConsoleId: 'storage' },
    })).toThrow(/does not match the proposed action/i);
  });

  it('returns new state without mutating the proposal, consent, or target ledgers', () => {
    const input = {
      ...base,
      proposal: { ...proposal },
      consent: { ...consent },
      targetDamage: { ...base.targetDamage, damagedSystemIds: [...base.targetDamage.damagedSystemIds] },
      targetResources: { ...base.targetResources },
    };
    const before = structuredClone(input);
    const result = resolvePermissionedDismantling(input);
    expect(result.targetDamage).not.toBe(input.targetDamage);
    expect(result.targetDamage.damagedSystemIds).not.toBe(input.targetDamage.damagedSystemIds);
    expect(result.targetResources).not.toBe(input.targetResources);
    expect(input).toEqual(before);
  });
});
