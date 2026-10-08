import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import ts from 'typescript';
import { deploymentSelector } from './deployment-targets.mjs';

const baseline = '248ba5fe7460dd2708baf4dc152190001ffbdb20';
const productSource = '63d8c8b1c444200bbb25dd99e44f07651f670d48';
const expected = new Map([
  ['functions/src/gmAccess.ts', ['claimGmInstance', 'loginGmAccess']],
  ['functions/src/requestGuards.ts', ['claimGmInstance']],
  ['functions/src/index.ts', ['claimGmInstance', 'expireStalePlayers']],
]);
const readSource = (revision, file) => execFileSync('git', ['show', `${revision}:${file}`], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
});
const select = (files, driftFile) => deploymentSelector({
  before: baseline, after: 'mobile-gm-candidate', files, targets: ['functions'],
  isAncestor: () => false,
  sourceAtRevision: (revision, file) => readSource(revision === baseline ? baseline : productSource, file) +
    (revision !== baseline && file === driftFile ? '\n// unaudited source drift\n' : ''),
});

function exportedCallers(source, names) {
  const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const found = new Set();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) ||
        !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const visit = node => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.includes(node.expression.text)) {
          found.add(declaration.name.getText(file));
        }
        ts.forEachChild(node, visit);
      };
      visit(declaration);
    }
  }
  return [...found].sort();
}

test('the hotfix consumer sets follow real access, parser and lease helper calls', () => {
  const index = readSource(productSource, 'functions/src/index.ts');
  assert.deepEqual(exportedCallers(index, ['isGmAccessPassword', 'isGmAccessActive']), expected.get('functions/src/gmAccess.ts'));
  assert.deepEqual(exportedCallers(index, ['requireGmClaimRequest']), expected.get('functions/src/requestGuards.ts'));
  assert.deepEqual(exportedCallers(index, ['presenceLeaseExpired', 'validPastGmLease']), expected.get('functions/src/index.ts'));
});

for (const [file, consumers] of expected) {
  test(`maps the exact mobile GM hotfix transition for ${file}`, () => {
    assert.deepEqual(select([file]).split(',').sort(), ['hosting', ...consumers.map(name => `functions:${name}`)].sort());
  });
  test(`rejects unaudited mobile GM hotfix source drift in ${file}`, () => {
    assert.throws(() => select([file], file), /mobile GM hotfix.*audit/i);
  });
}

test('deduplicates the complete hotfix without a broad Functions selector', () => {
  const selected = select([...expected.keys()]).split(',');
  assert.deepEqual(selected.slice().sort(), [
    'hosting', 'functions:claimGmInstance', 'functions:expireStalePlayers', 'functions:loginGmAccess',
  ].sort());
  assert.equal(new Set(selected).size, selected.length);
  assert.equal(selected.includes('functions'), false);
});

test('native Git source reads select the complete pinned hotfix transition', () => {
  assert.deepEqual(deploymentSelector({before: baseline, after: productSource, files: [...expected.keys()], targets: ['functions']})
    .split(',').sort(), ['hosting', 'functions:claimGmInstance', 'functions:expireStalePlayers', 'functions:loginGmAccess'].sort());
});
