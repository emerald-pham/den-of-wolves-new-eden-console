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
      card: "A♦",
      effect: "Stored resources remain available. Damaged: discard half of each stored resource, including docked shuttle cargo, each maintenance cycle; round losses down.",
    },
    {
      name: "Reactor",
      card: "2♦",
      effect: "Charge up to 4 consoles. Upgraded: +1 console. Damaged: −3 consoles.",
    },
    {
      name: "Shuttle Bay",
      card: "3♦",
      effect: "Spend 1 fuel to refuel one shuttle during maintenance step 6. Damaged: cannot refuel. Uses the shared ship manifest.",
    },
    {
      name: "Hydroponics",
      card: "4♦",
      effect: "Spend 1 water → 3 food. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Water Reclamation",
      card: "5♦",
      effect: "Generate 2 water. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Fuel Refinery",
      card: "6♦",
      effect: "Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel. Upgraded: refine an additional 5. Damaged: cannot be charged or used.",
    },
    {
      name: "Fuel Refinery II",
      card: "7♦",
      effect: "Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel. Upgraded: refine an additional 5. Damaged: cannot be charged or used.",
    },
    {
      name: "Fighter Bay",
      card: "8♦",
      effect: "Wolf Attack: while charged, a Fighter Wing can be launched. Damaged: cannot be charged or used.",
    },
    {
      name: "Jump Drive",
      card: "9♦",
      effect: "Charged: jump for 2 / 4 / 8 fuel at short / medium / long range. Upgraded: 1 fewer fuel; damaged jumps fail only on 1. Damaged: jumps fail on 1–3.",
    },
  ],
  maintenance: {reactor: 4, jump: [2, 4, 8], food: [0, 3, 7, 11], water: [0, 2, 5, 8]},
  roles: [
    { id: 'refinery-124-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'refinery-124-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'refinery-124-pdf-colonel', name: 'P.D.F. Colonel', commandAuthority: 'officer' },
  ],
  resources: { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
});
