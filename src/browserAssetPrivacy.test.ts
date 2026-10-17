// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { SHIP_DAMAGE_DECKS } from '../functions/src/shipDamage';

const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const fingerprint = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
const deckFingerprints = new Set(Object.values(SHIP_DAMAGE_DECKS).map(fingerprint));
const cardFingerprints = new Set(Object.values(SHIP_DAMAGE_DECKS).flat().map(fingerprint));

// Inspect executable literal content, independent of import names and minified
// bindings. Never put the matching private values into assertion diagnostics.
function literal(node: ts.Node): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return !literal(node.operand);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) ||
        (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) throw Error('dynamic property');
    return [property.name.text, literal(property.initializer)];
  }));
  throw Error('dynamic expression');
}

function executableExposure(code: string): { decks: number; cards: number } {
  const program = ts.createSourceFile('browser.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const diagnostics = (program as ts.SourceFile & { parseDiagnostics: readonly unknown[] }).parseDiagnostics;
  expect(diagnostics).toHaveLength(0);
  const decks = new Set<string>();
  const cards = new Set<string>();
  const walk = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) {
      try {
        const hash = fingerprint(literal(node));
        if (deckFingerprints.has(hash)) decks.add(hash);
        if (cardFingerprints.has(hash)) cards.add(hash);
      } catch { /* Dynamic expressions are not static catalog literals. */ }
    }
    ts.forEachChild(node, walk);
  };
  walk(program);
  return { decks: decks.size, cards: cards.size };
}

it('detects private card content even with anonymous bindings and reordered object properties', () => {
  const deck = Object.values(SHIP_DAMAGE_DECKS)[0].map((card) =>
    Object.fromEntries(Object.entries(card).reverse()));
  const detected = executableExposure(`(()=>{const a=${JSON.stringify(deck)};return a})()`);
  expect(detected.decks).toBe(1);
  expect(detected.cards).toBeGreaterThan(0);
  expect(executableExposure('const publicState={damagedSystemIds:[],destroyed:false};'))
    .toEqual({ decks: 0, cards: 0 });
});

it('keeps private damage content out of every full production executable and diagnostic map', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  // Keep the complete configured multi-entry production graph; the scene-only
  // regression has a different, narrower consumer boundary and stays intact.
  const result = await build({ root, logLevel: 'silent', build: { write: false } });
  const bundles = Array.isArray(result) ? result : [result];
  const emitted = bundles.flatMap((bundle) => 'output' in bundle ? bundle.output : []);
  expect(emitted.filter((file) => file.fileName.endsWith('.html')).length).toBeGreaterThan(1);
  expect(emitted.filter((file) => file.fileName.endsWith('.map')).length).toBeGreaterThan(0);
  const privateModule = /(?:^|\/)functions\/src\/(?:shipDamage|consoleMetadata)\.ts$/;
  const exposures: { file: string; decks?: number; cards?: number; privateModules?: number }[] = [];
  for (const file of emitted) {
    if (file.type === 'chunk') {
      const content = executableExposure(file.code);
      const privateModules = Object.entries(file.modules).filter(([id, contribution]) =>
        privateModule.test(id) && contribution.renderedLength > 0).length;
      if (content.decks || content.cards || privateModules) exposures.push({ file: file.fileName, ...content, privateModules });
    } else if (file.fileName.endsWith('.map')) {
      const map: { sources: string[]; sourcesContent?: (string | null)[] } = JSON.parse(String(file.source));
      const privateModules = map.sources.filter((source, index) => privateModule.test(source) ||
        /\b(?:SHIP_DAMAGE_DECKS|CONSOLE_METADATA)\b/.test(map.sourcesContent?.[index] ?? '')).length;
      if (privateModules) exposures.push({ file: file.fileName, privateModules });
    }
  }
  let evidence = '';
  if (exposures.length) {
    evidence = await mkdtemp(join(tmpdir(), 'bp1-private-production-'));
    for (const file of emitted) {
      const target = join(evidence, file.fileName);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.type === 'chunk' ? file.code : file.source);
    }
  }
  expect(exposures, `Failed full production output retained privately at ${evidence}`).toEqual([]);
}, 60_000);
