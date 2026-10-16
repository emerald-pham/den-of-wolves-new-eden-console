import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const ts = require('typescript');

/** Read the canonical LoyaltyKind TypeScript union without duplicating its IDs. */
export function extractLoyaltyKindIds(source) {
  if (typeof source !== 'string') throw new TypeError('LoyaltyKind source must be text.');
  const file = ts.createSourceFile(
    'gameSetup.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length) throw new Error('LoyaltyKind source is not valid TypeScript.');
  const aliases = file.statements.filter((statement) => ts.isTypeAliasDeclaration(statement) &&
    statement.name.text === 'LoyaltyKind');
  if (aliases.length !== 1) throw new Error('Expected exactly one canonical LoyaltyKind type alias.');

  const type = aliases[0].type;
  const members = ts.isUnionTypeNode(type) ? type.types : [type];
  const ids = members.map((member) => {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) {
      throw new Error('LoyaltyKind members must be string literal types.');
    }
    const id = member.literal.text;
    if (!id.trim()) throw new Error('LoyaltyKind IDs cannot be empty.');
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error('LoyaltyKind contains duplicate IDs.');
  return ids;
}
