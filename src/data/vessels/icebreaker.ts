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
      name: "Mining Drone Control",
      timing: 5,
      id: "mining-drone-control",
      effect: "Gain 3 material from mining drones. Upgraded: +2 materials. Damaged: cannot be charged or used.",
    },
    {
      name: "Jump Drive",
      timing: 'ftl',
      id: "jump-drive",
      effect: "Charged: jump for 3 / 6 / 12 fuel at short / medium / long range. Upgraded: 1 fewer fuel; damaged jumps fail only on 1. Damaged: jumps fail on 1–3.",
    },
    {
      name: "Ram Scoop",
      timing: 'ftl',
      id: "ram-scoop",
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
  populationTrack: {"steps": [40000, 37000, 34000, 32000, 30000, 28000, 26500, 25000, 23500, 22000, 20500, 19000, 17500, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [34000, 25000, 15000, 5000, 0]},
  initialSurvivors: 40000,
  specifications: { length: '800m', tonnage: 1200000, crewCapacity: 10000, passengerCapacity: 100 },
});
