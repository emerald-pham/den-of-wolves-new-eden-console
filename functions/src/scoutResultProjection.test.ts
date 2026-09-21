import { describe, expect, it } from 'vitest';
import { parsePrivateScoutResult, projectPrivateScoutResult } from './scoutResultProjection';

const result = {
  type: 'private-scout-result',
  sessionId: 'session-1',
  requestId: 'scan-328',
  requesterUid: 'requester-1',
  sourceId: 'starlight',
  cycle: 4,
  targetCoordinate: '5143',
  systemFact: {
    coordinate: '5143',
    code: 'L',
    title: 'Active Wolf Outpost',
  },
} as const;

const nowMs = Date.parse('2026-09-21T20:00:00.000Z');
const playerViewer = {
  sessionId: 'session-1', uid: 'requester-1', role: 'player',
  active: true, connected: true, nowMs,
} as const;

const gmViewer = {
  sessionId: 'session-1', uid: 'gm-1', role: 'gm', active: true, connected: true, nowMs,
  facilitatorInstance: {
    id: 'browser-1', sessionId: 'session-1', uid: 'gm-1', connected: true,
    lastSeenAt: nowMs - 1_000,
  },
} as const;

describe('private scout-result projection', () => {
  it('delivers exactly one requested system fact to the active requester', () => {
    const projected = projectPrivateScoutResult(result, playerViewer);
    expect(projected).toEqual(result);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected?.systemFact)).toBe(true);
  });

  it('delivers the same bounded fact to a live matching facilitator instance', () => {
    expect(projectPrivateScoutResult(result, gmViewer)).toEqual(result);
  });

  it.each([
    ['another player', { ...playerViewer, uid: 'player-2' }],
    ['inactive requester', { ...playerViewer, active: false }],
    ['disconnected requester', { ...playerViewer, connected: false }],
    ['player from another session', { ...playerViewer, sessionId: 'session-2' }],
    ['GM without an instance', { ...gmViewer, facilitatorInstance: undefined }],
    ['another GM instance', {
      ...gmViewer, facilitatorInstance: { ...gmViewer.facilitatorInstance, uid: 'gm-2' },
    }],
    ['foreign-session GM instance', {
      ...gmViewer,
      facilitatorInstance: { ...gmViewer.facilitatorInstance, sessionId: 'session-2' },
    }],
    ['stale GM lease', {
      ...gmViewer, facilitatorInstance: { ...gmViewer.facilitatorInstance, lastSeenAt: 0 },
    }],
    ['missing GM lease', {
      ...gmViewer,
      facilitatorInstance: { ...gmViewer.facilitatorInstance, lastSeenAt: undefined },
    }],
    ['malformed GM lease', {
      ...gmViewer,
      facilitatorInstance: { ...gmViewer.facilitatorInstance, lastSeenAt: 'not-a-time' },
    }],
    ['disconnected GM instance', {
      ...gmViewer, facilitatorInstance: { ...gmViewer.facilitatorInstance, connected: false },
    }],
  ] as const)('returns no result to %s', (_label, viewer) => {
    expect(projectPrivateScoutResult(result, viewer)).toBeNull();
  });

  it.each([
    ['full chart sibling', { ...result, organiserChart: { '5143': result.systemFact } }],
    ['extra fact field', { ...result, systemFact: { ...result.systemFact, summary: 'secret' } }],
    ['mismatched coordinate', {
      ...result, systemFact: { ...result.systemFact, coordinate: '1413' },
    }],
    ['unprinted target', {
      ...result, targetCoordinate: '0101',
      systemFact: { ...result.systemFact, coordinate: '0101' },
    }],
    ['unknown source', { ...result, sourceId: 'pallas' }],
    ['invalid code', { ...result, systemFact: { ...result.systemFact, code: 'Q' } }],
    ['blank title', { ...result, systemFact: { ...result.systemFact, title: '' } }],
  ])('fails closed instead of projecting a malformed result with %s', (_label, malformed) => {
    expect(parsePrivateScoutResult(malformed)).toBeNull();
    expect(projectPrivateScoutResult(malformed, playerViewer)).toBeNull();
  });
});
