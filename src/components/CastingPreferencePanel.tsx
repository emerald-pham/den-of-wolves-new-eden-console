import { useEffect, useMemo, useState } from 'react';
import { findVessel } from '@/data/ships';
import { parseEntityId } from '@/types/identifiers';
import type { GameSession, Player } from '@/types/game';
import { submitShipPreference } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import './CastingPreferencePanel.css';

type CastingSession = Pick<GameSession, 'id' | 'phase' | 'activeVesselIds' | 'configurationLocked'>;
type CastingPlayer = Pick<Player, 'role' | 'uid' | 'shipPreferenceId'>;

type PreferenceFeedback =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'queued'; readonly requestId: string; readonly shipId: string }
  | { readonly kind: 'confirmed'; readonly shipId: string }
  | { readonly kind: 'error' };

const CASTING_PHASES = new Set<GameSession['phase']>(['lobby', 'casting']);

export default function CastingPreferencePanel({
  session,
  player,
  sessionSnapshotFreshness,
}: {
  readonly session: CastingSession;
  readonly player: CastingPlayer;
  readonly sessionSnapshotFreshness: 'unknown' | 'cache' | 'server';
}) {
  const connection = useSessionStore((state) => state.connection);
  const pendingPreference = useSessionStore((state) => state.pendingCommands.find((command) =>
    command.kind === 'setShipPreference' && command.payload.sessionId === session.id &&
    command.actorUid === player.uid));
  const [selectedShipId, setSelectedShipId] = useState('');
  const [feedback, setFeedback] = useState<PreferenceFeedback>({ kind: 'idle' });
  const roster = session.activeVesselIds;
  const options = useMemo(() => {
    if (!Array.isArray(roster) || roster.length === 0 || new Set(roster).size !== roster.length) return null;
    const vessels = roster.map((id) => {
      const parsed = parseEntityId('vessel', id);
      const vessel = parsed ? findVessel(parsed) : undefined;
      return vessel ? { id: parsed, name: vessel.name } : undefined;
    });
    return vessels.every((vessel) => vessel !== undefined)
      ? vessels as { readonly id: string; readonly name: string }[]
      : null;
  }, [roster]);
  const activePreference = options?.find((option) => option.id === player.shipPreferenceId);
  const selectedOption = options?.find((option) => option.id === selectedShipId);
  const hasFreshConnection = window.navigator.onLine && connection === 'live' &&
    sessionSnapshotFreshness === 'server';
  const phaseAllowsPreference = CASTING_PHASES.has(session.phase);
  const locked = session.configurationLocked === true;
  const queued = pendingPreference !== undefined;
  const submitting = feedback.kind === 'submitting';
  const awaitingReceipt = feedback.kind === 'queued' && queued && pendingPreference.id === feedback.requestId;

  useEffect(() => {
    const currentSelection = roster?.includes(player.shipPreferenceId ?? '')
      ? player.shipPreferenceId ?? ''
      : '';
    setSelectedShipId(currentSelection);
  }, [player.shipPreferenceId, roster]);

  useEffect(() => {
    if (feedback.kind !== 'queued' || queued) return;
    setFeedback(player.shipPreferenceId === feedback.shipId
      ? { kind: 'confirmed', shipId: feedback.shipId }
      : { kind: 'error' });
  }, [feedback, player.shipPreferenceId, queued]);

  if (player.role !== 'player' || !phaseAllowsPreference) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOption || !hasFreshConnection || locked || queued || submitting ||
        selectedOption.id === player.shipPreferenceId) return;
    setFeedback({ kind: 'submitting' });
    try {
      const result = await submitShipPreference(selectedOption.id);
      setFeedback(result.disposition === 'queued'
        ? { kind: 'queued', requestId: result.requestId, shipId: selectedOption.id }
        : { kind: 'confirmed', shipId: selectedOption.id });
    } catch {
      setFeedback({ kind: 'error' });
    }
  }

  return (
    <section className="casting-preference cic-frame" aria-labelledby="casting-preference-title">
      <p className="eyebrow">Optional, nonbinding ship preference</p>
      <h2 id="casting-preference-title">Casting preference</h2>
      <p className="casting-preference__copy">No resources or actions are used.</p>
      <p className="casting-preference__copy">The GM decides assignments and any tie-breaks.</p>

      {!options ? (
        <p className="casting-preference__notice" role="status">
          The active roster cannot be safely shown right now. Wait for the current member session before choosing.
        </p>
      ) : (
        <>
          {activePreference && (
            <p className="casting-preference__current">
              Your current preference is {activePreference.name}. The GM decides assignments and any tie-breaks.
            </p>
          )}
          {player.shipPreferenceId && !activePreference && (
            <p className="casting-preference__notice">
              Your saved preference is not in this active roster. Choose from the current roster to update it.
            </p>
          )}
          <form className="casting-preference__form" onSubmit={handleSubmit}>
            <label className="casting-preference__field" htmlFor="casting-preference-ship">
              Preferred ship
              <select
                id="casting-preference-ship"
                value={selectedShipId}
                disabled={!hasFreshConnection || locked || queued || submitting}
                onChange={(event) => {
                  setSelectedShipId(event.currentTarget.value);
                  setFeedback({ kind: 'idle' });
                }}
              >
                <option value="">Choose a ship</option>
                {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
            <button
              className="cic-action-button"
              type="submit"
              disabled={!selectedOption || !hasFreshConnection || locked || queued || submitting ||
                selectedOption.id === player.shipPreferenceId}
            >
              {submitting ? 'Submitting preference…' : 'Submit preference'}
            </button>
          </form>
        </>
      )}

      {!hasFreshConnection && (
        <p className="casting-preference__notice" role="status">
          Reconnect and wait for current server state before submitting.
        </p>
      )}
      {locked && (
        <p className="casting-preference__notice" role="status">
          Casting is locked, so preference changes are unavailable.
        </p>
      )}
      {queued && (
        <p className="casting-preference__notice" role="status">
          {awaitingReceipt
            ? 'No preference is confirmed yet. This choice is waiting for the current server connection.'
            : 'A preference is already waiting for server confirmation. Reconnect before trying again.'}
        </p>
      )}
      {feedback.kind === 'confirmed' && selectedOption?.id === feedback.shipId && (
        <p className="casting-preference__result" role="status">
          Preference confirmed: {selectedOption.name}. Next step: the GM decides assignments and any tie-breaks.
        </p>
      )}
      {feedback.kind === 'error' && (
        <p className="casting-preference__notice" role="alert">
          This preference was not confirmed. Check the connection and casting status, then retry.
        </p>
      )}
    </section>
  );
}
