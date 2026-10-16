import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Firestore, DocumentSnapshot, type DocumentReference } from '@google-cloud/firestore';
import ts from 'typescript';

// Execute the original Source projection against real locally constructed SDK
// snapshots. No get(), commit(), callable, Auth, emulator or network is invoked.
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const helperBegin = source.indexOf('function normalizedResponsibilities(');
const helperEnd = source.indexOf('export const setFacilitatorResponsibility', helperBegin);
const projectionBegin = source.indexOf('    const nextInstances = liveInstances.map((candidate) => ({', helperEnd);
const projectionEnd = source.indexOf('    const reply = {', projectionBegin);
if (helperBegin < 0 || helperEnd <= helperBegin || projectionBegin < 0 || projectionEnd <= projectionBegin) {
  throw new Error('Bind the actual responsibility Source projection before running regressions.');
}
const executable = ts.transpileModule(
  "type FacilitatorResponsibility = 'main' | 'assistant';\n" + source.slice(helperBegin, helperEnd) +
  '\nfunction projectCoverage(liveInstances, nextByInstance) {\n' +
  source.slice(projectionBegin, projectionEnd) + '\nreturn responsibilityCoverage(nextInstances);\n}\n',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
type Coverage = { main: string[]; assistant: string[] };
const projectCoverage = new Function(executable + '\nreturn projectCoverage;')() as
  (instances: readonly DocumentSnapshot[], lanes: ReadonlyMap<string, readonly string[]>) => Coverage;
const firestore = new Firestore({ projectId: 'demo-pc10-snapshot-source-unit' });
const locally = DocumentSnapshot as unknown as {
  fromObject(ref: DocumentReference, fields: Record<string, unknown>): DocumentSnapshot;
};
function snapshot(id: string, lanes: string[]) {
  return locally.fromObject(firestore.doc('sessions/synthetic/gmInstances/' + id), {
    responsibilities: lanes, responsibility: lanes[0] ?? null,
  });
}
const gmA = snapshot('gm-a', ['main', 'assistant']), gmB = snapshot('gm-b', []);
const scenarios = [
  { name: 'share', lanes: new Map([['gm-a', ['main', 'assistant']], ['gm-b', ['assistant']]]),
    coverage: { main: ['gm-a'], assistant: ['gm-a', 'gm-b'] } },
  { name: 'drop', lanes: new Map([['gm-a', ['main']], ['gm-b', ['assistant']]]),
    coverage: { main: ['gm-a'], assistant: ['gm-b'] } },
  { name: 'handoff', lanes: new Map([['gm-a', ['main', 'assistant']], ['gm-b', []]]),
    coverage: { main: ['gm-a'], assistant: ['gm-a'] } },
];

describe('real SDK snapshot IDs in facilitator responsibility replies', () => {
  it('bridge: the actual SDK has readable inherited IDs and accepts locally serialized original snapshots', () => {
    expect(gmA).toBeInstanceOf(DocumentSnapshot);
    expect(gmA.id).toBe('gm-a'); expect(gmB.id).toBe('gm-b');
    expect(Object.hasOwn(gmA, 'id')).toBe(false);
    expect({ ...gmA }).not.toHaveProperty('id');
    expect(gmA.get('responsibilities')).toEqual(['main', 'assistant']);
    expect(() => firestore.batch().set(firestore.doc('nativeFixtures/bridge'), {
      originalCoverage: { main: [gmA.id], assistant: [gmA.id] },
    })).not.toThrow();
  });

  for (const scenario of scenarios) {
    it(scenario.name + ' retains both original SDK instance identities in exact next coverage', () => {
      const coverage = projectCoverage([gmA, gmB], scenario.lanes);
      expect(coverage).toEqual(scenario.coverage);
      expect([...coverage.main, ...coverage.assistant].every(id => typeof id === 'string' && id.length > 0)).toBe(true);
      expect(gmA.get('responsibilities')).toEqual(['main', 'assistant']);
      expect(gmB.get('responsibilities')).toEqual([]);
    });
  }

  it('the sole live original SDK instance retains both printed lane coverage IDs', () => {
    const coverage = projectCoverage([gmA], new Map([['gm-a', ['main', 'assistant']]]));
    expect(coverage).toEqual({ main: ['gm-a'], assistant: ['gm-a'] });
  });

  for (const scenario of scenarios) {
    it(scenario.name + ' produces reply and command-marker payloads accepted by the actual SDK serializer', () => {
      const reply = { status: 'committed', requestId: 'synthetic-' + scenario.name,
        setupRevision: 38, responsibilities: scenario.lanes.get('gm-a'),
        coverage: projectCoverage([gmA, gmB], scenario.lanes) };
      expect(() => firestore.batch().set(firestore.doc('nativeFixtures/' + scenario.name), {
        reply, result: reply,
      })).not.toThrow();
    });
  }
});
