import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'black-sheep',
  name: 'R.S.S. Black Sheep',
  shortName: 'Black Sheep',
  consoleName: 'R.S.S. Black Sheep',
  operator: 'Rosal',
  operatorShort: 'ROSAL',
  vesselType: 'Service shuttle',
  description: 'Recharges consoles and carries full cargo for the Shepherd Engineer.',
  captainRoleId: 'shepherd-engineer',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
  initialDocking: { shipId: 'shepherd', dockedAt: 'SESSION START' },
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
