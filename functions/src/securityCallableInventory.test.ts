import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import ts from 'typescript';

it('routes every production SDK callable constructor including factories through the audited boundary', () => {
  const unwrapped: string[] = [];
  const auditedFactories = new Map([
    ['securityCallable.ts', 'auditedOnCall'],
    ['castingCallableTransport.ts', 'castingCallableTransport'],
  ]);
  const auditedFactoryCalls = new Map<string, number>();
  for (const file of readdirSync(new URL('.', import.meta.url))) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    const constructors = new Set<string>();
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) ||
          node.moduleSpecifier.text !== 'firebase-functions/v2/https') continue;
      const imports = node.importClause?.namedBindings;
      if (imports && ts.isNamedImports(imports)) for (const entry of imports.elements) {
        if ((entry.propertyName ?? entry.name).text === 'onCall') constructors.add(entry.name.text);
      }
      if (imports && ts.isNamespaceImport(imports)) constructors.add(`${imports.name.text}.onCall`);
    }
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && constructors.has(node.expression.getText(source))) {
        let parent = node.parent;
        while (parent && !ts.isFunctionDeclaration(parent) && !ts.isFunctionExpression(parent) && !ts.isArrowFunction(parent)) {
          parent = parent.parent;
        }
        const factoryName = parent && ts.isFunctionDeclaration(parent) ? parent.name?.text : undefined;
        if (auditedFactories.get(file) === factoryName) {
          auditedFactoryCalls.set(file, (auditedFactoryCalls.get(file) ?? 0) + 1);
        } else {
          unwrapped.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(unwrapped, 'A factory must retain the same denial boundary as an exported callable').toEqual([]);
  expect([...auditedFactoryCalls.entries()].sort(), 'Both behavior-qualified transport factories must remain in the inventory').toEqual([
    ['castingCallableTransport.ts', 1],
    ['securityCallable.ts', 1],
  ]);
});
