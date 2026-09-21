import { describe, expect, it } from 'vitest';
import { parseRetainedShuttles, retainShuttlesFromDestroyedHost } from './retainedShuttles';

const control = {
  starlight: {
    shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
    holderUid: 'holder', revision: 2,
  },
  pallas: {
    shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo',
    holderUid: 'xo', revision: 0,
  },
} as const;

describe('destroyed-host retained shuttles', () => {
  it('keeps holder custody while removing every destroyed-host docking', () => {
    const result = retainShuttlesFromDestroyedHost({
      destroyedHostShipId: 'aegis',
      dockings: [
        { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
        { shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' },
        { shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' },
      ],
      control: {
        ...control,
        philia: {
          shuttleId: 'philia', ownerRoleId: 'dione-engineer', ownerUid: 'engineer',
          holderUid: 'engineer', revision: 0,
        },
      },
      retained: {},
      retainedAt: '2026-09-21T09:30:00.000Z',
    });

    expect(result.dockings).toEqual([
      { shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' },
    ]);
    expect(result.retainedShuttleIds).toEqual(['starlight', 'pallas']);
    expect(result.retained).toEqual({
      starlight: {
        status: 'retained', shuttleId: 'starlight', ownerRoleId: 'wing-commander',
        holderUid: 'holder', destroyedHostShipId: 'aegis', controlRevision: 2,
        retainedAt: '2026-09-21T09:30:00.000Z',
      },
      pallas: {
        status: 'retained', shuttleId: 'pallas', ownerRoleId: 'executive-officer',
        holderUid: 'xo', destroyedHostShipId: 'aegis', controlRevision: 0,
        retainedAt: '2026-09-21T09:30:00.000Z',
      },
    });
  });

  it('preserves earlier retained craft and leaves unrelated state untouched', () => {
    const existing = {
      philia: {
        status: 'retained' as const, shuttleId: 'philia', ownerRoleId: 'dione-engineer',
        holderUid: 'engineer', destroyedHostShipId: 'dione', controlRevision: 1,
        retainedAt: '2026-09-21T08:00:00.000Z',
      },
    };
    expect(retainShuttlesFromDestroyedHost({
      destroyedHostShipId: 'aegis', dockings: [], control, retained: existing,
      retainedAt: '2026-09-21T09:30:00.000Z',
    })).toEqual({ dockings: [], retained: existing, retainedShuttleIds: [] });
  });

  it('fails closed instead of orphaning a shuttle without holder authority', () => {
    expect(() => retainShuttlesFromDestroyedHost({
      destroyedHostShipId: 'aegis',
      dockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
      control: {}, retained: {}, retainedAt: '2026-09-21T09:30:00.000Z',
    })).toThrow(/no authoritative holder/i);
  });

  it('parses only exact retained-state records', () => {
    const valid = {
      starlight: {
        status: 'retained', shuttleId: 'starlight', ownerRoleId: 'wing-commander',
        holderUid: 'holder', destroyedHostShipId: 'aegis', controlRevision: 2,
        retainedAt: '2026-09-21T09:30:00.000Z',
      },
    };
    expect(parseRetainedShuttles(valid)).toEqual(valid);
    expect(parseRetainedShuttles({ starlight: { ...valid.starlight, holderUid: '' } })).toBeNull();
    expect(parseRetainedShuttles({ starlight: { ...valid.starlight, extra: true } })).toBeNull();
  });
});
