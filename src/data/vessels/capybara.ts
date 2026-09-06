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

  systems: [
    {
      name: "Storage",
      card: "A♠",
      effect: "If damaged, discard half the ship's resources including those on docked shuttles. Round losses down (5 food → 3).",
    },
    {
      name: "Advanced Hydroponics",
      card: "2♠",
      effect: "Spend 2 water → 6 food. May spend an additional 1 scrap → +6 food. Upgraded: +3 food. Damaged: cannot be charged.",
    },
    {
      name: "Reactor",
      card: "3♠",
      effect: "Charge up to 3 consoles. Upgraded: +1. Damaged: −3.",
    },
    {
      name: "Water Production",
      card: "4♠",
      effect: "Generate 6 water. May spend 1 scrap → +6 water. Upgraded: +3 water. Damaged: cannot be charged.",
    },
    {
      name: "Scrap Refinery",
      card: "7♠",
      effect: "Choose one: spend 1 scrap → 3 materials, or generate 1 scrap. Damaged: cannot be charged.",
    },
    {
      name: "Shuttle Bay",
      card: "6♠",
      effect: "Spend 1 strytium fuel to refuel one shuttle. Damaged: cannot refuel.",
    },
    {
      name: "Jump Drive",
      card: "5♠",
      effect: "Coordination phase, if charged: FTL jump. 3 / 6 / 12 fuel for short / medium / long. Upgraded: 1 fewer fuel, jumps only fail when damaged on a 1. Damaged: jumps fail on 1–3.",
    },
  ],
  maintenance: {reactor: 3, jump: [3, 6, 12], food: [0, 3, 7, 11], water: [0, 2, 5, 8]},
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
