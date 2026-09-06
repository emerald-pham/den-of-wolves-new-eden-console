import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'hummingbird',
  name: 'P.S. Hummingbird',
  shortName: 'Hummingbird',
  consoleName: 'P.S. Hummingbird',
  operator: 'Proxima',
  operatorShort: 'PROXIMA',
  vesselType: 'Exploration shuttle',
  description: 'Scouts nearby systems and harvests supplies for the Quellon Explorer.',
  captainRoleId: 'quellon-explorer',
  cargoTransfer: 'Food and water only',
  initialDocking: { shipId: 'quellon', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Scout system',
      phase: 'Coordination',
      effect: 'Ask a facilitator to scout one system within 3 jumps of Quellon.',
    },
    {
      name: 'Resource harvesting',
      phase: 'Coordination',
      effect: 'When fuelled, roll 2d6; choose one die for food and receive the other die in water.',
    },
    {
      name: 'Away missions',
      phase: 'Away mission',
      effect: 'May join away missions. Add +3 to exploration and +1 to mining checks when contributing.',
    },
  ],
});
