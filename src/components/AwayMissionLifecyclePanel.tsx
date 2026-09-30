import { useMemo, useState } from 'react';

interface PublicOpportunity {
  readonly id: string;
  readonly label: string;
}

interface PrivateMissionCard {
  readonly id: string;
  readonly value: number;
  readonly status: 'remaining' | 'discarded' | 'assigned';
  readonly opportunityId: string | null;
}

interface PrivateMissionState {
  readonly missionId: string;
  readonly participantUid: string;
  readonly revision: number;
  readonly phase: string;
  readonly cards: readonly PrivateMissionCard[];
  readonly reclamatorSalvage?: Readonly<{
    opportunityId: string;
    choices: readonly Readonly<{ cardId: string; resource: 'food' | 'water' | 'materials' }>[];
  }> | null;
}

interface PublicMissionState {
  readonly explorationAppliedOpportunityIds?: readonly string[];
  readonly missionId: string;
  readonly groupId: string;
  readonly siteCode: string;
  readonly revision: number;
  readonly phase: string;
  readonly status: 'active' | 'resolved' | 'complete';
  readonly overrun: boolean;
  readonly missionLeaderUid: string;
  readonly participantCount: number;
  readonly opportunities: readonly PublicOpportunity[];
  readonly requestCounts: readonly Readonly<{ participantUid: string; count: number }>[];
  readonly outcomes: readonly Readonly<{
    opportunityId: string;
    total: number;
    outcome: string;
  }>[] | null;
  readonly rewards: readonly Readonly<{
    opportunityId: string;
    resources: Readonly<Record<string, number>>;
  }>[] | null;
  readonly specialRewards?: readonly Readonly<{
    opportunityId: string;
    resources: Readonly<Record<string, number>>;
  }>[] | null;
  readonly custody: Readonly<{ status: string; holderUid: string; shipId: string | null }>;
  readonly legalDropOffShipIds: readonly string[];
}

export interface AwayMissionLifecycleActions {
  readonly requestExtraCards: (count: number) => Promise<unknown>;
  readonly distributeExtraCard: (participantUid: string, opportunityId: string) => Promise<unknown>;
  readonly openDiscards: () => Promise<unknown>;
  readonly discardCard: (cardId: string) => Promise<unknown>;
  readonly reclamatorSalvage?: (
    opportunityId: string,
    choices: readonly Readonly<{ cardId: string; resource: 'food' | 'water' | 'materials' }>[],
  ) => Promise<unknown>;
  readonly assignCards: (placements: readonly Readonly<{ cardId: string; opportunityId: string }>[]) => Promise<unknown>;
  readonly addFacilitatorCards: () => Promise<unknown>;
  readonly resolve: () => Promise<unknown>;
  readonly exploreSystems?: (opportunityId: string, targetCoordinates: readonly string[]) => Promise<unknown>;
  readonly dropOff: (shipId: string) => Promise<unknown>;
}

export interface AwayMissionLifecyclePanelProps {
  readonly actorUid: string;
  readonly isGm: boolean;
  readonly isMissionLeader: boolean;
  /** Server-projected role/craft eligibility for showing the special action. */
  readonly canUseReclamator?: boolean;
  readonly publicState: PublicMissionState;
  readonly privateState: PrivateMissionState | null;
  readonly actions: AwayMissionLifecycleActions;
}

export default function AwayMissionLifecyclePanel({
  actorUid,
  isGm,
  isMissionLeader,
  canUseReclamator = false,
  publicState,
  privateState,
  actions,
}: AwayMissionLifecyclePanelProps) {
  const [extraCount, setExtraCount] = useState(1);
  const [recipientUid, setRecipientUid] = useState('');
  const [distributionOpportunity, setDistributionOpportunity] = useState('');
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [reclamatorChoices, setReclamatorChoices] = useState<Record<string, 'food' | 'water' | 'materials'>>({});
  const [reclamatorOpportunityId, setReclamatorOpportunityId] = useState('');
  const [dropOffShipId, setDropOffShipId] = useState('');
  const [explorationTargets, setExplorationTargets] = useState<Record<string, readonly [string, string]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ownPrivateState = !isGm && privateState?.participantUid === actorUid &&
    privateState.missionId === publicState.missionId ? privateState : null;
  const remainingCards = useMemo(
    () => ownPrivateState?.cards.filter(({ status }) => status === 'remaining') ?? [],
    [ownPrivateState],
  );
  const usedOpportunityIds = useMemo(() => new Set(
    Object.entries(placements).filter(([, opportunityId]) => opportunityId).map(([, opportunityId]) => opportunityId),
  ), [placements]);
  const requestOptions = isMissionLeader ? publicState.requestCounts : [];
  const legalDropOffIds = isMissionLeader ? publicState.legalDropOffShipIds : [];

  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The away mission action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const submitAssignments = () => {
    const assigned = remainingCards.flatMap((card) => {
      const opportunityId = placements[card.id];
      return opportunityId ? [{ cardId: card.id, opportunityId }] : [];
    });
    if (assigned.length !== remainingCards.length) {
      setMessage('Choose one opportunity for each remaining card before submitting.');
      return;
    }
    void run(() => actions.assignCards(assigned));
  };

  const chosenDropOffShipId = dropOffShipId || legalDropOffIds[0] || '';
  const privateDiscardComplete = ownPrivateState?.cards.some(({ status }) => status === 'discarded') === true;

  return (
    <section className="away-mission-lifecycle cic-frame" aria-label={`Away mission // ${publicState.missionId}`}>
      <style data-away-mission-lifecycle>{`
        .away-mission-lifecycle { display: grid; gap: 1rem; min-width: 0; padding: clamp(1rem, 2vw, 1.5rem); }
        .away-mission-lifecycle__header, .away-mission-lifecycle__actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; }
        .away-mission-lifecycle__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: .85rem; }
        .away-mission-lifecycle__card, .away-mission-lifecycle__opportunity { border: 1px solid var(--console-line, #38615f); border-radius: .35rem; padding: .8rem; background: var(--console-panel, #101c20); }
        .away-mission-lifecycle label { display: grid; gap: .35rem; min-width: min(100%, 12rem); color: var(--console-text, #e7e6dc); }
        .away-mission-lifecycle button, .away-mission-lifecycle select, .away-mission-lifecycle input { min-height: 2.75rem; max-width: 100%; }
        .away-mission-lifecycle :focus-visible { outline: 3px solid var(--console-focus, #a7d6bc); outline-offset: 2px; }
        .away-mission-lifecycle__muted { color: var(--console-muted, #aab7b2); }
        .away-mission-lifecycle__result { border-inline-start: .25rem solid var(--console-accent, #b4cda8); padding-inline-start: .75rem; }
        @media (max-width: 640px) { .away-mission-lifecycle__actions { align-items: stretch; flex-direction: column; } .away-mission-lifecycle__actions > * { width: 100%; } }
        @media (prefers-reduced-motion: reduce) { .away-mission-lifecycle, .away-mission-lifecycle * { animation: none !important; scroll-behavior: auto !important; transition: none !important; } }
      `}</style>

      <header className="away-mission-lifecycle__header">
        <div>
          <h2 className="gm-console__section-title">Away mission // {publicState.missionId}</h2>
          <p className="gm-console__hint">
            Fleet group {publicState.groupId} // mission leader {publicState.missionLeaderUid} // system {publicState.siteCode}
            {publicState.overrun ? ' // continuing after Team Phase' : ''}
          </p>
        </div>
        <p className="gm-console__status" role="status">{publicState.status} // {publicState.phase}</p>
      </header>

      <div className="away-mission-lifecycle__grid" aria-label="Mission opportunities">
        {publicState.opportunities.map((opportunity) => (
          <article className="away-mission-lifecycle__opportunity" key={opportunity.id}>
            <h3>{opportunity.id}</h3>
            <p>{opportunity.label}</p>
            {publicState.outcomes?.find(({ opportunityId }) => opportunityId === opportunity.id) && (
              <p className="away-mission-lifecycle__result">
                {publicState.outcomes.find(({ opportunityId }) => opportunityId === opportunity.id)?.outcome.replace('-', ' ')}
                {' // total '}{publicState.outcomes.find(({ opportunityId }) => opportunityId === opportunity.id)?.total}
              </p>
            )}
            {publicState.rewards?.find(({ opportunityId }) => opportunityId === opportunity.id) && (
              <p>
                Reward // {Object.entries(publicState.rewards.find(({ opportunityId }) => opportunityId === opportunity.id)!.resources)
                  .map(([resource, amount]) => `${resource} ${amount}`).join(' // ') || 'printed effect'}
              </p>
            )}
            {isGm && actions.exploreSystems && publicState.status === 'resolved' &&
              ((publicState.siteCode === 'D' && opportunity.id === 'D-3') ||
                (publicState.siteCode === 'E' && opportunity.id === 'E-3')) &&
              publicState.outcomes?.some(result => result.opportunityId === opportunity.id &&
                ['success', 'critical-success'].includes(result.outcome)) &&
              !publicState.explorationAppliedOpportunityIds?.includes(opportunity.id) && (
                <fieldset disabled={busy} className="away-mission-lifecycle__actions">
                  <legend>Explore two {publicState.siteCode === 'E' ? 'Wolf ' : ''}systems</legend>
                  <p>Enter two distinct coordinates on the locked chart. Knowledge goes to this mission's participants.</p>
                  {[0, 1].map(index => (
                    <label key={index}>
                      {index === 0 ? 'First' : 'Second'} system coordinate
                      <input aria-label={`${index === 0 ? 'First' : 'Second'} system coordinate for ${opportunity.id}`}
                        inputMode="numeric" maxLength={4} value={explorationTargets[opportunity.id]?.[index] ?? ''}
                        onChange={event => setExplorationTargets(current => {
                          const pair: [string, string] = [...(current[opportunity.id] ?? ['', ''])];
                          pair[index] = event.target.value;
                          return { ...current, [opportunity.id]: pair };
                        })} />
                    </label>
                  ))}
                  <button type="button" aria-label={`Apply exploration reward ${opportunity.id}`}
                    disabled={busy || !explorationTargets[opportunity.id]?.every(coordinate => /^\d{4}$/.test(coordinate)) ||
                      new Set(explorationTargets[opportunity.id]).size !== 2}
                    onClick={() => void run(() => actions.exploreSystems!(opportunity.id, explorationTargets[opportunity.id]!))}>
                    Apply exploration reward
                  </button>
                </fieldset>
              )}
          </article>
        ))}
      </div>

      {publicState.specialRewards?.map((reward) => (
        <p className="away-mission-lifecycle__result" key={`reclamator-${reward.opportunityId}`}>
          {`Reclamator salvage // ${reward.opportunityId} // ${Object.entries(reward.resources)
            .map(([resource, amount]) => `${resource} ${amount}`).join(' // ')}`}
        </p>
      ))}

      {ownPrivateState && (
        <section className="away-mission-lifecycle__private" aria-label="Your private mission cards">
          <h3>Your private hand</h3>
          {privateDiscardComplete && <p className="gm-console__status" role="status">Private discard recorded.</p>}
          {ownPrivateState.reclamatorSalvage && (
            <p className="gm-console__status" role="status">
              Warrior Reclamator // {ownPrivateState.reclamatorSalvage.opportunityId} // per-card choices saved privately.
            </p>
          )}
          {ownPrivateState.cards.length === 0 && <p className="away-mission-lifecycle__muted">No private cards remain.</p>}
          <div className="away-mission-lifecycle__grid">
            {ownPrivateState.cards.map((card) => (
              <article className="away-mission-lifecycle__card" key={card.id} aria-label={`Private card ${card.id}`}>
                <strong>{card.id}</strong><span> // value {card.value}</span>
                {card.status === 'discarded' && <p className="away-mission-lifecycle__muted">Discarded privately</p>}
                {card.status === 'assigned' && <p className="away-mission-lifecycle__muted">Assigned face down</p>}
                {publicState.phase === 'discarding' && !privateDiscardComplete && card.status === 'remaining' && (
                  <button type="button" onClick={() => void run(() => actions.discardCard(card.id))} disabled={busy}>
                    Discard {card.id} secretly
                  </button>
                )}
                {publicState.phase === 'assignment-ready' && card.status === 'remaining' && (
                  <label>
                    Opportunity for {card.id}
                    <select
                      value={placements[card.id] ?? ''}
                      onChange={(event) => setPlacements((current) => ({ ...current, [card.id]: event.target.value }))}
                      disabled={busy}
                    >
                      <option value="">Choose an opportunity</option>
                      {publicState.opportunities.map((opportunity) => (
                        <option
                          key={opportunity.id}
                          value={opportunity.id}
                          disabled={usedOpportunityIds.has(opportunity.id) && placements[card.id] !== opportunity.id}
                        >
                          {opportunity.id} // {opportunity.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </article>
            ))}
          </div>
          {publicState.phase === 'assignment-ready' && (
            <button type="button" onClick={submitAssignments} disabled={busy}>
              Submit mission assignments
            </button>
          )}
          {publicState.phase === 'discarding' && canUseReclamator && !ownPrivateState.reclamatorSalvage &&
            remainingCards.length > 0 && (
              <section className="away-mission-lifecycle__reclamator" aria-label="Warrior Reclamator salvage">
                <h4>Warrior Reclamator // one salvage opportunity</h4>
                <p className="away-mission-lifecycle__muted">Gain one material plus your choice of one food or water for every card. Using this action consumes the entire hand.</p>
                <label>
                  Reclamator salvage opportunity
                  <select value={reclamatorOpportunityId} onChange={(event) => setReclamatorOpportunityId(event.target.value)}>
                    <option value="">Choose one opportunity</option>
                    {publicState.opportunities.map(({ id }) => <option key={id} value={id}>{id}</option>)}
                  </select>
                </label>
                <div className="away-mission-lifecycle__grid">
                  {remainingCards.map((card) => (
                    <label className="away-mission-lifecycle__card" key={`reclamator-${card.id}`}>
                      Resource for {card.id}
                      <select
                        value={reclamatorChoices[card.id] ?? ''}
                        onChange={(event) => {
                          const resource = event.target.value as 'food' | 'water' | 'materials' | '';
                          setReclamatorChoices((current) => {
                            const next = { ...current };
                            if (resource) next[card.id] = resource;
                            else delete next[card.id];
                            return next;
                          });
                        }}
                      >
                        <option value="">Choose a resource</option>
                        <option value="food">Food</option>
                        <option value="water">Water</option>
                        </select>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busy || !reclamatorOpportunityId || remainingCards.some(({ id }) => !reclamatorChoices[id]) ||
                    !actions.reclamatorSalvage}
                  onClick={() => {
                    if (!actions.reclamatorSalvage) return;
                    const choices = remainingCards.map(({ id }) => ({ cardId: id, resource: reclamatorChoices[id]! }));
                    void run(() => actions.reclamatorSalvage!(reclamatorOpportunityId, choices));
                  }}
                >
                  Salvage entire hand with Warrior Reclamator
                </button>
              </section>
            )}
          {publicState.phase === 'awaiting-card-selection' && (
            <div className="away-mission-lifecycle__actions">
              <label>
                Extra cards to request
                <input type="number" min={1} max={publicState.opportunities.length} value={extraCount}
                  onChange={(event) => setExtraCount(Number(event.target.value))} />
              </label>
              <button type="button" onClick={() => void run(() => actions.requestExtraCards(extraCount))} disabled={busy}>
                Request extra cards privately
              </button>
            </div>
          )}
        </section>
      )}

      {isMissionLeader && requestOptions.length > 0 && (
        <section aria-label="Blind extra card requests">
          <h3>Private requests // counts only</h3>
          <ul>
            {requestOptions.map(({ participantUid, count }) => (
              <li key={participantUid}>{participantUid} // requested {count} extra card{count === 1 ? '' : 's'}</li>
            ))}
          </ul>
          {publicState.phase === 'awaiting-card-selection' && (
            <div className="away-mission-lifecycle__actions">
              <label>
                Participant for extra card
                <select value={recipientUid} onChange={(event) => setRecipientUid(event.target.value)}>
                  <option value="">Choose participant</option>
                  {requestOptions.map(({ participantUid }) => <option key={participantUid} value={participantUid}>{participantUid}</option>)}
                </select>
              </label>
              <label>
                Opportunity for blind extra card
                <select value={distributionOpportunity} onChange={(event) => setDistributionOpportunity(event.target.value)}>
                  <option value="">Choose opportunity</option>
                  {publicState.opportunities.map(({ id }) => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !recipientUid || !distributionOpportunity}
                onClick={() => void run(() => actions.distributeExtraCard(recipientUid, distributionOpportunity))}>
                Distribute one card blindly
              </button>
            </div>
          )}
        </section>
      )}

      {isGm && publicState.status === 'active' && publicState.phase === 'awaiting-card-selection' && (
        <button type="button" onClick={() => void run(actions.openDiscards)} disabled={busy}>
          Open private discards
        </button>
      )}
      {isGm && publicState.status === 'active' && publicState.phase === 'assignments-complete' && (
        <button type="button" onClick={() => void run(actions.addFacilitatorCards)} disabled={busy}>
          Add facilitator cards
        </button>
      )}
      {isGm && publicState.status === 'active' && publicState.phase === 'facilitator-cards-added' && (
        <button type="button" onClick={() => void run(actions.resolve)} disabled={busy}>
          Resolve away mission
        </button>
      )}

      {publicState.status === 'resolved' && isMissionLeader && legalDropOffIds.length > 0 && (
        <section aria-label="Mission reward custody">
          <p className="gm-console__status">Mission Leader custody // {publicState.custody.holderUid}</p>
          <div className="away-mission-lifecycle__actions">
            <label>
              Ship for reward drop-off
              <select value={chosenDropOffShipId} onChange={(event) => setDropOffShipId(event.target.value)}>
                {legalDropOffIds.map((shipId) => <option key={shipId} value={shipId}>{shipId.toUpperCase()}</option>)}
              </select>
            </label>
            <button type="button" aria-label="Drop mission rewards at selected ship" disabled={busy || !chosenDropOffShipId}
              onClick={() => void run(() => actions.dropOff(chosenDropOffShipId))}>
              Drop mission rewards at selected ship
            </button>
          </div>
        </section>
      )}

      {message && <p className="gm-console__status" role="alert">{message}</p>}
    </section>
  );
}
