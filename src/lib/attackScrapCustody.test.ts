import { describe, expect, it } from 'vitest';
import { pickupShipDestroyed, retainedFromDestroyedShip, scrapCollectionRoleId } from './attackScrapCustody';

const retainedMacaw = {
  shuttleDockings: [],
  shuttleControl: { macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain',
    ownerUid: 'captain', holderUid: 'captain', revision: 3 } },
  retainedShuttles: { macaw: { status: 'retained', shuttleId: 'macaw', ownerRoleId: 'capybara-captain',
    holderUid: 'captain', destroyedHostShipId: 'aegis', controlRevision: 3, retainedAt: '2026-10-04T09:59:00.000Z' } },
} as never;

describe('attack Scrap custody', () => {
  it('reads the collecting role from each craft’s vessel config', () => {
    expect(scrapCollectionRoleId('macaw')).toBe('capybara-captain');
    expect(scrapCollectionRoleId('boa')).toBe('capybara-recycler');
  });

  it('recognises only the shuttle retained from that destroyed ship under current control', () => {
    expect(retainedFromDestroyedShip(retainedMacaw, 'macaw', 'aegis')).toBe(true);
    expect(retainedFromDestroyedShip(retainedMacaw, 'macaw', 'dione')).toBe(false);
    expect(retainedFromDestroyedShip(retainedMacaw, 'boa', 'aegis')).toBe(false);
    const changedControl = { ...(retainedMacaw as object), shuttleControl: { macaw: {
      shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'captain', holderUid: 'captain', revision: 4 } } };
    expect(retainedFromDestroyedShip(changedControl as never, 'macaw', 'aegis')).toBe(false);
    const redocked = { ...(retainedMacaw as object), shuttleDockings: [{ shuttleId: 'macaw', shipId: 'dione', dockedAt: 'now' }] };
    expect(retainedFromDestroyedShip(redocked as never, 'macaw', 'aegis')).toBe(false);
  });

  it('treats a pickup as destroyed-status from its ledger entry or the current ship damage', () => {
    const pickup = { attackId: 'attack-6', turn: 6, destroyed: false };
    expect(pickupShipDestroyed(pickup, 'aegis', undefined)).toBe(false);
    expect(pickupShipDestroyed(pickup, 'aegis', { aegis: { damagedSystemIds: [], destroyed: true } })).toBe(true);
    expect(pickupShipDestroyed({ ...pickup, destroyed: true }, 'aegis', {})).toBe(true);
  });
});
