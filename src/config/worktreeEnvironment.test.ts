import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('Codex worktree environment', () => {
  it('bootstraps both locked dependency trees from the npm cache', async () => {
    const environment = await readFile(
      resolve(process.cwd(), '.codex/environments/environment.toml'),
      'utf8',
    );

    expect(environment).toContain('version = 1');
    expect(environment).toContain('[setup]');
    expect(environment).toContain('npm ci --prefer-offline --no-audit');
    expect(environment).toContain(
      'npm ci --prefix functions --prefer-offline --no-audit',
    );
  });
});
