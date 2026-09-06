import proxima from '@/assets/flags/proxima.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'quellon',
  name: 'Quellon',
  vesselType: 'Water hauler',
  nation: 'Proxima',
  nationShort: 'PROXIMA',
  origin: 'colonies',
  description: 'Produces water at scale while supporting exploration missions and emergencies.',
  flag: proxima,
  color: 'var(--cic-faction-proxima)',

  systems: [
    {
      name: "Storage",
      card: "A♣",
      effect: "Stored resources remain available. Damaged: discard half of each stored resource, including docked shuttle cargo, each maintenance cycle; round losses down.",
    },
    {
      name: "Reactor",
      card: "2♣",
      effect: "Charge up to 3 consoles. Upgraded: +1 console. Damaged: −2 consoles.",
    },
    {
      name: "Shuttle Bay",
      card: "3♣",
      effect: "Spend 1 fuel to refuel one shuttle during maintenance step 6. Damaged: cannot refuel. Uses the shared ship manifest.",
    },
    {
      name: "Hydroponics",
      card: "4♣",
      effect: "Spend 1 water → 3 food. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Water Production",
      card: "5♣",
      effect: "Generate 12 water. Upgraded: +4. Damaged: cannot be charged or used.",
    },
    {
      name: "Water Production II",
      card: "6♣",
      effect: "Generate 12 water. Upgraded: +4. Damaged: cannot be charged or used.",
    },
    {
      name: "Jump Drive",
      card: "7♣",
      effect: "Charged: jump for 2 / 4 / 8 fuel at short / medium / long range. Upgraded: 1 fewer fuel; damaged jumps fail only on 1. Damaged: jumps fail on 1–3.",
    },
  ],
  maintenance: {reactor: 3, jump: [2, 4, 8], food: [0, 4, 8, 12], water: [0, 3, 6, 9]},
  roles: [
    { id: 'quellon-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'quellon-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'quellon-explorer', name: 'Explorer', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
  initialSurvivors: 30000,
  specifications: { length: '600m', tonnage: 700000, crewCapacity: 6500, passengerCapacity: 10 },
});
