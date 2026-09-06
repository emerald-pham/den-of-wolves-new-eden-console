import gliese from '@/assets/flags/gliese.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'refinery-124',
  name: 'Refinery 124',
  vesselType: 'Refinery station',
  nation: 'Gliese',
  nationShort: 'GLIESE',
  origin: 'colonies',
  description: 'Provides strytium fuel for the fleet and supports its defence while sheltering civilians.',
  flag: gliese,
  color: 'var(--cic-faction-gliese)',
  secondaryColor: 'var(--cic-faction-gliese-secondary)',

  systems: [
    {
      name: "Storage",
      timing: 1,
      id: "storage",
      effect: "Stored resources remain available. Damaged: discard half of each stored resource, including docked shuttle cargo, each maintenance cycle; round losses down.",
    },
    {
      name: "Reactor",
      timing: 5,
      id: "reactor",
      effect: "Charge up to 4 consoles. Upgraded: +1 console. Damaged: −3 consoles.",
    },
    {
      name: "Shuttle Bay",
      timing: 6,
      id: "shuttle-bay",
      effect: "Spend 1 fuel to refuel one shuttle during maintenance step 6. Damaged: cannot refuel. Uses the shared ship manifest.",
    },
    {
      name: "Hydroponics",
      timing: 5,
      id: "hydroponics",
      effect: "Spend 1 water → 3 food. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Water Reclamation",
      timing: 5,
      id: "water-reclamation",
      effect: "Generate 2 water. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Fuel Refinery",
      timing: 5,
      id: "fuel-refinery",
      effect: "Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel. Upgraded: refine an additional 5. Damaged: cannot be charged or used.",
    },
    {
      name: "Fuel Refinery II",
      timing: 5,
      id: "fuel-refinery-ii",
      effect: "Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel. Upgraded: refine an additional 5. Damaged: cannot be charged or used.",
    },
    {
      name: "Fighter Bay",
      timing: 'combat',
      id: "fighter-bay",
      effect: "Wolf Attack: while charged, a Fighter Wing can be launched. Damaged: cannot be charged or used.",
    },
    {
      name: "Jump Drive",
      timing: 'ftl',
      id: "jump-drive",
      effect: "Charged: Jump for 2 / 4 / 8 fuel at short / medium / long range. Upgraded: 1 fewer fuel; damaged jumps fail only on 1. Damaged: jumps fail on 1–3.",
    },
  ],
  maintenance: {reactor: 4, jump: [2, 4, 8], food: [0, 3, 7, 11], water: [0, 2, 5, 8]},
  roles: [
    { id: 'refinery-124-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'refinery-124-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'refinery-124-pdf-colonel', name: 'P.D.F. Colonel', commandAuthority: 'officer' },
  ],
  resources: { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
  populationTrack: {"steps": [20000, 18500, 17000, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [15000, 5000, 0]},
  initialSurvivors: 20000,
  specifications: { length: '500km', tonnage: 450000, crewCapacity: 5000, passengerCapacity: 0 },
});
