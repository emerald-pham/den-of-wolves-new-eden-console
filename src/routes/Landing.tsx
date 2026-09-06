import ArrivalDisplay from './ArrivalDisplay';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, getSurvivorPopulation, joinSession } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import { APP_VERSION } from '@/version';
import { setMotionOverride, useMotionPreference } from '@/lib/motionPreference';

const LEGACY_CODE_LENGTH = 4;
const CODE_LENGTH = 6;

function isCompleteCode(code: string): boolean {
  return code.length === LEGACY_CODE_LENGTH || code.length === CODE_LENGTH;
}

export default function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [survivorPopulation, setSurvivorPopulation] = useState<number | null>(null);
  const { reducedMotion } = useMotionPreference();
  const connection = useSessionStore((state) => state.connection);

  useEffect(() => {
    if (connection !== 'live') return;
    let active = true;
    void getSurvivorPopulation()
      .then((population) => { if (active) setSurvivorPopulation(population); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [connection]);

  /**
   * One place for the two things every call has to get right: the buttons go
   * dead while a request is in flight, and a rejection is shown to the player
   * rather than disappearing into an unhandled promise.
   */
  async function enterSession(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      navigate('/roles');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function onJoin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void enterSession(() => joinSession(code));
  }

  return (
    <main className="landing">
      <div className="arrival-topline cic-overline"><span>OPERATION NEW EDEN / CIC</span><span>SYSTEM STATUS</span></div>
      <h1 className="landing__title">
        <span className="landing__title-line">Den of Wolves: New Eden</span>
        <span className="landing__title-sub">Unofficial Companion Console</span>
      </h1>

      <ArrivalDisplay
        standDown={busy}
        survivorPopulation={survivorPopulation}
      />

      <div className="landing__actions cic-frame">
        <div className="landing__primary-actions">
          <button
            type="button"
            className="landing__button"
            disabled={busy}
            onClick={() => void enterSession(() => createSession())}
          >
            Create a session
          </button>
        </div>

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
            maxLength={CODE_LENGTH}
            placeholder="000000"
            value={code}
            // Digits only, with no invalid characters or more than six entered.
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
            }
          />
          <button
            type="submit"
            className="landing__button"
            disabled={busy || !isCompleteCode(code)}
          >
            Join a session
          </button>
          <button
            type="button"
            className="landing__button landing__motion-control"
            onClick={() => setMotionOverride(reducedMotion ? 'full' : 'reduce')}
          >
            {reducedMotion ? 'Restore motion 😀' : 'Reduce motion (reduce awesomeness) 😞'}
          </button>
        </form>
        {reducedMotion && <p className="landing__motion-status">Motion is reduced.</p>}
      </div>

      {error !== null && (
        <p className="landing__error" role="alert">
          {error}
        </p>
      )}
      <footer className="arrival-bottomline cic-overline"><span>OPERATION NEW EDEN</span><span>SYSTEM INTERFACE / BUILD {APP_VERSION}</span></footer>
    </main>
  );
}
