#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function isDocumentationFile(filePath) {
  const fileName = basename(filePath);
  return /\.mdx?$/i.test(fileName) || fileName === 'README' || /^README\./i.test(fileName);
}

function changedFiles(cwd) {
  return execFileSync('git', ['diff', '--name-only', 'main...HEAD'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\n')
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

function checkMarkdownFile(cwd, filePath, scripts, errors) {
  const absolutePath = resolve(cwd, filePath);
  if (!existsSync(absolutePath)) return;

  const source = readFileSync(absolutePath, 'utf8');
  const lines = source.split('\n');
  let fence;
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;
    const marker = match[1][0];
    if (!fence) {
      fence = marker;
    } else if (fence === marker) {
      fence = undefined;
    }
  }
  if (fence) errors.push(`${filePath}: unclosed ${fence} fenced code block`);

  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)\n]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith('<')) {
      const closingBracket = target.indexOf('>');
      target = closingBracket >= 0 ? target.slice(1, closingBracket) : target;
    } else {
      target = target.split(/\s+/, 1)[0];
    }
    if (!target || target.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) {
      continue;
    }
    const pathPart = target.split(/[?#]/, 1)[0];
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      errors.push(`${filePath}: invalid URL encoding in link target ${target}`);
      continue;
    }
    if (!existsSync(resolve(dirname(absolutePath), decodedPath))) {
      errors.push(`${filePath}: link target does not exist: ${target}`);
    }
  }

  for (const match of source.matchAll(/\bnpm run ([a-z0-9:_-]+)/gi)) {
    const scriptName = match[1];
    if (!scripts[scriptName]) {
      errors.push(`${filePath}: npm script does not exist: ${scriptName}`);
    }
  }
}

/** Validate the deterministic portion of the repository's Markdown contract. */
export function validateDocumentation({ cwd = process.cwd(), files } = {}) {
  const packageJson = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  const candidateFiles = files ?? changedFiles(cwd);
  const documentationFiles = [
    ...new Set([
      ...candidateFiles.filter(isDocumentationFile),
      'AGENTS.md',
      'CLAUDE.md',
    ]),
  ];
  const errors = [];

  if (documentationFiles.length === 0) {
    errors.push('no documentation files were found in the task diff');
  }
  for (const filePath of documentationFiles) {
    checkMarkdownFile(cwd, filePath, packageJson.scripts ?? {}, errors);
  }

  const agents = readFileSync(resolve(cwd, 'AGENTS.md'), 'utf8');
  const claude = readFileSync(resolve(cwd, 'CLAUDE.md'), 'utf8');
  for (const requiredText of [
    'CLAUDE.md',
    'coordination:validate',
    'coordination:finish',
    'machine-checked',
  ]) {
    if (!agents.includes(requiredText)) {
      errors.push(`AGENTS.md is missing required guidance: ${requiredText}`);
    }
  }
  for (const requiredText of [
    'coordination:begin',
    'coordination:validate',
    'coordination:finish',
    'origin/main',
    'machine-checked',
  ]) {
    if (!claude.includes(requiredText)) {
      errors.push(`CLAUDE.md is missing required guidance: ${requiredText}`);
    }
  }

  return errors;
}

async function main() {
  const errors = validateDocumentation();
  if (errors.length > 0) {
    throw new Error(`Documentation validation failed:\n- ${errors.join('\n- ')}`);
  }
  console.log('Documentation validation passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
