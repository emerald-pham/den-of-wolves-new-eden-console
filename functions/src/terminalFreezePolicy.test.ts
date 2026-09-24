import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const callablePattern = /export const (\w+) = onCall/g;
const matches = [...source.matchAll(callablePattern)];
const highwallWindowGuardStart = source.indexOf('function requireLiveHighwallMiningWindow(');
const highwallWindowGuardEnd = source.indexOf('\nfunction highwallCargo(', highwallWindowGuardStart);
const highwallWindowGuard = source.slice(highwallWindowGuardStart, highwallWindowGuardEnd);

const terminalFreezeExemptions = new Set([
  // Session lifecycle, authentication, presence, and GM administration remain
  // available so a terminal session can be inspected and closed safely.
  'createSession', 'joinSession', 'resumeSession', 'loginGmAccess', 'logoutGmAccess',
  'claimGmInstance', 'setGmShipConsoleWriteGrant', 'listGmInstances', 'kickGmInstance',
  'releaseGmInstance', 'kickPlayer', 'getSessionPresence', 'refreshPresence',
  'disconnectFromSession', 'elevateToGm',
  // Setup and casting commands have their own pre-game windows. Legacy setup
  // shims always reject, and debrief mode is intentionally available afterward.
  'confirmSetup', 'setFacilitatorResponsibility', 'startGame', 'setShipPreference',
  'assignRole', 'releaseRole', 'assignLoyalty', 'setCapybaraEnabled', 'setDioneEnabled',
  'setActiveRoleEnabled', 'setActiveRoleConfiguration', 'applyRolePreset',
  'claimSeat', 'releaseSeat', 'startSinglePlayerDemo', 'setDebriefMode',
  // Read-only authority projections do not mutate gameplay state.
  'getCommissarPurgeAuthority',
  // Current-GM acknowledgement only records handling of a prior committed
  // sabotage clue and emits its decorative notice; it must remain drainable
  // from the terminal/debrief view without reopening gameplay mutations.
  'acknowledgeWolfHackingAlert',
]);

function callableBody(index: number): string {
  const start = matches[index]!.index;
  const end = matches[index + 1]?.index ?? source.length;
  return source.slice(start, end);
}

it('classifies every callable and requires terminal guards on normal gameplay paths', () => {
  const unclassified: string[] = [];
  const unguarded: string[] = [];
  const acceptedGuards = [
    'requireActiveGameplayPhase(',
    'requireActionPhase(',
    'requireSmallShipDockingPhase(',
    "get('phase') !== 'active'",
    'validateWolfAttackDeclaration(',
    'requireLiveHighwallMiningWindow(',
  ];

  matches.forEach((match, index) => {
    const name = match[1]!;
    const body = callableBody(index);
    if (terminalFreezeExemptions.has(name)) return;
    if (!acceptedGuards.some((guard) => body.includes(guard))) {
      unclassified.push(name);
      unguarded.push(name);
    }
  });

  expect(unclassified, 'New callables must be classified or terminal-guarded').toEqual([]);
  expect(unguarded, 'Normal gameplay callables must reject terminal phases').toEqual([]);
});

it('requires the Highwall mining window guard to reject non-active sessions', () => {
  expect(highwallWindowGuard).toContain("session.get('phase') !== 'active'");
});

it.each([
  'setFacilitatorCensusNote',
  'authorArbourVision',
  'authorFacilitatorRuleCall',
  'revealAndroidProof',
  'replayTurnStartAnnouncement',
  'beginOpenAirspacePhase',
  'extendAirspaceWindow',
  'setEmergencyTimerPaused',
  'unlockPressAirspace',
])('%s uses the shared terminal-phase guard directly', (name) => {
  const index = matches.findIndex((match) => match[1] === name);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(callableBody(index)).toContain('requireActiveGameplayPhase(');
});
