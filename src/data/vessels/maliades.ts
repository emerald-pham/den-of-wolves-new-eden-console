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
  initialDocking: { shipId: 'dione', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Damage capacity',
      phase: 'Team',
      effect: 'Track up to 3 damage. At 3 damage the Maliades is destroyed; when fuelled, repair damage for 1 material each.',
    },
    {
      name: 'Medium range',
      phase: 'Wolf attack',
      effect: 'Shift one hostile target number by +1 or −1 and/or roll one die for 1 damage on 4+; rolls of 1–3 deal 1 damage to the Maliades.',
    },
    {
      name: 'Short range',
      phase: 'Wolf attack',
      effect: 'Roll up to 2 dice against different targets; each 2+ deals 1 damage and each 1 damages the Maliades.',
    },
  ],
});
