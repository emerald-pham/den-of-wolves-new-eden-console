import { describe, expect, it } from 'vitest';
import {
  initialShuttleControl,
  parseShuttleControl,
  transferShuttleControl,
} from './shuttleControl';

describe('shuttle control state', () => {
  const craft = [
    { id: 'starlight', kind: 'shuttle' as const, ownerRoleId: 'wing-commander', enabledMode: 'standard' as const, wolfAttackRole: 'park-only' as const },
    { id: 'fighter-wing-alpha', kind: 'fighter-wing' as const, ownerRoleId: 'wing-commander', enabledMode: 'standard' as const, wolfAttackRole: 'battle-table' as const },
    { id: 'wobbly', kind: 'shuttle' as const, ownerRoleId: 'joint-engineering-quellon-refinery', enabledMode: 'gm-controlled' as const, wolfAttackRole: 'park-only' as const },
  ];

  it('initializes only enabled shuttles whose printed owner has one holder', () => {
    expect(initialShuttleControl(craft, [
      { uid: 'wing', roleId: 'wing-commander' },
      { uid: 'union', roleId: 'joint-engineering-quellon-refinery' },
    ])).toEqual({
      starlight: {
        shuttleId: 'starlight',
        ownerRoleId: 'wing-commander',
        ownerUid: 'wing',
        holderUid: 'wing',
        revision: 0,
      },
      wobbly: {
        shuttleId: 'wobbly',
        ownerRoleId: 'joint-engineering-quellon-refinery',
        ownerUid: 'union',
        holderUid: 'union',
        revision: 0,
      },
    });
    expect(() => initialShuttleControl(craft, [
      { uid: 'one', roleId: 'wing-commander' },
      { uid: 'two', roleId: 'wing-commander' },
    ])).toThrow(/exactly one holder/i);
  });

  it('lets only the printed owner or facilitator hand off and reclaim', () => {
    const initial = initialShuttleControl(craft, [{ uid: 'wing', roleId: 'wing-commander' }]);
    const handedOff = transferShuttleControl(initial, {
      shuttleId: 'starlight',
      action: 'handoff',
      actorUid: 'wing',
      actorIsFacilitator: false,
      targetUid: 'crew',
      expectedRevision: 0,
    });
    expect(handedOff).toEqual({
      shuttleId: 'starlight',
      ownerRoleId: 'wing-commander',
      ownerUid: 'wing',
      holderUid: 'crew',
      revision: 1,
    });
    expect(() => transferShuttleControl({ starlight: handedOff }, {
      shuttleId: 'starlight',
      action: 'handoff',
      actorUid: 'crew',
      actorIsFacilitator: false,
      targetUid: 'other',
      expectedRevision: 1,
    })).toThrow(/printed owner or facilitator/i);
    expect(transferShuttleControl({ starlight: handedOff }, {
      shuttleId: 'starlight',
      action: 'reclaim',
      actorUid: 'wing',
      actorIsFacilitator: false,
      expectedRevision: 1,
    })).toMatchObject({ holderUid: 'wing', revision: 2 });
  });

  it('fails closed on stale, malformed, duplicate, or no-op changes', () => {
    const initial = initialShuttleControl(craft, [{ uid: 'wing', roleId: 'wing-commander' }]);
    expect(() => transferShuttleControl(initial, {
      shuttleId: 'starlight', action: 'handoff', actorUid: 'wing',
      actorIsFacilitator: false, targetUid: 'crew', expectedRevision: 1,
    })).toThrow(/stale/i);
    expect(() => transferShuttleControl(initial, {
      shuttleId: 'starlight', action: 'handoff', actorUid: 'wing',
      actorIsFacilitator: false, targetUid: 'wing', expectedRevision: 0,
    })).toThrow(/already holds/i);
    expect(() => transferShuttleControl(initial, {
      shuttleId: 'starlight', action: 'reclaim', actorUid: 'wing',
      actorIsFacilitator: false, expectedRevision: 0,
    })).toThrow(/already holds/i);
    expect(parseShuttleControl({ starlight: { ...initial.starlight, revision: -1 } }))
      .toBeNull();
    expect(parseShuttleControl({ starlight: initial.starlight })).toEqual(initial);
  });
});
