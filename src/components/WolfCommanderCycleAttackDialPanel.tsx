import { useEffect, useState } from 'react';
import {
  commitWolfCommanderAttackDial,
  getWolfCommanderCycleAttackDial,
  type WolfCommanderCycleAttackDialView,
} from '@/lib/sessionService';
import {
  useWolfAttackChoiceAuthority,
  wolfAttackChoiceAuthorityIsCurrent,
} from '@/lib/wolfAttackChoiceController';

/** Private Commander control for the once-per-cycle, target-group attack dial. */
export default function WolfCommanderCycleAttackDialPanel() {
  const authority = useWolfAttackChoiceAuthority('wolf-commander');
  const [view, setView] = useState<WolfCommanderCycleAttackDialView | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setView(null);
    setSelectedGroupId('');
    setError(null);
    if (!authority.ready || !authority.sessionId) return;
    let live = true;
    const key = authority.key;
    const sessionId = authority.sessionId;
    void getWolfCommanderCycleAttackDial().then((next) => {
      if (!live || !wolfAttackChoiceAuthorityIsCurrent('wolf-commander', key, sessionId)) return;
      setView(next);
      setSelectedGroupId(next.groupId ?? next.groups[0]?.groupId ?? '');
    }).catch((cause: unknown) => {
      if (!live || !wolfAttackChoiceAuthorityIsCurrent('wolf-commander', key, sessionId)) return;
      setView(null);
      setError(cause instanceof Error ? cause.message : 'Commander attack dial is unavailable.');
    });
    return () => { live = false; };
  }, [authority.key, authority.ready, authority.sessionId, refreshToken]);

  if (!authority.actorReady) return null;
  if (!authority.ready) {
    return (
      <section className="wolf-commander-panel cic-frame" aria-label="Wolf Commander fleet dial">
        <p className="wolf-commander-panel__status" role="status">
          Waiting for current connected Commander authority before reading the fleet dial.
        </p>
      </section>
    );
  }

  const group = view?.groups.find(({ groupId }) => groupId === selectedGroupId);
  const capacity = group ? 10 + group.pursuitValue : undefined;
  const canCommit = Boolean(view?.status === 'available' && group && !busy);

  async function commit(): Promise<void> {
    if (!view || !group || view.status !== 'available' || busy ||
        !wolfAttackChoiceAuthorityIsCurrent('wolf-commander', authority.key, authority.sessionId)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await commitWolfCommanderAttackDial(
        group.groupId, view.cycle, view.navigationRevision,
      );
      if (!wolfAttackChoiceAuthorityIsCurrent('wolf-commander', authority.key, authority.sessionId)) return;
      setView({
        ...view,
        status: 'committed',
        groupId: result.groupId,
        targetGroupPursuit: result.targetGroupPursuit,
        damageCapacity: result.damageCapacity,
        attackNumber: result.attackNumber,
      });
    } catch (cause) {
      if (wolfAttackChoiceAuthorityIsCurrent('wolf-commander', authority.key, authority.sessionId)) {
        setView(null);
        setError(cause instanceof Error ? cause.message : 'The Commander fleet dial could not be committed.');
      }
    } finally {
      setBusy(false);
    }
  }

  const committedCapacity = view?.status === 'committed' ? view.damageCapacity : undefined;
  return (
    <section className="wolf-commander-panel cic-frame" aria-labelledby="wolf-cycle-dial-title">
      <header className="wolf-commander-panel__header">
        <div>
          <p className="eyebrow">Private Wolf action</p>
          <h2 id="wolf-cycle-dial-title">Wolf fleet dial</h2>
        </div>
        <span className="wolf-commander-panel__revision">
          {view ? `Cycle ${view.cycle} // Nav rev ${view.navigationRevision}` : 'Current cycle'}
        </span>
      </header>
      <p className="wolf-commander-panel__guidance">
        Choose one current fleet group. The server uses that group’s pursuit and permits one Commander dial each cycle.
      </p>
      {view?.status === 'available' && (
        <>
          <label className="wolf-commander-panel__field">
            Target fleet group
            <select
              aria-label="Target fleet group"
              value={selectedGroupId}
              disabled={busy}
              onChange={(event) => setSelectedGroupId(event.currentTarget.value)}
            >
              {view.groups.map(({ groupId, pursuitValue }) => (
                <option key={groupId} value={groupId}>
                  {groupId.replace('fleet-', 'Fleet ')} // pursuit {pursuitValue}
                </option>
              ))}
            </select>
          </label>
          {capacity !== undefined && <p aria-live="polite">10 + {group?.pursuitValue} = {capacity} damage capacity</p>}
          <button className="cic-action-button cic-action-button--confirm" type="button"
            disabled={!canCommit} onClick={() => void commit()}>
            {busy ? 'Committing cycle dial…' : 'Commit this cycle attack dial'}
          </button>
        </>
      )}
      {view?.status === 'committed' && <p className="wolf-commander-panel__status" role="status">
        Cycle {view.cycle} dial committed // attack {view.attackNumber} // {committedCapacity} damage capacity
      </p>}
      {view?.status === 'unavailable' && <p className="wolf-commander-panel__status" role="status">
        {view.reason === 'team-phase-closed'
          ? 'The Commander dial is available during Team Phase.'
          : 'The current Wolf attack must finish before another dial can be opened.'}
      </p>}
      {error && <p className="wolf-commander-panel__status" role="alert">{error}</p>}
      <button className="cic-text-button" type="button" disabled={busy}
        onClick={() => setRefreshToken((value) => value + 1)}>
        Refresh fleet dial
      </button>
    </section>
  );
}
