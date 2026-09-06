import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'boa',
  name: 'S.A.N.S. Boa',
  shortName: 'Boa',
  consoleName: 'S.A.N.S. Boa',
  operator: 'South American Nations',
  operatorShort: 'S.A.N.S.',
  vesselType: 'Reclamation shuttle',
  description: 'Converts resources into scrap and reshapes away missions for the Capybara Recycler.',
  captainRoleId: 'capybara-recycler',
  cargoTransfer: 'Scrap only',
  initialDocking: { shipId: 'capybara', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Recycling',
      phase: 'Coordination',
      effect: 'When fuelled, trade 6 food, water, or ore; 3 materials; or 6 fuel for 1 scrap, up to twice per turn.',
    },
    {
      name: 'Reclamation',
      phase: 'Away mission',
      effect: 'Choose one opportunity before cards are dealt: halve its difficulty and replace its reward with 1 scrap.',
    },
    {
      name: 'Scrap strike',
      phase: 'Wolf attack',
      effect: 'At each of long, medium, and short range, spend 1 scrap to deal 1 damage to a chosen Wolf ship.',
    },
  ],
});
