import proxima from '@/assets/flags/proxima.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'quellon',
  name: 'Quellon',
  vesselType: 'Water hauler',
  nation: 'Proxima',
  nationShort: 'PROXIMA',
  origin: 'colonies',
  description: 'Produces water at scale while supporting exploration missions and emergencies.',
  flag: proxima,
  color: 'var(--cic-faction-proxima)',

  roles: [
    { id: 'quellon-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'quellon-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'quellon-explorer', name: 'Explorer', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
  initialSurvivors: 30000,
  specifications: { length: '600m', tonnage: 700000, crewCapacity: 6500, passengerCapacity: 10 },
});
