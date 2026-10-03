export type WolfBoardingProtocolStage =
  | Readonly<{ kind: 'commander'; actorUid: string }>
  | Readonly<{ kind: 'relocation'; actorUid: string; craftId: 'pallas' | 'chepu' }>
  | Readonly<{ kind: 'defence'; actorUid: string; target: string }>
  | Readonly<{ kind: 'militia'; actorUid: string; target: string }>
  | Readonly<{ kind: 'lock-rolls' }>
  | Readonly<{ kind: 'aegis-reroll'; actorUid: string }>
  | Readonly<{ kind: 'pallas-reroll'; actorUid: string; target: string }>
  | Readonly<{ kind: 'commander-ruling'; target: string }>
  | Readonly<{ kind: 'complete' }>;

export interface WolfBoardingProtocolInput {
  readonly attackedTargets: readonly Readonly<{ target: string; boardingParties: number }>[];
  readonly commanderUid?: string;
  readonly commanderChoice?: Readonly<{ target: string | null }>;
  readonly relocations: readonly Readonly<{
    craftId: 'pallas' | 'chepu'; holderUid: string; fuelled: boolean; host: string;
  }>[];
  readonly relocationChoices: Readonly<Record<string, Readonly<{ target: string | null }>>>;
  readonly crewActorUidByTarget: Readonly<Record<string, string>>;
  readonly defenceChoices: Readonly<Record<string, Readonly<{ actorUid: string }>>>;
  readonly supportTargets: readonly string[];
  readonly militiaUidByTarget: Readonly<Record<string, string>>;
  readonly militiaChoices: Readonly<Record<string, Readonly<{ actorUid: string }>>>;
  readonly rollsLocked: boolean;
  readonly diceCounts: Readonly<Record<string, number>>;
  readonly aegisRerollActorUid?: string;
  readonly pallasRerollActorUid?: string;
  readonly rerollChoices: Readonly<Record<string, readonly unknown[]>>;
  readonly commanderRulingRequiredTarget?: string;
  readonly commanderRuling?: Readonly<{ actorUid: string; text: string }>;
}

/** Return the first actor decision or server action that still blocks boarding. */
export function nextWolfBoardingStage(input: WolfBoardingProtocolInput): WolfBoardingProtocolStage {
  if (input.attackedTargets.length === 0) return { kind: 'complete' };

  if (input.commanderUid && input.commanderChoice === undefined) {
    return { kind: 'commander', actorUid: input.commanderUid };
  }

  for (const relocation of input.relocations) {
    if (!relocation.fuelled || input.relocationChoices[relocation.craftId] !== undefined) continue;
    return { kind: 'relocation', actorUid: relocation.holderUid, craftId: relocation.craftId };
  }

  const supportTargets = new Set(input.supportTargets);
  for (const { target } of input.attackedTargets) {
    if (supportTargets.has(target) && input.defenceChoices[target] === undefined) {
      const actorUid = input.crewActorUidByTarget[target];
      if (actorUid) return { kind: 'defence', actorUid, target };
    }
    const militiaUid = input.militiaUidByTarget[target];
    if (militiaUid && input.militiaChoices[target] === undefined) {
      return { kind: 'militia', actorUid: militiaUid, target };
    }
  }

  if (!input.rollsLocked) return { kind: 'lock-rolls' };

  if ((input.diceCounts.aegis ?? 0) > 0 && input.aegisRerollActorUid &&
      input.rerollChoices.aegis === undefined) {
    return { kind: 'aegis-reroll', actorUid: input.aegisRerollActorUid };
  }

  if (input.pallasRerollActorUid) {
    const relocation = input.relocations.find(({ craftId }) => craftId === 'pallas');
    const pallasChoice = input.relocationChoices.pallas?.target;
    const host = pallasChoice ?? relocation?.host;
    if (host && (input.diceCounts[host] ?? 0) > 0 && input.rerollChoices.pallas === undefined) {
      return { kind: 'pallas-reroll', actorUid: input.pallasRerollActorUid, target: host };
    }
  }

  if (input.commanderRulingRequiredTarget && input.commanderRuling === undefined) {
    return { kind: 'commander-ruling', target: input.commanderRulingRequiredTarget };
  }
  return { kind: 'complete' };
}
