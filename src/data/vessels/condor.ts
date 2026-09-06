import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'condor',
  name: 'P.S. Condor',
  shortName: 'Condor',
  consoleName: 'P.S. Condor',
  operator: 'Proxima',
  operatorShort: 'PROXIMA',
  vesselType: 'Service shuttle',
  description: 'Recharges consoles and carries full cargo for the Quellon Engineer.',
  captainRoleId: 'quellon-engineer',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
  initialDocking: { shipId: 'quellon', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Recharge',
      phase: 'Coordination',
      effect: 'When fuelled, charge one console. A console with an immediate maintenance effect resolves immediately.',
    },
    {
      name: 'Boarding defence',
      phase: 'Wolf attack',
      effect: 'The docked ship may use its security teams to help repel boarders.',
    },
  ],
});
