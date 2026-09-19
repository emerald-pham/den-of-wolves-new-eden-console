import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST_PATH = 'security/threat-model.json';

const REQUIRED_CONTROL_IDS = [
  'HOSTING_CDN',
  'APPCHECK_CLIENT',
  'CALLABLE_APPCHECK',
  'CALLABLE_INSTANCE_CAP',
  'FIRESTORE_APPCHECK',
  'JOIN_CODE_FORMAT',
  'JOIN_CODE_LOOKUP',
  'JOIN_CODE_COLLISION',
  'JOIN_CODE_LIMITER',
  'FIRESTORE_RULES',
  'CALLABLE_AUTHORIZATION',
  'COMMAND_REPLAY',
];

const REQUIRED_THREAT_IDS = [
  'SESSION_CODE_GUESSING',
  'SESSION_CODE_DISCLOSURE',
  'SESSION_CODE_ENUMERATION',
  'SESSION_CODE_COLLISION',
  'HOSTING_FLOOD',
  'CALLABLE_RESOURCE_EXHAUSTION',
  'FIRESTORE_DIRECT_ABUSE',
  'RETRY_REPLAY',
];

const REQUIRED_PROPERTIES = [
  'server-authority',
  'authorization',
  'replay-resistance',
  'privacy',
  'input-validation',
];

const REQUIRED_RISK_PROPERTIES = [
  'availability',
  'abuse-reduction',
  'resource-containment',
];

const KNOWN_PROPERTIES = [...REQUIRED_PROPERTIES, ...REQUIRED_RISK_PROPERTIES];

// This digest binds every control ID to its exact verification mode, source
// anchors, and focused test anchors. Contributors may update the manifest and
// this contract together through review; accidental relabeling cannot pass.
const CONTROL_EVIDENCE_CONTRACT_SHA256 =
  '319dd73550eacba97210cde15c691370c05af28b220bcdd978c77d2a2dcd98c2';

const GOVERNANCE_WORKFLOW_TRIGGERS = [
  'CLAUDE.md',
  'docs/WORKTREE_COORDINATION.md',
  'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
];

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameMembers(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export async function validateThreatModel({ root = process.cwd(), manifest, sourceOverrides = {} } = {}) {
  const errors = [];
  const manifestFile = resolve(root, MANIFEST_PATH);
  let model = manifest;
  if (!model) {
    try {
      model = JSON.parse(await readFile(manifestFile, 'utf8'));
    } catch (error) {
      return [`${MANIFEST_PATH}: ${error instanceof Error ? error.message : String(error)}`];
    }
  }

  if (model?.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (model?.scope?.runtimeBehaviorChange !== false) {
    errors.push('scope.runtimeBehaviorChange must remain false for Prompt 667.');
  }
  if (model?.scope?.platformLimitChange !== false) {
    errors.push('scope.platformLimitChange must remain false for Prompt 667.');
  }
  if (!sameMembers(array(model?.scope?.protectedProperties), REQUIRED_PROPERTIES)) {
    errors.push(`scope.protectedProperties must map exactly: ${REQUIRED_PROPERTIES.join(', ')}.`);
  }
  if (!sameMembers(array(model?.scope?.riskProperties), REQUIRED_RISK_PROPERTIES)) {
    errors.push(`scope.riskProperties must map exactly: ${REQUIRED_RISK_PROPERTIES.join(', ')}.`);
  }
  if (model?.trustModel?.contributors !== 'trusted' || model?.trustModel?.buildPipeline !== 'trusted') {
    errors.push('trustModel must keep contributors and the build pipeline trusted.');
  }
  if (model?.trustModel?.contributorOutput !== 'untrusted-until-independent-review-and-release-gate') {
    errors.push('trustModel must retain independent review and release-gate acceptance.');
  }
  if (model?.trustModel?.independentReviewReceipt !== 'exact-head-structured-receipt-required' ||
      model?.trustModel?.releaseGate !==
        'coordination-validation-and-finish-enforce-receipt-for-security-governance-change') {
    errors.push('trustModel must name the enforced exact-head coordination review and release gate.');
  }
  const outOfScope = array(model?.outOfScope);
  for (const boundary of ['malicious-contributor', 'deliberate-commit-forgery', 'deliberate-history-forgery']) {
    if (!outOfScope.includes(boundary)) errors.push(`outOfScope is missing ${boundary}.`);
  }
  if (array(model?.gapPolicy?.demonstratedRuntimeGaps).length > 0) {
    errors.push('Demonstrated runtime gaps require a separately registered feature prompt.');
  }
  if (model?.gapPolicy?.forbidEquivalentControlDuplicationWithoutOwnerDecision !== true) {
    errors.push('gapPolicy must forbid equivalent-control duplication without an owner decision.');
  }

  const controls = array(model?.controls);
  const controlIds = controls.map((control) => control?.id).filter(nonEmptyString);
  if (controlIds.length !== new Set(controlIds).size) errors.push('Control IDs must be unique.');
  if (!sameMembers(controlIds, REQUIRED_CONTROL_IDS)) {
    errors.push(`controls must inventory exactly: ${REQUIRED_CONTROL_IDS.join(', ')}.`);
  }
  const evidenceContract = controls.map((control) => ({
    id: control?.id,
    verificationMode: control?.verificationMode,
    sourceChecks: control?.sourceChecks,
    testChecks: control?.testChecks,
  }));
  const evidenceDigest = createHash('sha256')
    .update(JSON.stringify(evidenceContract))
    .digest('hex');
  if (evidenceDigest !== CONTROL_EVIDENCE_CONTRACT_SHA256) {
    errors.push('Control evidence differs from the reviewed per-control source/test contract.');
  }

  const sourceCache = new Map();
  async function source(file) {
    if (!sourceCache.has(file)) {
      const override = Object.prototype.hasOwnProperty.call(sourceOverrides, file)
        ? Promise.resolve(String(sourceOverrides[file]))
        : readFile(resolve(root, file), 'utf8');
      sourceCache.set(file, override.catch((error) => {
        errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
        return '';
      }));
    }
    return sourceCache.get(file);
  }

  const governanceFiles = array(model?.governanceAudit?.files);
  if (!sameMembers(governanceFiles.map((entry) => entry?.file).filter(nonEmptyString), GOVERNANCE_WORKFLOW_TRIGGERS)) {
    errors.push(`governanceAudit.files must inventory exactly: ${GOVERNANCE_WORKFLOW_TRIGGERS.join(', ')}.`);
  }
  const forbiddenAssumptions = array(model?.governanceAudit?.forbiddenAssumptions);
  if (!sameMembers(forbiddenAssumptions, ['malicious contributor', 'commit forgery', 'history forgery'])) {
    errors.push('governanceAudit.forbiddenAssumptions must retain the discarded attacker assumptions.');
  }
  for (const entry of governanceFiles) {
    if (!nonEmptyString(entry?.file) || !nonEmptyString(entry?.requiredContains)) {
      errors.push('Every governance audit entry requires a file and requiredContains text.');
      continue;
    }
    const contents = await source(entry.file);
    if (!normalizeWhitespace(contents).includes(normalizeWhitespace(entry.requiredContains))) {
      errors.push(`${entry.file}: missing governance simplification ${JSON.stringify(entry.requiredContains)}.`);
    }
    const lowered = contents.toLowerCase();
    for (const assumption of forbiddenAssumptions) {
      if (lowered.includes(assumption.toLowerCase())) {
        errors.push(`${entry.file}: reintroduces out-of-scope assumption ${JSON.stringify(assumption)}.`);
      }
    }
  }
  const workflow = await source('.github/workflows/ci.yml');
  for (const trigger of GOVERNANCE_WORKFLOW_TRIGGERS) {
    const occurrences = workflow.split(`- '${trigger}'`).length - 1;
    if (occurrences !== 2) {
      errors.push(`.github/workflows/ci.yml: ${trigger} must trigger both pull_request and push validation.`);
    }
  }

  for (const control of controls) {
    if (!nonEmptyString(control?.id) || !nonEmptyString(control?.title)) {
      errors.push('Every control requires a non-empty id and title.');
      continue;
    }
    if (!nonEmptyString(control.verificationMode)) {
      errors.push(`${control.id}: verificationMode is required.`);
    }
    const properties = array(control.properties);
    if (properties.length === 0 || properties.some((property) => !KNOWN_PROPERTIES.includes(property))) {
      errors.push(`${control.id}: properties must be non-empty and use declared property IDs.`);
    }
    const checks = array(control.sourceChecks);
    if (checks.length === 0) errors.push(`${control.id}: at least one source check is required.`);
    for (const check of checks) {
      if (!nonEmptyString(check?.file) || array(check?.contains).length === 0) {
        errors.push(`${control.id}: each source check requires a file and non-empty contains list.`);
        continue;
      }
      const contents = await source(check.file);
      for (const needle of check.contains) {
        if (!nonEmptyString(needle) || !contents.includes(needle)) {
          errors.push(`${control.id}: ${check.file} is missing ${JSON.stringify(needle)}.`);
        }
      }
    }
    const testChecks = array(control.testChecks);
    if (control.verificationMode === 'source-and-test' && testChecks.length === 0) {
      errors.push(`${control.id}: source-and-test controls require focused test anchors.`);
    }
    for (const testCheck of testChecks) {
      if (!nonEmptyString(testCheck?.file) || array(testCheck?.contains).length === 0) {
        errors.push(`${control.id}: each test check requires a file and non-empty contains list.`);
        continue;
      }
      const contents = await source(testCheck.file);
      for (const needle of testCheck.contains) {
        if (!nonEmptyString(needle) || !contents.includes(needle)) {
          errors.push(`${control.id}: ${testCheck.file} is missing test anchor ${JSON.stringify(needle)}.`);
        }
      }
    }
  }

  const threats = array(model?.threats);
  const threatIds = threats.map((threat) => threat?.id).filter(nonEmptyString);
  if (threatIds.length !== new Set(threatIds).size) errors.push('Threat IDs must be unique.');
  if (!sameMembers(threatIds, REQUIRED_THREAT_IDS)) {
    errors.push(`threats must map exactly: ${REQUIRED_THREAT_IDS.join(', ')}.`);
  }
  const validControls = new Set(controlIds);
  const usedControls = new Set();
  for (const threat of threats) {
    const mappings = array(threat?.controlIds);
    if (mappings.length === 0) errors.push(`${threat?.id ?? 'unknown threat'}: no controls mapped.`);
    for (const controlId of mappings) {
      if (!validControls.has(controlId)) errors.push(`${threat.id}: unknown control ${controlId}.`);
      usedControls.add(controlId);
    }
    if (threat?.status === 'bounded-residual-risk' || threat?.status === 'bounded-existing-product-boundary') {
      if (!nonEmptyString(threat.residualRisk)) errors.push(`${threat.id}: bounded risk requires residualRisk.`);
    } else if (threat?.status !== 'controlled-existing-baseline') {
      errors.push(`${threat?.id ?? 'unknown threat'}: unsupported status ${JSON.stringify(threat?.status)}.`);
    }
  }
  for (const controlId of controlIds) {
    if (!usedControls.has(controlId)) errors.push(`${controlId}: control is not mapped to an in-scope threat.`);
  }
  const coveredProperties = new Set(controls.flatMap((control) => array(control.properties)));
  for (const property of REQUIRED_PROPERTIES) {
    if (!coveredProperties.has(property)) errors.push(`Protected property ${property} has no control.`);
  }
  return errors;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const errors = await validateThreatModel();
  if (errors.length > 0) {
    console.error(`Threat-model validation failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`Threat-model validation passed: ${REQUIRED_THREAT_IDS.length} threats mapped to ${REQUIRED_CONTROL_IDS.length} controls.`);
  }
}
