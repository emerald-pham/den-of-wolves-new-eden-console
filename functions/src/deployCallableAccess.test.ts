import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('restores public transport access for the browser-callable DRADIS trigger after deploys', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

  expect(workflow).toContain('google-github-actions/setup-gcloud@v3');
  expect(workflow).toContain('gcloud functions add-invoker-policy-binding triggerDradisContact');
  expect(workflow).toContain('--member="allUsers"');
  expect(workflow).toContain('--region="us-central1"');
});
