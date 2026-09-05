import { useState, type FormEvent } from 'react';
import ConnectionIndicator from '@/components/ConnectionIndicator';
import { createSession, joinSession } from '@/lib/sessionService';
import { selectConnectionStatus, useSessionStore } from '@/store/useSessionStore';

/** Table codes are read aloud across a noisy room, so they stay short. */
const CODE_LENGTH = 4;

export default function Landing() {
  const status = useSessionStore(selectConnectionStatus);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One place for the two things every call has to get right: the buttons go
   * dead while a request is in flight, and a rejection is shown to the player
   * rather than disappearing into an unhandled promise.
   */
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function onJoin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(() => joinSession(code));
  }

  return (
    <main className="landing">
      <header className="landing__bar">
        <ConnectionIndicator status={status} />
      </header>

      <h1 className="landing__title">
        <span className="landing__title-line">Den of Wolves: New Eden</span>
        <span className="landing__title-sub">Unofficial Companion Console</span>
      </h1>

      <div className="landing__actions">
        <button
          type="button"
          className="landing__button"
          disabled={busy}
          onClick={() => void run(() => createSession())}
        >
          Create a session
        </button>

        <p className="landing__or">or</p>

        <form className="landing__join" onSubmit={onJoin}>
          <label className="landing__label" htmlFor="join-code">
            Session code
          </label>
          <input
            id="join-code"
            className="landing__code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="0000"
            value={code}
            // Digits only, four at most: the field cannot hold anything the
            // server would reject, so there is no invalid state to report.
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
            }
          />
          <button
            type="submit"
            className="landing__button"
            disabled={busy || code.length !== CODE_LENGTH}
          >
            Join a session
          </button>
        </form>
      </div>

      {error !== null && (
        <p className="landing__error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
