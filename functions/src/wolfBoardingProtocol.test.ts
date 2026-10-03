import { describe, expect, it } from 'vitest';
import { nextWolfBoardingStage, type WolfBoardingProtocolInput } from './wolfBoardingProtocol';

const base: WolfBoardingProtocolInput = {
  attackedTargets: [{ target: 'aegis', boardingParties: 4 }, { target: 'dione', boardingParties: 4 }],
  commanderUid: 'commander', commanderChoice: undefined,
  relocations: [{ craftId: 'pallas', holderUid: 'pilot', fuelled: true, host: 'aegis' }],
  relocationChoices: {},
  defenceChoices: {}, supportTargets: ['aegis', 'dione'],
  militiaUidByTarget: {}, militiaChoices: {},
  rollsLocked: false, diceCounts: { aegis: 2, dione: 1 },
  aegisRerollActorUid: 'xo', pallasRerollActorUid: 'pilot',
  rerollChoices: {},
  commanderRulingRequiredTarget: undefined, commanderRuling: undefined,
};

describe('Wolf boarding stage protocol', () => {
  it('serializes Commander leadership, fuelled relocation, crew defence, and Militia before locking dice', () => {
    expect(nextWolfBoardingStage(base)).toEqual({ kind: 'commander', actorUid: 'commander' });
    expect(nextWolfBoardingStage({ ...base, commanderChoice: { target: 'aegis' } }))
      .toEqual({ kind: 'relocation', actorUid: 'pilot', craftId: 'pallas' });
    expect(nextWolfBoardingStage({ ...base, commanderChoice: { target: 'aegis' },
      relocationChoices: { pallas: { target: 'dione' } } }))
      .toEqual({ kind: 'defence', actorUid: 'crew-aegis', target: 'aegis' });
  });

  it('opens each independent reroll source in order and waits for an explicit Commander ruling', () => {
    const ready = {
      ...base, commanderChoice: { target: 'aegis' },
      relocationChoices: { pallas: { target: 'aegis' } },
      defenceChoices: { aegis: { actorUid: 'crew-aegis' }, dione: { actorUid: 'crew-dione' } },
      rollsLocked: true, commanderRulingRequiredTarget: 'aegis',
    };
    expect(nextWolfBoardingStage(ready)).toEqual({ kind: 'aegis-reroll', actorUid: 'xo' });
    expect(nextWolfBoardingStage({ ...ready, rerollChoices: { aegis: [] } }))
      .toEqual({ kind: 'pallas-reroll', actorUid: 'pilot', target: 'aegis' });
    expect(nextWolfBoardingStage({ ...ready, rerollChoices: { aegis: [], pallas: [] } }))
      .toEqual({ kind: 'commander-ruling', target: 'aegis' });
    expect(nextWolfBoardingStage({ ...ready, rerollChoices: { aegis: [], pallas: [] },
      commanderRuling: { actorUid: 'gm-1', text: 'Ruling recorded.' } })).toEqual({ kind: 'complete' });
  });

  it('skips absent actors and unavailable abilities without inventing a choice', () => {
    const noSpecialActors: WolfBoardingProtocolInput = {
      ...base, commanderUid: undefined, relocations: [],
      supportTargets: [], rollsLocked: true, diceCounts: { aegis: 0, dione: 0 },
      aegisRerollActorUid: undefined, pallasRerollActorUid: undefined,
    };
    expect(nextWolfBoardingStage(noSpecialActors)).toEqual({ kind: 'defence', actorUid: 'crew-aegis', target: 'aegis' });
    expect(nextWolfBoardingStage({ ...noSpecialActors,
      attackedTargets: [], defenceChoices: {}, militiaChoices: {} })).toEqual({ kind: 'complete' });
  });
});
