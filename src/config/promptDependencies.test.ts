import { describe, expect, it } from 'vitest';
import type { PromptCatalog, PromptRecord } from '../../scripts/prompt-catalog.mjs';
import {
  CATALOG_PATH,
  buildPromptDispatch,
  loadPromptCatalog,
  stableCatalogJson,
  validatePromptCatalog,
} from '../../scripts/prompt-catalog.mjs';
import {
  createDependencyPacket,
  formatDependencyPacket,
  loadDependencySources,
} from '../../scripts/prompt-dependencies.mjs';

const root = process.cwd();
const catalog = loadPromptCatalog({ cwd: root });

function fixtureCatalog() {
  const prompt = (id: string, status: PromptRecord['status'], extras: Partial<PromptRecord> = {}) => ({
    id,
    section: 'Fixture',
    tag: 'PROVE',
    definition: { title: `Fixture ${id}.`, acceptance: `Prompt ${id} is proven.` },
    status,
    changeClass: 'non-feature',
    releases: [],
    description: `Fixture evidence for ${id}.`,
    hardPromptPrerequisites: 'none',
    hardMilestone: 'none',
    hardContract: 'none',
    decisionOwner: 'none',
    closureEvidenceGates: 'none',
    sequenceRules: 'none',
    releaseBoundaries: 'none',
    relatedConsumes: 'none',
    evidenceIds: 'none',
    milestoneHints: 'M1',
    ...extras,
  } satisfies PromptRecord);
  return {
    schemaVersion: 2,
    catalogPath: CATALOG_PATH,
    retiredPromptIds: ['071'],
    prompts: [
      prompt('001', 'done'),
      prompt('002', 'partial', { hardPromptPrerequisites: '001', evidenceIds: 'E-002' }),
      prompt('003', 'missing', { hardPromptPrerequisites: '002', evidenceIds: 'E-003' }),
      prompt('004', 'missing', { hardMilestone: 'M1', evidenceIds: 'E-004' }),
    ],
    evidence: [
      { id: 'E-002', type: 'hard_prompt', direction: '002 -> 001', source: 'fixture', language: 'fixture' },
      { id: 'E-003', type: 'hard_prompt', direction: '003 -> 002', source: 'fixture', language: 'fixture' },
      { id: 'E-004', type: 'hard_milestone', direction: '004 -> M1', source: 'fixture', language: 'fixture' },
    ],
    sequences: [],
    plan: { wolfAttackSequence: null },
  } satisfies PromptCatalog;
}

describe('read-only dependency lookup', () => {
  it('loads only the catalog and preserves dependency readiness checks', () => {
    const sources = loadDependencySources(root);
    expect(Object.keys(sources)).toEqual(['catalogSource', 'catalog']);
    expect(sources.catalog.prompts).toHaveLength(catalog.prompts.length);

    const fixture = fixtureCatalog();
    expect(validatePromptCatalog(fixture)).toEqual([]);
    const dispatch = buildPromptDispatch(fixture);
    expect(dispatch.readyQueue.map(({ prompt }) => prompt)).toContain('002');
    const blocked = dispatch.blocked.find(({ prompt }) => prompt === '003');
    expect((blocked?.reasons as string[] | undefined)?.join(' ')).toMatch(/002=partial/);
    expect(dispatch.needsConfirmation.map(({ prompt }) => prompt)).toContain('004');
  });

  it('returns deterministic compact, full, and JSON packets without artifact binding', () => {
    const packet = createDependencyPacket({ prompt: '012', catalog });
    expect(packet.readiness).toBe('done');
    expect(packet).not.toHaveProperty('binding');
    expect(packet).not.toHaveProperty('fingerprint');
    expect(packet).not.toHaveProperty('artifact');

    const compact = formatDependencyPacket(packet);
    const full = formatDependencyPacket(packet, { full: true });
    const json = formatDependencyPacket(packet, { json: true });
    expect(compact).toContain('next_is_advisory: true');
    expect(full).toContain('READY_QUEUE');
    expect(JSON.parse(json)).toEqual(packet);
    expect(formatDependencyPacket(packet)).toBe(compact);
    expect(formatDependencyPacket(packet, { full: true })).toBe(full);
    expect(stableCatalogJson(packet)).toBe(stableCatalogJson(JSON.parse(json)));
  });

  it('can inspect a blocked prompt without mutating or inventing completion state', () => {
    const packet = createDependencyPacket({ prompt: '020a', catalog });
    expect(packet.readiness).toBe('blocked');
    expect(packet.selected.status).toBe('missing');
    const prerequisites = packet.selected.prerequisites as Array<{ id: string; status: string }>;
    expect(prerequisites.some(({ id, status }) => id === '075' && status === 'partial')).toBe(true);
    expect(packet.next).toBe('063');
  });
});
