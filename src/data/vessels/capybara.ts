import san from '@/assets/flags/san.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'capybara',
  name: 'Capybara',
  vesselType: 'Supply ship',
  nation: 'South American Nations',
  nationShort: 'S.A.N.',
  origin: 'earth',
  description: 'Supplies the fleet with essential food, water, and materials through salvage and recycling.',
  flag: san,
  color: 'var(--cic-faction-san)',

  roles: [
    { id: 'capybara-captain', name: 'Capybara Captain', commandAuthority: 'captain' },
    { id: 'capybara-recycler', name: 'Capybara Recycler', commandAuthority: 'officer' },
  ],
  resources: {
    ore: 0,
    fuel: 3,
    food: 9,
    water: 4,
    materials: 0,
    securityTeams: 2,
    scrap: 3,
  },
  initialSurvivors: 20000,
  populationTrack: {
    steps: [
      20000, 18500, 17000, 16000, 15000, 14000, 13000, 12000, 11000, 10000,
      9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000,
      1500, 1250, 1000, 750, 500, 250, 0,
    ],
    thresholds: [15000, 5000, 0],
  },
  specifications: { length: '600m', tonnage: 800000, crewCapacity: 5000, passengerCapacity: 500 },
});
