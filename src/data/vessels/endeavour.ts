import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'endeavour',
  name: 'R.S.S. Endeavour',
  shortName: 'Endeavour',
  consoleName: 'R.S.S. Endeavour',
  operator: 'Rosal',
  operatorShort: 'ROSAL',
  vesselType: 'Science shuttle',
  description: 'Surveys distant systems and advances upgrades for the Shepherd Scientist.',
  captainRoleId: 'shepherd-scientist',
  initialDocking: { shipId: 'shepherd', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Long-range sensors',
      phase: 'Coordination',
      effect: 'Ask a facilitator to scout one system each turn, regardless of range.',
    },
    {
      name: 'Upgrades',
      phase: 'Coordination',
      effect: 'Upgrade up to 2 consoles per turn, paying each target ship’s next material cost; when fuelled, upgrade 2 additional consoles.',
    },
    {
      name: 'Away missions',
      phase: 'Away mission',
      effect: 'May join away missions. Add +3 to science checks when contributing.',
    },
  ],
});
