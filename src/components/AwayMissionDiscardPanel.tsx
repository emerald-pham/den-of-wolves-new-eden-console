import { useMemo, useState } from 'react';
import {
  discardPrivateMissionCard,
  openPrivateMissionDiscards,
} from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import type { AwayMissionHandPointer } from '@/types/game';
import { normalizeCommandError } from '@/lib/commandErrors';

function failureMessage(error: unknown): string {
  if (error instanceof Error && !('code' in error)) return error.message;
  return normalizeCommandError(error).message;
}

function ParticipantPanel() {
  const pointers = useSessionStore((state) => state.awayMissionHandPointers);
  const legacyPointer = useSessionStore((state) => state.awayMissionHandPointer);
  const hands = useSessionStore((state) => state.awayMissionHands);
  const legacyHand = useSessionStore((state) => state.awayMissionHand);
  const visiblePointers = useMemo(
    () => pointers.length > 0 ? pointers : legacyPointer ? [legacyPointer] : [],
    [legacyPointer, pointers],
  );
  const visibleHands = useMemo(
    () => hands.length > 0 ? hands : legacyHand ? [legacyHand] : [],
    [hands, legacyHand],
  );
  const handsById = useMemo(() => new Map(visibleHands.map((hand) => [hand.handId, hand])), [visibleHands]);
  const [busyHandId, setBusyHandId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (visiblePointers.length === 0) return null;
  const discard = async (pointer: AwayMissionHandPointer, hand: typeof visibleHands[number]) => {
    if (!hand || busyHandId || pointer.phase !== 'discarding' || pointer.discarded || hand.discarded) return;
    setBusyHandId(hand.handId);
    setMessage(null);
    try {
      await discardPrivateMissionCard(pointer.missionId, hand.cardId);
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setBusyHandId(null);
    }
  };

  return (
    <section className="away-mission-private-panel role-card cic-frame" aria-label="Private away mission cards">
      <h2 className="gm-console__section-title">Away mission // private cards</h2>
      {visiblePointers.map((pointer) => {
        const hand = handsById.get(pointer.handId);
        const discarded = pointer.discarded || hand?.discarded === true;
        return (
          <article key={pointer.handId} className="away-mission-private-panel__mission" aria-label={`Private away mission card ${pointer.missionId}`}>
            <h3 className="gm-console__status">Mission {pointer.missionId}</h3>
            {pointer.phase === 'awaiting-card-selection' && (
              <p className="gm-console__status" role="status">
                Waiting for the facilitator to finish extra-card selection.
              </p>
            )}
            {pointer.phase === 'discarding' && discarded && (
              <p className="gm-console__status" role="status">
                Your card was discarded secretly. Keep the remaining mission cards for assignment.
              </p>
            )}
            {pointer.phase === 'assignment-ready' && (
              <p className="gm-console__status" role="status">
                Private discards are complete. Keep the remaining mission cards for assignment.
              </p>
            )}
            {pointer.phase === 'discarding' && !discarded && !hand && (
              <p className="gm-console__status" role="status">Receiving your private card…</p>
            )}
            {pointer.phase === 'discarding' && !discarded && hand && (
              <>
                <dl className="away-mission-private-panel__card" aria-label="Private mission card details">
                  <div><dt>Card</dt><dd>{hand.cardId}</dd></div>
                  <div><dt>Value</dt><dd>{hand.value}</dd></div>
                </dl>
                <p className="gm-console__hint">
                  Discard exactly one card secretly before the remaining cards are assigned.
                </p>
                <button
                  type="button"
                  className="cic-text-button"
                  onClick={() => void discard(pointer, hand)}
                  disabled={busyHandId !== null}
                >
                  {busyHandId === hand.handId ? 'Discarding…' : 'Discard this card secretly'}
                </button>
              </>
            )}
          </article>
        );
      })}
      {message && <p className="gm-console__status" role="alert">{message}</p>}
    </section>
  );
}

function FacilitatorPanel() {
  const pointers = useSessionStore((state) => state.gmAwayMissionHandPointers);
  const missions = useMemo(() => {
    const groups = new Map<string, AwayMissionHandPointer[]>();
    pointers.forEach((pointer) => {
      const group = groups.get(pointer.missionId) ?? [];
      group.push(pointer);
      groups.set(pointer.missionId, group);
    });
    return [...groups.entries()];
  }, [pointers]);
  const [busyMission, setBusyMission] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (missions.length === 0) return null;
  const open = async (missionId: string) => {
    setBusyMission(missionId);
    setMessage(null);
    try {
      await openPrivateMissionDiscards(missionId);
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setBusyMission(null);
    }
  };

  return (
    <section className="away-mission-private-panel gm-console__module cic-frame" aria-label="Away mission discard readiness">
      <h2 className="gm-console__section-title">Away mission // private discards</h2>
      <p className="gm-console__hint">
        Open discards only after the extra-card selection is complete. Card identities remain private.
      </p>
      {missions.map(([missionId, missionPointers]) => {
        const phase = missionPointers[0]?.phase;
        const samePhase = missionPointers.every((pointer) => pointer.phase === phase);
        return (
          <div className="away-mission-private-panel__mission" key={missionId}>
            <p className="gm-console__status">
              Mission {missionId} // {missionPointers.length} participant{missionPointers.length === 1 ? '' : 's'} // {samePhase ? phase : 'mixed state'}
            </p>
            {phase === 'awaiting-card-selection' && samePhase && (
              <button
                type="button"
                className="cic-text-button"
                onClick={() => void open(missionId)}
                disabled={busyMission === missionId}
              >
                {busyMission === missionId ? 'Opening…' : 'Open private discards'}
              </button>
            )}
          </div>
        );
      })}
      {message && <p className="gm-console__status" role="alert">{message}</p>}
    </section>
  );
}

export default function AwayMissionDiscardPanel() {
  const isGm = useSessionStore(selectIsGm);
  return isGm ? <FacilitatorPanel /> : <ParticipantPanel />;
}
