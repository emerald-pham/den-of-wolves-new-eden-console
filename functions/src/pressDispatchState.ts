export interface ActivePressDispatch {
  readonly id: string;
  readonly text: string;
}

export interface PressDispatchState {
  readonly dispatches: readonly ActivePressDispatch[];
  readonly revision: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Read both the released single-copy shape and the active dispatch collection. */
export function pressDispatchState(value: unknown): PressDispatchState {
  if (!record(value) || !revision(value.revision)) return { dispatches: [], revision: 0 };
  if (typeof value.text === 'string' && value.text.length > 0) {
    return {
      dispatches: [{ id: `legacy-${value.revision}`, text: value.text }],
      revision: value.revision,
    };
  }
  if (!Array.isArray(value.dispatches)) return { dispatches: [], revision: 0 };
  const dispatches = value.dispatches.flatMap((dispatch) => {
    if (
      !record(dispatch) || typeof dispatch.id !== 'string' || dispatch.id.length === 0 ||
      typeof dispatch.text !== 'string' || dispatch.text.length === 0
    ) return [];
    return [{ id: dispatch.id, text: dispatch.text }];
  });
  if (dispatches.length !== value.dispatches.length) return { dispatches: [], revision: 0 };
  return { dispatches, revision: value.revision };
}
