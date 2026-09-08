import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('restores public transport access for the browser-callable Turn 1 demo after deploys', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');

  expect(workflow).toContain('gcloud functions add-invoker-policy-binding startSinglePlayerDemo');
  expect(workflow).toContain('--member="allUsers"');
  expect(workflow).toContain('--region="us-central1"');
});
