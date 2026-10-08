import { useState } from 'react';
import { exchangeAegisFighterWings, type AegisFighterWingId } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import { phaseForSession, turnPhaseDeadlinePassed } from '@/lib/turnPhase';
import './AegisFighterWingExchangePanel.css';

const WINGS: readonly Readonly<{ id: AegisFighterWingId; name: 'Alpha' | 'Bravo' }>[] = [
  { id: 'fighter-wing-alpha', name: 'Alpha' },
  { id: 'fighter-wing-bravo', name: 'Bravo' },
];

export default function AegisFighterWingExchangePanel() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [sourceWingId, setSourceWingId] = useState<AegisFighterWingId>('fighter-wing-alpha');
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const counts = session?.fighterWingCounts;
  const alpha = counts?.['fighter-wing-alpha'];
  const bravo = counts?.['fighter-wing-bravo'];
  const phase = phaseForSession(session);
  const teamOpen = Boolean(phase && phase.airspace.state === 'restricted' &&
    !turnPhaseDeadlinePassed(phase, 'team'));
  const liveAuthority = Boolean(session && me?.sessionId === session.id && me.role === 'player' &&
    me.activeConsoleRoleId === 'wing-commander' && connection === 'live' && freshness === 'server');
  const source = sourceWingId === 'fighter-wing-alpha' ? alpha : bravo;
  const target = sourceWingId === 'fighter-wing-alpha' ? bravo : alpha;
  const capacity = session?.shipUpgrades?.aegis?.includes('construction-bay') ? 6 : 4;
  const maximum = source && target ? Math.min(source.count, capacity - target.count) : 0;
  const sourceName = sourceWingId === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo';
  const targetName = sourceWingId === 'fighter-wing-alpha' ? 'Bravo' : 'Alpha';
  const canExchange = Boolean(liveAuthority && teamOpen && alpha && bravo && maximum > 0 && !busy);

  async function submit() {
    if (!canExchange || amount > maximum) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await exchangeAegisFighterWings(sourceWingId, amount);
      setMessage(`${result.amount} fighter${result.amount === 1 ? '' : 's'} exchanged from ${sourceName} to ${targetName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Fighter Wing exchange could not be committed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cic-frame aegis-wing-exchange" aria-label="Fighter Wing exchange">
      <header className="aegis-wing-exchange__header">
        <div><p className="eyebrow">Team Phase // flight control</p><h3>Fighter Wing exchange</h3></div>
        <span className="aegis-wing-exchange__cycle">{session?.currentTurn ? `Cycle ${session.currentTurn}` : 'Cycle unavailable'}</span>
      </header>
      <p className="aegis-wing-exchange__strength">
        Alpha // {alpha ? `${alpha.count} fighters` : 'count unavailable'}
        <span aria-hidden="true"> · </span>
        Bravo // {bravo ? `${bravo.count} fighters` : 'count unavailable'}
      </p>
      <div className="aegis-wing-exchange__form">
        <label>
          Move fighters from
          <select aria-label="Wing to transfer fighters from" value={sourceWingId}
            onChange={(event) => { setSourceWingId(event.target.value as AegisFighterWingId); setAmount(1); }}>
            {WINGS.map((wing) => <option key={wing.id} value={wing.id}>{wing.name}</option>)}
          </select>
        </label>
        <label>
          Fighters to transfer
          <select aria-label="Number of fighters to transfer" value={amount}
            onChange={(event) => setAmount(Number(event.target.value))} disabled={maximum < 1}>
            {Array.from({ length: Math.max(1, maximum) }, (_, index) => index + 1).map((value) =>
              <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="cic-action-button" disabled={!canExchange || amount > maximum}
          aria-busy={busy} onClick={() => void submit()}>
          Transfer {amount === 1 ? 'fighter' : 'fighters'}
        </button>
      </div>
      {!liveAuthority ? <p className="aegis-wing-exchange__notice" role="status">Reconnect as the Wing Commander to use the live exchange.</p>
        : !teamOpen ? <p className="aegis-wing-exchange__notice" role="status">Fighters can be exchanged during the current Team Phase.</p>
          : maximum < 1 ? <p className="aegis-wing-exchange__notice" role="status">No surviving fighter can move into the other Wing at its current capacity.</p>
            : <p className="aegis-wing-exchange__notice">Move any number of surviving fighters up to the destination Wing’s capacity.</p>}
      {message && <p className="aegis-wing-exchange__notice" role="status">{message}</p>}
      {error && <p className="aegis-wing-exchange__error" role="alert">{error}</p>}
    </section>
  );
}
