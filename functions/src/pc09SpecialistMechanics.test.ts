import { expect, it } from 'vitest';
import * as specialistFunctions from './index';

it('keeps Detector truth server-defined and applies four-in-five accuracy', () => {
  const detectorReportedWolf = specialistFunctions.detectorReportedWolf as
    (actualWolf: boolean, accuracyRoll: number) => boolean;
  expect(detectorReportedWolf(true, 4)).toBe(true);
  expect(detectorReportedWolf(true, 5)).toBe(false);
  expect(detectorReportedWolf(false, 5)).toBe(true);
  expect(() => detectorReportedWolf(true, 0)).toThrow();
});

it('compares attendance to the private posse calculation without returning suspicion', () => {
  const resolveArrestOutcome = specialistFunctions.resolveArrestOutcome as
    (requiredPlayers: number, presentPlayers: number) => 'arrested' | 'not-arrested';
  expect(resolveArrestOutcome(7, 7)).toBe('arrested');
  expect(resolveArrestOutcome(7, 6)).toBe('not-arrested');
  expect(() => resolveArrestOutcome(-1, 0)).toThrow();
});

it('resolves Fighter Ace dice and source-specific fighter and pilot outcomes', () => {
  const resolvePdfFighterAceCombat = specialistFunctions.resolvePdfFighterAceCombat as
    (input: Record<string, unknown>) => Record<string, unknown>;
  const cruiser = { instanceId: '2:wolf-cruiser', shipId: 'wolf-cruiser', damageTaken: 1, destroyed: false };
  expect(resolvePdfFighterAceCombat({ range: 'long', target: cruiser, rolls: [3, 2, 4] })).toMatchObject({
    damage: 2, targetDestroyed: true, fighterDestroyed: false, aceDied: false,
  });
  expect(resolvePdfFighterAceCombat({ range: 'long', target: cruiser, rolls: [2, 2, 2] })).toMatchObject({
    damage: 0, targetDestroyed: false, fighterDestroyed: true, aceDied: true,
  });
  expect(resolvePdfFighterAceCombat({ range: 'short', target: cruiser, extraTarget: null })).toMatchObject({
    damage: 1, fighterDestroyed: false, aceDied: false, escaped: false,
  });
  expect(resolvePdfFighterAceCombat({ range: 'short', target: cruiser, extraTarget: cruiser })).toMatchObject({
    damage: 2, fighterDestroyed: true, aceDied: false, escaped: true,
  });
});

it('binds a hosted maintenance die to one current GM-attested Team visit outside Dione', () => {
  const createHostedMaintenanceGrant = specialistFunctions.createHostedMaintenanceGrant as
    (input: Record<string, unknown>) => Record<string, unknown>;
  const grant = createHostedMaintenanceGrant({
    sessionId: 'session-1', cycle: 3, hostUid: 'host-1', hostRoleId: 'vip-host',
    hostShipId: 'dione', destinationShipId: 'aegis', destinationActive: true,
    attestedByUid: 'gm-1', inTeamPhase: true,
  });
  expect(grant).toMatchObject({ type: 'vip-host-maintenance-grant', sessionId: 'session-1',
    hostUid: 'host-1', shipId: 'aegis', cycle: 3, status: 'available', revision: 1,
    attestedByUid: 'gm-1' });
  expect(() => createHostedMaintenanceGrant({
    sessionId: 'session-1', cycle: 3, hostUid: 'host-1', hostRoleId: 'vip-host',
    hostShipId: 'dione', destinationShipId: 'dione', destinationActive: true,
    attestedByUid: 'gm-1', inTeamPhase: true,
  })).toThrow(/other than Dione/i);
  expect(() => createHostedMaintenanceGrant({
    sessionId: 'session-1', cycle: 3, hostUid: 'host-1', hostRoleId: 'vip-host',
    hostShipId: 'dione', destinationShipId: 'aegis', destinationActive: true,
    attestedByUid: 'gm-1', inTeamPhase: false,
  })).toThrow(/Team Phase/i);
});

it('consumes a hosted maintenance reroll exactly once in its bound ship and cycle', () => {
  const consumeHostedMaintenanceGrant = specialistFunctions.consumeHostedMaintenanceGrant as
    (grant: unknown, input: Record<string, unknown>) => Record<string, unknown>;
  const grant = {
    type: 'vip-host-maintenance-grant', sessionId: 'session-1', hostUid: 'host-1',
    shipId: 'aegis', cycle: 3, status: 'available', revision: 1, attestedByUid: 'gm-1',
  };
  expect(consumeHostedMaintenanceGrant(grant, { sessionId: 'session-1', shipId: 'aegis', cycle: 3 }))
    .toMatchObject({ status: 'consumed', revision: 2, cycle: 3, shipId: 'aegis' });
  expect(() => consumeHostedMaintenanceGrant(grant, { sessionId: 'session-1', shipId: 'dione', cycle: 3 }))
    .toThrow(/bound ship/i);
  expect(() => consumeHostedMaintenanceGrant({ ...grant, status: 'consumed' },
    { sessionId: 'session-1', shipId: 'aegis', cycle: 3 })).toThrow(/already been consumed/i);
});
