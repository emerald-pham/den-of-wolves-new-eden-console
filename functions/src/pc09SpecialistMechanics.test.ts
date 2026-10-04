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
  expect(resolvePdfFighterAceCombat({ range: 'short', target: cruiser,
    extraTarget: { instanceId: '0:wolf-fighter-wing', shipId: 'wolf-fighter-wing', damageTaken: 0, destroyed: false } }))
    .toMatchObject({ damage: 2, targetResults: [
      { instanceId: '2:wolf-cruiser', damage: 1 }, { instanceId: '0:wolf-fighter-wing', damage: 1 },
    ] });
  expect(resolvePdfFighterAceCombat({ range: 'short', target: cruiser, extraTarget: cruiser }))
    .toMatchObject({ damage: 2, fighterDestroyed: true, aceDied: false, escaped: true,
      targetResults: [{ instanceId: '2:wolf-cruiser', damage: 2 }] });
});

it('applies only actual Fighter Ace damage to the authoritative attack roster', () => {
  const applyPdfFighterAceResults = specialistFunctions.applyPdfFighterAceResults as
    (roster: readonly Record<string, unknown>[], results: readonly Record<string, unknown>[]) => readonly Record<string, unknown>[];
  const roster = [
    { instanceId: '0:wolf-fighter-wing', shipId: 'wolf-fighter-wing', target: 'shepherd', damageTaken: 0, destroyed: false },
    { instanceId: '2:wolf-cruiser', shipId: 'wolf-cruiser', target: 'quellon', damageTaken: 1, destroyed: false },
  ];
  expect(applyPdfFighterAceResults(roster, [
    { instanceId: '2:wolf-cruiser', shipId: 'wolf-cruiser', damage: 2, destroyed: true },
    { instanceId: '0:wolf-fighter-wing', shipId: 'wolf-fighter-wing', damage: 0, destroyed: false },
  ])).toEqual([
    roster[0],
    { ...roster[1], damageTaken: 3, destroyed: true },
  ]);
  expect(() => applyPdfFighterAceResults(roster, [
    { instanceId: '2:wolf-cruiser', shipId: 'wolf-cruiser', damage: 1, destroyed: true },
  ])).toThrow(/damage|capacity/i);
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

it('binds an explicit commander permission to one live source slot and the current Ace', () => {
  const createPdfFighterAcePermission = specialistFunctions.createPdfFighterAcePermission as
    (input: Record<string, unknown>) => Record<string, unknown>;
  const requirePdfFighterAcePermission = specialistFunctions.requirePdfFighterAcePermission as
    (permission: unknown, expected: Record<string, unknown>) => Record<string, unknown>;
  const permission = createPdfFighterAcePermission({
    attackId: 'attack-1', turn: 4, sourceId: 'fighter-wing-alpha', fighterIndex: 2,
    aceUid: 'ace-1', actorUid: 'commander-1', actorRoleId: 'wing-commander',
    requestId: 'permission-1', revision: 1, fighters: 4, launched: true,
  });
  expect(permission).toMatchObject({ type: 'pdf-fighter-ace-permission', attackId: 'attack-1', turn: 4,
    sourceId: 'fighter-wing-alpha', fighterIndex: 2, aceUid: 'ace-1', actorUid: 'commander-1',
    actorRoleId: 'wing-commander', requestId: 'permission-1', revision: 1 });
  expect(requirePdfFighterAcePermission(permission, {
    attackId: 'attack-1', turn: 4, sourceId: 'fighter-wing-alpha', fighterIndex: 2,
    aceUid: 'ace-1', actorUid: 'commander-1', actorRoleId: 'wing-commander',
  })).toEqual(permission);
  expect(() => requirePdfFighterAcePermission(permission, { attackId: 'attack-2' })).toThrow(/attack/i);
  expect(() => requirePdfFighterAcePermission(permission, { sourceId: 'fighter-wing-bravo' })).toThrow(/source/i);
  expect(() => requirePdfFighterAcePermission(permission, { fighterIndex: 1 })).toThrow(/slot/i);
  expect(() => createPdfFighterAcePermission({
    attackId: 'attack-1', turn: 4, sourceId: 'fighter-wing-alpha', fighterIndex: 4,
    aceUid: 'ace-1', actorUid: 'commander-1', actorRoleId: 'wing-commander',
    requestId: 'permission-2', revision: 1, fighters: 4, launched: true,
  })).toThrow(/slot/i);
  expect(() => createPdfFighterAcePermission({
    attackId: 'attack-1', turn: 4, sourceId: 'pdf-escort-fighter-wing', fighterIndex: 0,
    aceUid: 'ace-1', actorUid: 'colonel-1', actorRoleId: 'wing-commander',
    requestId: 'permission-3', revision: 1, fighters: 4, launched: true,
  })).toThrow(/current.*permission|role/i);
  expect(() => createPdfFighterAcePermission({
    attackId: 'attack-1', turn: 4, sourceId: 'fighter-wing-alpha', fighterIndex: 0,
    aceUid: 'ace-1', actorUid: 'commander-1', actorRoleId: 'wing-commander',
    requestId: 'permission-4', revision: 1, fighters: 4, launched: false,
  })).toThrow(/launched/i);
});

it('validates an immutable Fighter Ace receipt against its permission, targets, outcome, and durable source loss', () => {
  const requirePdfFighterAceActionReceipt = specialistFunctions.requirePdfFighterAceActionReceipt as
    (receipt: unknown, expected?: Record<string, unknown>) => Record<string, unknown>;
  const permission = {
    type: 'pdf-fighter-ace-permission', attackId: 'attack-1', turn: 4,
    sourceId: 'fighter-wing-alpha', fighterIndex: 2, aceUid: 'ace-1',
    actorUid: 'commander-1', actorRoleId: 'wing-commander', requestId: 'permission-1', revision: 1,
  };
  const before = { sourceId: 'fighter-wing-alpha', fighters: 4, losses: 0, revision: 6,
    durableRevision: 2, launched: true, attackId: 'attack-1', cycle: 4 };
  const receipt = {
    type: 'pdf-fighter-ace-action', attackId: 'attack-1', turn: 4, revision: 9,
    requestId: 'ace-action-1', actorUid: 'ace-1', actorRoleId: 'pdf-fighter-ace', fighterUid: 'ace-1',
    sourceId: 'fighter-wing-alpha', fighterIndex: 2, permissionActor: permission,
    permissionActorUid: 'commander-1', permissionActorRoleId: 'wing-commander',
    permissionRequestId: 'permission-1', permissionRevision: 1, range: 'short',
    submittedTargetId: 'contact-2', extraTargetId: 'contact-2', submittedTargetShift: null,
    resolvedTargetShift: null,
    rosterBefore: [
      { instanceId: '0:wolf-fighter-wing', shipId: 'wolf-fighter-wing', target: 'aegis', damageTaken: 0, destroyed: false },
      { instanceId: '2:wolf-cruiser', shipId: 'wolf-cruiser', target: 'quellon', damageTaken: 1, destroyed: false },
    ],
    targetResults: [{ instanceId: '2:wolf-cruiser', shipId: 'wolf-cruiser', damage: 2, destroyed: true }],
    sourceStateBefore: before,
    sourceStateAfter: { ...before, fighters: 3, losses: 1, revision: 7, durableRevision: 3 },
    outcome: { damage: 2, targetDestroyed: true, fighterDestroyed: true, aceDied: false, escaped: true },
    rolls: [], committedAt: '2026-10-04T12:00:00.000Z',
  };
  expect(requirePdfFighterAceActionReceipt(receipt, { attackId: 'attack-1', actorUid: 'ace-1' }))
    .toMatchObject({ fighterUid: 'ace-1', permissionActorUid: 'commander-1', outcome: { damage: 2 } });
  expect(() => requirePdfFighterAceActionReceipt({ ...receipt, targetShipId: 'wolf-cruiser' })).toThrow(/receipt/i);
  expect(() => requirePdfFighterAceActionReceipt({ ...receipt,
    sourceStateAfter: { ...receipt.sourceStateAfter, durableRevision: 2 } })).toThrow(/source|loss|revision/i);
  expect(() => requirePdfFighterAceActionReceipt({ ...receipt,
    outcome: { ...receipt.outcome, damage: 1 } })).toThrow(/damage|outcome/i);
  expect(() => requirePdfFighterAceActionReceipt({ ...receipt,
    permissionActor: { ...permission, aceUid: 'another-ace' } })).toThrow(/permission|Ace/i);
});
