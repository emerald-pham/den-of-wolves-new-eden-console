import { describe, expect, it } from 'vitest';
import { resolveScoutChartResult } from './scoutChartResult';

const nowMs = Date.parse('2026-09-21T20:00:00.000Z');
const request = {
  type: 'scout-resolution-request',
  sessionId: 'session-1',
  requestId: 'scan-329',
  requesterUid: 'requester-1',
  sourceId: 'starlight',
  cycle: 4,
  targetCoordinate: '5143',
} as const;
const facilitator = {
  sessionId: 'session-1', uid: 'gm-1', role: 'gm', active: true, connected: true, nowMs,
  facilitatorInstance: {
    id: 'browser-1', sessionId: 'session-1', uid: 'gm-1', connected: true,
    lastSeenAt: nowMs - 1_000,
  },
} as const;

const chartAuthority = {
  sessionId: 'session-1', phase: 'active', chartId: 'A', chartSelectionLocked: true,
} as const;

describe('facilitator scout chart resolution', () => {
  it.each([
    ['A', 'L', 'Active Wolf Outpost'],
    ['B', 'E', 'I.C.S.S. Athena Survivors'],
    ['C', 'L', 'Active Wolf Outpost'],
  ] as const)('resolves only the requested coordinate from chart %s', (chartId, code, title) => {
    const result = resolveScoutChartResult(
      request,
      { ...chartAuthority, chartId },
      facilitator,
    );
    expect(result).toEqual({
      type: 'private-scout-result', sessionId: 'session-1', requestId: 'scan-329',
      requesterUid: 'requester-1', sourceId: 'starlight', cycle: 4,
      targetCoordinate: '5143', systemFact: { coordinate: '5143', code, title },
    });
    expect(result).not.toHaveProperty('chartId');
    expect(result).not.toHaveProperty('organiserSites');
    expect(result.systemFact).not.toHaveProperty('summary');
  });

  it.each([
    ['non-GM actor', { ...facilitator, role: 'player' }],
    ['foreign session viewer', { ...facilitator, sessionId: 'session-2' }],
    ['foreign session instance', {
      ...facilitator,
      facilitatorInstance: { ...facilitator.facilitatorInstance, sessionId: 'session-2' },
    }],
    ['another GM instance', {
      ...facilitator,
      facilitatorInstance: { ...facilitator.facilitatorInstance, uid: 'gm-2' },
    }],
    ['stale lease', {
      ...facilitator,
      facilitatorInstance: { ...facilitator.facilitatorInstance, lastSeenAt: 0 },
    }],
    ['missing lease', {
      ...facilitator,
      facilitatorInstance: { ...facilitator.facilitatorInstance, lastSeenAt: undefined },
    }],
  ] as const)('rejects %s before revealing a chart fact', (_label, actor) => {
    expect(() => resolveScoutChartResult(request, chartAuthority, actor)).toThrow(/facilitator/i);
  });

  it.each([
    ['extra request field', { ...request, originCoordinate: '0000' }],
    ['unknown source', { ...request, sourceId: 'pallas' }],
    ['unknown coordinate', { ...request, targetCoordinate: '0101' }],
    ['wrong session type', { ...request, sessionId: 7 }],
    ['invalid cycle', { ...request, cycle: 0 }],
  ])('rejects a malformed request with %s', (_label, malformed) => {
    expect(() => resolveScoutChartResult(malformed, chartAuthority, facilitator)).toThrow(/malformed/i);
  });

  it('rejects the unlabelled start coordinate and never invents a booklet fact', () => {
    expect(() => resolveScoutChartResult(
      { ...request, targetCoordinate: '0000' }, chartAuthority, facilitator,
    ))
      .toThrow(/no booklet entry/i);
  });

  it.each([
    ['client chart override', { ...request, chartId: 'B' }, chartAuthority],
    ['foreign session authority', request, { ...chartAuthority, sessionId: 'session-2' }],
    ['unlocked chart authority', request, { ...chartAuthority, chartSelectionLocked: false }],
    ['inactive session authority', request, { ...chartAuthority, phase: 'casting' }],
    ['unknown authoritative chart', request, { ...chartAuthority, chartId: 'D' }],
    ['extra authority field', request, { ...chartAuthority, alternateChartId: 'B' }],
  ])('rejects %s without exposing another organiser chart', (_label, candidate, authority) => {
    expect(() => resolveScoutChartResult(candidate, authority, facilitator)).toThrow(/malformed/i);
  });
});
