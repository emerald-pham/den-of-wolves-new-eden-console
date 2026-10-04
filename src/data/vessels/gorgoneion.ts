import icn from '@/assets/flags/icn.png';
import { defineSupplementalVessel } from './templates';

/** Optional base small-ship identity and its connected PC08 range systems. */
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
  systems: [
    {
      id: 'missile-array',
      name: 'Missile Array',
      phase: 'Wolf attack',
      charge: 'reactor',
      effect: 'At each range, roll 3 dice. Each 6+ / 5+ / 4+ deals 1 damage at Long / Medium / Short range; the array can damage each target at most once per phase.',
      action: {
        status: 'live-below',
        reason: 'The live server-owned range choice panel appears below when the current Captain and charge permit.',
      },
    },
    {
      id: 'force-field-projector',
      name: 'Force Field Projector',
      phase: 'Wolf attack',
      charge: 'reactor',
      effect: 'Before targeting, choose 1 ship. At the end of the Wolf attack, reduce the damage that ship takes by 2.',
      action: {
        status: 'live-below',
        reason: 'The live before-targeting choice panel appears below when the current Captain and charge permit.',
      },
    },
  ],
});
