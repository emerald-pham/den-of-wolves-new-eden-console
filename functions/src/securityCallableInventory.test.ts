import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import ts from 'typescript';

it('routes every production SDK callable constructor including factories through the audited boundary', () => {
  const unwrapped: string[] = [];
  for (const file of readdirSync(new URL('.', import.meta.url))) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts') || file === 'securityCallable.ts') continue;
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
        unwrapped.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(unwrapped, 'A factory must retain the same denial boundary as an exported callable').toEqual([]);
});
