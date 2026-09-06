import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'chacau',
  name: 'G.S. Chacau',
  shortName: 'Chacau',
  consoleName: 'G.S. Chacau',
  operator: 'Gliese',
  operatorShort: 'G.S.',
  vesselType: 'Engineering shuttle',
  description: 'Repairs fleet consoles and carries full cargo for the Refinery 124 Engineer.',
  captainRoleId: 'refinery-124-engineer',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
  initialDocking: { shipId: 'refinery-124', dockedAt: 'SESSION START' },
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
