import proxima from '@/assets/flags/proxima.png';
import { defineSupplementalVessel } from './templates';

/** Optional base small-ship identity; its systems arrive in later prompts. */
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
});
