import { describe, expect, it } from 'vitest';
import { buildScoutResolutionPlan } from './scoutResolutionPlan';

const nowMs = Date.parse('2026-09-27T21:40:00.000Z');
const facilitator = {
  sessionId: 'session-1', uid: 'gm-1', role: 'gm', active: true, connected: true, nowMs,
  facilitatorInstance: {
    id: 'gm-browser', sessionId: 'session-1', uid: 'gm-1', connected: true,
    lastSeenAt: nowMs - 1_000,
  },
} as const;
const scan = { sourceId: 'endeavour', attempt: 1, range: 'unlimited', targetCoordinate: '0408' };
const request = {
  type: 'scout-request', status: 'requested', resolution: 'pending',
  sessionId: 'session-1', requestId: 'scan-1', actorUid: 'scientist-1',
  entitlementId: 'endeavour', source: 'craft', ownerRoleId: 'shepherd-scientist',
  anchorShipId: 'shepherd', receivingShipId: 'aegis', cycle: 4, targetCoordinate: '0408', scan,
  createdAt: 'server-time',
} as const;
const cadence = {
  sessionId: 'session-1', entitlementId: 'endeavour', cycle: 4,
  scans: [{ requestId: 'scan-1', actorUid: 'scientist-1', scan }],
};
const session = {
  sessionId: 'session-1', phase: 'active', chartId: 'A',
  chartSelectionLocked: true, currentCycle: 4,
};

describe('scout resolution write plan', () => {
  it('resolves one chart fact from an immutable authorized request and records one private note and audit', () => {
    const plan = buildScoutResolutionPlan({
      request, cadence, session, facilitator, fleetGroupId: 'fleet-1',
      recordedAt: '2026-09-27T21:40:00.000Z',
    });
    expect(plan.result).toEqual({
      type: 'private-scout-result', sessionId: 'session-1', requestId: 'scan-1',
      requesterUid: 'scientist-1', sourceId: 'endeavour', cycle: 4,
      targetCoordinate: '0408',
      systemFact: { coordinate: '0408', code: 'O', title: 'Deep Nebula' },
    });
    expect(plan.note).toMatchObject({
      type: 'player-discovery-note', sessionId: 'session-1', requestId: 'scan-1',
      requesterUid: 'scientist-1', shipId: 'aegis', fleetGroupId: 'fleet-1',
      systemFact: plan.result.systemFact,
    });
    expect(plan.audit).toMatchObject({
      type: 'scout-resolution-audit', sessionId: 'session-1', requestId: 'scan-1',
      requesterUid: 'scientist-1', originShipId: 'shepherd',
      targetCoordinate: '0408', cycle: 4,
      result: plan.result.systemFact,
    });
    expect(plan.deepNebulaScan).toEqual({
      type: 'deep-nebula-scan', sessionId: 'session-1', requestId: 'scan-1',
      cycle: 4, shipId: 'aegis', targetCoordinate: '0408',
    });
    expect(JSON.stringify(plan)).not.toMatch(/accruedBonus|modifier|organiserChart|chartId/);
  });

  it('never counts an ordinary chart fact as a Deep Nebula scan', () => {
    const plan = buildScoutResolutionPlan({
      request: { ...request, targetCoordinate: '5143', scan: { ...scan, targetCoordinate: '5143' } },
      cadence: { ...cadence, scans: [{ requestId: 'scan-1', actorUid: 'scientist-1', scan: { ...scan, targetCoordinate: '5143' } }] },
      session, facilitator, fleetGroupId: 'fleet-1',
      recordedAt: '2026-09-27T21:40:00.000Z',
    });
    expect(plan.deepNebulaScan).toBeNull();
  });

  it.each([
    ['different cadence scan', { cadence: { ...cadence, scans: [{ ...cadence.scans[0], scan: { ...scan, targetCoordinate: '5143' } }] } }],
    ['different cadence actor', { cadence: { ...cadence, scans: [{ ...cadence.scans[0], actorUid: 'other' }] } }],
    ['forged request fact', { request: { ...request, organiserChart: { '0408': 'O' } } }],
    ['wrong source identity', { request: { ...request, anchorShipId: 'aegis' } }],
    ['missing receiving ship', { request: { ...request, receivingShipId: undefined } }],
    ['old cycle', { session: { ...session, currentCycle: 5 } }],
    ['unlocked chart', { session: { ...session, chartSelectionLocked: false } }],
    ['stale GM lease', { facilitator: { ...facilitator, facilitatorInstance: { ...facilitator.facilitatorInstance, lastSeenAt: 0 } } }],
  ])('fails closed on %s', (_label, change) => {
    expect(() => buildScoutResolutionPlan({
      request, cadence, session, facilitator, fleetGroupId: 'fleet-1',
      recordedAt: '2026-09-27T21:40:00.000Z',
      ...change,
    })).toThrow();
  });
});
