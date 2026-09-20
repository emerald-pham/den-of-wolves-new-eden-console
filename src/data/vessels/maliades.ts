import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'maliades',
  name: 'F.S.F. Maliades',
  shortName: 'Maliades',
  consoleName: 'F.S.F. Maliades',
  operator: 'Federated Atlantic Syndicate',
  operatorShort: 'F.A.S.',
  vesselType: 'Escort fighter',
  description: 'A three-damage escort fighter launched by the Dione Engineer.',
  captainRoleId: 'dione-engineer',
  wolfAttackRole: 'battle-table',
  launchSystemId: 'fighter-bay',
  initialDocking: { shipId: 'dione', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Damage capacity',
      phase: 'Team',
      effect: 'Track up to 3 damage. At 3 damage the Maliades is destroyed. When fuelled in a Shuttle Bay during the Team phase, repair damage for 1 material per damage.',
    },
    {
      name: 'Medium range',
      phase: 'Wolf attack',
      effect: 'Make 1 Wolf Ship add +1 or −1 to its target number (1s and 6s wrap around); and/or roll up to 1 die, doing 1 damage on a 4+ to different targets, but taking 1 damage for each roll of 1, 2, or 3.',
    },
    {
      name: 'Short range',
      phase: 'Wolf attack',
      effect: 'Roll up to 2 dice, 1 damage on a 2+ to different targets, but taking 1 damage for each roll of 1.',
    },
  ],
});
