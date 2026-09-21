import icn from '@/assets/flags/icn.png';
import { defineSupplementalVessel } from './templates';

/** Optional base small-ship identity; its systems arrive in later prompts. */
export default defineSupplementalVessel({
  id: 'gorgoneion',
  kind: 'small-ship',
  availability: 'base-small',
  name: 'Gorgoneion',
  vesselType: 'Frigate',
  nation: 'Interstellar Council Service Navy',
  nationShort: 'I.C.S.S.',
  origin: 'earth',
  description: 'An optional frigate auxiliary vessel for an expanded fleet line-up.',
  flag: icn,
  color: 'var(--cic-faction-icn)',
  printedStatistics: {
    capacity: null,
    population: 1_000,
    jumpCosts: { short: 1, medium: 1, long: 2 },
    reactorCapacity: 2,
    maintenanceSteps: [1, 2, 3, 4],
  },
  systems: [{
    id: 'missile-array',
    name: 'Missile Array',
    phase: 'Wolf attack',
    charge: 'reactor',
    effect: 'Roll 3 dice total: one at long, one at medium, and one at short range. Each 6+ / 5+ / 4+ deals 1 damage at that range; the array can damage each target at most once per phase.',
    action: {
      status: 'unavailable',
      reason: 'Range-phase firing is unavailable until the authoritative Missile Array resolver lands.',
      followOnPrompt: '455',
    },
  }],
});
