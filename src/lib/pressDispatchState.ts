import type { PressDispatchState } from '@/types/game';

const EMPTY_PRESS_DISPATCH: PressDispatchState = { dispatches: [], revision: 0 };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Convert persisted legacy copy and current Firestore state to one active-list shape. */
export function normalizePressDispatch(value: unknown): PressDispatchState {
  if (!record(value) || !revision(value.revision)) return EMPTY_PRESS_DISPATCH;
  if (typeof value.text === 'string' && value.text.length > 0) {
    return {
      dispatches: [{ id: `legacy-${value.revision}`, text: value.text }],
      revision: value.revision,
    };
  }
  if (!Array.isArray(value.dispatches)) return EMPTY_PRESS_DISPATCH;
  const dispatches = value.dispatches.flatMap((dispatch) => {
    if (
      !record(dispatch) || typeof dispatch.id !== 'string' || dispatch.id.length === 0 ||
      typeof dispatch.text !== 'string' || dispatch.text.length === 0
    ) return [];
    return [{ id: dispatch.id, text: dispatch.text }];
  });
  if (dispatches.length !== value.dispatches.length) return EMPTY_PRESS_DISPATCH;
  return { dispatches, revision: value.revision };
}
