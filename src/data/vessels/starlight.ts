import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'starlight',
  name: 'I.C.S.S. Starlight',
  shortName: 'Starlight',
  consoleName: 'I.C.S.S. Starlight',
  operator: 'Interstellar Council Service Navy',
  operatorShort: 'I.C.N.',
  vesselType: 'Exploration shuttle',
  description: 'Scouts nearby systems and supports exploration missions for the AEGIS Wing Commander.',
  captainRoleId: 'wing-commander',
  initialDocking: { shipId: 'aegis', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Scouting',
      phase: 'Coordination',
      effect: 'Ask a facilitator to scout one system within 2 jumps of AEGIS; when fuelled, scout a second system.',
    },
    {
      name: 'Away missions',
      phase: 'Away mission',
      effect: 'May join away missions. Add +3 to exploration and +1 to salvage checks when contributing.',
    },
  ],
});
