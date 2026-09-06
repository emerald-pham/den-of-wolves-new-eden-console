import cpa from '@/assets/flags/cpa.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'icebreaker',
  name: 'Icebreaker',
  vesselType: 'Mining vessel',
  nation: 'Confederated People of Asia',
  nationShort: 'C.P.A.',
  origin: 'earth',
  description: 'Harvests the materials and strytium ore that keep the survivor fleet moving.',
  flag: cpa,
  color: 'var(--cic-faction-cpa)',

  roles: [
    { id: 'icebreaker-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'icebreaker-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'icebreaker-miner', name: 'Miner', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 4, food: 11, water: 9, materials: 3, securityTeams: 2 },
  initialSurvivors: 40000,
  specifications: { length: '800m', tonnage: 1200000, crewCapacity: 10000, passengerCapacity: 100 },
});
