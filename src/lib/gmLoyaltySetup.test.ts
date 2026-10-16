import { describe, expect, it } from 'vitest';
import {
  GM_LOYALTY_KINDS,
  allowedExplicitGmLoyaltyKinds,
  canonicalGmLoyaltyAssignmentHolders,
  canonicalGmLoyaltyHolders,
  explicitLoyaltyCoverage,
  hasOtherConfiguredWolf,
  suspicionChoicesForGmLoyalty,
} from './gmLoyaltySetup';

describe('explicit GM loyalty setup options', () => {
  it('keeps ordinary Wolf designation automatic and offers no explicit assignment choices by default', () => {
    expect(allowedExplicitGmLoyaltyKinds({
      playerCount: 14, universalArbourEnabled: false, wolfCultEnabled: false,
    })).toEqual([]);
    expect(GM_LOYALTY_KINDS).toHaveLength(7);
    expect(GM_LOYALTY_KINDS).toEqual([
      'fleet-loyalist', 'wolf-agent', 'intelligence-agent', 'universal-arbour',
      'wolf-cult', 'android', 'friend',
    ]);
  });

  it('uses source-approved kinds for the explicitly configured Arbour scenario', () => {
    expect(allowedExplicitGmLoyaltyKinds({
      playerCount: 14, universalArbourEnabled: true, wolfCultEnabled: false,
    })).toEqual([
      'fleet-loyalist', 'wolf-agent', 'intelligence-agent', 'universal-arbour', 'android', 'friend',
    ]);
  });

  it('enforces the two-Wolf threshold and optional toggle for Wolf Cult', () => {
    const disabled = allowedExplicitGmLoyaltyKinds({
      playerCount: 8, universalArbourEnabled: false, wolfCultEnabled: true,
    });
    expect(disabled).not.toContain('wolf-cult');
    expect(allowedExplicitGmLoyaltyKinds({
      playerCount: 14, universalArbourEnabled: false, wolfCultEnabled: true,
    })).toEqual([
      'fleet-loyalist', 'wolf-agent', 'intelligence-agent', 'wolf-cult', 'android', 'friend',
    ]);
  });

  it('uses canonical suspicion choices, including the Android null choice', () => {
    expect(suspicionChoicesForGmLoyalty('fleet-loyalist')).toEqual([0, 5, 10]);
    expect(suspicionChoicesForGmLoyalty('wolf-agent')).toEqual([0]);
    expect(suspicionChoicesForGmLoyalty('intelligence-agent')).toEqual([6]);
    expect(suspicionChoicesForGmLoyalty('universal-arbour')).toEqual([10]);
    expect(suspicionChoicesForGmLoyalty('wolf-cult')).toEqual([15]);
    expect(suspicionChoicesForGmLoyalty('android')).toEqual([null]);
    expect(suspicionChoicesForGmLoyalty('friend')).toEqual([0]);
  });

  it('includes only uniquely assigned active core holders and reports aggregate coverage', () => {
    const holders = canonicalGmLoyaltyHolders([
      { uid: 'u1', displayName: 'A', role: 'player', assignedRoleId: 'aegis-engineer' },
      { uid: 'u2', displayName: 'B', role: 'player', assignedRoleId: 'aegis-captain' },
      { uid: 'u3', displayName: 'Press', role: 'player', assignedRoleId: 'press-officer' },
      { uid: 'u4', displayName: 'Waiting', role: 'player', assignedRoleId: null },
      { uid: 'u5', displayName: 'GM', role: 'gm', assignedRoleId: null },
      { uid: 'u6', displayName: 'Duplicate', role: 'player', assignedRoleId: 'aegis-engineer' },
      { uid: 'u7', displayName: 'Awaiting replacement', role: 'player', assignedRoleId: 'aegis-captain', replacementStatus: 'awaiting-re-role' },
    ] as never, ['aegis-engineer', 'aegis-captain']);
    expect(holders).toEqual([]);

    const uniqueHolders = canonicalGmLoyaltyHolders([
      { uid: 'u1', displayName: 'A', role: 'player', assignedRoleId: 'aegis-engineer' },
      { uid: 'u2', displayName: 'B', role: 'player', assignedRoleId: 'aegis-captain' },
      { uid: 'press', displayName: 'Press', role: 'player', assignedRoleId: 'press-officer' },
      { uid: 'waiting', displayName: 'Waiting', role: 'player', assignedRoleId: null },
      { uid: 'gm', displayName: 'GM', role: 'gm', assignedRoleId: null },
    ] as never, ['aegis-engineer', 'aegis-captain']);
    expect(uniqueHolders.map((holder) => holder.uid)).toEqual(['u1', 'u2']);
    expect(explicitLoyaltyCoverage(uniqueHolders, ['u1'])).toEqual({ configured: 1, total: 2, complete: false });
    expect(explicitLoyaltyCoverage(uniqueHolders, ['u1', 'u2'])).toEqual({ configured: 2, total: 2, complete: true });
  });

  it('counts a claimed Press holder only from a stable live station record and outside core roles', () => {
    const core = { uid: 'u1', displayName: 'A', role: 'player', assignedRoleId: 'aegis-engineer', replacementStatus: null, connected: true };
    const press = {
      uid: 'press', displayName: 'Press', role: 'player', assignedRoleId: null, seatId: null,
      activeConsoleRoleId: 'press-officer', replacementStatus: null, replacementRoleId: null,
      escapeState: null, connected: true,
    };
    const holders = canonicalGmLoyaltyAssignmentHolders(
      [core, press] as never,
      ['aegis-engineer'],
      { enabled: true, claimed: true },
    );
    expect(holders.map((holder) => holder.uid)).toEqual(['u1', 'press']);
    expect(holders.find((holder) => holder.uid === 'press')?.assignedRoleId).toBe('press-officer');
    expect(canonicalGmLoyaltyAssignmentHolders(
      [core, press] as never,
      ['aegis-engineer'],
      { enabled: false, claimed: true },
    ).map((holder) => holder.uid)).toEqual(['u1']);
    expect(canonicalGmLoyaltyAssignmentHolders(
      [core, { ...press, seatId: 'aegis-engineer' }] as never,
      ['aegis-engineer'],
      { enabled: true, claimed: true },
    ).map((holder) => holder.uid)).toEqual(['u1']);
    expect(canonicalGmLoyaltyAssignmentHolders(
      [core, press, { ...press, uid: 'press-2' }] as never,
      ['aegis-engineer'],
      { enabled: true, claimed: true },
    ).map((holder) => holder.uid)).toEqual(['u1']);
  });

  it('requires a different configured Wolf holder before an Intelligence Agent assignment', () => {
    expect(hasOtherConfiguredWolf('wolf-a', ['wolf-a'])).toBe(false);
    expect(hasOtherConfiguredWolf('crew-a', ['wolf-a'])).toBe(true);
    expect(hasOtherConfiguredWolf('crew-a', [])).toBe(false);
  });
});
