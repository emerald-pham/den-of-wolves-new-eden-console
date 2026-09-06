import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'blacksmith',
  name: 'C.S.S. Blacksmith',
  shortName: 'Blacksmith',
  consoleName: 'C.S.S. Blacksmith',
  operator: 'Confederated People of Asia',
  operatorShort: 'C.P.A.',
  vesselType: 'Engineering shuttle',
  description: 'Repairs fleet consoles and carries the Icebreaker Engineer’s full cargo load.',
  captainRoleId: 'icebreaker-engineer',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
  initialDocking: { shipId: 'icebreaker', dockedAt: 'SESSION START' },
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
