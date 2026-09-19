import gliese from '@/assets/flags/gliese.png';
import { defineSupplementalVessel } from './templates';

/** Crisis-arrival identity; admission and gameplay are owned by later prompts. */
export default defineSupplementalVessel({
  id: 'voyage-33-0',
  kind: 'voyage',
  availability: 'approaching-vessel',
  name: 'Voyage 33-0',
  vesselType: 'Damaged star cruiser',
  nation: 'Gliese',
  nationShort: 'GLIESE',
  origin: 'colonies',
  description: 'A damaged Gliese star cruiser carrying 40,000 survivors.',
  flag: gliese,
  color: 'var(--cic-faction-gliese)',
  printedStatistics: {
    capacity: null,
    population: 40_000,
    jumpCosts: { short: 1, medium: 1, long: 2 },
    reactorCapacity: 1,
    maintenanceSteps: [1, 2, 3, 4],
  },
});
