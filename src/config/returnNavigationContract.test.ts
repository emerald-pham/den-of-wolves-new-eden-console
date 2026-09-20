import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_SOURCE = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const BROWSER_PROOF = readFileSync(
  resolve(process.cwd(), 'scripts/prompt-602-return-navigation.mjs'),
  'utf8',
);

const ROUTE_PROOF_EXAMPLES: Readonly<Record<string, string>> = {
  '/roles': '/roles',
  '/brief': '/brief',
  '/escape': '/escape',
  '/gm': '/gm',
  '/console': '/console',
  '/press': '/press',
  '/shuttles/:shuttleId': '/shuttles/wobbly',
  '/ships/:shipId/roles': '/ships/aegis/roles',
  '/ships/:shipId/roles/:roleId': '/ships/aegis/roles/admiral',
  '/ships/:shipId/observer': '/ships/aegis/observer',
  '/ships/:shipId': '/ships/aegis',
  '/union/roles/:roleId': '/union/roles/joint-engineering-quellon-refinery',
  '*': '/missing-console',
};

describe('return navigation proof inventory', () => {
  it('keeps every nonlanding application route in the rendered proof matrix', () => {
    const declaredRoutes = [...APP_SOURCE.matchAll(/<Route path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== '/');

    expect(declaredRoutes).toEqual(Object.keys(ROUTE_PROOF_EXAMPLES));
    for (const examplePath of Object.values(ROUTE_PROOF_EXAMPLES)) {
      expect(BROWSER_PROOF).toContain(`path: '${examplePath}'`);
    }
  });
});
