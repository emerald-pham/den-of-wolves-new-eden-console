import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'highwall',
  name: 'C.S.S. Highwall',
  shortName: 'Highwall',
  consoleName: 'C.S.S. Highwall',
  operator: 'Confederated People of Asia',
  operatorShort: 'C.P.A.',
  vesselType: 'Mining shuttle',
  description: 'Conducts mining operations and supports engineering missions for the Icebreaker Miner.',
  captainRoleId: 'icebreaker-miner',
  cargoTransfer: 'Strytium ore and materials only',
  initialDocking: { shipId: 'icebreaker', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Mining operations',
      phase: 'Coordination',
      effect: 'Conduct up to 2 operations: roll 1d6 for materials or 3d6 for strytium ore. When fuelled, conduct a third operation.',
    },
    {
      name: 'Away missions',
      phase: 'Away mission',
      effect: 'May join away missions. Add +3 to mining and +2 to engineering checks when contributing.',
    },
    {
      name: 'Mining laser',
      phase: 'Wolf attack',
      effect: 'When fuelled, roll one die at medium and short range; on 5+ deal 3 damage to one target.',
    },
  ],
});
