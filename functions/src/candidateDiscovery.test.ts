import { describe, expect, it } from 'vitest';
import {
  candidateDiscoveryFromArrival,
  candidateDiscoveryFromScout,
} from './candidateDiscovery';

const event = { id: 'navigation-arrival-0', occurredAt: '2026-09-22T14:00:00.000Z' };

describe('New Eden candidate discovery authority', () => {
  it.each([
    ['A', '6798', 'N', 'Ancient Jump Ring'],
    ['A', '0408', 'O', 'Deep Nebula'],
    ['A', '4888', 'P', 'Ancient Space Station'],
    ['B', '0408', 'N', 'Ancient Jump Ring'],
    ['B', '1380', 'O', 'Deep Nebula'],
    ['B', '1964', 'P', 'Ancient Space Station'],
    ['C', '6798', 'N', 'Ancient Jump Ring'],
    ['C', '8378', 'O', 'Deep Nebula'],
    ['C', '4888', 'P', 'Ancient Space Station'],
  ] as const)('derives chart %s candidate %s only from an arrival', (chart, coordinate, code, title) => {
    const history = candidateDiscoveryFromArrival(undefined, {
      shipId: 'aegis', coordinate, chart, event,
    });
    expect(history?.aegis?.[coordinate]?.candidateDiscovery).toEqual({
      ...event, code, title, source: 'arrival',
    });
  });

  it('does not mark an ordinary site as a candidate', () => {
    expect(candidateDiscoveryFromArrival(undefined, {
      shipId: 'aegis', coordinate: '5143', chart: 'A', event,
    })).toBeUndefined();
  });

  it('records only a strictly validated private candidate scout result', () => {
    const result = {
      type: 'private-scout-result', sessionId: 's1', requestId: 'scan-1',
      requesterUid: 'u1', sourceId: 'starlight', cycle: 4,
      targetCoordinate: '6798',
      systemFact: { coordinate: '6798', code: 'N', title: 'Ancient Jump Ring' },
    } as const;
    const history = candidateDiscoveryFromScout(
      undefined, 'aegis', result, '2026-09-22T14:05:00.000Z',
    );
    expect(history?.aegis?.['6798']?.candidateDiscovery).toEqual({
      id: 'scout-scan-1', occurredAt: '2026-09-22T14:05:00.000Z',
      code: 'N', title: 'Ancient Jump Ring', source: 'scout',
    });
    expect(candidateDiscoveryFromScout(undefined, 'aegis', {
      ...result, organiserSites: { '6798': result.systemFact },
    }, '2026-09-22T14:05:00.000Z')).toBeUndefined();
    expect(candidateDiscoveryFromScout(undefined, 'aegis', {
      ...result, systemFact: { ...result.systemFact, title: 'Forged candidate' },
    }, '2026-09-22T14:05:00.000Z')).toBeUndefined();
    expect(candidateDiscoveryFromScout(undefined, 'aegis', result, 'not-a-time')).toBeUndefined();
  });

  it('does not turn an ordinary private scout result into candidate history', () => {
    expect(candidateDiscoveryFromScout(undefined, 'aegis', {
      type: 'private-scout-result', sessionId: 's1', requestId: 'scan-2',
      requesterUid: 'u1', sourceId: 'starlight', cycle: 4,
      targetCoordinate: '5143',
      systemFact: { coordinate: '5143', code: 'L', title: 'Active Wolf Outpost' },
    }, '2026-09-22T14:05:00.000Z')).toBeUndefined();
  });

  it('keeps the first authorized reveal stable across later sources', () => {
    const arrived = candidateDiscoveryFromArrival(undefined, {
      shipId: 'aegis', coordinate: '6798', chart: 'A', event,
    });
    const rescanned = candidateDiscoveryFromScout(arrived, 'aegis', {
      type: 'private-scout-result', sessionId: 's1', requestId: 'scan-later',
      requesterUid: 'u1', sourceId: 'endeavour', cycle: 5,
      targetCoordinate: '6798',
      systemFact: { coordinate: '6798', code: 'N', title: 'Ancient Jump Ring' },
    }, '2026-09-22T15:00:00.000Z');
    expect(rescanned?.aegis?.['6798']?.candidateDiscovery).toEqual({
      ...event, code: 'N', title: 'Ancient Jump Ring', source: 'arrival',
    });
  });
});
