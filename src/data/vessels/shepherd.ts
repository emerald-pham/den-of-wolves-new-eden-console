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
      timing: 1,
      id: "storage",
      effect: "Stored resources remain available. Damaged: discard half of each stored resource, including docked shuttle cargo, each maintenance cycle; round losses down.",
    },
    {
      name: "Reactor",
      timing: 5,
      id: "reactor",
      effect: "Charge up to 3 consoles. Upgraded: +1 console. Damaged: −2 consoles.",
    },
    {
      name: "Shuttle Bay",
      timing: 6,
      id: "shuttle-bay",
      effect: "Spend 1 fuel to refuel one shuttle during maintenance step 6. Damaged: cannot refuel. Uses the shared ship manifest.",
    },
    {
      name: "Water Reclamation",
      timing: 5,
      id: "water-reclamation",
      effect: "Generate 2 water. Upgraded +2. Damaged: cannot be charged or used.",
    },
    {
      name: "Advanced Hydroponics",
      timing: 5,
      id: "advanced-hydroponics",
      effect: "Spend 2 water → 12 food. Upgraded: +4 food. Damaged: cannot be charged or used.",
    },
    {
      name: "Advanced Hydroponics II",
      timing: 5,
      id: "advanced-hydroponics-ii",
      effect: "Spend 2 water → 12 food. Upgraded: +4 food. Damaged: cannot be charged or used.",
    },
    {
      name: "Jump Drive",
      timing: 'ftl',
      id: "jump-drive",
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
  populationTrack: {"steps": [30000, 28000, 26000, 24000, 22000, 20500, 19000, 17500, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [24000, 15000, 5000, 0]},
  initialSurvivors: 30000,
  specifications: { length: '700m', tonnage: 750000, crewCapacity: 4000, passengerCapacity: 4000 },
});
