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

  describe('Macaw deliberate dismantling', () => {
    const macawProposal = {
      craftId: 'macaw',
      targetShipId: 'dione',
      targetConsoleId: 'reactor',
      targetRevision: 7,
      scrapGain: 1,
    } as const;
    const macawConsent = { id: 'consent-macaw', status: 'granted', actorUid: 'target-player', ...macawProposal } as const;
    const macawBase = {
      proposal: macawProposal,
      consent: macawConsent,
      activeTargetShipPlayerUids: ['target-player'],
      currentTargetRevision: 7,
      targetDamage: { damagedSystemIds: ['storage'], destroyed: false },
      targetResources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 5, securityTeams: 2 },
      capybaraScrap: 3,
    } as const;

    it('damages one consented console on another ship and credits exactly one Capybara Scrap', () => {
      expect(resolvePermissionedDismantling(macawBase)).toEqual({
        targetDamage: { damagedSystemIds: ['storage', 'reactor'], destroyed: false },
        targetResources: macawBase.targetResources,
        capybaraScrapAfter: 4,
        consumedConsent: { ...macawConsent, status: 'consumed' },
      });
    });

    it('applies host dismantling to the Capybara inventory it damages in one combined result', () => {
      const hostProposal = { ...macawProposal, targetShipId: 'capybara', targetConsoleId: 'advanced-hydroponics' };
      const hostConsent = { ...macawConsent, actorUid: 'capybara-recycler', ...hostProposal };
      const hostResources = { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 };
      expect(resolvePermissionedDismantling({
        ...macawBase,
        proposal: hostProposal,
        consent: hostConsent,
        activeTargetShipPlayerUids: ['capybara-recycler'],
        targetDamage: { damagedSystemIds: [], destroyed: false },
        targetResources: hostResources,
      })).toEqual({
        targetDamage: { damagedSystemIds: ['advanced-hydroponics'], destroyed: false },
        targetResources: { ...hostResources, scrap: 4 },
        capybaraScrapAfter: 4,
        consumedConsent: { ...hostConsent, status: 'consumed' },
      });
    });

    const materialProposal = {
      craftId: 'macaw', targetShipId: 'dione', targetConsoleId: 'reactor', targetRevision: 7, materialGain: 3,
    };
    const withoutLedger = {
      proposal: macawProposal,
      consent: macawConsent,
      activeTargetShipPlayerUids: ['target-player'],
      currentTargetRevision: 7,
      targetDamage: macawBase.targetDamage,
      targetResources: macawBase.targetResources,
    };

    it.each([
      ['a material gain instead of Scrap', { ...macawBase, proposal: materialProposal }],
      ['more than one Scrap', { ...macawBase, proposal: { ...macawProposal, scrapGain: 2 } }],
      ['a consent for a different Scrap amount', { ...macawBase, consent: { ...macawConsent, scrapGain: 2 } }],
      ['a consenter not assigned to the target ship', { ...macawBase, activeTargetShipPlayerUids: ['someone-else'] }],
      ['an unavailable Capybara Scrap ledger', withoutLedger],
      ['an unsafe Capybara Scrap overflow', { ...macawBase, capybaraScrap: Number.MAX_SAFE_INTEGER }],
    ])('rejects %s', (_label, input) => {
      expect(() => resolvePermissionedDismantling(input as never)).toThrow();
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
    ['Macaw carrying an engineering material gain', { proposal: { ...proposal, craftId: 'macaw' } }],
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
