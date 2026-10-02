import { describe, expect, it } from 'vitest';
import type { GameSession } from '@/types/game';
import { stripGmNavigationProjection, stripPersistedNavigationProjection } from './navigationPrivacy';

describe('navigation privacy helpers', () => {
  it('removes Voyage movement with the other GM-only coordinate projections', () => {
    const session = {
      id: 's1',
      name: 'Table one',
      joinCode: '4821',
      phase: 'active',
      voyage33Movement: {
        id: 'voyage-33-0', coordinate: '1413', revision: 4,
        jumpState: { lastJumpTurn: 2 },
      },
      shipGalacticCoordinates: { aegis: '1413' },
      organiserSystems: { 'system-17': '1413' },
    } as unknown as GameSession;

    expect(stripGmNavigationProjection(session)).not.toHaveProperty('voyage33Movement');
    expect(stripPersistedNavigationProjection(session)).not.toHaveProperty('voyage33Movement');
  });
});
