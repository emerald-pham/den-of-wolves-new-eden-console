import type { LoyaltyKind } from './gameSetup';

/** Private loyalty-card text. This server-owned copy is written only to the holder's secret. */
const PRIVATE_LOYALTY_DIRECTIVES: Readonly<Record<LoyaltyKind, readonly string[]>> = {
  'fleet-loyalist': [
    'Objective // Reach New Eden with as many survivors as possible; keep faith with the fleet.',
    'Recognise that other fleet members may have different loyalties.',
  ],
  'wolf-agent': [
    'Your sleeper priority overrides your former loyalty objective when you activate. Objective // Keep the fleet from escaping by spreading fear or confusion, weakening its infrastructure or defences, or reducing morale.',
  ],
  'intelligence-agent': [
    'Keep your Intelligence Bureau cover hidden while identifying Wolf agents. Your undercover assignment has no working chain of command to contact or prove your credentials.',
  ],
  'universal-arbour': [
    'Objective // Recruit fleet members and spread Universal Arbour influence.',
  ],
  'wolf-cult': [
    'Override // Your Arbour is a Wolf-created cult. Objective // Prevent the Survivor Fleet from escaping through the Wolf-created Arbour cult; pass Wolf intelligence as religious insight.',
  ],
  android: [
    'Objective // Reach New Eden with as many survivors as possible and keep your android identity secret. You may choose to show your card as proof that you are not a Wolf agent.',
  ],
  friend: [
    'Objective // Reach New Eden with as many survivors as possible and trust your reciprocal Friend. Your matching Friend card names you back as someone known not to be a Wolf agent.',
  ],
};

export function privateLoyaltyDirectives(kind: LoyaltyKind): readonly string[];
export function privateLoyaltyDirectives(kind: string): readonly string[] | null;
export function privateLoyaltyDirectives(kind: string): readonly string[] | null {
  return Object.hasOwn(PRIVATE_LOYALTY_DIRECTIVES, kind)
    ? PRIVATE_LOYALTY_DIRECTIVES[kind as LoyaltyKind]
    : null;
}
