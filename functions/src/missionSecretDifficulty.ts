/**
 * Away mission sites whose difficulty and critical threshold come from the
 * facilitator's secret d6 (`difficultyRule.kind: 'secretD6Difficulty'` in
 * missionCards.ts), so members never receive them. The browser must not
 * import the mission catalog, which carries hidden rewards; missionCards.test.ts
 * keeps this list equal to the catalog.
 */
export const SECRET_D6_DIFFICULTY_SITE_CODES: readonly string[] = ['K'];

export function hasSecretD6DifficultySite(siteCode: string): boolean {
  return SECRET_D6_DIFFICULTY_SITE_CODES.includes(siteCode);
}
