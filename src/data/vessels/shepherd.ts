import rosal from '@/assets/flags/rosal.png';
import { defineShip } from './templates';

export default defineShip({
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

  systems: [
    {
      name: "Storage",
      card: "A♠",
      effect: "Stored resources remain available. Damaged: discard half of each stored resource, including docked shuttle cargo, each maintenance cycle; round losses down.",
    },
    {
      name: "Reactor",
      card: "2♠",
      effect: "Charge up to 3 consoles. Upgraded: +1 console. Damaged: −2 consoles.",
    },
    {
      name: "Shuttle Bay",
      card: "3♠",
      effect: "Spend 1 fuel to refuel one shuttle during maintenance step 6. Damaged: cannot refuel. Uses the shared ship manifest.",
    },
    {
      name: "Water Reclamation",
      card: "4♠",
      effect: "Generate 2 water. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Advanced Hydroponics",
      card: "5♠",
      effect: "Spend 2 water → 12 food. Upgraded: +4 food. Damaged: cannot be charged or used.",
    },
    {
      name: "Advanced Hydroponics II",
      card: "6♠",
      effect: "Spend 2 water → 12 food. Upgraded: +4 food. Damaged: cannot be charged or used.",
    },
    {
      name: "Jump Drive",
      card: "7♠",
      effect: "Charged: jump for 3 / 6 / 12 fuel at short / medium / long range. Upgraded: 1 fewer fuel; damaged jumps fail only on 1. Damaged: jumps fail on 1–3.",
    },
  ],
  maintenance: {reactor: 3, jump: [3, 6, 12], food: [0, 4, 8, 12], water: [0, 3, 6, 9]},
  roles: [
    { id: 'shepherd-captain', name: 'Captain', commandAuthority: 'captain' },
    { id: 'shepherd-engineer', name: 'Engineer', commandAuthority: 'officer' },
    { id: 'shepherd-scientist', name: 'Scientist', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 4, food: 10, water: 8, materials: 0, securityTeams: 2 },
  initialSurvivors: 30000,
  specifications: { length: '700m', tonnage: 750000, crewCapacity: 4000, passengerCapacity: 4000 },
});
