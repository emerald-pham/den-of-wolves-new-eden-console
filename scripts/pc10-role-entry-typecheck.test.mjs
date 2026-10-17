import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const compiler = resolve(root, 'node_modules/typescript/bin/tsc');

function compile(fixture) {
  return spawnSync(process.execPath, [compiler, '--noEmit', '--allowJs', '--skipLibCheck',
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--types', 'node', '--strict', resolve(root, 'scripts', fixture)], {
    cwd: root,
    encoding: 'utf8',
  });
}

function electionConsumerDiagnostics() {
  const filePath = resolve(root, 'scripts', 'pc10-politics-press-proof.mjs');
  const program = ts.createProgram([filePath], {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ['node'],
  });
  const source = program.getSourceFile(filePath);
  assert.ok(source, 'The TypeScript compiler must load the actual election proof consumer.');
  let consumer;
  let voterReentry;
  const findConsumer = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'configureElection') consumer = node;
    if (consumer && ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer) &&
        node.initializer.declarations.length === 1 && ts.isIdentifier(node.initializer.declarations[0].name) &&
        node.initializer.declarations[0].name.text === 'roleId' && ts.isIdentifier(node.expression) &&
        node.expression.text === 'voters') voterReentry = node;
    ts.forEachChild(node, findConsumer);
  };
  findConsumer(source);
  assert.ok(consumer, 'The compiler check targets the existing election consumer.');
  assert.ok(voterReentry, 'The compiler check targets the actual selected-voter re-entry block.');
  const start = voterReentry.getStart(source);
  const end = voterReentry.end;
  return program.getSemanticDiagnostics(source).filter(diagnostic =>
    diagnostic.start !== undefined && diagnostic.start >= start && diagnostic.start < end);
}

test('correct role-entry consumer reads current live identity from the checked snapshot', () => {
  const result = compile('pc10-role-entry-valid-consumer.mts');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout + result.stderr, '');
});

test('TypeScript rejects live identity reads from original role-entry actor metadata', () => {
  const result = compile('pc10-role-entry-invalid-consumer.mts');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  const diagnostics = result.stdout + result.stderr;
  assert.match(diagnostics, /error TS2339: Property 'sameActor' does not exist on type .+\./);
  assert.equal((diagnostics.match(/error TS\d{4}:/g) ?? []).length, 1, diagnostics);
  assert.doesNotMatch(diagnostics, /TS2307|TS2688|Cannot find module|Cannot find type definition/);
});

test('the existing election consumer type-checks the shared actor/current result in place', () => {
  const diagnostics = electionConsumerDiagnostics();
  assert.equal(diagnostics.length, 0, diagnostics.map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
});
