import fas from '@/assets/flags/fas.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'dione',
  name: 'Dione',
  vesselType: 'Luxury cruiser',
  nation: 'Federated Atlantic Syndicate',
  nationShort: 'F.A.S.',
  origin: 'earth',
  description: 'Carries almost half of the fleet’s civilian population aboard a vast long-term recreation vessel.',
  flag: fas,
  color: 'var(--cic-faction-fas)',

  roles: [
    { id: 'dione-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'dione-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'dione-president', name: 'President', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 },
  initialSurvivors: 100000,
  specifications: { length: '550m', tonnage: 500000, crewCapacity: 4000, passengerCapacity: 12000 },
});
