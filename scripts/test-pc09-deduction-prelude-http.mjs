import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';
import { runPc09DeductionPrelude } from './pc09-deduction-prelude.mjs';

const directory = process.env.PC09_DEDUCTION_EVIDENCE_DIRECTORY;
assert.ok(directory, 'Set an external evidence directory.');
await mkdir(directory, { recursive: true });
const f = await createPc07AuthenticatedSession('PC09 authenticated deduction prelude', 20, {
  keepAlive: true,
  expansion: 'capybara',
  capybaraEnabled: true,
  explicitLoyaltySetup: {
    wolfAgentRoleId: 'refinery-124-pdf-colonel',
    wolfCultRoleId: 'wing-commander',
    intelligenceAgentRoleId: 'quellon-explorer',
  },
});

try {
  const targetUid = f.loyaltyActors.wolfAgent.localId;
  const result = await runPc09DeductionPrelude(f, { directory });
  assert.equal(result.arrestOutcome, undefined, 'Emulator fixture accounts do not attest physical attendance.');
  console.log(JSON.stringify({ checks: result.checks, actorRoleIds: result.actorRoleIds,
    investigation: result.investigation, arrest: { outcome: result.arrestOutcome.outcome,
      deadlineCycle: result.arrestOutcome.deadlineCycle }, evidencePath: result.evidencePath }, null, 2));
} finally {
  await f.cleanup();
}
