import { describe, expect, it } from 'vitest';
import {
  navigationEntryMessage,
  stardateForDate,
  visitedCoordinates,
} from './navigationLog';
import type { ShipNavigationLogEntry } from '@/types/game';

describe('ship navigation log presentation', () => {
  it('formats a stardate from the UTC day, hour, minute, and second', () => {
    expect(stardateForDate(new Date('2026-09-07T13:04:09.000Z')))
      .toBe('2026.250.130409');
  });

  it('keeps the current system out of the places a ship has come from', () => {
    const entries: readonly ShipNavigationLogEntry[] = [
      {
        id: 'jump-1',
        shipId: 'aegis',
        type: 'self-jump',
        origin: '0000',
        destination: '5143',
        navigationalError: true,
        occurredAt: '2026-09-07T13:04:09.000Z',
        stardate: '2026.250.130409',
      },
      {
        id: 'jump-2',
        shipId: 'aegis',
        type: 'self-jump',
        origin: '5143',
        destination: '6837',
        occurredAt: '2026-09-07T13:05:09.000Z',
        stardate: '2026.250.130509',
      },
    ];

    expect(visitedCoordinates(entries, '6837')).toEqual(['0000', '5143']);
  });

  it('distinguishes own navigation errors from other ships entering or leaving', () => {
    expect(navigationEntryMessage({
      id: 'jump-1', shipId: 'aegis', type: 'self-jump', origin: '0000', destination: '5143',
      navigationalError: true, occurredAt: '2026-09-07T13:04:09.000Z', stardate: '2026.250.130409',
    })).toMatch(/JUMP.*NAVIGATIONAL ERROR.*0000.*5143/i);
    expect(navigationEntryMessage({
      id: 'away-1', shipId: 'dione', type: 'ship-jump-away', origin: '0000', destination: '5143',
      subjectShipId: 'dione', subjectShipName: 'Dione', occurredAt: '2026-09-07T13:04:09.000Z', stardate: '2026.250.130409',
    })).toMatch(/DIONE.*JUMPED AWAY/i);
    expect(navigationEntryMessage({
      id: 'in-1', shipId: 'aegis', type: 'ship-jump-arrival', origin: '0000', destination: '5143',
      subjectShipId: 'dione', subjectShipName: 'Dione', occurredAt: '2026-09-07T13:04:09.000Z', stardate: '2026.250.130409',
    })).toMatch(/DIONE.*JUMPED INTO SYSTEM/i);
  });
});
