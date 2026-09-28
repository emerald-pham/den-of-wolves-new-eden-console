import type { ReactNode } from 'react';
import type { PressDispatch } from '@/types/game';

const MAX_DISPATCH_LENGTH = 220;

/**
 * Presentation-only Press desk. State and actions arrive through props so a
 * review scene can render synthetic records without importing live services.
 */
export function PressDispatchDesk({
  operatorShort,
  dispatches,
  text,
  authorized,
  connectionReady,
  sending,
  dismissingId,
  notice,
  status,
  eventLog,
  onTextChange,
  onPublish,
  onDismiss,
}: {
  readonly operatorShort: string;
  readonly dispatches: readonly PressDispatch[];
  readonly text: string;
  readonly authorized: boolean;
  readonly connectionReady: boolean;
  readonly sending: boolean;
  readonly dismissingId: string | null;
  readonly notice: string;
  readonly status: string;
  readonly eventLog?: ReactNode;
  readonly onTextChange: (value: string) => void;
  readonly onPublish: () => void;
  readonly onDismiss: (dispatchId: string) => void;
}) {
  return (
    <section className="press-dispatch cic-frame" aria-label="Press dispatch desk">
      <p className="press-dispatch__eyebrow">{operatorShort} // Fleet press ticker</p>
      <h2>Dispatch desk</h2>
      <form onSubmit={(event) => {
        event.preventDefault();
        onPublish();
      }}>
        <label htmlFor="press-dispatch">Dispatch</label>
        <div className="press-dispatch__copy">
          <span aria-hidden="true">SNN //</span>
          <textarea
            id="press-dispatch"
            maxLength={MAX_DISPATCH_LENGTH}
            rows={4}
            value={text}
            disabled={!authorized}
            onChange={(event) => onTextChange(event.target.value)}
          />
        </div>
        <button className="cic-action-button" type="submit"
          disabled={!authorized || !connectionReady || sending || dismissingId !== null || !text.trim()}>
          {sending ? 'Transmitting' : 'Publish dispatch'}
        </button>
      </form>
      <div className="press-dispatch__current">
        <p className="press-dispatch__current-heading">
          Current dispatches // {dispatches.length}
        </p>
        {dispatches.length > 0 ? (
          <ul className="press-dispatch__current-list">
            {dispatches.map((dispatch) => (
              <li className="press-dispatch__current-item" key={dispatch.id}>
                <p className="press-dispatch__current-copy">{dispatch.text}</p>
                <button
                  aria-label={`Dismiss dispatch: ${dispatch.text}`}
                  className="cic-action-button"
                  type="button"
                  disabled={!authorized || !connectionReady || sending || dismissingId !== null}
                  onClick={() => onDismiss(dispatch.id)}
                >
                  {dismissingId === dispatch.id ? 'Dismissing' : 'Dismiss dispatch'}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="press-dispatch__empty">No active dispatches</p>}
      </div>
      {eventLog}
      <p className="press-dispatch__status" aria-live="polite">
        {notice || status}
      </p>
    </section>
  );
}
