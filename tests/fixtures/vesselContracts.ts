/**
 * A compact cross-layer sample of the vessel contract. Client and Functions
 * tests consume these exact objects so their independent catalogs cannot drift
 * while still appearing internally consistent.
 */
export const VESSEL_CONTRACT_FIXTURES = [
  {
    id: 'aegis',
    kind: 'full',
    population: 2_500,
    reactorCapacity: 5,
    maintenanceSteps: [1, 2, 3, 4, 5, 6, 7],
    jumpCosts: { short: 2, medium: 3, long: 6 },
    resources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
  },
  {
    id: 'dione',
    kind: 'full',
    population: 100_000,
    reactorCapacity: 4,
    maintenanceSteps: [1, 2, 3, 4, 5, 6],
    jumpCosts: { short: 2, medium: 4, long: 8 },
    resources: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 },
  },
  {
    id: 'gorgoneion',
    kind: 'small',
    population: 1_000,
    reactorCapacity: 2,
    maintenanceSteps: [1, 2, 3, 4],
  },
] as const;
