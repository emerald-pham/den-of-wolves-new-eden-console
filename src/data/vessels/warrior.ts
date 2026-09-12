import rosal from '@/assets/flags/rosal.png';
import { defineSupplementalVessel } from './templates';

/** Optional base small-ship identity; its systems arrive in later prompts. */
export default defineSupplementalVessel({
  id: 'warrior',
  kind: 'small-ship',
  availability: 'base-small',
  name: 'Warrior',
  vesselType: 'Salvage vessel',
  nation: 'Rosal',
  nationShort: 'ROSAL',
  origin: 'colonies',
  description: 'An optional salvage vessel auxiliary for an expanded fleet line-up.',
  flag: rosal,
  color: 'var(--cic-faction-rosal)',
});
