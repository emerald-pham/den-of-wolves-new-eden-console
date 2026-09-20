import { describe, expect, it } from 'vitest';
import { CONSOLE_METADATA, UNREGISTERED_VESSEL_CONSOLES, consoleMetadataFor } from './consoleMetadata';
import { SHIP_DAMAGE_DECKS } from './shipDamage';

describe('server-only console metadata', () => {
  it('covers every configured damage-deck console without publishing cards to the client catalog', () => {
    for (const [shipId, deck] of Object.entries(SHIP_DAMAGE_DECKS)) {
      for (const card of deck) {
        const metadata = consoleMetadataFor(shipId, card.systemId);
        expect(metadata).toMatchObject({
          consoleId: `${shipId}:${card.systemId}`,
          shipId,
          name: card.systemName,
          card: card.card,
          phase: expect.any(String),
          charge: expect.objectContaining({ status: expect.any(String) }),
          damage: expect.objectContaining({ status: expect.any(String) }),
          upgrade: expect.objectContaining({ status: expect.any(String) }),
          effect: expect.any(String),
          resolver: expect.objectContaining({ status: expect.any(String) }),
        });
        expect(metadata?.step === null || [1, 5, 6, 7].includes(metadata?.step ?? -1)).toBe(true);
      }
    }
    expect(Object.keys(CONSOLE_METADATA)).toHaveLength(
      Object.values(SHIP_DAMAGE_DECKS).reduce((count, deck) => count + deck.length, 0),
    );
  });

  it('links implemented paths and fail-closes unavailable actions under an owning prompt', () => {
    expect(consoleMetadataFor('dione', 'storage')?.resolver)
      .toEqual({ status: 'implemented', id: 'maintenance.storage' });
    expect(consoleMetadataFor('dione', 'hydroponics')?.resolver).toEqual({
      status: 'implemented', id: 'maintenance.production',
    });
    expect(consoleMetadataFor('aegis', 'missile-launchers')?.resolver).toEqual({
      status: 'unavailable', id: 'fail-closed.unavailable', followOnPrompts: ['182'],
      reason: 'Missile Launchers are unavailable until the AEGIS attack resolver lands.',
    });
    expect(consoleMetadataFor('icebreaker', 'jump-drive')?.resolver)
      .toEqual({ status: 'implemented', id: 'jump.resolve' });
    expect(consoleMetadataFor('capybara', 'advanced-hydroponics')?.resolver)
      .toEqual({ status: 'implemented', id: 'maintenance.production' });
    expect(consoleMetadataFor('dione', 'water-reclamation')?.resolver)
      .toEqual({ status: 'implemented', id: 'maintenance.production' });
    expect(consoleMetadataFor('dione', 'vip-lounge')?.resolver)
      .toEqual({ status: 'implemented', id: 'vip-card.draw' });
    expect(consoleMetadataFor('capybara', 'scrap-refinery')?.resolver)
      .toEqual({ status: 'implemented', id: 'maintenance.production' });
    expect(consoleMetadataFor('capybara', 'water-production')?.resolver)
      .toEqual({ status: 'implemented', id: 'maintenance.production' });
    expect(consoleMetadataFor('aegis', 'construction-bay')).toMatchObject({
      ownerRoleId: 'wing-commander',
      resolver: { status: 'implemented', id: 'fighter.build' },
    });
  });

  it('gives every registered console one complete authoritative resolver disposition', () => {
    const unavailableOwners = new Set<string>();
    for (const metadata of Object.values(CONSOLE_METADATA)) {
      if (metadata.resolver.status === 'implemented') {
        expect(metadata.resolver.id).not.toBe('fail-closed.unavailable');
        continue;
      }
      expect(metadata.resolver).toMatchObject({
        status: 'unavailable', id: 'fail-closed.unavailable',
        reason: expect.stringMatching(/unavailable until/i),
      });
      expect(metadata.resolver.followOnPrompts).toHaveLength(1);
      expect(metadata.resolver.followOnPrompts[0]).toMatch(/^\d+[a-z]?$/);
      unavailableOwners.add(metadata.resolver.followOnPrompts[0]);
    }
    expect([...unavailableOwners].sort()).toEqual(['182', '192', '202', '231']);
  });

  it('records identity-only vessel console gaps instead of inventing systems', () => {
    expect(Object.keys(UNREGISTERED_VESSEL_CONSOLES)).toEqual([
      'gorgoneion', 'capybara-small', 'warrior', 'vulcan', 'voyage-33-0',
    ]);
    expect(UNREGISTERED_VESSEL_CONSOLES['gorgoneion']).toEqual(['235', '236', '239', '240']);
  });
});
