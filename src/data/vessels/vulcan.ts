import proxima from '@/assets/flags/proxima.png';
import { defineSupplementalVessel } from './templates';

/** Optional base small-ship identity with printed charged laser support. */
export default defineSupplementalVessel({
  id: 'vulcan',
  kind: 'small-ship',
  availability: 'base-small',
  name: 'Vulcan',
  vesselType: 'Prison ship',
  nation: 'Proxima',
  nationShort: 'PROXIMA',
  origin: 'colonies',
  description: 'An optional prison vessel auxiliary for an expanded fleet line-up.',
  flag: proxima,
  color: 'var(--cic-faction-proxima)',
  printedStatistics: {
    capacity: null,
    population: 15_000,
    jumpCosts: { short: 1, medium: 1, long: 2 },
    reactorCapacity: 2,
    maintenanceSteps: [1, 2, 3, 4],
  },
  systems: [{
    id: 'laser-cannon',
    name: 'Laser Cannon',
    phase: 'Wolf attack',
    charge: 'reactor',
    effect: 'At each of medium and short range, roll 2 dice. Each die deals 1 damage on a 4+.',
    action: {
      status: 'live-below',
      reason: 'The current Vulcan Captain chooses use or pass at Medium and Short range; the server locks and resolves its dice with that range.',
    },
  }],
});
