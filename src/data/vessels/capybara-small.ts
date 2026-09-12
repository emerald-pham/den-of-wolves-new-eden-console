import san from '@/assets/flags/san.png';
import { defineSupplementalVessel } from './templates';

/** The base small-ship Capybara is distinct from the expansion ship. */
export default defineSupplementalVessel({
  id: 'capybara-small',
  kind: 'small-ship',
  availability: 'base-small',
  name: 'Capybara',
  vesselType: 'Supply ship',
  nation: 'South American Nations',
  nationShort: 'S.A.N.',
  origin: 'earth',
  description: 'The base-game small supply ship, replaced by the expansion Capybara when selected.',
  flag: san,
  color: 'var(--cic-faction-san)',
  printedStatistics: {
    capacity: null,
    population: 2_000,
    jumpCosts: { short: 1, medium: 1, long: 2 },
    reactorCapacity: 2,
    maintenanceSteps: [1, 2, 3, 4],
  },
});
