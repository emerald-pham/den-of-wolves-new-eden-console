import { describe, expect, it } from 'vitest';
import { requireScoutEntitlement, SCOUT_ENTITLEMENTS } from './scoutEntitlements';

const core = {
  playerRole: 'player', connected: true, replacementRoleId: null,
  seatId: null,
  activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
  activeVesselIds: ['aegis', 'quellon', 'shepherd'],
};

describe('scout entitlement authority', () => {
  it('defines exactly the three printed craft owners and assigned Comms Officer', () => {
    expect(SCOUT_ENTITLEMENTS).toEqual([
      { id: 'starlight', source: 'craft', ownerRoleId: 'wing-commander', anchorShipId: 'aegis' },
      { id: 'hummingbird', source: 'craft', ownerRoleId: 'quellon-explorer', anchorShipId: 'quellon' },
      { id: 'endeavour', source: 'craft', ownerRoleId: 'shepherd-scientist', anchorShipId: 'shepherd' },
      { id: 'comms-officer', source: 'replacement-role', ownerRoleId: 'comms-officer', anchorShipId: 'aegis' },
    ]);
  });

  it.each([
    ['starlight', 'wing-commander'],
    ['hummingbird', 'quellon-explorer'],
    ['endeavour', 'shepherd-scientist'],
  ] as const)('authorizes %s only for its current printed owner', (requestedEntitlementId, assignedRoleId) => {
    expect(requireScoutEntitlement({ ...core, requestedEntitlementId, assignedRoleId, seatId: assignedRoleId }))
      .toMatchObject({ id: requestedEntitlementId, ownerRoleId: assignedRoleId });
  });

  it('authorizes the exact assigned Comms Officer without reviving a former core role', () => {
    expect(requireScoutEntitlement({
      ...core, requestedEntitlementId: 'comms-officer', assignedRoleId: 'wing-commander',
      seatId: 'wing-commander', replacementRoleId: 'comms-officer',
    })).toMatchObject({ id: 'comms-officer', source: 'replacement-role', anchorShipId: 'aegis' });
    expect(() => requireScoutEntitlement({
      ...core, requestedEntitlementId: 'starlight', assignedRoleId: 'wing-commander',
      seatId: 'wing-commander', replacementRoleId: 'comms-officer',
    })).toThrow(/current printed craft owner/i);
  });

  it.each([
    ['wrong craft owner', { requestedEntitlementId: 'hummingbird', assignedRoleId: 'wing-commander', seatId: 'wing-commander' }],
    ['mismatched seat', { requestedEntitlementId: 'starlight', assignedRoleId: 'wing-commander', seatId: 'admiral' }],
    ['inactive role', { requestedEntitlementId: 'starlight', assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeRoleIds: [] }],
    ['inactive anchor', { requestedEntitlementId: 'starlight', assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeVesselIds: ['quellon', 'shepherd'] }],
    ['unassigned replacement', { requestedEntitlementId: 'comms-officer', assignedRoleId: null, replacementRoleId: null }],
    ['other replacement', { requestedEntitlementId: 'comms-officer', assignedRoleId: null, replacementRoleId: 'vip-host' }],
    ['disconnected player', { requestedEntitlementId: 'endeavour', assignedRoleId: 'shepherd-scientist', connected: false }],
    ['facilitator', { requestedEntitlementId: 'endeavour', assignedRoleId: 'shepherd-scientist', playerRole: 'gm' }],
    ['unknown entitlement', { requestedEntitlementId: 'pallas', assignedRoleId: 'executive-officer' }],
  ] as const)('rejects %s', (_label, patch) => {
    expect(() => requireScoutEntitlement({ ...core, ...patch })).toThrow();
  });

  it.each([
    { activeRoleIds: ['wing-commander', 'wing-commander'] },
    { activeRoleIds: ['wing-commander', 7] },
    { activeVesselIds: ['aegis', 'aegis'] },
    { activeVesselIds: 'aegis' },
    { activeRoleIds: ['wing-commander', 'space-wizard'] },
    { activeRoleIds: ['wing-commander', 'press-officer'], activeVesselIds: ['aegis'] },
    {
      activeRoleIds: ['wing-commander', 'joint-engineering-quellon-refinery'],
      activeVesselIds: ['aegis', 'quellon', 'refinery-124'],
    },
    { activeVesselIds: ['aegis', 'quellon', 'shepherd', 'wolf-ship'] },
    { requestedEntitlementId: 7 },
  ])('fails closed on malformed authority %#', (patch) => {
    expect(() => requireScoutEntitlement({
      ...core, requestedEntitlementId: 'starlight', assignedRoleId: 'wing-commander',
      seatId: 'wing-commander', ...patch,
    })).toThrow();
  });
});
