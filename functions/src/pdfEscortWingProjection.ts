import {
  parsePdfEscortWingState,
  type PdfEscortWingState,
} from './pdfEscortWingState';

/** The only Escort Wing state placed on the member-readable session document. */
export interface PdfEscortWingMemberView {
  readonly type: 'pdf-escort-fighter-wing-view';
  readonly revision: number;
  readonly cycle: number | null;
  readonly capacity: 4;
  readonly fighters: number;
  readonly launched: boolean;
  readonly mediumResolved: boolean;
  readonly mediumActionCount: number;
  readonly shortResolved: boolean;
  readonly shortRollCount: number;
  readonly losses: number;
}

function viewFromState(state: PdfEscortWingState): PdfEscortWingMemberView {
  return Object.freeze({
    type: 'pdf-escort-fighter-wing-view',
    revision: state.revision,
    cycle: state.attackCycle,
    capacity: state.capacity,
    fighters: state.fighters,
    launched: state.launched,
    mediumResolved: state.mediumResolved,
    mediumActionCount: state.mediumActionFighterIndexes.length,
    shortResolved: state.shortResolved,
    shortRollCount: state.shortRollFighterIndexes.length,
    losses: state.losses,
  });
}

/** Strip internal action indexes and mission metadata from the member view. */
export function projectPdfEscortWingMemberView(
  value: unknown,
): PdfEscortWingMemberView | null {
  const state = parsePdfEscortWingState(value);
  return state ? viewFromState(state) : null;
}
