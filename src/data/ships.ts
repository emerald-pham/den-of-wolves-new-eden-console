import cpa from '@/assets/flags/cpa.png';
import fas from '@/assets/flags/fas.png';
import gliese from '@/assets/flags/gliese.png';
import icn from '@/assets/flags/icn.png';
import proxima from '@/assets/flags/proxima.png';
import rosal from '@/assets/flags/rosal.png';
import san from '@/assets/flags/san.png';

export type ShipOrigin = 'earth' | 'colonies';

export interface Ship {
  readonly id: string;
  readonly name: string;
  readonly vesselType: string;
  readonly nation: string;
  readonly nationShort: string;
  readonly origin: ShipOrigin;
  readonly description: string;
  readonly flag: string;
  readonly color: string;
  readonly dradisColor?: string;
}

export const SHIPS: readonly Ship[] = [
  {
    id: 'aegis',
    name: 'AEGIS',
    vesselType: 'Battleship / carrier',
    nation: 'Interstellar Council Service Navy',
    nationShort: 'ICN',
    origin: 'earth',
    description: 'The main protector of the survivor fleet, carrying weapon batteries, fighter squadrons, and marines.',
    flag: icn,
    color: 'var(--cic-faction-icn)',
  },
  {
    id: 'dione',
    name: 'Dione',
    vesselType: 'Luxury cruiser',
    nation: 'Federated Atlantic Syndicate',
    nationShort: 'F.A.S.',
    origin: 'earth',
    description: 'Carries almost half of the fleet’s civilian population aboard a vast long-term recreation vessel.',
    flag: fas,
    color: 'var(--cic-faction-fas)',
  },
  {
    id: 'icebreaker',
    name: 'Icebreaker',
    vesselType: 'Mining vessel',
    nation: 'Confederated People of Asia',
    nationShort: 'C.P.A.',
    origin: 'earth',
    description: 'Harvests the materials and strytium ore that keep the survivor fleet moving.',
    flag: cpa,
    color: 'var(--cic-faction-cpa)',
  },
  {
    id: 'capybara',
    name: 'Capybara',
    vesselType: 'Supply ship',
    nation: 'South American Nations',
    nationShort: 'S.A.N.',
    origin: 'earth',
    description: 'Supplies the fleet with essential food, water, and materials through salvage and recycling.',
    flag: san,
    color: 'var(--cic-faction-san)',
  },
  {
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
  },
  {
    id: 'quellon',
    name: 'Quellon',
    vesselType: 'Water hauler',
    nation: 'Proxima',
    nationShort: 'PROXIMA',
    origin: 'colonies',
    description: 'Produces water at scale while supporting exploration missions and emergencies.',
    flag: proxima,
    color: 'var(--cic-faction-proxima)',
  },
  {
    id: 'refinery-124',
    name: 'Refinery 124',
    vesselType: 'Refinery station',
    nation: 'Gliese',
    nationShort: 'GLIESE',
    origin: 'colonies',
    description: 'Provides strytium fuel for the fleet and supports its defence while sheltering civilians.',
    flag: gliese,
    color: 'var(--cic-faction-gliese)',
  },
];

export function findShip(id: string | undefined): Ship | undefined {
  return SHIPS.find((ship) => ship.id === id);
}
