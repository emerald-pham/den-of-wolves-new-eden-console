import { candidateProofOptions } from './pc10-candidate-proof-helpers.mjs';

export function minimumRingPlan() {
  const previous = candidateProofOptions({ candidateCode: 'N', playerCount: 13, includePress: false,
    capybaraEnabled: false, directory: '/tmp/pc10-ring-baseline-plan' });
  return { actualAuthenticatedActors: previous.playerCount + 2, browserProcesses: 2,
    configuredRoles: previous.playerCount, hardCapMs: 1200000 };
}

export async function runRingWorkflow() {
  throw new Error('Existing full-roster Ring callback cannot use sparse ordinary-account setup.');
}
