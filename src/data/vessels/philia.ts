import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'philia',
  name: 'F.S. Philia',
  shortName: 'Philia',
  consoleName: 'F.S. Philia',
  operator: 'Federated Atlantic Syndicate',
  operatorShort: 'F.A.S.',
  vesselType: 'Engineering shuttle',
  description: 'Repairs or scraps ship consoles for the Dione Engineer.',
  captainRoleId: 'dione-engineer',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
  initialDocking: { shipId: 'dione', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Repair',
      phase: 'Coordination',
      effect: 'Repair up to 2 consoles on one ship for 4 materials each, or damage a console with a ship player’s permission to gain 3 materials.',
    },
    {
      name: 'Fuelled repair',
      phase: 'Coordination',
      effect: 'When fuelled, repair or scrap consoles on a second ship.',
    },
    {
      name: 'Boarding defence',
      phase: 'Wolf attack',
      effect: 'The docked ship may use its security teams to help repel boarders.',
    },
  ],
});
