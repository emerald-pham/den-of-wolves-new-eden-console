import { useState } from 'react';
import type { ShuttleControlEntry, ShuttleDocking } from '@/types/game';
import { runHighwallMining } from '@/lib/highwallMiningService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';

interface Props {
  readonly control?: ShuttleControlEntry | undefined;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

export default function HighwallMining({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const me = useSessionStore((state) => state.me)!;
  const connection = useSessionStore((state) => state.connection);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const state = session.highwallMining;
  const currentOperations = state && state.cycle === session.currentTurn ? state.operations : [];
  const limit = fuelled ? 3 : 2;
  const isHolder = control?.holderUid === me.uid;
  const phase = phaseForSession(session);
  const coordinationOpen = session.phase === 'active' && (session.currentTurn ?? 0) >= 1 &&
    phase?.airspace.state === 'lifted' && !phase.timerPause &&
    Date.now() < Date.parse(phase.openAirspaceEndsAt);
  const unavailable = busy || !docking || !control || !isHolder || connection !== 'live' ||
    !coordinationOpen || currentOperations.length >= limit;

  async function mine(resource: 'materials' | 'ore'): Promise<void> {
    if (unavailable || !control || !session.currentTurn) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await runHighwallMining(
        resource, state?.revision ?? 0, control.revision, session.currentTurn,
      );
      setStatus(`Operation committed // ${result.operation.rolls.join(' + ')} = ` +
        `${result.operation.amount} ${resource === 'ore' ? 'strytium ore' : 'materials'}.`);
    } catch (cause) {
      setStatus(cause instanceof Error && !('code' in cause)
        ? cause.message : normalizeCommandError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="console-workspace__section highwall-mining" aria-label="Highwall mining operations">
    <h3>Mining operations</h3>
    <p>Coordination Phase // Conduct two operations each cycle. A fuelled Highwall may conduct a third.</p>
    <p>Operations remaining // {Math.max(0, limit - currentOperations.length)} of {limit}</p>
    {!docking && <p>Unavailable // Highwall must be docked with an active fleet ship.</p>}
    {!isHolder && <p>Unavailable // Only the current Highwall holder may mine.</p>}
    {!coordinationOpen && <p>Unavailable // Highwall mining requires the Coordination Phase.</p>}
    {!fuelled && currentOperations.length >= 2 && <p>Fuel Highwall during the Team Phase to unlock its third operation.</p>}
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button" disabled={unavailable}
        onClick={() => void mine('materials')}>Roll 1d6 materials</button>
      <button className="cic-action-button" type="button" disabled={unavailable}
        onClick={() => void mine('ore')}>Roll 3d6 strytium ore</button>
    </div>
    {currentOperations.length > 0 && <ol aria-label="Highwall mining results">
      {currentOperations.map((operation, index) => <li key={operation.requestId}>
        Operation {index + 1} // {operation.rolls.join(' + ')} = {operation.amount} {operation.resource}
      </li>)}
    </ol>}
    {status && <p role="status">{status}</p>}
  </section>;
}
