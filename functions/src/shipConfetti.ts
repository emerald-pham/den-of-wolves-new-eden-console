export const FLEET_SHIP_NAMES = {
  aegis: 'AEGIS',
  dione: 'Dione',
  icebreaker: 'Icebreaker',
  capybara: 'Capybara',
  shepherd: 'Shepherd',
  quellon: 'Quellon',
  'refinery-124': 'Refinery 124',
} as const;

export function isFleetShipId(shipId: string): shipId is keyof typeof FLEET_SHIP_NAMES {
  return shipId in FLEET_SHIP_NAMES;
}

export function canPopShipConfetti(usedShipIds: readonly string[], shipId: string): boolean {
  return !usedShipIds.includes(shipId);
}
