import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { PUBLIC_FUNCTIONS } from '../../scripts/verify-deployment.mjs';

it('restores public transport access for required browser callables after deploys', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');

  expect(workflow).toContain('gcloud run services add-iam-policy-binding "$service"');
  expect(workflow).toMatch(/gcloud functions describe startSinglePlayerDemo \\\n\s+--v2/);
  expect(workflow).toContain('gcloud functions describe repairConsolesFromBlacksmith');
  expect(workflow).toContain("--format='value(serviceConfig.service)'");
  expect(workflow).toContain('--role="roles/run.invoker"');
  expect(workflow).toContain('--member="allUsers"');
  expect(workflow).toContain('--region="us-central1"');
  expect(workflow).toContain('verify-deployment.mjs');
  expect(PUBLIC_FUNCTIONS).toContain('repairConsolesFromBlacksmith');
});
