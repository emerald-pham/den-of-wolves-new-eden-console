export const FLEET_SHIP_NAMES = {
  aegis: 'AEGIS',
  dione: 'Dione',
  icebreaker: 'Icebreaker',
  capybara: 'Capybara',
  shepherd: 'Shepherd',
  quellon: 'Quellon',
  'refinery-124': 'Refinery 124',
  'snn-press-shuttle': 'SNN Independent Press Shuttle',
} as const;

export function isFleetShipId(shipId: string): shipId is keyof typeof FLEET_SHIP_NAMES {
  return shipId in FLEET_SHIP_NAMES;
}

export function canPopShipConfetti(usedShipIds: readonly string[], shipId: string): boolean {
  return shipId === 'snn-press-shuttle' || !usedShipIds.includes(shipId);
}

export const isReusableConfettiSource = (shipId: string): boolean =>
  shipId === 'snn-press-shuttle';

export const shouldLogShipConfettiEvent = (shipId: string): boolean =>
  shipId !== 'snn-press-shuttle';

export const isShipDispenserSignal = (sourceShipId: string, shipId: string): boolean =>
  sourceShipId === shipId;

interface ShuttleDocking {
  readonly shuttleId: string;
  readonly shipId: string;
}

export function confettiSignalTargets(
  shipId: string,
  shuttleDockings: readonly ShuttleDocking[],
): string[] {
  if (shipId !== 'snn-press-shuttle') return [shipId];
  const hostShipId = shuttleDockings.find((docking) => docking.shuttleId === shipId)?.shipId;
  return hostShipId ? [shipId, hostShipId] : [shipId];
}
