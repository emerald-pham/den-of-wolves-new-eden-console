import { expect, it } from 'vitest';
import chacau from './chacau';

it('keeps Chacau assigned to Refinery 124 with its own six-resource cargo manifest', () => {
  expect(chacau).toMatchObject({
    id: 'chacau',
    captainRoleId: 'refinery-124-engineer',
    cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    initialDocking: { shipId: 'refinery-124', dockedAt: 'SESSION START' },
  });
});

it('keeps repair and fuelled second-ship behavior on the Chacau procedure', () => {
  expect(chacau.operations).toEqual(expect.arrayContaining([
    {
      name: 'Repair',
      phase: 'Coordination',
      effect: 'Repair up to 2 consoles on one ship for 4 materials each, or damage a console with a ship player’s permission to gain 3 materials.',
      surfaceEffect: 'Repair up to 2 consoles on one ship for 4 materials each.',
    },
    {
      name: 'Fuelled repair',
      phase: 'Coordination',
      effect: 'When fuelled, repair consoles on a second ship.',
    },
  ]));
});
