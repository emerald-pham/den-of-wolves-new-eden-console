import { access, readFile } from 'node:fs/promises';
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
    expect(environment).not.toContain(
      'node scripts/enforce-worktree-limit.mjs --apply',
    );

    const rootInstall = environment.indexOf('npm ci --prefer-offline --no-audit');
    const functionsInstall = environment.indexOf(
      'npm ci --prefix functions --prefer-offline --no-audit',
    );
    expect(rootInstall).toBeGreaterThanOrEqual(0);
    expect(functionsInstall).toBeGreaterThan(rootInstall);
  });

  it('does not keep an executable worktree-count cap', async () => {
    await expect(
      access(resolve(process.cwd(), 'scripts/enforce-worktree-limit.mjs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
