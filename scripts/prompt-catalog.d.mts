export interface PromptDefinition {
  readonly title: string;
  readonly acceptance: string;
}

export interface PromptRecord {
  readonly id: string;
  readonly section: string;
  readonly tag: string;
  readonly definition: PromptDefinition;
  readonly status: 'done' | 'partial' | 'missing' | 'blocked' | 'in-progress';
  readonly changeClass: 'feature' | 'non-feature';
  readonly releases: readonly string[];
  readonly description: string;
  readonly hardPromptPrerequisites: string;
  readonly hardMilestone: string;
  readonly hardContract: string;
  readonly decisionOwner: string;
  readonly closureEvidenceGates: string;
  readonly sequenceRules: string;
  readonly releaseBoundaries: string;
  readonly relatedConsumes: string;
  readonly evidenceIds: string;
  readonly milestoneHints: string;
}

export interface PromptCatalog {
  readonly schemaVersion: number;
  readonly catalogPath: string;
  readonly retiredPromptIds: readonly string[];
  readonly prompts: readonly PromptRecord[];
  readonly evidence: readonly Readonly<Record<string, unknown>>[];
  readonly sequences: readonly Readonly<Record<string, unknown>>[];
  readonly plan: Readonly<{ wolfAttackSequence: string | null }>;
}

export const CATALOG_PATH: string;
export const PROMPT_CATALOG_SCHEMA_VERSION: number;
export const GENERATED_VIEW_MARKERS: Readonly<Record<string, Readonly<{ begin: string; end: string }>>>;

export function normalizePromptId(value: number | string): string | null;
export function stableCatalogJson(value: unknown, spacing?: number): string;
export function formatPromptDefinition(prompt: PromptRecord): string;
export function promptTitle(prompt: PromptRecord): string;
export function validatePromptCatalog(catalog: unknown): string[];
export function extractPromptCatalog(sources: {
  readonly planSource?: string;
  readonly progressSource?: string;
  readonly dependencySource?: string;
  readonly milestonesSource?: string;
}): PromptCatalog;
export function loadPromptCatalog(options?: {
  readonly cwd?: string;
  readonly path?: string;
  readonly source?: string;
}): PromptCatalog;
export function expandPromptTargets(
  value: string,
  knownPrompts: Iterable<string>,
  errors?: string[],
  label?: string,
  retired?: readonly string[],
): string[];
export function deriveProgressSummary(catalog: PromptCatalog): Readonly<{
  complete: number;
  total: number;
  partial: number;
  missing: number;
  blocked: number;
  inProgress: number;
  resumePrompt: string | null;
  activePrompt: string | null;
  counts: Readonly<Record<string, number>>;
}>;
export function buildPromptDispatch(catalog: PromptCatalog): Readonly<{
  readyQueue: readonly Readonly<Record<string, unknown>>[];
  needsConfirmation: readonly Readonly<Record<string, unknown>>[];
  blocked: readonly Readonly<Record<string, unknown>>[];
  next: string | null;
}>;
export function selectPrompt(catalog: PromptCatalog, value: number | string): Readonly<Record<string, unknown>>;
export function renderPromptViews(catalog: PromptCatalog): Readonly<{
  plan: string;
  progress: string;
  dependency: string;
}>;
export function updatePromptViews(options: {
  readonly sources: Readonly<Record<string, string>>;
  readonly catalog: PromptCatalog;
}): Readonly<{
  plan: string;
  progress: string;
  dependency: string;
  milestones: string;
}>;
export function readLegacyPromptSources(cwd?: string): Readonly<{
  plan: string;
  progress: string;
  dependency: string;
  milestones: string;
}>;
