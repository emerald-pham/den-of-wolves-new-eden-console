import { describe, expect, it } from 'vitest';
import {
  applyShipNavigationMove,
  isStarSystemCoordinate,
  stardateForDate,
} from './navigation';

describe('authoritative ship navigation', () => {
  it('recognizes only printed star-chart coordinates', () => {
    expect(isStarSystemCoordinate('5143')).toBe(true);
    expect(isStarSystemCoordinate('0101')).toBe(false);
  });

  it('moves one ship and records a self error plus nearby fleet notifications', () => {
    const result = applyShipNavigationMove({
      shipId: 'aegis',
      destination: '5143',
      now: new Date('2026-09-07T13:04:09.000Z'),
      coordinates: { aegis: '0000', dione: '0000', shepherd: '5143' },
      logs: { aegis: [], dione: [], shepherd: [] },
      shipNames: { aegis: 'AEGIS', dione: 'Dione', shepherd: 'Shepherd' },
    });

    expect(result.coordinates).toEqual({ aegis: '5143', dione: '0000', shepherd: '5143' });
    expect(result.logs.aegis?.[0]).toMatchObject({
      type: 'self-jump', origin: '0000', destination: '5143', navigationalError: true,
      stardate: '2026.250.130409',
    });
    expect(result.logs.dione?.[0]).toMatchObject({
      type: 'ship-jump-away', subjectShipName: 'AEGIS', origin: '0000', destination: '5143',
    });
    expect(result.logs.shepherd?.[0]).toMatchObject({
      type: 'ship-jump-arrival', subjectShipName: 'AEGIS', origin: '0000', destination: '5143',
    });
  });
});

it('formats the same stardate in the server model', () => {
  expect(stardateForDate(new Date('2026-09-07T13:04:09.000Z'))).toBe('2026.250.130409');
});
