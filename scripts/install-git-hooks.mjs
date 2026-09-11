#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const cwd = process.cwd();
const repositoryRoot = git(cwd, ['rev-parse', '--show-toplevel']);
for (const hook of ['commit-msg', 'pre-push']) {
  chmodSync(resolve(repositoryRoot, '.githooks', hook), 0o755);
}
git(repositoryRoot, ['config', '--local', 'core.hooksPath', '.githooks']);
console.log('Installed repository commit and push gates from .githooks.');
