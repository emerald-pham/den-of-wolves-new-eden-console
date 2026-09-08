import { describe, expect, it } from 'vitest';

import {
  ACTION_METADATA,
  decideActionAuthorization,
  phaseFromTurnPhase,
} from './actionMetadata';

describe('action metadata', () => {
  it('declares actor scope and required phase for Team and Coordination actions', () => {
    expect(ACTION_METADATA.maintenance).toMatchObject({
      actorScope: ['player', 'facilitator'],
      requiredPhase: 'team',
    });
    expect(ACTION_METADATA.jump).toMatchObject({
      actorScope: ['player', 'facilitator'],
      requiredPhase: 'coordination',
    });
  });

  it('normalizes current nested and legacy direct phase representations', () => {
    expect(phaseFromTurnPhase({ airspace: { state: 'restricted' } })).toBe('team');
    expect(phaseFromTurnPhase({ airspace: { state: 'lifted' } })).toBe('coordination');
    expect(phaseFromTurnPhase({ state: 'restricted' })).toBe('team');
    expect(phaseFromTurnPhase({ state: 'lifted' })).toBe('coordination');
  });

  it('treats an absent or malformed legacy phase as unknown', () => {
    expect(phaseFromTurnPhase(undefined)).toBe('unknown');
    expect(phaseFromTurnPhase(null)).toBe('unknown');
    expect(phaseFromTurnPhase({ airspace: { state: 'open' } })).toBe('unknown');
    expect(phaseFromTurnPhase({})).toBe('unknown');
  });

  it('allows a Team action during the Team phase', () => {
    expect(
      decideActionAuthorization({
        action: 'maintenance',
        actorScope: 'player',
        turnPhase: { airspace: { state: 'restricted' } },
      }),
    ).toEqual({
      allowed: true,
      action: 'maintenance',
      phase: 'team',
      reason: 'allowed',
    });
  });

  it('allows a Coordination action during the Coordination phase', () => {
    expect(
      decideActionAuthorization({
        action: 'jump',
        actorScope: 'player',
        turnPhase: { state: 'lifted' },
      }),
    ).toEqual({
      allowed: true,
      action: 'jump',
      phase: 'coordination',
      reason: 'allowed',
    });
  });

  it('rejects wrong-phase actions with a stable reason', () => {
    expect(
      decideActionAuthorization({
        action: 'maintenance',
        actorScope: 'player',
        turnPhase: { airspace: { state: 'lifted' } },
      }),
    ).toEqual({
      allowed: false,
      action: 'maintenance',
      phase: 'coordination',
      reason: 'wrong-phase',
    });
  });

  it('rejects unknown phase instead of granting authority', () => {
    expect(
      decideActionAuthorization({
        action: 'jump',
        actorScope: 'player',
        turnPhase: undefined,
      }),
    ).toEqual({
      allowed: false,
      action: 'jump',
      phase: 'unknown',
      reason: 'unknown-phase',
    });
  });

  it('rejects an actor outside the action metadata scope', () => {
    expect(
      decideActionAuthorization({
        action: 'maintenance',
        actorScope: 'system',
        turnPhase: { state: 'restricted' },
      }),
    ).toEqual({
      allowed: false,
      action: 'maintenance',
      phase: 'team',
      reason: 'actor-scope-denied',
    });
  });
});
