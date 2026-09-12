import { useState, type FormEvent } from 'react';
import type { Shuttlecraft } from '@/data/shuttles';
import { dismissPressDispatch, publishPressDispatch } from '@/lib/pressDispatchService';
import { normalizePressDispatch } from '@/lib/pressDispatchState';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { isGameplayLockedAtTurnZero } from '@/lib/gameContext';
import { normalizeCommandError } from '@/lib/commandErrors';

const MAX_DISPATCH_LENGTH = 220;

export default function PressDispatch({ shuttle }: {
  readonly shuttle: Pick<Shuttlecraft, 'captainRoleId' | 'operatorShort'>;
}) {
  const me = useSessionStore((state) => state.me);
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const isGm = useSessionStore(selectIsGm);
  const dispatchState = session?.pressDispatch;
  const current = normalizePressDispatch(dispatchState).dispatches;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const hasPressAuthority = me?.activeConsoleRoleId === shuttle.captainRoleId;
  const turnZeroLocked = isGameplayLockedAtTurnZero(session, isGm);
  const authorized = hasPressAuthority && !turnZeroLocked && session?.phase !== 'debrief' && session?.phase !== 'closed';

  async function publish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const dispatch = text.trim();
    if (!authorized || connection !== 'live' || sending || !dispatch) return;
    setSending(true);
    setNotice('');
    try {
      await publishPressDispatch(dispatch);
      setText('');
      setNotice('Dispatch transmitted');
    } catch (cause) {
      setNotice(normalizeCommandError(cause).message);
    } finally {
      setSending(false);
    }
  }

  async function dismiss(dispatchId: string): Promise<void> {
    if (!authorized || connection !== 'live' || sending || dismissing !== null) return;
    setDismissing(dispatchId);
    setNotice('');
    try {
      await dismissPressDispatch(dispatchId);
      setNotice('Dispatch dismissed');
    } catch (cause) {
      setNotice(normalizeCommandError(cause).message);
    } finally {
      setDismissing(null);
    }
  }

  return (
    <section className="press-dispatch cic-frame" aria-label="Press dispatch desk">
      <p className="press-dispatch__eyebrow">{shuttle.operatorShort} // Fleet press ticker</p>
      <h2>Dispatch desk</h2>
      <form onSubmit={(event) => void publish(event)}>
        <label htmlFor="press-dispatch">Dispatch</label>
        <div className="press-dispatch__copy">
          <span aria-hidden="true">SNN //</span>
          <textarea
            id="press-dispatch"
            maxLength={MAX_DISPATCH_LENGTH}
            rows={4}
            value={text}
            disabled={!authorized}
            onChange={(event) => {
              setText(event.target.value);
              setNotice('');
            }}
          />
        </div>
        <button className="cic-action-button" type="submit"
          disabled={!authorized || connection !== 'live' || sending || dismissing !== null || !text.trim()}>
          {sending ? 'Transmitting' : 'Publish dispatch'}
        </button>
      </form>
      <div className="press-dispatch__current">
        <p className="press-dispatch__current-heading">
          Current dispatches // {current.length}
        </p>
        {current.length > 0 ? (
          <ul className="press-dispatch__current-list">
            {current.map((dispatch) => (
              <li className="press-dispatch__current-item" key={dispatch.id}>
                <p className="press-dispatch__current-copy">{dispatch.text}</p>
                <button
                  aria-label={`Dismiss dispatch: ${dispatch.text}`}
                  className="cic-action-button"
                  type="button"
                  disabled={
                    !authorized || connection !== 'live' || sending || dismissing !== null
                  }
                  onClick={() => void dismiss(dispatch.id)}
                >
                  {dismissing === dispatch.id ? 'Dismissing' : 'Dismiss dispatch'}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="press-dispatch__empty">No active dispatches</p>}
      </div>
      <p className="press-dispatch__status" aria-live="polite">
        {notice || (turnZeroLocked
          ? 'Turn 0 // Awaiting Iris Authentication'
          : session?.phase === 'debrief'
            ? 'Endgame evaluation // gameplay dispatches frozen'
            : !authorized ? 'Press Officer authority required' : '')}
      </p>
    </section>
  );
}
