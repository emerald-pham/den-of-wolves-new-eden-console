import type { PdfEscortWingMemberView } from '@/types/game';

const INITIAL_PDF_ESCORT_WING_VIEW: PdfEscortWingMemberView = Object.freeze({
  type: 'pdf-escort-fighter-wing-view',
  revision: 0,
  capacity: 4,
  fighters: 4,
  launched: false,
  mediumResolved: false,
  mediumActionCount: 0,
  shortResolved: false,
  shortRollCount: 0,
  losses: 0,
});

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Parse only the intentionally small member-readable Escort Wing view. */
export function parsePdfEscortWingMemberView(
  value: unknown,
): PdfEscortWingMemberView | undefined {
  if (value === undefined) return INITIAL_PDF_ESCORT_WING_VIEW;
  const raw = record(value);
  if (!raw || !exactKeys(raw, [
    'type', 'revision', 'capacity', 'fighters', 'launched', 'mediumResolved',
    'mediumActionCount', 'shortResolved', 'shortRollCount', 'losses',
  ]) || raw.type !== 'pdf-escort-fighter-wing-view' || raw.capacity !== 4 ||
      !nonNegativeInteger(raw.revision) || !nonNegativeInteger(raw.fighters) ||
      raw.fighters > 4 || !nonNegativeInteger(raw.losses) || raw.losses > 4 ||
      raw.losses !== 4 - raw.fighters || typeof raw.launched !== 'boolean' ||
      typeof raw.mediumResolved !== 'boolean' ||
      !nonNegativeInteger(raw.mediumActionCount) || raw.mediumActionCount > 4 ||
      typeof raw.shortResolved !== 'boolean' ||
      !nonNegativeInteger(raw.shortRollCount) || raw.shortRollCount > 4 ||
      raw.mediumResolved !== (raw.mediumActionCount > 0) ||
      raw.shortResolved !== (raw.shortRollCount > 0) ||
      (raw.launched && raw.revision < 1) ||
      (!raw.launched && (raw.revision !== 0 || raw.fighters !== 4 || raw.losses !== 0 ||
        raw.mediumResolved || raw.shortResolved))) return undefined;

  return Object.freeze({
    type: 'pdf-escort-fighter-wing-view',
    revision: raw.revision as number,
    capacity: 4,
    fighters: raw.fighters as number,
    launched: raw.launched,
    mediumResolved: raw.mediumResolved,
    mediumActionCount: raw.mediumActionCount as number,
    shortResolved: raw.shortResolved,
    shortRollCount: raw.shortRollCount as number,
    losses: raw.losses as number,
  });
}

export function initialPdfEscortWingMemberView(): PdfEscortWingMemberView {
  return INITIAL_PDF_ESCORT_WING_VIEW;
}
