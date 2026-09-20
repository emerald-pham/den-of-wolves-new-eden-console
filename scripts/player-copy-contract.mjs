import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TECHNICAL_ATTRIBUTES = new Set([
  'className', 'data-state', 'data-status', 'data-slide', 'data-slide-count',
  'htmlFor', 'id', 'key', 'role', 'type',
]);

function posix(file) {
  return file.replaceAll(path.sep, '/');
}

function productionFiles(root, sourceRoots) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx)$/.test(entry.name) &&
        !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts')) files.push(absolute);
    }
  };
  for (const sourceRoot of sourceRoots) visit(path.join(root, sourceRoot));
  return files;
}

function attributeName(ancestors) {
  const attribute = [...ancestors].reverse().find((node) => ts.isJsxAttribute(node));
  return attribute && ts.isIdentifier(attribute.name) ? attribute.name.text : undefined;
}

function technicalLiteral(node, ancestors) {
  if (ancestors.some((ancestor) =>
    (ts.isImportDeclaration(ancestor) || ts.isExportDeclaration(ancestor)) &&
      ancestor.moduleSpecifier === node)) return true;
  if (ancestors.some((ancestor) =>
    (ts.isPropertyAssignment(ancestor) || ts.isPropertySignature(ancestor) ||
      ts.isMethodDeclaration(ancestor)) && ancestor.name === node)) return true;
  const attribute = attributeName(ancestors);
  if (attribute && (TECHNICAL_ATTRIBUTES.has(attribute) || attribute.startsWith('data-'))) return true;
  // JSX text and non-technical JSX attributes are player-facing even when the
  // entire value is one lowercase word (for example, `turn`).
  if (ts.isJsxText(node) || attribute) return false;
  const text = typeof node.text === 'string' ? node.text.trim() : '';
  return Boolean(text && /^(?:--)?[a-z0-9_.:/@-]+$/.test(text));
}

function literalText(node) {
  if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) {
    return node.text;
  }
  return undefined;
}

function sourceViolations(root, absolute, rules, developerOnlyFiles) {
  const relative = posix(path.relative(root, absolute));
  if (developerOnlyFiles.has(relative)) return [];
  const source = fs.readFileSync(absolute, 'utf8');
  const sourceFile = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = [];
  const visit = (node, ancestors) => {
    const text = literalText(node);
    if (text !== undefined && text.trim() && !technicalLiteral(node, ancestors)) {
      for (const rule of rules) {
        if (rule.regex.test(text)) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          violations.push({ file: relative, line, ruleId: rule.id, text: text.trim(), guidance: rule.guidance });
        }
        rule.regex.lastIndex = 0;
      }
    }
    ts.forEachChild(node, (child) => visit(child, [...ancestors, node]));
  };
  visit(sourceFile, []);
  return violations;
}

function staticViolations(root, file, rules) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const violations = [];
  for (const rule of rules) {
    for (const match of source.matchAll(new RegExp(rule.regex.source, `${rule.regex.flags.includes('g') ? rule.regex.flags : `${rule.regex.flags}g`}`))) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      violations.push({ file, line, ruleId: rule.id, text: match[0], guidance: rule.guidance });
    }
  }
  return violations;
}

export function scanPlayerCopyContract({
  root = process.cwd(),
  contractPath = 'config/player-copy-contract.json',
} = {}) {
  const contract = JSON.parse(fs.readFileSync(path.join(root, contractPath), 'utf8'));
  const rules = contract.forbidden.map((rule) => ({
    ...rule,
    regex: new RegExp(rule.pattern, rule.flags),
  }));
  const developerOnlyFiles = new Set(contract.developerOnlyFiles);
  return [
    ...productionFiles(root, contract.sourceRoots).flatMap((file) =>
      sourceViolations(root, file, rules, developerOnlyFiles)),
    ...contract.staticFiles.flatMap((file) => staticViolations(root, file, rules)),
  ].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line ||
    left.ruleId.localeCompare(right.ruleId));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = scanPlayerCopyContract();
  if (violations.length) {
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} [${violation.ruleId}] ${JSON.stringify(violation.text)}`);
      console.error(`  ${violation.guidance}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Player-facing copy contract passed.');
  }
}
