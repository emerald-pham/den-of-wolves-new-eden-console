import { useState, type FormEvent } from 'react';
import type { Shuttlecraft } from '@/data/shuttles';
import { publishPressDispatch } from '@/lib/pressDispatchService';
import { useSessionStore } from '@/store/useSessionStore';

const MAX_DISPATCH_LENGTH = 220;

export default function PressDispatch({ shuttle }: {
  readonly shuttle: Pick<Shuttlecraft, 'captainRoleId' | 'operatorShort'>;
}) {
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const current = useSessionStore((state) => state.session?.pressDispatch?.text);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const authorized = me?.activeConsoleRoleId === shuttle.captainRoleId;

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
      setNotice(cause instanceof Error ? cause.message : 'Dispatch transmission failed');
    } finally {
      setSending(false);
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
          disabled={!authorized || connection !== 'live' || sending || !text.trim()}>
          {sending ? 'Transmitting' : 'Publish dispatch'}
        </button>
      </form>
      <p className="press-dispatch__status" aria-live="polite">
        {notice || (current ? `Current // ${current}` : 'Press Officer authority required')}
      </p>
    </section>
  );
}
