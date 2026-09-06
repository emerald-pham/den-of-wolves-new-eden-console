import fas from '@/assets/flags/fas.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'dione',
  name: 'Dione',
  vesselType: 'Luxury cruiser',
  nation: 'Federated Atlantic Syndicate',
  nationShort: 'F.A.S.',
  origin: 'earth',
  description: 'Carries almost half of the fleet’s civilian population aboard a vast long-term recreation vessel.',
  flag: fas,
  color: 'var(--cic-faction-fas)',

  systems: [
    {
      name: "Storage",
      card: "8♣",
      effect: "Stored resources remain available. Damaged: discard half of each stored resource, including docked shuttle cargo, each maintenance cycle; round losses down.",
    },
    {
      name: "Reactor",
      card: "9♣",
      effect: "Charge up to 4 consoles. Upgraded: +1 console. Damaged: −3 consoles.",
    },
    {
      name: "Shuttle Bay",
      card: "10♣",
      effect: "Spend 1 fuel to refuel one shuttle during maintenance step 6. Damaged: cannot refuel. Uses the shared ship manifest.",
    },
    {
      name: "Hydroponics",
      card: "J♣",
      effect: "Spend 1 water → generate 3 food. Upgraded: +2 food. Damaged: cannot be charged or used.",
    },
    {
      name: "Water Reclamation",
      card: "Q♣",
      effect: "Generate 2 water. Upgraded: +2 water. Damaged: cannot be charged or used.",
    },
    {
      name: "VIP Lounge",
      card: "K♣",
      effect: "Draw a VIP card. Damaged: cannot be charged or used.",
    },
    {
      name: "Fighter Bay",
      card: "10♦",
      effect: "Wolf Attack: while charged, the Maliades can be launched. Damaged: cannot launch it.",
    },
    {
      name: "Jump Drive",
      card: "J♦",
      effect: "Charged: jump for 2 / 4 / 8 fuel at short / medium / long range. Upgraded: 1 fewer fuel; damaged jumps fail only on 1. Damaged: jumps fail on 1–3.",
    },
  ],
  maintenance: {reactor: 4, jump: [2, 4, 8], food: [0, 6, 12, 18], water: [0, 6, 11, 14]},
  roles: [
    { id: 'dione-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'dione-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'dione-president', name: 'President', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 },
  initialSurvivors: 100000,
  specifications: { length: '550m', tonnage: 500000, crewCapacity: 4000, passengerCapacity: 12000 },
});
