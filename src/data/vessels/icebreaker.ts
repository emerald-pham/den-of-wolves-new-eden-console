import cpa from '@/assets/flags/cpa.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'icebreaker',
  name: 'Icebreaker',
  vesselType: 'Mining vessel',
  nation: 'Confederated People of Asia',
  nationShort: 'C.P.A.',
  origin: 'earth',
  description: 'Harvests the materials and strytium ore that keep the survivor fleet moving.',
  flag: cpa,
  color: 'var(--cic-faction-cpa)',

  systems: [
    {
      name: "Storage",
      card: "8♠",
      effect: "Stored resources remain available. Damaged: discard half of each stored resource, including docked shuttle cargo, each maintenance cycle; round losses down.",
    },
    {
      name: "Reactor",
      card: "9♠",
      effect: "Charge up to 4 consoles. Upgraded: +1 console. Damaged: −3 consoles.",
    },
    {
      name: "Shuttle Bay",
      card: "10♠",
      effect: "Spend 1 fuel to refuel one shuttle during maintenance step 6. Damaged: cannot refuel. Uses the shared ship manifest.",
    },
    {
      name: "Hydroponics",
      card: "J♠",
      effect: "Spend 1 water → 3 food. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Water Reclamation",
      card: "Q♠",
      effect: "Generate 2 water. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Mining Drone Control",
      card: "K♠",
      effect: "Gain 3 material from mining drones. Upgraded: +2 materials. Damaged: cannot be charged or used.",
    },
    {
      name: "Jump Drive",
      card: "Q♦",
      effect: "Charged: jump for 3 / 6 / 12 fuel at short / medium / long range. Upgraded: 1 fewer fuel; damaged jumps fail only on 1. Damaged: jumps fail on 1–3.",
    },
    {
      name: "Ram Scoop",
      card: "K♦",
      effect: "When you FTL jump, if charged, gain 10 ore after a short jump, 15 after a medium, 20 after a long. Upgraded: +5 ore every jump. Damaged: cannot gather ore.",
    },
  ],
  maintenance: {reactor: 4, jump: [3, 6, 12], food: [0, 4, 9, 13], water: [0, 4, 7, 10]},
  roles: [
    { id: 'icebreaker-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'icebreaker-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'icebreaker-miner', name: 'Miner', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 4, food: 11, water: 9, materials: 3, securityTeams: 2 },
  initialSurvivors: 40000,
  specifications: { length: '800m', tonnage: 1200000, crewCapacity: 10000, passengerCapacity: 100 },
});
