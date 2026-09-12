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
});
