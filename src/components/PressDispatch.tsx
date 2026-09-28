import { useState } from 'react';
import type { Shuttlecraft } from '@/data/shuttles';
import { dismissPressDispatch, publishPressDispatch } from '@/lib/pressDispatchService';
import { normalizePressDispatch } from '@/lib/pressDispatchState';
import { useSessionStore } from '@/store/useSessionStore';
import { normalizeCommandError } from '@/lib/commandErrors';
import PressEventLog from './PressEventLog';
import { PressDispatchDesk } from './PressDispatchDesk';

export default function PressDispatch({ shuttle }: {
  readonly shuttle: Pick<Shuttlecraft, 'captainRoleId' | 'operatorShort'>;
}) {
  const me = useSessionStore((state) => state.me);
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const dispatchState = session?.pressDispatch;
  const current = normalizePressDispatch(dispatchState).dispatches;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const hasPressAuthority = me?.activeConsoleRoleId === shuttle.captainRoleId;
  // The independent Press desk is explicitly available during Turn 0. Keep
  // the ordinary endgame phase gates and server authority checks intact.
  const gameplayFrozen = ['success', 'failure', 'debrief', 'closed'].includes(session?.phase ?? '');
  const authorized = hasPressAuthority && !gameplayFrozen;

  async function publish(): Promise<void> {
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
    <PressDispatchDesk
      operatorShort={shuttle.operatorShort}
      dispatches={current}
      text={text}
      authorized={authorized}
      connectionReady={connection === 'live'}
      sending={sending}
      dismissingId={dismissing}
      notice={notice}
      status={gameplayFrozen
        ? 'Endgame evaluation // gameplay dispatches frozen'
        : !authorized ? 'Press Officer authority required' : ''}
      eventLog={<PressEventLog />}
      onTextChange={(value) => {
        setText(value);
        setNotice('');
      }}
      onPublish={() => void publish()}
      onDismiss={(dispatchId) => void dismiss(dispatchId)}
    />
  );
}
