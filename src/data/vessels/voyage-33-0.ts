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
  description: 'The damaged approaching vessel identity used by the Voyage 33-0 crisis path.',
  flag: gliese,
  color: 'var(--cic-faction-gliese)',
});
