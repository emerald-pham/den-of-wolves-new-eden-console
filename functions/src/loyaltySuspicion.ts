import { loyaltyAssignmentDecision, type LoyaltyKind } from './gameSetup';

export type LiveLoyaltySuspicionDecision =
  | { readonly allowed: true; readonly kind: LoyaltyKind; readonly suspicion: number | null }
  | { readonly allowed: false };

/**
 * Starting loyalty cards use printed suspicion values. During play, Wolf
 * actions may raise Wolf suspicion and Intelligence Agent investigations may
 * raise that card from its printed six in exact increments of two. Every other
 * loyalty retains its printed setup domain.
 */
export function liveLoyaltySuspicionDecision(
  kind: unknown,
  suspicion: unknown,
): LiveLoyaltySuspicionDecision {
  if ((kind === 'wolf-agent' || kind === 'wolf-cult') &&
      Number.isSafeInteger(suspicion) && (suspicion as number) >= 0) {
    return { allowed: true, kind, suspicion: suspicion as number };
  }
  if (kind === 'intelligence-agent' && Number.isSafeInteger(suspicion) &&
      (suspicion as number) >= 6 && ((suspicion as number) - 6) % 2 === 0) {
    return { allowed: true, kind, suspicion: suspicion as number };
  }
  if (typeof kind !== 'string' || (typeof suspicion !== 'number' && suspicion !== null)) {
    return { allowed: false };
  }
  const setup = loyaltyAssignmentDecision(kind, suspicion);
  return setup.allowed
    ? { allowed: true, kind: kind as LoyaltyKind, suspicion: setup.suspicion }
    : { allowed: false };
}
