import { useId, useState, type FormEvent } from 'react';
import './SameTableTradePanel.css';

export const SAME_TABLE_TRADE_RESOURCES = [
  { id: 'ore', label: 'Ore' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'food', label: 'Food' },
  { id: 'water', label: 'Water' },
  { id: 'materials', label: 'Materials' },
  { id: 'securityTeams', label: 'Security Teams' },
] as const;

export type SameTableTradeResourceId = (typeof SAME_TABLE_TRADE_RESOURCES)[number]['id'];
export type SameTableTradeAmounts = Readonly<Partial<Record<SameTableTradeResourceId, number>>>;
export type SameTableTradeBalances = Readonly<Record<SameTableTradeResourceId, number>>;

export interface SameTableTradeParticipant {
  readonly id: string;
  readonly name: string;
}

export interface SameTableTradeOffer {
  readonly id: string;
  readonly participantName: string;
  readonly amounts: SameTableTradeAmounts;
}

export interface SameTableOutgoingTradeOffer extends SameTableTradeOffer {
  readonly statusLabel?: string;
}

export interface SameTableTradePanelProps {
  readonly currentPlayerName: string;
  /** The current player's privately projected, facilitator-attested token counts. */
  readonly balances: SameTableTradeBalances;
  /** Active same-table recipients projected for this player by the parent. */
  readonly counterparties: readonly SameTableTradeParticipant[];
  /** Pending offers addressed to the current player. */
  readonly incomingOffers: readonly SameTableTradeOffer[];
  /** Pending offers sent by the current player. */
  readonly outgoingOffers: readonly SameTableOutgoingTradeOffer[];
  readonly disabledReason?: string | null;
  readonly isSubmitting?: boolean;
  readonly pendingOfferId?: string | null;
  readonly statusMessage?: string | null;
  readonly errorMessage?: string | null;
  readonly onCreateOffer: (offer: {
    readonly recipientId: string;
    readonly amounts: SameTableTradeAmounts;
  }) => void;
  /** Accepts the exact immutable offer identified by this server-issued ID. */
  readonly onAcceptOffer: (offerId: string) => void;
}

type DraftAmounts = Readonly<Record<SameTableTradeResourceId, string>>;

const EMPTY_DRAFT: DraftAmounts = {
  ore: '',
  fuel: '',
  food: '',
  water: '',
  materials: '',
  securityTeams: '',
};

function amountEntries(amounts: SameTableTradeAmounts) {
  return SAME_TABLE_TRADE_RESOURCES.flatMap(({ id, label }) => {
    const amount = amounts[id];
    return Number.isSafeInteger(amount) && amount !== undefined && amount > 0
      ? [{ id, label, amount }]
      : [];
  });
}

function parseDraftAmounts(draft: DraftAmounts, balances: SameTableTradeBalances): SameTableTradeAmounts | null {
  const amounts: Partial<Record<SameTableTradeResourceId, number>> = {};
  let hasPositiveAmount = false;

  for (const { id } of SAME_TABLE_TRADE_RESOURCES) {
    const value = draft[id].trim();
    if (value === '') continue;
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > balances[id]) return null;
    if (amount > 0) {
      amounts[id] = amount;
      hasPositiveAmount = true;
    }
  }

  return hasPositiveAmount ? amounts : null;
}

function AmountReadout({ amounts }: { readonly amounts: SameTableTradeAmounts }) {
  const entries = amountEntries(amounts);
  if (entries.length === 0) return <p className="same-table-trade__empty-amounts">No resource amounts listed.</p>;

  return (
    <dl className="same-table-trade__amounts">
      {entries.map(({ id, label, amount }) => (
        <div className="same-table-trade__amount" key={id}>
          <dt>{label}{' '}</dt>
          <dd>{amount}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SameTableTradePanel({
  currentPlayerName,
  balances,
  counterparties,
  incomingOffers,
  outgoingOffers,
  disabledReason,
  isSubmitting = false,
  pendingOfferId = null,
  statusMessage,
  errorMessage,
  onCreateOffer,
  onAcceptOffer,
}: SameTableTradePanelProps) {
  const id = useId();
  const [recipientId, setRecipientId] = useState('');
  const [draft, setDraft] = useState<DraftAmounts>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState('');
  const disabled = Boolean(disabledReason) || isSubmitting;
  const recipientAvailable = counterparties.some((participant) => participant.id === recipientId);
  const amounts = parseDraftAmounts(draft, balances);
  const canSend = !disabled && recipientAvailable && amounts !== null;
  const visibleStatus = statusMessage?.trim() ?? '';
  const visibleError = errorMessage?.trim() || draftError;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const exactAmounts = parseDraftAmounts(draft, balances);
    if (disabled || !recipientAvailable || exactAmounts === null) {
      setDraftError('Choose a listed recipient and enter positive whole amounts within your held counts.');
      return;
    }

    onCreateOffer({ recipientId, amounts: exactAmounts });
    setDraft(EMPTY_DRAFT);
    setDraftError('');
  }

  return (
    <section className="same-table-trade cic-frame" aria-labelledby={`${id}-heading`}>
      <div className="same-table-trade__header">
        <p className="same-table-trade__eyebrow">PLAYER-HELD TOKENS // SAME TABLE</p>
        <h2 id={`${id}-heading`}>Same-table trade</h2>
        <p className="same-table-trade__intro">
          {currentPlayerName}, review your held tokens and send an exact offer to an active participant at this ship&apos;s table.
          The recipient must accept it before any counts change.
        </p>
      </div>

      <section className="same-table-trade__holdings" aria-labelledby={`${id}-holdings-heading`}>
        <h3 id={`${id}-holdings-heading`}>Your held tokens</h3>
        <dl className="same-table-trade__balance-list">
          {SAME_TABLE_TRADE_RESOURCES.map(({ id: resourceId, label }) => (
            <div className="same-table-trade__balance" key={resourceId}>
              <dt>{label}{' '}</dt>
              <dd>{balances[resourceId]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="same-table-trade__boundary">
        Only existing tabletop counts belong here. Ship stores are tracked separately, and this panel cannot move tokens between tables.
      </p>

      {disabledReason && (
        <p className="same-table-trade__notice" role="status">{disabledReason}</p>
      )}
      {visibleError && <p className="same-table-trade__notice same-table-trade__error" role="alert">{visibleError}</p>}
      {visibleStatus && <p className="same-table-trade__notice" role="status">{visibleStatus}</p>}

      <form className="same-table-trade__form" onSubmit={submit}>
        <h3 className="same-table-trade__section-heading">Make an offer</h3>
        <label className="same-table-trade__field" htmlFor={`${id}-recipient`}>
          <span>Recipient</span>
          <select
            id={`${id}-recipient`}
            value={recipientId}
            disabled={disabled || counterparties.length === 0}
            onChange={(event) => {
              setRecipientId(event.currentTarget.value);
              setDraftError('');
            }}
          >
            <option value="">Choose recipient</option>
            {counterparties.map((participant) => (
              <option key={participant.id} value={participant.id}>{participant.name}</option>
            ))}
          </select>
        </label>
        {counterparties.length === 0 && (
          <p className="same-table-trade__empty">No other active participants are listed at this ship&apos;s table.</p>
        )}

        <fieldset className="same-table-trade__resources" disabled={disabled}>
          <legend>Exact amounts to offer</legend>
          {SAME_TABLE_TRADE_RESOURCES.map(({ id: resourceId, label }) => (
            <label className="same-table-trade__field" htmlFor={`${id}-${resourceId}`} key={resourceId}>
              <span>
                {label}
                <small>Held: {balances[resourceId]}</small>
              </span>
              <input
                id={`${id}-${resourceId}`}
                aria-label={`${label} amount`}
                name={resourceId}
                type="number"
                min="0"
                max={balances[resourceId]}
                step="1"
                inputMode="numeric"
                value={draft[resourceId]}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft((current) => ({ ...current, [resourceId]: value }));
                  setDraftError('');
                }}
              />
            </label>
          ))}
          <p className="same-table-trade__help">Leave resources you are not offering blank or at zero.</p>
        </fieldset>

        <button className="cic-action-button same-table-trade__send" type="submit" disabled={!canSend}>
          {isSubmitting ? 'Sending offer…' : 'Send exact offer'}
        </button>
      </form>

      <section className="same-table-trade__offers" aria-labelledby={`${id}-incoming-heading`}>
        <h3 id={`${id}-incoming-heading`}>Offers waiting for you</h3>
        {incomingOffers.length === 0 ? (
          <p className="same-table-trade__empty">No incoming offers.</p>
        ) : (
          <ul className="same-table-trade__offer-list" aria-label="Incoming trade offers">
            {incomingOffers.map((offer) => (
              <li className="same-table-trade__offer" aria-label={`Offer from ${offer.participantName}`} key={offer.id}>
                <div className="same-table-trade__offer-copy">
                  <h4>Offer from {offer.participantName}</h4>
                  <AmountReadout amounts={offer.amounts} />
                </div>
                <button
                  className="cic-action-button same-table-trade__accept"
                  type="button"
                  disabled={disabled || pendingOfferId !== null}
                  aria-label={`Accept exact offer from ${offer.participantName}`}
                  onClick={() => onAcceptOffer(offer.id)}
                >
                  {pendingOfferId === offer.id ? 'Accepting…' : 'Accept exact offer'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="same-table-trade__offers" aria-labelledby={`${id}-outgoing-heading`}>
        <h3 id={`${id}-outgoing-heading`}>Offers you sent</h3>
        {outgoingOffers.length === 0 ? (
          <p className="same-table-trade__empty">No pending offers sent.</p>
        ) : (
          <ul className="same-table-trade__offer-list" aria-label="Pending offers sent">
            {outgoingOffers.map((offer) => (
              <li className="same-table-trade__offer" aria-label={`Offer to ${offer.participantName}`} key={offer.id}>
                <div className="same-table-trade__offer-copy">
                  <h4>Offer to {offer.participantName}</h4>
                  <AmountReadout amounts={offer.amounts} />
                  <p className="same-table-trade__offer-status">{offer.statusLabel ?? 'Awaiting response'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

export default SameTableTradePanel;
