import { describe, expect, it } from 'vitest';
import {
  beginPdfEscortWingAttack,
  initialPdfEscortWingState,
  launchPdfEscortWing,
  resolvePdfEscortWingMedium,
} from './pdfEscortWingState';
import { projectPdfEscortWingMemberView } from './pdfEscortWingProjection';

function dice(value: number) {
  return () => value - 1;
}

describe('PDF Escort Wing member projection', () => {
  it('projects only member-safe state and omits fighter action indexes and mission internals', () => {
    const launched = launchPdfEscortWing(beginPdfEscortWingAttack(initialPdfEscortWingState(), {
      expectedRevision: 0, attackId: 'wolf-attack-1', attackCycle: 1,
    }), {
      expectedRevision: 0,
      launchAllowed: true,
      bayCharged: true,
      bayDamaged: false,
    });
    const acted = resolvePdfEscortWingMedium(launched, {
      expectedRevision: 1,
      actions: [{ fighterIndex: 1, kind: 'attack', targetId: 'wolf-1' }],
      random: dice(5),
    }).state;

    const projection = projectPdfEscortWingMemberView(acted);

    expect(projection).toEqual({
      type: 'pdf-escort-fighter-wing-view',
      revision: 2,
      cycle: 1,
      capacity: 4,
      fighters: 4,
      launched: true,
      mediumResolved: true,
      mediumActionCount: 1,
      shortResolved: false,
      shortRollCount: 0,
      losses: 0,
    });
    expect(projection).not.toHaveProperty('mediumActionFighterIndexes');
    expect(projection).not.toHaveProperty('mission');
  });

  it('projects an uninitialized wing at its registered four-fighter baseline', () => {
    expect(projectPdfEscortWingMemberView(undefined)).toEqual({
      type: 'pdf-escort-fighter-wing-view',
      revision: 0,
      cycle: null,
      capacity: 4,
      fighters: 4,
      launched: false,
      mediumResolved: false,
      mediumActionCount: 0,
      shortResolved: false,
      shortRollCount: 0,
      losses: 0,
    });
  });

  it('does not project malformed server state', () => {
    expect(projectPdfEscortWingMemberView({
      type: 'pdf-escort-fighter-wing-state',
      wingId: 'pdf-escort-fighter-wing',
      attackId: 'wolf-attack-1',
      attackCycle: 1,
      capacity: 4,
      fighters: 4,
      revision: 1,
      launched: true,
      mediumResolved: false,
      mediumActionFighterIndexes: [],
      shortResolved: false,
      shortRollFighterIndexes: [],
      losses: 0,
      mission: { eligible: true, requiresFuel: true, bonuses: { searchAndRescue: 2, salvage: 1 } },
    })).toBeNull();
  });
});
