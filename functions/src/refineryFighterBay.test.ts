import { describe, expect, it } from 'vitest';
import { authorizeRefineryFighterBayLaunch } from './refineryFighterBay';

const base = {
  actorRoleId: 'refinery-124-pdf-colonel',
  activeRoleIds: ['refinery-124-pdf-colonel'],
  activeVesselIds: ['refinery-124'],
  maintenanceCycle: {
    turn: 4, step: 0, revision: 9,
    results: { '5': 'Reactor powered up. Charged 1/4 consoles.', '7': 'Maintenance cycle complete.' },
    charges: ['fighter-bay'], refuelled: [], completedAt: '2026-09-22T12:00:00.000Z',
  },
  damage: { damagedSystemIds: [], destroyed: false },
  attack: {
    status: 'declared' as const, currentStep: 'targeting' as const,
    turn: 4, revision: 3,
    battleTableCraftActions: [
      { craftId: 'highwall', kind: 'shuttle' as const, ownerRoleId: 'icebreaker-miner' },
      { craftId: 'pdf-escort-fighter-wing', kind: 'fighter-wing' as const, ownerRoleId: 'refinery-124-pdf-colonel' },
    ],
    launchedCraftIds: [],
  },
};

describe('Refinery 124 Fighter Bay launch gate', () => {
  it('authorizes only the P.D.F. Escort Wing from the charged operational 8♦ bay', () => {
    expect(authorizeRefineryFighterBayLaunch(base)).toEqual({
      type: 'refinery-fighter-bay-launch-authorization',
      shipId: 'refinery-124', consoleId: 'fighter-bay', damageCard: '8♦',
      craftId: 'pdf-escort-fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel',
      cycle: 4, attackRevision: 3,
    });
  });

  it.each([
    ['wrong actor', { actorRoleId: 'refinery-124-engineer' }, /P\.D\.F\. Colonel/i],
    ['inactive role', { activeRoleIds: ['refinery-124-engineer'] }, /not active/i],
    ['inactive vessel', { activeVesselIds: ['quellon'] }, /does not match/i],
    ['uncharged', { maintenanceCycle: { ...base.maintenanceCycle, charges: [] } }, /charge/i],
    ['stale cycle', { maintenanceCycle: { ...base.maintenanceCycle, turn: 3 } }, /current cycle/i],
    ['unfinished maintenance', { maintenanceCycle: { ...base.maintenanceCycle, step: 6, completedAt: undefined } }, /complete maintenance/i],
    ['missing completion result', { maintenanceCycle: { ...base.maintenanceCycle, results: { '5': base.maintenanceCycle.results['5'] } } }, /complete maintenance/i],
    ['blank completion timestamp', { maintenanceCycle: { ...base.maintenanceCycle, completedAt: '' } }, /complete maintenance/i],
    ['damaged bay', { damage: { damagedSystemIds: ['fighter-bay'], destroyed: false } }, /damaged/i],
    ['destroyed host', { damage: { damagedSystemIds: [], destroyed: true } }, /destroyed/i],
    ['no attack', { attack: { ...base.attack, status: 'resolved' } }, /active Wolf attack/i],
    ['wrong attack step', { attack: { ...base.attack, currentStep: 'medium-range' } }, /launch window/i],
    ['already launched', { attack: { ...base.attack, launchedCraftIds: ['pdf-escort-fighter-wing'] } }, /already launched/i],
  ] as const)('rejects %s', (_label, patch, message) => {
    expect(() => authorizeRefineryFighterBayLaunch({ ...base, ...patch } as never)).toThrow(message);
  });

  it.each([
    ['missing wing', [{ craftId: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' }]],
    ['wrong kind', [{ craftId: 'pdf-escort-fighter-wing', kind: 'shuttle', ownerRoleId: 'refinery-124-pdf-colonel' }]],
    ['wrong owner', [{ craftId: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'wing-commander' }]],
    ['duplicate wing', [
      { craftId: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel' },
      { craftId: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel' },
    ]],
  ] as const)('rejects a %s battle-table registration', (label, battleTableCraftActions) => {
    expect(() => authorizeRefineryFighterBayLaunch({
      ...base, attack: { ...base.attack, battleTableCraftActions },
    } as never)).toThrow(label === 'missing wing'
      ? /exact P\.D\.F\. Escort Wing registration/i
      : /battle-table craft authority is malformed/i);
  });

  it('rejects a request for any other craft even when that craft is registered', () => {
    expect(() => authorizeRefineryFighterBayLaunch({
      ...base, requestedCraftId: 'highwall',
    })).toThrow(/only.*P\.D\.F\. Escort Wing/i);
  });

  it.each([
    ['rogue active role', { activeRoleIds: ['refinery-124-pdf-colonel', 'rogue-role'] }],
    ['extra active vessel', { activeVesselIds: ['refinery-124', 'quellon'] }],
    ['duplicate active roles', { activeRoleIds: ['refinery-124-pdf-colonel', 'refinery-124-pdf-colonel'] }],
    ['duplicate active vessels', { activeVesselIds: ['refinery-124', 'refinery-124'] }],
    ['duplicate charges', { maintenanceCycle: { ...base.maintenanceCycle, charges: ['fighter-bay', 'fighter-bay'] } }],
    ['unknown charge', { maintenanceCycle: { ...base.maintenanceCycle, charges: ['fighter-bay', 'bogus-console'] } }],
    ['unknown result', { maintenanceCycle: { ...base.maintenanceCycle, results: { ...base.maintenanceCycle.results, rogue: 'accepted' } } }],
    ['unknown refuelled craft', { maintenanceCycle: { ...base.maintenanceCycle, refuelled: ['bogus-shuttle'] } }],
    ['unknown damage', { damage: { damagedSystemIds: ['invented-system'], destroyed: false } }],
    ['duplicate damage', { damage: { damagedSystemIds: ['fighter-bay', 'fighter-bay'], destroyed: false } }],
    ['invalid foreign action tuple', { attack: { ...base.attack, battleTableCraftActions: [
      { craftId: 'highwall', kind: 'fighter-wing', ownerRoleId: 'icebreaker-miner' },
      base.attack.battleTableCraftActions[1],
    ] } }],
    ['foreign launched craft', { attack: { ...base.attack, launchedCraftIds: ['invented-craft'] } }],
  ] as const)('fails closed on %s', (_label, patch) => {
    expect(() => authorizeRefineryFighterBayLaunch({ ...base, ...patch } as never))
      .toThrow(/malformed|valid printed configuration|does not match the active roles/i);
  });
});
