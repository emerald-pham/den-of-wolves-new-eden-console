import gliese from '@/assets/flags/gliese.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'refinery-124',
  name: 'Refinery 124',
  vesselType: 'Refinery station',
  nation: 'Gliese',
  nationShort: 'GLIESE',
  origin: 'colonies',
  description: 'Provides strytium fuel for the fleet and supports its defence while sheltering civilians.',
  flag: gliese,
  color: 'var(--cic-faction-gliese)',
  secondaryColor: 'var(--cic-faction-gliese-secondary)',

  roles: [
    { id: 'refinery-124-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'refinery-124-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'refinery-124-pdf-colonel', name: 'P.D.F. Colonel', commandAuthority: 'officer' },
  ],
  resources: { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
  initialSurvivors: 20000,
  specifications: { length: '500km', tonnage: 450000, crewCapacity: 5000, passengerCapacity: 0 },
});
