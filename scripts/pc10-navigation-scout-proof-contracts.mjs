// Test-first scaffold. This packet adds proof procedures, never game authority.
export const NAV_SCOUT_BRANCHES = Object.freeze([
  'prestart-readers', 'group-navigation', 'group-message', 'known-share', 'known-jump',
  'gm-move', 'partition', 'taxi-courier', 'taxi-fuel', 'taxi-passengers', 'natural-failure',
  'dradis', 'press-access', 'scout-request', 'gm-scout-recovery', 'scout-report',
  'candidate-reader', 'scout-reload', 'scout-foreign-denial', 'scout-offline-withdrawal',
  'scout-audience-withdrawal',
]);
const pending = () => { throw new Error('Navigation/scout proof contract is not implemented.'); };
export const assertNavigationScoutActor = pending;
export const assertNavigationScoutConsequenceActor = pending;
export const assertNavigationScoutCensus = pending;
export const waitForNavigationScoutPaint = pending;
export const assertNavigationScoutRequest = pending;
export const assertNavigationScoutReplay = pending;
export const assertNavigationScoutCost = pending;
export const validateScoutBundle = pending;
export const safeNavigationScoutEvidence = pending;
export const summarizeNavigationScoutBranches = pending;
export const captureNavigationScoutUiReceipt = pending;
