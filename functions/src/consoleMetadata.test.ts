import { describe, expect, it } from 'vitest';
import {
  CONSOLE_METADATA,
  SUPPLEMENTAL_CONSOLE_METADATA,
  UNREGISTERED_VESSEL_CONSOLES,
  consoleMetadataFor,
  supplementalConsoleMetadataFor,
} from './consoleMetadata';
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

  it('registers every AEGIS combat console as unavailable until its attack resolver lands', () => {
    const combatConsoles = [
      { consoleId: 'aegis:command-and-control', name: 'Command and Control' },
      { consoleId: 'aegis:fighter-bay-alpha', name: 'Fighter Bay Alpha' },
      { consoleId: 'aegis:fighter-bay-bravo', name: 'Fighter Bay Bravo' },
      { consoleId: 'aegis:missile-launchers', name: 'Missile Launchers' },
      { consoleId: 'aegis:point-defence-lasers', name: 'Point Defence Lasers' },
    ] as const;

    const promptOwned = Object.values(CONSOLE_METADATA)
      .filter((metadata) => metadata.shipId === 'aegis' && metadata.phase === 'Wolf attack' &&
        metadata.resolver.status === 'unavailable' && metadata.resolver.followOnPrompts.includes('182'))
      .map(({ consoleId, name }) => ({ consoleId, name }))
      .sort((left, right) => left.consoleId.localeCompare(right.consoleId));
    expect(promptOwned).toEqual(
      [...combatConsoles].sort((left, right) => left.consoleId.localeCompare(right.consoleId)),
    );

    expect(combatConsoles.map(({ consoleId }) => consoleMetadataFor('aegis', consoleId.split(':')[1]!)))
      .toEqual(combatConsoles.map(({ consoleId }) => expect.objectContaining({
        consoleId,
        shipId: 'aegis',
        phase: 'Wolf attack',
        resolver: {
          status: 'unavailable',
          id: 'fail-closed.unavailable',
          followOnPrompts: ['182'],
          reason: expect.stringMatching(/unavailable until/i),
        },
      })));
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
    expect(UNREGISTERED_VESSEL_CONSOLES['gorgoneion']).toEqual(['235', '236']);
  });

  it('registers Gorgoneion Missile Array while keeping firing fail closed for Prompt 455', () => {
    expect(Object.keys(SUPPLEMENTAL_CONSOLE_METADATA)).toEqual([
      'gorgoneion:missile-array', 'gorgoneion:force-field-projector',
    ]);
    expect(supplementalConsoleMetadataFor('gorgoneion', 'missile-array')).toEqual({
      consoleId: 'gorgoneion:missile-array',
      vesselId: 'gorgoneion',
      name: 'Missile Array',
      phase: 'Wolf attack',
      maintenanceStep: 4,
      charge: { status: 'printed', text: 'Requires one console charge from the small-ship Reactor.' },
      effect: 'Roll 3 dice total: one at long, one at medium, and one at short range. Each 6+ / 5+ / 4+ deals 1 damage at that range; the array can damage each target at most once per phase.',
      resolver: {
        status: 'unavailable', id: 'fail-closed.unavailable', followOnPrompts: ['455'],
        reason: 'Missile Array firing is unavailable until the authoritative range-phase resolver lands.',
      },
    });
    expect(supplementalConsoleMetadataFor('gorgoneion', 'force-field-projector')).toEqual({
      consoleId: 'gorgoneion:force-field-projector',
      vesselId: 'gorgoneion',
      name: 'Force Field Projector',
      phase: 'Wolf attack',
      maintenanceStep: 4,
      charge: { status: 'printed', text: 'Requires one console charge from the small-ship Reactor.' },
      effect: 'Before targeting, choose 1 ship. At the end of the Wolf attack, reduce the damage that ship takes by 2.',
      resolver: {
        status: 'unavailable', id: 'fail-closed.unavailable', followOnPrompts: ['437'],
        reason: 'Ship selection is unavailable until the authoritative before-targeting resolver lands; selection cannot occur after targeting begins.',
      },
    });
  });
});
