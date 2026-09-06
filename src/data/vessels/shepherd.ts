import rosal from '@/assets/flags/rosal.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'shepherd',
  name: 'Shepherd',
  vesselType: 'Supply vessel',
  nation: 'Rosal',
  nationShort: 'ROSAL',
  origin: 'colonies',
  description: 'Produces food for the fleet aboard a deep-space agricultural vessel.',
  flag: rosal,
  color: 'var(--cic-faction-rosal)',
  dradisColor: 'var(--cic-dradis-white)',

  roles: [
    { id: 'shepherd-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'shepherd-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'shepherd-scientist', name: 'Scientist', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 4, food: 10, water: 8, materials: 0, securityTeams: 2 },
});
