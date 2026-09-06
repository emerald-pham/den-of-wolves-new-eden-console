import { describe, expect, it } from 'vitest';
import { normalizePressDispatch } from './pressDispatchState';

describe('press dispatch state', () => {
  it('keeps every active dispatch and the collection revision', () => {
    expect(normalizePressDispatch({
      dispatches: [
        { id: 'dispatch-1', text: 'SNN // First report' },
        { id: 'dispatch-2', text: 'SNN // Second report' },
      ],
      revision: 4,
    })).toEqual({
      dispatches: [
        { id: 'dispatch-1', text: 'SNN // First report' },
        { id: 'dispatch-2', text: 'SNN // Second report' },
      ],
      revision: 4,
    });
  });

  it('presents a legacy single dispatch as an active dispatch', () => {
    expect(normalizePressDispatch({
      text: 'SNN // Existing report', revision: 3,
    })).toEqual({
      dispatches: [{ id: 'legacy-3', text: 'SNN // Existing report' }],
      revision: 3,
    });
  });

  it('falls back to an empty initial state for absent or malformed data', () => {
    expect(normalizePressDispatch(undefined)).toEqual({ dispatches: [], revision: 0 });
    expect(normalizePressDispatch({ dispatches: [{ id: '', text: 'Bad' }], revision: -1 }))
      .toEqual({ dispatches: [], revision: 0 });
  });
});
