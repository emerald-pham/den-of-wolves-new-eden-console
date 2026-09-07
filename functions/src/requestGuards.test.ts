import { describe, expect, it } from 'vitest';
import {
  requireDiceRequest,
  requireElevationRequest,
  requireGmClaimRequest,
  requireGmControlsLockRequest,
  requireDebriefModeRequest,
  requireGmInstanceActionRequest,
  requireGmInstanceRequest,
  requireDioneAvailabilityRequest,
  requireShipAvailabilityRequest,
  requireShipConfettiRequest,
  requireShipDamageRequest,
  requireWolfAssignmentRequest,
  requireManualWolfAssignmentRequest,
  requireActiveRoleSettingRequest,
  requireRoleConfigurationRequest,
  requireRolePresetRequest,
  requirePressDispatchDismissalRequest,
  requirePressDispatchRequest,
  requireSessionRequest,
  requireShipCounterBatchRequest,
  requireShipCounterRequest,
  requireUnrestDismissalRequest,
  requireSessionSeatRequest,
  requireUid,
} from './requestGuards';

function expectHttpsError(action: () => unknown, code: string): void {
  expect(action).toThrow(
    expect.objectContaining({ code }),
  );
}

describe('callable request guards', () => {
  it('requires an authenticated uid', () => {
    expectHttpsError(() => requireUid(undefined), 'unauthenticated');
    expect(requireUid({ uid: 'u1' })).toBe('u1');
  });

  it('requires both session and seat ids', () => {
    expectHttpsError(
      () => requireSessionSeatRequest({ sessionId: 's1', seatId: '' }),
      'invalid-argument',
    );
    expect(requireSessionSeatRequest({ sessionId: 's1', seatId: 'seat1' })).toEqual({
      sessionId: 's1',
      seatId: 'seat1',
    });
  });

  it('requires a session id when resuming', () => {
    expectHttpsError(() => requireSessionRequest({ sessionId: '' }), 'invalid-argument');
    expect(requireSessionRequest({ sessionId: 's1' })).toEqual({ sessionId: 's1' });
  });

  it('rejects path separators in every Firestore document id', () => {
    const malformedRequests = [
      () => requireSessionRequest({ sessionId: 's1/players' }),
      () => requireSessionSeatRequest({ sessionId: 's1', seatId: 'seat/one' }),
      () => requireElevationRequest({ sessionId: 's1', targetUid: '../target' }),
      () => requireDiceRequest({ sessionId: 's1/events', sides: 6, count: 1 }),
    ];

    for (const request of malformedRequests) {
      expectHttpsError(request, 'invalid-argument');
    }
  });

  it('requires both session and target ids for elevation', () => {
    expectHttpsError(
      () => requireElevationRequest({ sessionId: 's1', targetUid: '' }),
      'invalid-argument',
    );
  });

  it('bounds dice sides and count', () => {
    expectHttpsError(
      () => requireDiceRequest({ sessionId: 's1', sides: 1, count: 1 }),
      'invalid-argument',
    );
    expectHttpsError(
      () => requireDiceRequest({ sessionId: 's1', sides: 6, count: 51 }),
      'invalid-argument',
    );
    expect(requireDiceRequest({ sessionId: 's1', sides: 6, count: 2 })).toEqual({
      sessionId: 's1',
      sides: 6,
      count: 2,
    });
  });

  it('requires a named GM instance with bounded device information', () => {
    expectHttpsError(
      () => requireGmClaimRequest({
        sessionId: 's1', instanceId: 'i1', name: '   ', deviceLabel: 'Chrome',
      }),
      'invalid-argument',
    );
    expect(requireGmClaimRequest({
      sessionId: 's1', instanceId: 'i1', name: ' Bridge laptop ',
      deviceLabel: ' macOS / Chrome ',
    })).toEqual({
      sessionId: 's1', instanceId: 'i1', name: 'Bridge laptop',
      deviceLabel: 'macOS / Chrome',
    });
  });

  it('requires caller and target instance ids for a kick', () => {
    expectHttpsError(
      () => requireGmInstanceActionRequest({
        sessionId: 's1', instanceId: 'i1', targetInstanceId: '',
      }),
      'invalid-argument',
    );
    expect(requireGmInstanceActionRequest({
      sessionId: 's1', instanceId: 'i1', targetInstanceId: 'i2',
    })).toEqual({ sessionId: 's1', instanceId: 'i1', targetInstanceId: 'i2' });
  });

  it('requires a session and named GM instance for a DRADIS trigger', () => {
    expectHttpsError(
      () => requireGmInstanceRequest({ sessionId: 's1', instanceId: '' }),
      'invalid-argument',
    );
    expect(requireGmInstanceRequest({ sessionId: 's1', instanceId: 'i1' }))
      .toEqual({ sessionId: 's1', instanceId: 'i1' });
  });

  it('requires a boolean ship availability setting from a named GM instance', () => {
    expectHttpsError(
      () => requireShipAvailabilityRequest({
        sessionId: 's1', instanceId: 'i1', capybaraEnabled: 'yes',
      }),
      'invalid-argument',
    );
    expect(requireShipAvailabilityRequest({
      sessionId: 's1', instanceId: 'i1', capybaraEnabled: false,
    })).toEqual({ sessionId: 's1', instanceId: 'i1', capybaraEnabled: false });
  });

  it('requires a boolean Dione availability setting from a named GM instance', () => {
    expectHttpsError(
      () => requireDioneAvailabilityRequest({
        sessionId: 's1', instanceId: 'i1', dioneEnabled: 'yes',
      }),
      'invalid-argument',
    );
    expect(requireDioneAvailabilityRequest({
      sessionId: 's1', instanceId: 'i1', dioneEnabled: false,
    })).toEqual({ sessionId: 's1', instanceId: 'i1', dioneEnabled: false });
  });

  it('requires a boolean GM and Setup lock setting from a named GM instance', () => {
    expectHttpsError(
      () => requireGmControlsLockRequest({
        sessionId: 's1', instanceId: 'i1', locked: 'yes',
      }),
      'invalid-argument',
    );
    expect(requireGmControlsLockRequest({
      sessionId: 's1', instanceId: 'i1', locked: true,
    })).toEqual({ sessionId: 's1', instanceId: 'i1', locked: true });
  });

  it('requires a boolean finale state from a named GM instance', () => {
    expectHttpsError(
      () => requireDebriefModeRequest({ sessionId: 's1', instanceId: 'i1', active: 'yes' }),
      'invalid-argument',
    );
    expect(requireDebriefModeRequest({ sessionId: 's1', instanceId: 'i1', active: true }))
      .toEqual({ sessionId: 's1', instanceId: 'i1', active: true });
  });

  it('requires session and ship ids for a confetti activation', () => {
    expectHttpsError(
      () => requireShipConfettiRequest({ sessionId: 's1', shipId: '', roleId: 'admiral' }),
      'invalid-argument',
    );
    expect(requireShipConfettiRequest({ sessionId: 's1', shipId: 'aegis', roleId: 'admiral' }))
      .toEqual({ sessionId: 's1', shipId: 'aegis', roleId: 'admiral' });
  });

  it('requires a named GM instance for a damage draw', () => {
    expectHttpsError(
      () => requireShipDamageRequest({ sessionId: 's1', shipId: 'aegis', instanceId: '' }),
      'invalid-argument',
    );
    expect(requireShipDamageRequest({
      sessionId: 's1', shipId: 'aegis', instanceId: 'bridge',
    })).toEqual({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge' });
  });

  it('requires a known resource and a one-step counter change', () => {
    expectHttpsError(() => requireShipCounterRequest({
      sessionId: 's1', shipId: 'aegis', resourceId: 'morale', delta: 1,
    }), 'invalid-argument');
    expectHttpsError(() => requireShipCounterRequest({
      sessionId: 's1', shipId: 'aegis', resourceId: 'fuel', delta: 2,
    }), 'invalid-argument');
    expect(requireShipCounterRequest({
      sessionId: 's1', shipId: 'aegis', resourceId: 'fuel', delta: -1,
    })).toEqual({ sessionId: 's1', shipId: 'aegis', resourceId: 'fuel', delta: -1 });
  });

  it('requires a bounded, ordered GM counter batch', () => {
    expectHttpsError(() => requireShipCounterBatchRequest({
      sessionId: 's1', instanceId: 'gm1', shipId: 'aegis', counter: 'resource',
      resourceId: 'fuel', steps: [1, 0],
    }), 'invalid-argument');
    expectHttpsError(() => requireShipCounterBatchRequest({
      sessionId: 's1', instanceId: 'gm1', shipId: 'aegis', counter: 'unrest',
      steps: Array.from({ length: 13 }, () => 1),
    }), 'invalid-argument');
    expect(requireShipCounterBatchRequest({
      sessionId: 's1', instanceId: 'gm1', shipId: 'aegis', counter: 'resource',
      resourceId: 'fuel', steps: [1, -1, 1],
    })).toEqual({
      sessionId: 's1', instanceId: 'gm1', shipId: 'aegis', counter: 'resource',
      resourceId: 'fuel', steps: [1, -1, 1],
    });
  });

  it('requires a named GM instance to dismiss a ship unrest alert', () => {
    expect(requireUnrestDismissalRequest({
      sessionId: 's1', shipId: 'aegis', instanceId: 'gm-1',
    })).toEqual({ sessionId: 's1', shipId: 'aegis', instanceId: 'gm-1' });
  });

  it('only permits one or two wolves from a named GM instance', () => {
    expectHttpsError(() => requireWolfAssignmentRequest({
      sessionId: 's1', instanceId: 'i1', count: 3,
    }), 'invalid-argument');
    expect(requireWolfAssignmentRequest({
      sessionId: 's1', instanceId: 'i1', count: 2,
    })).toEqual({ sessionId: 's1', instanceId: 'i1', count: 2 });
  });

  it('requires one or two distinct, known roles for a manual wolf assignment', () => {
    expectHttpsError(() => requireManualWolfAssignmentRequest({
      sessionId: 's1', instanceId: 'i1', roleIds: ['press-officer', 'press-officer'],
    }), 'invalid-argument');
    expect(requireManualWolfAssignmentRequest({
      sessionId: 's1', instanceId: 'i1', roleIds: ['press-officer'],
    })).toEqual({ sessionId: 's1', instanceId: 'i1', roleIds: ['press-officer'] });
  });

  it('validates complete role configurations, individual availability, and player-count presets', () => {
    expectHttpsError(() => requireRoleConfigurationRequest({
      sessionId: 's1', instanceId: 'i1', activeRoleIds: ['admiral', 'admiral'],
    }), 'invalid-argument');
    expectHttpsError(() => requireRoleConfigurationRequest({
      sessionId: 's1', instanceId: 'i1', activeRoleIds: ['unknown-role'],
    }), 'invalid-argument');
    expect(requireRoleConfigurationRequest({
      sessionId: 's1', instanceId: 'i1', activeRoleIds: ['admiral'],
    })).toEqual({ sessionId: 's1', instanceId: 'i1', activeRoleIds: ['admiral'] });
    expectHttpsError(() => requireActiveRoleSettingRequest({
      sessionId: 's1', instanceId: 'i1', roleId: 'unknown', enabled: true,
    }), 'invalid-argument');
    expect(requireActiveRoleSettingRequest({
      sessionId: 's1', instanceId: 'i1', roleId: 'press-officer', enabled: false,
    })).toEqual({ sessionId: 's1', instanceId: 'i1', roleId: 'press-officer', enabled: false });
    expectHttpsError(() => requireRolePresetRequest({
      sessionId: 's1', instanceId: 'i1', playerCount: 22,
    }), 'invalid-argument');
    expect(requireRolePresetRequest({
      sessionId: 's1', instanceId: 'i1', playerCount: 14,
    })).toEqual({ sessionId: 's1', instanceId: 'i1', playerCount: 14 });
  });

  it('requires a bounded press dispatch and a non-negative revision', () => {
    expect(requirePressDispatchRequest({
      sessionId: 's1', text: '  Convoy arrival confirmed  ', expectedRevision: 3,
    })).toEqual({ sessionId: 's1', text: 'Convoy arrival confirmed', expectedRevision: 3 });
    expectHttpsError(() => requirePressDispatchRequest({
      sessionId: 's1', text: '', expectedRevision: 0,
    }), 'invalid-argument');
    expectHttpsError(() => requirePressDispatchRequest({
      sessionId: 's1', text: 'x'.repeat(241), expectedRevision: 0,
    }), 'invalid-argument');
    expectHttpsError(() => requirePressDispatchRequest({
      sessionId: 's1', text: 'News', expectedRevision: -1,
    }), 'invalid-argument');
  });

  it('requires dispatch identity and revision for a dismissal', () => {
    expect(requirePressDispatchDismissalRequest({
      sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 3,
    })).toEqual({ sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 3 });
    expectHttpsError(() => requirePressDispatchDismissalRequest({
      sessionId: 's1', dispatchId: '', expectedRevision: 3,
    }), 'invalid-argument');
    expectHttpsError(() => requirePressDispatchDismissalRequest({
      sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: -1,
    }), 'invalid-argument');
  });

});
