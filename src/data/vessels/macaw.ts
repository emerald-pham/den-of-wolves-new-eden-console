import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'macaw',
  name: 'S.A.N.S. Macaw',
  shortName: 'Macaw',
  consoleName: 'S.A.N.S. Macaw',
  operator: 'South American Nations',
  operatorShort: 'S.A.N.S.',
  vesselType: 'Salvage shuttle',
  description: 'Repairs or salvages consoles with scrap for the Capybara Captain.',
  captainRoleId: 'capybara-captain',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, materials, and scrap',
  initialDocking: { shipId: 'capybara', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Repair',
      phase: 'Coordination',
      effect: 'Repair up to 2 consoles on one ship for 1 scrap each, or damage a console with a ship player’s permission to gain 1 scrap.',
    },
    {
      name: 'Fuelled salvage',
      phase: 'Coordination',
      effect: 'When fuelled, repair or salvage consoles on a second ship.',
    },
    {
      name: 'Boarding defence',
      phase: 'Wolf attack',
      effect: 'The docked ship may use its security teams to help repel boarders.',
    },
  ],
});
