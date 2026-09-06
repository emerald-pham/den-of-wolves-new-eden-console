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
      effect: "Spend 1 water → generate 3 food. Upgraded: +2 food. Damaged: cannot be charged or used.",
    },
    {
      name: "Water Reclamation",
      timing: 5,
      id: "water-reclamation",
      effect: "Generate 2 water. Upgraded: +2 water. Damaged: cannot be charged or used.",
    },
    {
      name: "VIP Lounge",
      timing: 5,
      id: "vip-lounge",
      effect: "Draw a VIP card. Damaged: cannot be charged or used.",
    },
    {
      name: "Fighter Bay",
      timing: 'combat',
      id: "fighter-bay",
      effect: "Wolf Attack: while charged, the Maliades can be launched. Damaged: cannot launch it.",
    },
    {
      name: "Jump Drive",
      timing: 'ftl',
      id: "jump-drive",
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
  populationTrack: {"steps": [100000, 95000, 90000, 86000, 82000, 78000, 74000, 70000, 66000, 62000, 58000, 54000, 50000, 47000, 44000, 41000, 38000, 35000, 33000, 31000, 29000, 27000, 25000, 23500, 22000, 20500, 19000, 17500, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [90000, 70000, 50000, 35000, 25000, 15000, 5000, 0]},
  initialSurvivors: 100000,
  specifications: { length: '550m', tonnage: 500000, crewCapacity: 4000, passengerCapacity: 12000 },
});
