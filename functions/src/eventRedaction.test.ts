import { describe, expect, it } from 'vitest';
import { EventVisibility } from './eventEnvelope';
import { buildPrivacySafeEventRecord, memberEventFieldsFor } from './eventRedaction';

describe('buildPrivacySafeEventRecord', () => {
  it('publishes only the Highwall mining outcome', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'highwall-mining',
      payload: {
        shuttleId: 'highwall', resource: 'ore', rolls: [2, 3, 5], amount: 10,
        operation: 2, fingerprint: 'secret', expectedRevision: 1,
      },
      createdAt: 'server-time',
    })).toEqual({
      type: 'highwall-mining', shuttleId: 'highwall', resource: 'ore',
      rolls: [2, 3, 5], amount: 10, operation: 2, createdAt: 'server-time',
    });
  });

  it('publishes only the service-shuttle result coordinates', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'service-shuttle-recharge',
      payload: {
        shuttleId: 'condor', hostShipId: 'quellon', consoleId: 'hydroponics',
        immediate: true, message: 'Hydroponics: spent 1 water, generated 3 food.',
        expectedMaintenanceRevision: 7, fingerprint: 'secret',
      },
      createdAt: 'server-time',
    })).toEqual({
      type: 'service-shuttle-recharge', shuttleId: 'condor', hostShipId: 'quellon',
      consoleId: 'hydroponics', immediate: true,
      message: 'Hydroponics: spent 1 water, generated 3 food.', createdAt: 'server-time',
    });
  });

  it('allow-lists the public survivor evacuation result without command internals', () => {
    const event = buildPrivacySafeEventRecord({
      type: 'shuttle-survivor-evacuation',
      envelope: { sessionId: 's1', requestId: 'evac-1', visibility: 'member', revision: 2 },
      payload: {
        shuttleId: 'hummingbird', sourceShipId: 'quellon', destinationShipId: 'capybara',
        amount: 2_000, sourcePopulation: 28_000, destinationPopulation: 15_000,
        movedThisCycle: 2_000, expectedEvacuationRevision: 1, fingerprint: 'secret',
      },
      createdAt: 'now',
    });
    expect(event).toMatchObject({
      type: 'shuttle-survivor-evacuation', sessionId: 's1', requestId: 'evac-1',
      shuttleId: 'hummingbird', amount: 2_000, movedThisCycle: 2_000,
    });
    expect(event).not.toHaveProperty('expectedEvacuationRevision');
    expect(event).not.toHaveProperty('fingerprint');
  });

  it('publishes a shuttle arrival without the holder identity or transit route', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'shuttle-arrival',
      envelope: {
        sessionId: 's1', actorUid: 'holder-secret', actorRoleId: 'wing-commander',
        requestId: 'shuttle-arrival-trip-1', turn: 2, phase: 'active', revision: 2,
        serverTime: '2026-09-22T12:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        shuttleId: 'starlight', holderUid: 'holder-secret', fleetGroupId: 'fleet-1',
        originShipId: 'aegis', destinationShipId: 'icebreaker', route: ['aegis', 'icebreaker'],
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', requestId: 'shuttle-arrival-trip-1', turn: 2, phase: 'active',
      revision: 2, serverTime: '2026-09-22T12:00:00.000Z',
      visibility: EventVisibility.Member, type: 'shuttle-arrival',
      createdAt: 'server-time', shuttleId: 'starlight',
    });
  });

  it('publishes ordinary airspace closure parking without exposing shuttle routes or holders', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'airspace-closure-parking',
      envelope: {
        sessionId: 's1', turn: 2, phase: 'active', requestId: 'airspace-close-2-abcd',
        revision: 1, serverTime: '2026-09-22T12:15:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        parkedShuttleCount: 1, originShipId: 'aegis', destinationShipId: 'dione',
        holderUid: 'private', transitRequestId: 'private',
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 2, phase: 'active', requestId: 'airspace-close-2-abcd',
      revision: 1, serverTime: '2026-09-22T12:15:00.000Z', visibility: EventVisibility.Member,
      type: 'airspace-closure-parking', createdAt: 'server-time', parkedShuttleCount: 1,
    });
    expect(memberEventFieldsFor('airspace-closure-parking')).not.toContain('transitRequestId');
    expect(memberEventFieldsFor('airspace-closure-parking')).toEqual(['parkedShuttleCount']);
  });

  it('publishes a retarget marker without disclosing its private route', () => {
    const event = buildPrivacySafeEventRecord({
      type: 'shuttle-retarget',
      envelope: {
        sessionId: 's1', actorUid: 'holder-secret', actorRoleId: 'wing-commander',
        requestId: 'retarget-1', turn: 2, phase: 'active', revision: 2,
        serverTime: '2026-09-22T12:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        shuttleId: 'starlight', originShipId: 'aegis', destinationShipId: 'dione',
        fleetGroupId: 'fleet-1', holderUid: 'holder-secret', fingerprint: 'secret',
      },
      createdAt: 'server-time',
    });
    expect(event).toMatchObject({
      sessionId: 's1', requestId: 'retarget-1', type: 'shuttle-retarget', shuttleId: 'starlight',
    });
    expect(event).not.toHaveProperty('actorUid');
    expect(event).not.toHaveProperty('originShipId');
    expect(event).not.toHaveProperty('destinationShipId');
    expect(event).not.toHaveProperty('fleetGroupId');
    expect(event).not.toHaveProperty('holderUid');
  });

  it('allow-lists the member-safe Philia repair outcome', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'philia-repair',
      envelope: {
        sessionId: 's1', actorUid: 'engineer', actorRoleId: 'dione-engineer',
        turn: 3, phase: 'active', requestId: 'repair-1', revision: 2,
        serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
        commandFingerprint: { materials: 8 }, privateInput: 'omit',
      },
      payload: {
        shuttleId: 'philia', hostShipId: 'dione', systemIds: ['reactor', 'storage'],
        materialsSpent: 8, materialsRemaining: 4, expectedRevision: 1,
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 3, phase: 'active', type: 'philia-repair', requestId: 'repair-1',
      revision: 2, serverTime: '2026-09-22T15:00:00.000Z',
      visibility: EventVisibility.Member, createdAt: 'server-time',
      shuttleId: 'philia', hostShipId: 'dione', systemIds: ['reactor', 'storage'],
      materialsSpent: 8,
    });
    expect(memberEventFieldsFor('philia-repair')).toEqual([
      'shuttleId', 'hostShipId', 'systemIds', 'materialsSpent',
    ]);
  });

  it('allow-lists the member-safe Macaw repair outcome without authority details', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'macaw-repair',
      envelope: {
        sessionId: 's1', actorUid: 'captain', actorRoleId: 'capybara-captain',
        turn: 3, phase: 'active', requestId: 'macaw-repair-1', revision: 1,
        serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        shuttleId: 'macaw', hostShipId: 'aegis', systemIds: ['reactor'],
        scrapSpent: 1, scrapRemaining: 2, actorUid: 'private',
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 3, phase: 'active', type: 'macaw-repair', requestId: 'macaw-repair-1',
      revision: 1, serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      createdAt: 'server-time', shuttleId: 'macaw', hostShipId: 'aegis', systemIds: ['reactor'], scrapSpent: 1,
    });
    expect(memberEventFieldsFor('macaw-repair')).toEqual([
      'shuttleId', 'hostShipId', 'systemIds', 'scrapSpent',
    ]);
  });

  it('allow-lists the Boa recycling result without actor or receipt details', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'boa-recycling',
      envelope: {
        sessionId: 's1', actorUid: 'recycler', actorRoleId: 'capybara-recycler',
        turn: 3, phase: 'active', requestId: 'boa-recycling-1', revision: 1,
        serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        shuttleId: 'boa', hostShipId: 'aegis', recipeId: 'food', resourceId: 'food',
        resourceCost: 6, scrapAwarded: 1, exchangesThisCycle: 1,
        scrapRemaining: 1, fingerprint: 'private', holderUid: 'private',
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 3, phase: 'active', type: 'boa-recycling',
      requestId: 'boa-recycling-1', revision: 1,
      serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      createdAt: 'server-time', shuttleId: 'boa', hostShipId: 'aegis', recipeId: 'food',
      resourceId: 'food', resourceCost: 6, scrapAwarded: 1, exchangesThisCycle: 1,
    });
    expect(memberEventFieldsFor('boa-recycling')).toEqual([
      'shuttleId', 'hostShipId', 'recipeId', 'resourceId', 'resourceCost',
      'scrapAwarded', 'exchangesThisCycle',
    ]);
  });

  it('allow-lists the member-safe Ally repair outcome without Union authority details', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'ally-repair',
      envelope: {
        sessionId: 's1', actorUid: 'holder', actorRoleId: 'joint-engineering-shepherd-icebreaker',
        turn: 3, phase: 'active', requestId: 'ally-repair-1', revision: 1,
        serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        shuttleId: 'ally', hostShipId: 'shepherd', systemIds: ['reactor', 'storage'],
        materialsSpent: 8, materialsRemaining: 4, holderUid: 'private', fleetGroupId: 'private',
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 3, phase: 'active', type: 'ally-repair', requestId: 'ally-repair-1',
      revision: 1, serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      createdAt: 'server-time', shuttleId: 'ally', hostShipId: 'shepherd',
      systemIds: ['reactor', 'storage'], materialsSpent: 8,
    });
    expect(memberEventFieldsFor('ally-repair')).toEqual([
      'shuttleId', 'hostShipId', 'systemIds', 'materialsSpent',
    ]);
  });

  it('allow-lists Gorgoneion repair details without actor, role, or private repair authority', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'gorgoneion-repair-drones',
      envelope: {
        sessionId: 's1', actorUid: 'captain-secret', actorRoleId: 'gorgoneion-captain',
        turn: 3, phase: 'active', requestId: 'gorg-repair-1', revision: 1,
        serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        smallShipId: 'gorgoneion', hostShipId: 'aegis', systemId: 'reactor', materialsSpent: 3,
        materialsRemaining: 2, expectedRevision: 0, actorUid: 'captain-secret',
        actorRoleId: 'gorgoneion-captain', hostHolderUid: 'captain-secret', repairLedger: { cycle: 3 },
        fingerprint: { actorUid: 'captain-secret' },
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 3, phase: 'active', type: 'gorgoneion-repair-drones',
      requestId: 'gorg-repair-1', revision: 1,
      serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      createdAt: 'server-time', smallShipId: 'gorgoneion', hostShipId: 'aegis',
      systemId: 'reactor', materialsSpent: 3,
    });
    expect(memberEventFieldsFor('gorgoneion-repair-drones')).toEqual([
      'smallShipId', 'hostShipId', 'systemId', 'materialsSpent',
    ]);
  });

  it('allow-lists the Warrior repair outcome without actor, role, or private repair authority', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'warrior-repair-drones',
      envelope: {
        sessionId: 's1', actorUid: 'captain-secret', actorRoleId: 'warrior-captain',
        turn: 3, phase: 'active', requestId: 'warrior-repair-1', revision: 1,
        serverTime: '2026-09-24T15:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        smallShipId: 'warrior', hostShipId: 'icebreaker',
        systemIds: ['storage', 'reactor'], materialsSpent: 6,
        materialsRemaining: 3, expectedRevision: 0, actorUid: 'captain-secret',
        actorRoleId: 'warrior-captain', hostHolderUid: 'captain-secret',
        repairLedger: { cycle: 3 }, fingerprint: { actorUid: 'captain-secret' },
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 3, phase: 'active', type: 'warrior-repair-drones',
      requestId: 'warrior-repair-1', revision: 1,
      serverTime: '2026-09-24T15:00:00.000Z', visibility: EventVisibility.Member,
      createdAt: 'server-time', smallShipId: 'warrior', hostShipId: 'icebreaker',
      systemIds: ['storage', 'reactor'], materialsSpent: 6,
    });
    expect(memberEventFieldsFor('warrior-repair-drones')).toEqual([
      'smallShipId', 'hostShipId', 'systemIds', 'materialsSpent',
    ]);
  });

  it('publishes Endeavour upgrade targets without actor identity or research internals', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'endeavour-field-upgrade',
      envelope: {
        sessionId: 's1', actorUid: 'holder-secret', actorRoleId: 'shepherd-scientist',
        turn: 3, phase: 'active', requestId: 'upgrade-1', revision: 1,
        serverTime: '2026-09-22T15:00:00.000Z', visibility: EventVisibility.Member,
      },
      payload: {
        shuttleId: 'endeavour',
        targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
        materialsSpentByShip: { shepherd: 7 },
        materialCost: 7, trackId: 'reactor', crossedBox: 1,
        researchProgress: { reactor: 1 },
        holderUid: 'holder-secret', commandFingerprint: { expectedRevision: 0 },
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 's1', turn: 3, phase: 'active', type: 'endeavour-field-upgrade', requestId: 'upgrade-1',
      revision: 1, serverTime: '2026-09-22T15:00:00.000Z',
      visibility: EventVisibility.Member, createdAt: 'server-time',
      shuttleId: 'endeavour', targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
    });
    expect(memberEventFieldsFor('endeavour-field-upgrade')).toEqual([
      'shuttleId', 'targets',
    ]);
  });

  it('keeps the replay-safe envelope and only the public payload allowlist', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: {
        sessionId: 'session-1',
        actorUid: 'uid-secret',
        actorRoleId: 'aegis-engineer',
        requestId: 'request-1',
        revision: 4,
        visibility: EventVisibility.Member,
        phase: 'active',
        turn: 2,
        serverTime: '2026-09-11T00:00:00.000Z',
        fingerprint: { payload: { foodLevel: 0 } },
      },
      payload: {
        shipId: 'aegis',
        shipName: 'AEGIS',
        action: 'reactor',
        results: { '6': 'Stable' },
        serverEntropy: 0.4,
        serverRolls: [6, 6],
        secretCard: '10♥',
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 'session-1',
      actorRoleId: 'aegis-engineer',
      actorUid: 'uid-secret',
      requestId: 'request-1',
      revision: 4,
      visibility: 'member',
      phase: 'active',
      turn: 2,
      serverTime: '2026-09-11T00:00:00.000Z',
      type: 'maintenance',
      createdAt: 'server-time',
      shipId: 'aegis',
      shipName: 'AEGIS',
      action: 'reactor',
      results: { '6': 'Stable' },
    });
  });

  it('fails closed for a new event type until its public fields are declared', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'future-secret-event',
      payload: { publicSummary: 'safe', hiddenResult: 'secret' },
      createdAt: 'server-time',
    })).toEqual({
      type: 'future-secret-event',
      createdAt: 'server-time',
    });
    expect(memberEventFieldsFor('future-secret-event')).toEqual([]);
  });

  it('keeps fleet ticker audit metadata audience safe while retaining server time', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'fleet-ticker',
      payload: {
        action: 'stand-down', messageId: 's1:fleet-ticker:4', revision: 4,
        sequence: 4, serverTime: '2026-09-12T13:01:00.000Z', secretText: 'hidden',
      },
      createdAt: 'server-time',
    })).toEqual({
      type: 'fleet-ticker',
      action: 'stand-down', messageId: 's1:fleet-ticker:4', revision: 4,
      sequence: 4, serverTime: '2026-09-12T13:01:00.000Z', createdAt: 'server-time',
    });
  });

  it('publishes Admiral directive metadata without duplicating authored copy or actor identity', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'admiral-directive',
      payload: {
        kind: 'fleet-policy', revision: 3, cycle: 2,
        serverTime: '2026-09-21T12:00:00.000Z',
        text: 'Private duplicate', actorUid: 'admiral-uid',
      },
      createdAt: 'server-time',
    })).toEqual({
      type: 'admiral-directive', kind: 'fleet-policy', revision: 3, cycle: 2,
      serverTime: '2026-09-21T12:00:00.000Z', createdAt: 'server-time',
    });
  });

  it('publishes President action metadata without duplicating authored copy or actor identity', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'president-action',
      payload: {
        kind: 'crisis', revision: 3, cycle: 2,
        serverTime: '2026-09-21T12:00:00.000Z',
        text: 'Private duplicate', actorUid: 'president-uid',
      },
      createdAt: 'server-time',
    })).toEqual({
      type: 'president-action', kind: 'crisis', revision: 3, cycle: 2,
      serverTime: '2026-09-21T12:00:00.000Z', createdAt: 'server-time',
    });
  });

  it('preserves stable actor attribution for existing audit payloads', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'timer-pause',
      payload: { action: 'paused', turn: 2, window: 'restricted', actorName: 'GM', byUid: 'gm-1' },
      createdAt: 'server-time',
    })).toMatchObject({ byUid: 'gm-1' });
    expect(buildPrivacySafeEventRecord({
      type: 'roll',
      payload: { byUid: 'player-1', sides: 6, count: 1, rolls: [4], total: 4 },
      createdAt: 'server-time',
    })).toMatchObject({ byUid: 'player-1' });
    expect(buildPrivacySafeEventRecord({
      type: 'ship-confetti',
      payload: {
        actorUid: 'player-2', shipId: 'aegis', shipName: 'AEGIS',
        actorName: 'Alice', actorRoleName: 'Captain',
      },
      createdAt: 'server-time',
    })).toMatchObject({ actorUid: 'player-2' });
  });

  it('publishes only the Android proof audit fields', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'android-proof-disclosed',
      payload: {
        actorUid: 'android-player',
        requestId: 'android-proof-1',
        privateCard: 'android',
        suspicion: null,
      },
      createdAt: 'server-time',
    })).toEqual({
      type: 'android-proof-disclosed',
      actorUid: 'android-player',
      requestId: 'android-proof-1',
      createdAt: 'server-time',
    });
  });

  it('publishes crisis lifecycle summaries without facilitator notes', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'crisis-state',
      payload: {
        crisisId: 'approaching-vessel', state: 'delivered', title: 'Approaching vessel',
        details: 'Private resolution notes', actorUid: 'gm-secret',
      },
      createdAt: 'server-time',
    })).toEqual({
      type: 'crisis-state', crisisId: 'approaching-vessel', state: 'delivered',
      title: 'Approaching vessel', createdAt: 'server-time',
    });
  });

  it.each([
    EventVisibility.Public,
    EventVisibility.Crew,
    EventVisibility.RolePrivate,
    EventVisibility.LoyaltyPrivate,
    EventVisibility.Facilitator,
  ])('rejects %s visibility for member-readable events', (visibility) => {
    expect(() => buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: { visibility },
      payload: {},
      createdAt: 'server-time',
    })).toThrow('Member-readable events must use member visibility');
  });

  it('never exposes command and hidden-state fields from role or loyalty decisions', () => {
    const event = buildPrivacySafeEventRecord({
      type: 'loyalty-assignment',
      payload: {
        actorUid: 'gm-secret',
        targetUid: 'player-secret',
        kind: 'wolf-agent',
        suspicion: 10,
        partnerUid: 'friend-secret',
        fingerprint: { payload: { kind: 'wolf-agent' } },
        reply: { assignedUids: ['player-secret'] },
      },
      createdAt: 'server-time',
    });
    expect(event).toEqual({ type: 'loyalty-assignment', actorUid: 'gm-secret', createdAt: 'server-time' });
    expect(event).not.toHaveProperty('kind');
    expect(event).not.toHaveProperty('suspicion');
    expect(event).not.toHaveProperty('partnerUid');
    expect(event).not.toHaveProperty('fingerprint');
    expect(event).not.toHaveProperty('reply');
  });
});
